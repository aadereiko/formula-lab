"""HTTP surface: status codes, error shapes, and the worker-process boundary.

These run against the real app, so they also prove the process pool works --
including that a runaway formula is actually preempted rather than hanging the
request.
"""

import pytest

# `client` comes from conftest.py, which points the app at a throwaway database
# so these tests can never touch the development one.


def test_built_in_library_needs_no_account(client):
    assert client.get("/api/library").status_code == 200


def test_saved_formulas_need_an_account(client):
    assert client.get("/api/formulas").status_code == 401


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_analyze_returns_variables(client):
    response = client.post("/api/analyze", json={"expression": "F = m*a"})
    assert response.status_code == 200
    body = response.json()
    assert body["is_equation"] is True
    assert body["symbols"] == ["F", "a", "m"]


def test_evaluate_solves(client):
    response = client.post("/api/evaluate", json={
        "expression": "F = m*a", "values": {"F": 10, "a": 2},
    })
    assert response.status_code == 200
    body = response.json()
    assert body["solve_for"] == "m"
    assert body["primary"]["value"] == pytest.approx(5.0)


def test_evaluate_expression(client):
    response = client.post("/api/evaluate", json={
        "expression": "1/2 m v^2", "values": {"m": 2, "v": 3}, "precision": 4,
    })
    assert response.json()["primary"]["formatted"] == "9"


@pytest.mark.parametrize("expression", [
    "__import__('os').system('id')",
    "().__class__",
    "open('/etc/passwd')",
])
def test_hostile_expressions_get_400_not_500(client, expression):
    response = client.post("/api/analyze", json={"expression": expression})
    assert response.status_code == 400
    assert "error" in response.json()


def test_bad_formula_returns_readable_error(client):
    response = client.post("/api/evaluate", json={
        "expression": "1/2 m v^2", "values": {"m": 2},
    })
    assert response.status_code == 400
    assert "v" in response.json()["error"]


def test_oversized_payload_rejected_by_schema(client):
    response = client.post("/api/analyze", json={"expression": "x" * 600})
    assert response.status_code == 422  # pydantic max_length, before parsing


def test_precision_out_of_range_rejected(client):
    response = client.post("/api/evaluate", json={
        "expression": "pi", "values": {}, "precision": 99,
    })
    assert response.status_code == 422


def test_runaway_formula_is_preempted_not_hung(client):
    """The static guards cannot catch this one; the timeout must.

    `exp(exp(exp(9)))` is 15 characters, has a five-node expression tree and no
    large literal exponent -- every static check passes. Evaluating it means
    computing e raised to roughly e^8103, which occupies a CPU indefinitely.
    """
    response = client.post("/api/evaluate", json={
        "expression": "exp(exp(exp(9)))", "values": {},
    })
    assert response.status_code == 400
    assert "longer than" in response.json()["error"]


def test_pool_still_works_after_a_timeout(client):
    """A discarded pool must be rebuilt transparently."""
    response = client.post("/api/evaluate", json={
        "expression": "F = m*a", "values": {"F": 12, "a": 4},
    })
    assert response.status_code == 200
    assert response.json()["primary"]["value"] == pytest.approx(3.0)


def test_formula_library_is_served(client):
    # The built-in catalogue lives at /api/library; /api/formulas is now the
    # signed-in user's own saved formulas.
    body = client.get("/api/library").json()
    assert len(body["formulas"]) > 30
    assert "Kinematics" in body["categories"]
    assert all({"id", "name", "expression", "variables"} <= set(f) for f in body["formulas"])


def test_constants_are_served(client):
    constants = client.get("/api/constants").json()["constants"]
    by_symbol = {c["symbol"]: c for c in constants}
    assert by_symbol["c"]["value"] == 299792458.0
    assert by_symbol["g"]["unit"] == "m/s²"


def test_capabilities_lists_functions_and_limits(client):
    body = client.get("/api/capabilities").json()
    assert "sqrt" in body["functions"]
    # Regression: these must NOT be exposed as constants.
    assert "E" not in body["functions"] and "I" not in body["functions"]
    assert body["limits"]["max_length"] == 500


def test_unknown_api_path_404s_rather_than_returning_html(client):
    """The SPA fallback must never shadow the API namespace."""
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert "html" not in response.headers.get("content-type", "")


# -- static file serving --------------------------------------------------

def test_static_paths_cannot_escape_the_bundle_directory(tmp_path):
    """`FileResponse` serves whatever path it is given, so containment is on us."""
    from app.main import resolve_static_file

    root = tmp_path / "dist"
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_text("<div id='root'></div>")
    (root / "assets" / "app.js").write_text("console.log(1)")
    secret = tmp_path / "secret.txt"
    secret.write_text("do not serve me")

    # Legitimate requests resolve.
    assert resolve_static_file(root, "index.html") == (root / "index.html").resolve()
    assert resolve_static_file(root, "assets/app.js") == (root / "assets" / "app.js").resolve()

    # Everything that points outside the bundle is refused.
    for attempt in [
        "../secret.txt",
        "../../secret.txt",
        "assets/../../secret.txt",
        "/etc/passwd",
        "",
        "does-not-exist.js",
    ]:
        assert resolve_static_file(root, attempt) is None, attempt


def test_additive_migration_adds_missing_columns(tmp_path):
    """`create_all` never alters an existing table, so a new column would be
    invisible until the database was deleted -- discarding real data."""
    from sqlalchemy import create_engine, inspect, text

    from app import db

    path = tmp_path / "legacy.db"
    legacy = create_engine(f"sqlite:///{path}")

    # A table shaped like an older release: no variable_notes column.
    with legacy.begin() as connection:
        connection.execute(text("""
            CREATE TABLE saved_formulas (
                id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL,
                name VARCHAR(120) NOT NULL, expression VARCHAR(500) NOT NULL,
                note TEXT NOT NULL DEFAULT '', values_json TEXT NOT NULL DEFAULT '{}',
                solve_for VARCHAR(64), created_at DATETIME, updated_at DATETIME
            )
        """))
        connection.execute(text(
            "INSERT INTO saved_formulas (id, user_id, name, expression) "
            "VALUES (1, 1, 'Existing', 'a = b*c')"
        ))
    legacy.dispose()

    engine = create_engine(f"sqlite:///{path}")
    original = db.engine
    try:
        db.engine = engine          # ensure_columns inspects the module engine
        db.ensure_columns()
        columns = {c["name"] for c in inspect(engine).get_columns("saved_formulas")}
        assert "variable_notes" in columns

        with engine.connect() as connection:
            row = connection.execute(
                text("SELECT name, variable_notes FROM saved_formulas WHERE id = 1")
            ).one()
        assert row[0] == "Existing"          # the existing row survived
        assert row[1] == "{}"               # and got the server default
    finally:
        db.engine = original
        engine.dispose()
