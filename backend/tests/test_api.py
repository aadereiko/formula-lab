"""HTTP surface: status codes, error shapes, and the worker-process boundary.

These run against the real app, so they also prove the process pool works --
including that a runaway formula is actually preempted rather than hanging the
request.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


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
    body = client.get("/api/formulas").json()
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
