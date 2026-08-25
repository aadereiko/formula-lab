"""Google sign-in, with Google mocked.

The point is to exercise the decisions the flow makes -- state matching,
verified-email linking, and account creation -- without a network round trip.
"""

import pytest

from app import auth, oauth_google
from app.db import User

PASSWORD = "correct horse battery"


@pytest.fixture
def google(monkeypatch):
    """Configure credentials and stand in for Google's two endpoints."""
    monkeypatch.setattr(oauth_google, "CLIENT_ID", "test-client-id")
    monkeypatch.setattr(oauth_google, "CLIENT_SECRET", "test-client-secret")
    monkeypatch.setattr(oauth_google, "APP_URL", "http://localhost:7732/")

    state = {"claims": {"sub": "google-123", "email": "sam@example.com", "email_verified": True}}

    def fake_exchange(code):
        if code == "bad-code":
            raise ValueError("token exchange failed")
        return {"id_token": "stand-in-id-token"}

    def fake_verify(id_token, expected_nonce):
        # The real implementation checks the signature and nonce against
        # Google's keys; those paths are Google's contract, not ours.
        return state["claims"]

    monkeypatch.setattr(oauth_google, "_exchange_code", fake_exchange)
    monkeypatch.setattr(oauth_google, "_verify_id_token", fake_verify)
    return state


def begin(client):
    """Run the redirect-to-Google step and return the state value."""
    response = client.get("/api/auth/google/start", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"].startswith("https://accounts.google.com/")
    assert oauth_google.STATE_COOKIE in response.cookies
    return response.cookies[oauth_google.STATE_COOKIE]


def finish(client, state, code="good-code"):
    return client.get(
        f"/api/auth/google/callback?code={code}&state={state}", follow_redirects=False
    )


# -- configuration --------------------------------------------------------

def test_unconfigured_server_says_so(client):
    assert client.get("/api/auth/google/start").status_code == 503


def test_providers_endpoint_reports_availability(client, google):
    assert client.get("/api/auth/providers").json()["google"] is True


# -- happy path -----------------------------------------------------------

def test_first_google_sign_in_creates_an_account(client, google, session_factory):
    state = begin(client)
    response = finish(client, state)

    assert response.status_code == 303
    assert response.headers["location"] == "http://localhost:7732/"
    assert client.get("/api/auth/me").json()["email"] == "sam@example.com"

    with session_factory() as session:
        user = session.query(User).one()
        assert user.google_sub == "google-123"
        # No password at all, rather than an unusable placeholder.
        assert user.password_hash is None


def test_returning_google_user_reuses_the_same_account(client, google, session_factory):
    finish(client, begin(client))
    client.post("/api/auth/logout")
    finish(client, begin(client))

    with session_factory() as session:
        assert session.query(User).count() == 1


def test_google_account_can_save_formulas(client, google):
    finish(client, begin(client))
    created = client.post("/api/formulas", json={"name": "Ohm", "expression": "V = I*R"})
    assert created.status_code == 201
    assert [f["name"] for f in client.get("/api/formulas").json()] == ["Ohm"]


def test_changed_google_email_updates_the_account(client, google, session_factory):
    finish(client, begin(client))
    client.post("/api/auth/logout")

    google["claims"] = {"sub": "google-123", "email": "new@example.com", "email_verified": True}
    finish(client, begin(client))

    with session_factory() as session:
        user = session.query(User).one()  # matched on sub, not email
        assert user.email == "new@example.com"


# -- account linking ------------------------------------------------------

def test_verified_google_email_links_to_an_existing_password_account(client, google, session_factory):
    client.post("/api/auth/register", json={"email": "sam@example.com", "password": PASSWORD})
    client.post("/api/auth/logout")

    finish(client, begin(client))
    assert client.get("/api/auth/me").json()["email"] == "sam@example.com"

    with session_factory() as session:
        user = session.query(User).one()  # linked, not duplicated
        assert user.google_sub == "google-123"
        assert user.password_hash is not None  # password login still works


def test_unverified_google_email_cannot_take_over_an_account(client, google, session_factory):
    """The whole basis for linking is Google vouching for the address."""
    client.post("/api/auth/register", json={"email": "sam@example.com", "password": PASSWORD})
    client.post("/api/auth/logout")

    google["claims"] = {"sub": "attacker-999", "email": "sam@example.com", "email_verified": False}
    response = finish(client, begin(client))

    assert response.status_code == 303
    assert "auth_error" in response.headers["location"]
    assert client.get("/api/auth/me").status_code == 401  # no session granted

    with session_factory() as session:
        assert session.query(User).one().google_sub is None


def test_password_login_still_works_after_linking(client, google):
    client.post("/api/auth/register", json={"email": "sam@example.com", "password": PASSWORD})
    client.post("/api/auth/logout")
    finish(client, begin(client))
    client.post("/api/auth/logout")

    assert client.post(
        "/api/auth/login", json={"email": "sam@example.com", "password": PASSWORD}
    ).status_code == 200


def test_google_only_account_cannot_be_logged_into_with_a_password(client, google):
    finish(client, begin(client))
    client.post("/api/auth/logout")
    response = client.post(
        "/api/auth/login", json={"email": "sam@example.com", "password": PASSWORD}
    )
    # Same generic message as any other failure, so the response does not
    # reveal that the address exists under a different sign-in method.
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password."


# -- callback hardening ---------------------------------------------------

def test_callback_without_matching_state_is_refused(client, google):
    begin(client)
    response = finish(client, "a-state-we-never-issued")
    assert response.status_code == 303
    assert "auth_error" in response.headers["location"]
    assert client.get("/api/auth/me").status_code == 401


def test_callback_without_a_state_cookie_is_refused(client, google):
    state = begin(client)
    client.cookies.delete(oauth_google.STATE_COOKIE)
    response = finish(client, state)
    assert "auth_error" in response.headers["location"]
    assert client.get("/api/auth/me").status_code == 401


def test_forged_state_signature_is_refused(client, google):
    """The cookie can be set by an attacker; its signature cannot be forged."""
    forged = "eyJhbGciOiJIUzI1NiJ9.eyJub25jZSI6ICJ4In0.not-a-real-signature"
    client.cookies.set(oauth_google.STATE_COOKIE, forged)
    response = finish(client, forged)
    assert "auth_error" in response.headers["location"]
    assert client.get("/api/auth/me").status_code == 401


def test_cancelled_consent_returns_to_the_app(client, google):
    response = client.get("/api/auth/google/callback?error=access_denied", follow_redirects=False)
    assert response.status_code == 303
    assert "auth_error" in response.headers["location"]


def test_failed_token_exchange_does_not_sign_anyone_in(client, google):
    state = begin(client)
    response = finish(client, state, code="bad-code")
    assert "auth_error" in response.headers["location"]
    assert client.get("/api/auth/me").status_code == 401


def test_state_cookie_is_httponly(client, google):
    response = client.get("/api/auth/google/start", follow_redirects=False)
    header = response.headers["set-cookie"].lower()
    assert "httponly" in header
    assert "samesite=lax" in header


def test_requested_scope_is_identity_only(client, google):
    location = client.get("/api/auth/google/start", follow_redirects=False).headers["location"]
    assert "scope=openid+email" in location or "scope=openid%20email" in location
    assert "drive" not in location and "contacts" not in location
