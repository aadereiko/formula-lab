"""Registration, login, sessions, and the things that must not leak."""

import pytest

from app import auth
from app.db import User

GOOD_PASSWORD = "correct horse battery"


def test_register_creates_an_account_and_signs_in(client):
    response = client.post(
        "/api/auth/register", json={"email": "sam@example.com", "password": GOOD_PASSWORD}
    )
    assert response.status_code == 201
    assert response.json()["email"] == "sam@example.com"
    assert auth.COOKIE_NAME in response.cookies
    # The session cookie is enough to identify the user on the next request.
    assert client.get("/api/auth/me").json()["email"] == "sam@example.com"


def test_session_cookie_is_httponly_and_lax(client):
    response = client.post(
        "/api/auth/register", json={"email": "sam@example.com", "password": GOOD_PASSWORD}
    )
    header = response.headers["set-cookie"].lower()
    assert "httponly" in header      # not readable from JavaScript
    assert "samesite=lax" in header  # not sent on cross-site POSTs


def test_password_is_never_stored_or_returned(client, session_factory):
    client.post(
        "/api/auth/register", json={"email": "sam@example.com", "password": GOOD_PASSWORD}
    )
    with session_factory() as session:
        user = session.query(User).one()
        assert GOOD_PASSWORD not in user.password_hash
        assert user.password_hash.startswith("$argon2")

    body = client.get("/api/auth/me").text
    assert GOOD_PASSWORD not in body and "password" not in body


def test_email_is_case_insensitive(client):
    client.post("/api/auth/register", json={"email": "Sam@Example.COM", "password": GOOD_PASSWORD})
    client.post("/api/auth/logout")
    response = client.post(
        "/api/auth/login", json={"email": "sam@example.com", "password": GOOD_PASSWORD}
    )
    assert response.status_code == 200


def test_duplicate_email_is_rejected(client):
    client.post("/api/auth/register", json={"email": "sam@example.com", "password": GOOD_PASSWORD})
    response = client.post(
        "/api/auth/register", json={"email": "SAM@example.com", "password": "another password"}
    )
    assert response.status_code == 409


@pytest.mark.parametrize("password", ["short", "1234567"])
def test_short_passwords_are_rejected(client, password):
    response = client.post("/api/auth/register", json={"email": "a@b.com", "password": password})
    assert response.status_code == 422


def test_invalid_email_is_rejected(client):
    response = client.post("/api/auth/register", json={"email": "not-an-email", "password": GOOD_PASSWORD})
    assert response.status_code == 422


def test_long_passphrase_works(client):
    """Argon2 has no 72-byte truncation, unlike bcrypt."""
    passphrase = "a very long passphrase " * 10
    client.post("/api/auth/register", json={"email": "sam@example.com", "password": passphrase})
    client.post("/api/auth/logout")
    assert client.post(
        "/api/auth/login", json={"email": "sam@example.com", "password": passphrase}
    ).status_code == 200
    # And a truncated version must NOT authenticate.
    assert client.post(
        "/api/auth/login", json={"email": "sam@example.com", "password": passphrase[:72]}
    ).status_code == 401


def test_wrong_password_and_unknown_email_are_indistinguishable(client):
    client.post("/api/auth/register", json={"email": "sam@example.com", "password": GOOD_PASSWORD})
    client.post("/api/auth/logout")

    wrong = client.post("/api/auth/login", json={"email": "sam@example.com", "password": "nope nope nope"})
    missing = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "nope nope nope"})
    # Identical status and message, so the endpoint cannot be used to discover
    # which addresses have accounts.
    assert wrong.status_code == missing.status_code == 401
    assert wrong.json()["detail"] == missing.json()["detail"]


def test_me_requires_a_session(client):
    assert client.get("/api/auth/me").status_code == 401


def test_logout_ends_the_session(client):
    client.post("/api/auth/register", json={"email": "sam@example.com", "password": GOOD_PASSWORD})
    assert client.get("/api/auth/me").status_code == 200
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_tampered_cookie_is_rejected(client):
    client.post("/api/auth/register", json={"email": "sam@example.com", "password": GOOD_PASSWORD})
    client.cookies.set(auth.COOKIE_NAME, "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.forged")
    assert client.get("/api/auth/me").status_code == 401


def test_unsigned_token_is_rejected(client):
    """A JWT with alg=none must not be accepted."""
    import jwt as pyjwt

    forged = pyjwt.encode({"sub": "1"}, key="", algorithm="none")
    client.cookies.set(auth.COOKIE_NAME, forged)
    assert client.get("/api/auth/me").status_code == 401


def test_repeated_failures_are_throttled(client):
    client.post("/api/auth/register", json={"email": "sam@example.com", "password": GOOD_PASSWORD})
    client.post("/api/auth/logout")

    codes = [
        client.post(
            "/api/auth/login", json={"email": "sam@example.com", "password": "wrong wrong wrong"}
        ).status_code
        for _ in range(auth.MAX_FAILURES + 2)
    ]
    assert codes[0] == 401
    assert 429 in codes, "brute-force attempts should eventually be refused"


def test_successful_login_clears_the_throttle(client):
    client.post("/api/auth/register", json={"email": "sam@example.com", "password": GOOD_PASSWORD})
    client.post("/api/auth/logout")
    for _ in range(3):
        client.post("/api/auth/login", json={"email": "sam@example.com", "password": "wrong pass!"})
    assert client.post(
        "/api/auth/login", json={"email": "sam@example.com", "password": GOOD_PASSWORD}
    ).status_code == 200
    assert auth._failures == {}
