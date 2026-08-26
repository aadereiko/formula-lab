"""Rubrics a user invented."""

PASSWORD = "correct horse battery"


def sign_up(client, email):
    assert client.post(
        "/api/auth/register", json={"email": email, "password": PASSWORD}
    ).status_code == 201


def add(client, name):
    return client.post("/api/categories", json={"name": name})


def save_formula(client, name, category):
    return client.post(
        "/api/formulas",
        json={"name": name, "expression": "a = b*c", "category": category},
    )


def test_categories_require_an_account(client):
    assert client.get("/api/categories").status_code == 401
    assert add(client, "Optics").status_code == 401


def test_add_and_list(client):
    sign_up(client, "sam@example.com")
    assert client.get("/api/categories").json() == []
    assert add(client, "Optics rig").status_code == 204
    assert client.get("/api/categories").json() == ["Optics rig"]


def test_adding_twice_is_not_an_error(client):
    sign_up(client, "sam@example.com")
    assert add(client, "Optics").status_code == 204
    assert add(client, "Optics").status_code == 204
    assert client.get("/api/categories").json() == ["Optics"]


def test_case_and_spacing_do_not_make_a_second_category(client):
    """`Optics`, `optics` and `Optics  rig` are one rubric, not three."""
    sign_up(client, "sam@example.com")
    assert add(client, "Optics").status_code == 204
    assert add(client, "optics").status_code == 204
    assert add(client, "  OPTICS  ").status_code == 204
    assert client.get("/api/categories").json() == ["Optics"]

    assert add(client, "Bench  rig").status_code == 204
    assert add(client, "Bench rig").status_code == 204
    assert client.get("/api/categories").json() == ["Bench rig", "Optics"]


def test_a_blank_name_is_refused(client):
    sign_up(client, "sam@example.com")
    assert add(client, "   ").status_code == 422
    assert client.get("/api/categories").json() == []


def test_an_overlong_name_is_refused(client):
    sign_up(client, "sam@example.com")
    assert add(client, "x" * 61).status_code == 422
    assert client.get("/api/categories").json() == []


def test_listing_is_sorted_regardless_of_case(client):
    sign_up(client, "sam@example.com")
    for name in ("zeta", "Alpha", "beta"):
        assert add(client, name).status_code == 204
    assert client.get("/api/categories").json() == ["Alpha", "beta", "zeta"]


def test_remove(client):
    sign_up(client, "sam@example.com")
    add(client, "Optics")
    assert client.delete("/api/categories", params={"name": "Optics"}).status_code == 204
    assert client.get("/api/categories").json() == []


def test_removing_something_absent_is_not_an_error(client):
    sign_up(client, "sam@example.com")
    assert client.delete("/api/categories", params={"name": "Nope"}).status_code == 204


def test_removing_ignores_case(client):
    sign_up(client, "sam@example.com")
    add(client, "Optics")
    assert client.delete("/api/categories", params={"name": "OPTICS"}).status_code == 204
    assert client.get("/api/categories").json() == []


def test_a_category_in_use_by_a_formula_is_listed(client):
    """A rubric typed straight into the save dialog is still a rubric.

    Formulas saved by an older client never recorded the name, and losing it
    from the list would mean the sidebar shows a group the dialog cannot offer.
    """
    sign_up(client, "sam@example.com")
    assert save_formula(client, "Lens", "Optics").status_code == 201
    assert client.get("/api/categories").json() == ["Optics"]


def test_a_category_in_use_survives_removal(client):
    """Deleting the name must not silently re-file the formulas under it."""
    sign_up(client, "sam@example.com")
    add(client, "Optics")
    save_formula(client, "Lens", "Optics")
    assert client.delete("/api/categories", params={"name": "Optics"}).status_code == 204
    # Still offered, because a formula still uses it.
    assert client.get("/api/categories").json() == ["Optics"]
    # And the formula kept its rubric.
    assert client.get("/api/formulas").json()[0]["category"] == "Optics"


def test_categories_are_per_account(client):
    sign_up(client, "sam@example.com")
    add(client, "Sam only")
    client.post("/api/auth/logout")

    sign_up(client, "ada@example.com")
    assert client.get("/api/categories").json() == []
    add(client, "Ada only")
    assert client.get("/api/categories").json() == ["Ada only"]

    client.post("/api/auth/logout")
    assert client.post(
        "/api/auth/login", json={"email": "sam@example.com", "password": PASSWORD}
    ).status_code == 200
    assert client.get("/api/categories").json() == ["Sam only"]


def test_category_count_is_capped(client):
    from app.routes_categories import MAX_PER_USER

    sign_up(client, "sam@example.com")
    for index in range(MAX_PER_USER):
        assert add(client, f"rubric {index}").status_code == 204
    assert add(client, "one too many").status_code == 400


def test_deleting_a_user_removes_their_categories(client, session_factory):
    from sqlalchemy import select

    from app.db import User, UserCategory

    sign_up(client, "sam@example.com")
    add(client, "Optics")

    with session_factory() as session:
        user = session.scalar(select(User).where(User.email == "sam@example.com"))
        session.delete(user)
        session.commit()
        assert session.scalars(select(UserCategory)).all() == []
