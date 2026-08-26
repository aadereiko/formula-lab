"""Pins on the built-in library."""

PASSWORD = "correct horse battery"


def sign_up(client, email):
    assert client.post(
        "/api/auth/register", json={"email": email, "password": PASSWORD}
    ).status_code == 201


def test_pins_require_an_account(client):
    assert client.get("/api/pinned-library").status_code == 401
    assert client.put("/api/pinned-library/newton2").status_code == 401


def test_pin_and_unpin(client):
    sign_up(client, "sam@example.com")
    assert client.get("/api/pinned-library").json() == []

    assert client.put("/api/pinned-library/newton2").status_code == 204
    assert client.get("/api/pinned-library").json() == ["newton2"]

    assert client.delete("/api/pinned-library/newton2").status_code == 204
    assert client.get("/api/pinned-library").json() == []


def test_pinning_twice_is_not_an_error(client):
    """The caller wanted it pinned; after either call, it is."""
    sign_up(client, "sam@example.com")
    assert client.put("/api/pinned-library/newton2").status_code == 204
    assert client.put("/api/pinned-library/newton2").status_code == 204
    assert client.get("/api/pinned-library").json() == ["newton2"]


def test_unpinning_something_unpinned_is_not_an_error(client):
    sign_up(client, "sam@example.com")
    assert client.delete("/api/pinned-library/newton2").status_code == 204


def test_unknown_library_ids_are_refused(client):
    """A pin must never dangle, so only ids the library actually has count."""
    sign_up(client, "sam@example.com")
    for bad in ["not-a-formula", "../etc", "NEWTON2", ""]:
        assert client.put(f"/api/pinned-library/{bad}").status_code in (404, 405), bad
    assert client.get("/api/pinned-library").json() == []


def test_pins_are_per_account(client):
    sign_up(client, "a@example.com")
    client.put("/api/pinned-library/newton2")
    client.post("/api/auth/logout")

    sign_up(client, "b@example.com")
    assert client.get("/api/pinned-library").json() == []

    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"email": "a@example.com", "password": PASSWORD})
    assert client.get("/api/pinned-library").json() == ["newton2"]


def test_pin_count_is_capped(client):
    from app.routes_library_pins import MAX_PER_USER

    from app.formulas import FORMULAS

    sign_up(client, "sam@example.com")
    ids = [f["id"] for f in FORMULAS][:MAX_PER_USER]
    for library_id in ids:
        assert client.put(f"/api/pinned-library/{library_id}").status_code == 204
    assert len(client.get("/api/pinned-library").json()) == len(ids)


def test_deleting_a_user_removes_their_pins(client, session_factory):
    from app.db import PinnedLibraryFormula, User

    sign_up(client, "sam@example.com")
    client.put("/api/pinned-library/newton2")

    with session_factory() as session:
        session.delete(session.query(User).one())
        session.commit()
        assert session.query(PinnedLibraryFormula).count() == 0
