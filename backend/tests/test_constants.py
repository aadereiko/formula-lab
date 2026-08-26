"""User-defined constants: CRUD, validation, and isolation between accounts."""

import pytest

PASSWORD = "correct horse battery"
STEEL = {"symbol": "rho_steel", "value": 7850.0, "name": "Density of steel", "unit": "kg/m³"}


def sign_up(client, email):
    assert client.post(
        "/api/auth/register", json={"email": email, "password": PASSWORD}
    ).status_code == 201


# -- built-in catalogue ---------------------------------------------------

def test_built_in_constants_need_no_account(client):
    constants = client.get("/api/constants").json()["constants"]
    assert len(constants) >= 30
    by_symbol = {c["symbol"]: c for c in constants}
    assert by_symbol["c"]["value"] == 299792458.0
    assert by_symbol["h_bar"]["unit"] == "J·s"


def test_built_in_symbols_are_unique(client):
    symbols = [c["symbol"] for c in client.get("/api/constants").json()["constants"]]
    assert len(symbols) == len(set(symbols))


def test_ambiguous_symbols_are_left_out(client):
    """A chip offering the wrong quantity is worse than no chip."""
    symbols = {c["symbol"] for c in client.get("/api/constants").json()["constants"]}
    # F is force far more often than Faraday; alpha is thermal expansion too.
    assert "F" not in symbols
    assert "alpha" not in symbols
    # The unambiguous spellings are used instead.
    assert "amu" in symbols and "u" not in symbols


# -- the user's own ------------------------------------------------------

def test_own_constants_require_an_account(client):
    assert client.get("/api/my-constants").status_code == 401
    assert client.post("/api/my-constants", json=STEEL).status_code == 401


def test_create_list_update_delete(client):
    sign_up(client, "sam@example.com")

    created = client.post("/api/my-constants", json=STEEL)
    assert created.status_code == 201
    body = created.json()
    assert body["symbol"] == "rho_steel"
    assert body["value"] == 7850.0

    assert [c["symbol"] for c in client.get("/api/my-constants").json()] == ["rho_steel"]

    updated = client.put(
        f"/api/my-constants/{body['id']}",
        json={**STEEL, "value": 7900.0, "name": "Steel (rolled)"},
    )
    assert updated.status_code == 200
    assert updated.json()["value"] == 7900.0
    assert updated.json()["name"] == "Steel (rolled)"

    assert client.delete(f"/api/my-constants/{body['id']}").status_code == 204
    assert client.get("/api/my-constants").json() == []


def test_symbol_must_be_usable_in_a_formula(client):
    sign_up(client, "sam@example.com")
    for symbol in ["0rho", "rho steel", "__x", "a-b", ""]:
        response = client.post("/api/my-constants", json={**STEEL, "symbol": symbol})
        assert response.status_code in (400, 422), symbol


def test_non_finite_values_are_refused(client):
    sign_up(client, "sam@example.com")
    for value in ["nan", "inf", "-inf"]:
        response = client.post("/api/my-constants", json={**STEEL, "value": value})
        assert response.status_code in (400, 422), value


def test_duplicate_symbol_is_refused(client):
    sign_up(client, "sam@example.com")
    client.post("/api/my-constants", json=STEEL)
    assert client.post("/api/my-constants", json=STEEL).status_code == 409


def test_two_users_may_define_the_same_symbol(client):
    sign_up(client, "a@example.com")
    assert client.post("/api/my-constants", json=STEEL).status_code == 201
    client.post("/api/auth/logout")

    sign_up(client, "b@example.com")
    assert client.post("/api/my-constants", json=STEEL).status_code == 201


def test_one_account_cannot_touch_anothers_constants(client):
    sign_up(client, "owner@example.com")
    constant_id = client.post("/api/my-constants", json=STEEL).json()["id"]
    client.post("/api/auth/logout")

    sign_up(client, "intruder@example.com")
    assert client.get("/api/my-constants").json() == []
    assert client.put(f"/api/my-constants/{constant_id}", json=STEEL).status_code == 404
    assert client.delete(f"/api/my-constants/{constant_id}").status_code == 404

    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"email": "owner@example.com", "password": PASSWORD})
    assert len(client.get("/api/my-constants").json()) == 1


def test_a_user_constant_can_shadow_a_built_in(client):
    """Local gravity, say, should be allowed to replace standard gravity."""
    sign_up(client, "sam@example.com")
    created = client.post(
        "/api/my-constants",
        json={"symbol": "g", "value": 9.819, "name": "Gravity in Oslo", "unit": "m/s²"},
    )
    assert created.status_code == 201
    assert created.json()["value"] == 9.819


def test_count_is_capped(client):
    from app.routes_constants import MAX_PER_USER

    sign_up(client, "sam@example.com")
    for index in range(MAX_PER_USER):
        assert client.post(
            "/api/my-constants", json={**STEEL, "symbol": f"k_{index}"}
        ).status_code == 201
    assert client.post(
        "/api/my-constants", json={**STEEL, "symbol": "one_too_many"}
    ).status_code == 400


def test_constant_values_survive_a_reread(client):
    sign_up(client, "sam@example.com")
    client.post(
        "/api/my-constants",
        json={"symbol": "tiny", "value": 6.62607015e-34, "name": "", "unit": ""},
    )
    assert client.get("/api/my-constants").json()[0]["value"] == pytest.approx(6.62607015e-34)


def test_deleting_a_user_removes_their_constants(client, session_factory):
    from app.db import User, UserConstant

    sign_up(client, "sam@example.com")
    client.post("/api/my-constants", json=STEEL)

    with session_factory() as session:
        session.delete(session.query(User).one())
        session.commit()
        assert session.query(UserConstant).count() == 0, "ON DELETE CASCADE did not fire"
