"""Saved formulas: CRUD, validation, and isolation between accounts."""

import pytest

from app.db import SavedFormula, User

PASSWORD = "correct horse battery"
KINETIC = {"name": "Kinetic energy", "expression": "E = 1/2 m v^2", "values": {"m": "70", "v": "8.5"}}


def sign_up(client, email):
    response = client.post("/api/auth/register", json={"email": email, "password": PASSWORD})
    assert response.status_code == 201
    return response.json()


def sign_in(client, email):
    assert client.post("/api/auth/login", json={"email": email, "password": PASSWORD}).status_code == 200


# -- basics ----------------------------------------------------------------

def test_saving_requires_an_account(client):
    assert client.post("/api/formulas", json=KINETIC).status_code == 401
    assert client.get("/api/formulas").status_code == 401


def test_create_then_list(client):
    sign_up(client, "sam@example.com")
    created = client.post("/api/formulas", json=KINETIC)
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Kinetic energy"
    assert body["values"] == {"m": "70", "v": "8.5"}

    listed = client.get("/api/formulas").json()
    assert [f["id"] for f in listed] == [body["id"]]


def test_update(client):
    sign_up(client, "sam@example.com")
    formula_id = client.post("/api/formulas", json=KINETIC).json()["id"]

    updated = client.put(
        f"/api/formulas/{formula_id}",
        json={"name": "KE", "expression": "E = 1/2 m v^2", "note": "for the bike", "values": {"m": "80"}},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "KE"
    assert updated.json()["note"] == "for the bike"
    assert len(client.get("/api/formulas").json()) == 1  # updated, not duplicated


def test_delete(client):
    sign_up(client, "sam@example.com")
    formula_id = client.post("/api/formulas", json=KINETIC).json()["id"]
    assert client.delete(f"/api/formulas/{formula_id}").status_code == 204
    assert client.get("/api/formulas").json() == []
    assert client.delete(f"/api/formulas/{formula_id}").status_code == 404


def test_saved_formula_round_trips_through_evaluate(client):
    """A saved formula must still work when reopened."""
    sign_up(client, "sam@example.com")
    saved = client.post("/api/formulas", json=KINETIC).json()
    result = client.post(
        "/api/evaluate", json={"expression": saved["expression"], "values": saved["values"]}
    )
    assert result.status_code == 200
    assert result.json()["primary"]["value"] == pytest.approx(2528.75)


# -- isolation between accounts -------------------------------------------

def test_one_account_cannot_read_anothers_formula(client):
    sign_up(client, "owner@example.com")
    formula_id = client.post("/api/formulas", json=KINETIC).json()["id"]
    client.post("/api/auth/logout")

    sign_up(client, "intruder@example.com")
    # 404, not 403: a 403 would confirm the id exists and belongs to somebody.
    assert client.put(f"/api/formulas/{formula_id}", json=KINETIC).status_code == 404
    assert client.delete(f"/api/formulas/{formula_id}").status_code == 404
    assert client.get("/api/formulas").json() == []


def test_listing_shows_only_your_own(client):
    sign_up(client, "a@example.com")
    client.post("/api/formulas", json={"name": "Mine", "expression": "a = b*c"})
    client.post("/api/auth/logout")

    sign_up(client, "b@example.com")
    client.post("/api/formulas", json={"name": "Theirs", "expression": "x = y*z"})
    assert [f["name"] for f in client.get("/api/formulas").json()] == ["Theirs"]

    client.post("/api/auth/logout")
    sign_in(client, "a@example.com")
    assert [f["name"] for f in client.get("/api/formulas").json()] == ["Mine"]


def test_enumerating_ids_reveals_nothing(client):
    sign_up(client, "owner@example.com")
    for index in range(3):
        client.post("/api/formulas", json={"name": f"f{index}", "expression": "a = b + c"})
    client.post("/api/auth/logout")

    sign_up(client, "intruder@example.com")
    for candidate in range(1, 20):
        assert client.put(f"/api/formulas/{candidate}", json=KINETIC).status_code == 404


# -- names and validation -------------------------------------------------

def test_duplicate_name_for_the_same_user_is_rejected(client):
    sign_up(client, "sam@example.com")
    client.post("/api/formulas", json=KINETIC)
    assert client.post("/api/formulas", json=KINETIC).status_code == 409


def test_two_users_may_use_the_same_name(client):
    sign_up(client, "a@example.com")
    assert client.post("/api/formulas", json=KINETIC).status_code == 201
    client.post("/api/auth/logout")

    sign_up(client, "b@example.com")
    assert client.post("/api/formulas", json=KINETIC).status_code == 201


def test_unparseable_expression_is_refused(client):
    sign_up(client, "sam@example.com")
    response = client.post("/api/formulas", json={"name": "Broken", "expression": "E = m*c^^2"})
    assert response.status_code == 400
    assert "parse" in response.json()["detail"].lower()


def test_hostile_expression_is_refused(client):
    sign_up(client, "sam@example.com")
    response = client.post(
        "/api/formulas", json={"name": "Nope", "expression": "__import__('os').system('id')"}
    )
    assert response.status_code == 400


def test_blank_name_is_refused(client):
    sign_up(client, "sam@example.com")
    assert client.post(
        "/api/formulas", json={"name": "   ", "expression": "a = b"}
    ).status_code == 400


def test_solve_for_must_be_a_variable_in_the_formula(client):
    sign_up(client, "sam@example.com")
    ok = client.post(
        "/api/formulas", json={"name": "Good", "expression": "F = m*a", "solve_for": "m"}
    )
    assert ok.status_code == 201
    bad = client.post(
        "/api/formulas", json={"name": "Bad", "expression": "F = m*a", "solve_for": "q"}
    )
    assert bad.status_code == 400


def test_junk_value_keys_are_dropped(client):
    sign_up(client, "sam@example.com")
    saved = client.post(
        "/api/formulas",
        json={"name": "Filtered", "expression": "F = m*a", "values": {"m": "2", "not a name": "9"}},
    ).json()
    assert saved["values"] == {"m": "2"}


def test_saved_count_is_capped(client):
    from app.routes_formulas import MAX_SAVED_PER_USER

    sign_up(client, "sam@example.com")
    for index in range(MAX_SAVED_PER_USER):
        assert client.post(
            "/api/formulas", json={"name": f"f{index}", "expression": "a = b + c"}
        ).status_code == 201
    assert client.post(
        "/api/formulas", json={"name": "one too many", "expression": "a = b + c"}
    ).status_code == 400


# -- database behaviour ---------------------------------------------------

def test_deleting_a_user_removes_their_formulas(client, session_factory):
    sign_up(client, "sam@example.com")
    client.post("/api/formulas", json=KINETIC)

    with session_factory() as session:
        session.delete(session.query(User).one())
        session.commit()
        assert session.query(SavedFormula).count() == 0, "ON DELETE CASCADE did not fire"


# -- descriptions ---------------------------------------------------------

DESCRIBED = {
    "name": "Kinetic energy",
    "expression": "E = 1/2 m v^2",
    "note": "Energy of a moving body.",
    "variable_notes": {"E": "energy (J)", "m": "mass (kg)", "v": "speed (m/s)"},
}


def test_description_and_variable_notes_round_trip(client):
    sign_up(client, "sam@example.com")
    created = client.post("/api/formulas", json=DESCRIBED)
    assert created.status_code == 201
    body = created.json()
    assert body["note"] == "Energy of a moving body."
    assert body["variable_notes"] == DESCRIBED["variable_notes"]

    # And survive a re-read rather than only being echoed back.
    listed = client.get("/api/formulas").json()[0]
    assert listed["variable_notes"]["m"] == "mass (kg)"


def test_notes_for_symbols_not_in_the_formula_are_dropped(client):
    """Otherwise stale entries pile up every time the expression is edited."""
    sign_up(client, "sam@example.com")
    created = client.post(
        "/api/formulas",
        json={
            "name": "Ohm",
            "expression": "V = I*R",
            "variable_notes": {"V": "volts", "I": "amps", "zzz": "gone"},
        },
    ).json()
    assert set(created["variable_notes"]) == {"V", "I"}


def test_editing_an_expression_prunes_orphaned_notes(client):
    sign_up(client, "sam@example.com")
    formula_id = client.post("/api/formulas", json=DESCRIBED).json()["id"]

    updated = client.put(
        f"/api/formulas/{formula_id}",
        json={
            "name": "Kinetic energy",
            "expression": "E = 1/2 m u^2",  # v became u
            "variable_notes": DESCRIBED["variable_notes"],
        },
    ).json()
    assert "v" not in updated["variable_notes"]
    assert updated["variable_notes"]["m"] == "mass (kg)"


def test_blank_variable_notes_are_not_stored(client):
    sign_up(client, "sam@example.com")
    created = client.post(
        "/api/formulas",
        json={"name": "Ohm", "expression": "V = I*R", "variable_notes": {"V": "  ", "I": "amps"}},
    ).json()
    assert created["variable_notes"] == {"I": "amps"}


def test_variable_note_length_is_capped(client):
    sign_up(client, "sam@example.com")
    created = client.post(
        "/api/formulas",
        json={"name": "Ohm", "expression": "V = I*R", "variable_notes": {"V": "x" * 500}},
    ).json()
    assert len(created["variable_notes"]["V"]) == 200


def test_formulas_without_descriptions_still_work(client):
    """The fields are optional -- older saved rows have neither."""
    sign_up(client, "sam@example.com")
    created = client.post("/api/formulas", json={"name": "Bare", "expression": "a = b*c"}).json()
    assert created["note"] == ""
    assert created["variable_notes"] == {}


def test_corrupt_stored_json_reads_as_empty(client, session_factory):
    """A hand-edited database should not turn every read into a 500."""
    from app.db import SavedFormula

    sign_up(client, "sam@example.com")
    client.post("/api/formulas", json=DESCRIBED)

    with session_factory() as session:
        row = session.query(SavedFormula).one()
        row.variable_notes = "not json at all"
        row.values_json = "[1, 2, 3]"  # valid JSON, wrong shape
        session.commit()

    listed = client.get("/api/formulas").json()[0]
    assert listed["variable_notes"] == {}
    assert listed["values"] == {}


# -- pinning --------------------------------------------------------------

def test_pinned_defaults_to_false_and_round_trips(client):
    sign_up(client, "sam@example.com")
    created = client.post("/api/formulas", json=KINETIC).json()
    assert created["pinned"] is False

    updated = client.put(
        f"/api/formulas/{created['id']}", json={**KINETIC, "pinned": True}
    ).json()
    assert updated["pinned"] is True
    assert client.get("/api/formulas").json()[0]["pinned"] is True


def test_pinned_formulas_sort_first(client):
    """Ordering lives on the server so every list agrees on it."""
    sign_up(client, "sam@example.com")
    ids = {}
    for name in ["first", "second", "third"]:
        ids[name] = client.post(
            "/api/formulas", json={"name": name, "expression": "a = b*c"}
        ).json()["id"]

    # `first` is the oldest, so without pinning it sorts last.
    assert [f["name"] for f in client.get("/api/formulas").json()] == ["third", "second", "first"]

    client.put(
        f"/api/formulas/{ids['first']}",
        json={"name": "first", "expression": "a = b*c", "pinned": True},
    )
    listed = [f["name"] for f in client.get("/api/formulas").json()]
    assert listed[0] == "first", listed


def test_unpinning_restores_recency_order(client):
    sign_up(client, "sam@example.com")
    formula_id = client.post("/api/formulas", json={"name": "old", "expression": "a = b"}).json()["id"]
    client.post("/api/formulas", json={"name": "new", "expression": "x = y"})

    client.put(f"/api/formulas/{formula_id}", json={"name": "old", "expression": "a = b", "pinned": True})
    assert client.get("/api/formulas").json()[0]["name"] == "old"

    client.put(f"/api/formulas/{formula_id}", json={"name": "old", "expression": "a = b", "pinned": False})
    assert client.get("/api/formulas").json()[0]["name"] == "old"  # now newest by update time


def test_pinning_is_per_account(client):
    sign_up(client, "a@example.com")
    mine = client.post("/api/formulas", json={**KINETIC, "pinned": True}).json()
    assert mine["pinned"] is True
    client.post("/api/auth/logout")

    sign_up(client, "b@example.com")
    theirs = client.post("/api/formulas", json=KINETIC).json()
    assert theirs["pinned"] is False


# -- categories -----------------------------------------------------------

def test_category_defaults_to_empty_and_round_trips(client):
    sign_up(client, "sam@example.com")
    bare = client.post("/api/formulas", json={"name": "Bare", "expression": "a = b"}).json()
    assert bare["category"] == ""

    filed = client.post(
        "/api/formulas",
        json={"name": "Filed", "expression": "x = y", "category": "Kinematics"},
    ).json()
    assert filed["category"] == "Kinematics"
    assert client.get("/api/formulas").json()[0]["category"] == "Kinematics"


def test_category_is_trimmed(client):
    sign_up(client, "sam@example.com")
    created = client.post(
        "/api/formulas", json={"name": "Spaced", "expression": "a = b", "category": "  Energy  "}
    ).json()
    assert created["category"] == "Energy"


def test_category_can_be_cleared_on_update(client):
    sign_up(client, "sam@example.com")
    created = client.post(
        "/api/formulas", json={"name": "Filed", "expression": "a = b", "category": "Energy"}
    ).json()
    updated = client.put(
        f"/api/formulas/{created['id']}", json={"name": "Filed", "expression": "a = b"}
    ).json()
    assert updated["category"] == ""


# -- hiding from the menu -------------------------------------------------

def test_hidden_defaults_to_false_and_round_trips(client):
    sign_up(client, "sam@example.com")
    created = client.post("/api/formulas", json=KINETIC).json()
    assert created["hidden"] is False

    updated = client.put(
        f"/api/formulas/{created['id']}", json={**KINETIC, "hidden": True}
    ).json()
    assert updated["hidden"] is True


def test_hidden_formulas_are_still_listed(client):
    """Hidden means "not in my way", not "deleted": the list still has it."""
    sign_up(client, "sam@example.com")
    created = client.post("/api/formulas", json={**KINETIC, "hidden": True}).json()

    listed = client.get("/api/formulas").json()
    assert [f["name"] for f in listed] == [created["name"]]
    assert listed[0]["hidden"] is True
