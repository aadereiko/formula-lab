"""Google sign-in via the OAuth 2.0 authorization-code flow.

Flow, and why each step exists:

1. ``/api/auth/google/start`` redirects the browser to Google, carrying a
   ``state`` value that is also set as a short-lived httpOnly cookie.
2. Google sends the browser back to ``/api/auth/google/callback`` with a code.
   The ``state`` in the query must match the cookie -- otherwise an attacker
   could feed a victim a callback URL containing *their* code and quietly link
   the victim's browser to the attacker's Google account.
3. The code is exchanged for tokens **server to server**, using the client
   secret. The secret never reaches the browser, and neither does the code's
   value in any usable form.
4. The returned ID token is verified against Google's published keys, then its
   ``email``/``sub``/``email_verified`` claims decide which account to use.

Nothing here works until credentials are configured; see the README. When they
are absent the endpoints report that cleanly instead of half-working.
"""

from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import auth
from .db import User, get_session

logger = logging.getLogger("formula_lab.oauth")

router = APIRouter(prefix="/api/auth/google", tags=["auth"])

CLIENT_ID = os.environ.get("FORMULA_LAB_GOOGLE_CLIENT_ID", "").strip()
CLIENT_SECRET = os.environ.get("FORMULA_LAB_GOOGLE_CLIENT_SECRET", "").strip()
REDIRECT_URI = os.environ.get(
    "FORMULA_LAB_GOOGLE_REDIRECT_URI", "http://localhost:7732/api/auth/google/callback"
).strip()
#: Where to send the browser once sign-in finishes.
APP_URL = os.environ.get("FORMULA_LAB_APP_URL", "http://localhost:7732/").strip()

AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs"
ISSUERS = ("https://accounts.google.com", "accounts.google.com")

STATE_COOKIE = "formula_lab_oauth_state"
STATE_TTL = timedelta(minutes=10)


def is_configured() -> bool:
    return bool(CLIENT_ID and CLIENT_SECRET)


def _require_configured() -> None:
    if not is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured on this server.",
        )


#: Fetched lazily and cached by PyJWT, so the keys are not re-downloaded per
#: login. Created on first use to keep import time free of network calls.
_jwk_client: jwt.PyJWKClient | None = None


def _jwks() -> jwt.PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        _jwk_client = jwt.PyJWKClient(JWKS_URI, cache_keys=True)
    return _jwk_client


def _fail(message: str) -> RedirectResponse:
    """Send the user back to the app with an error to display.

    A raw 400 here would leave them on a blank API page mid-login.
    """
    separator = "&" if "?" in APP_URL else "?"
    return RedirectResponse(f"{APP_URL}{separator}auth_error={message}", status_code=303)


# --------------------------------------------------------------------------
# Step 1: send the user to Google
# --------------------------------------------------------------------------

@router.get("/start")
def start(response: Response) -> RedirectResponse:
    _require_configured()

    nonce = secrets.token_urlsafe(24)
    issued = datetime.now(timezone.utc)
    state = jwt.encode(
        {"nonce": nonce, "iat": issued, "exp": issued + STATE_TTL},
        auth.SECRET,
        algorithm=auth.TOKEN_ALGORITHM,
    )

    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        # Only identity. No Drive, no contacts, nothing else to explain to the
        # user on the consent screen.
        "scope": "openid email",
        "state": state,
        "nonce": nonce,
        # Ask Google to show the chooser rather than silently reusing a session.
        "prompt": "select_account",
    }
    redirect = RedirectResponse(f"{AUTHORIZE_ENDPOINT}?{httpx.QueryParams(params)}", status_code=307)
    redirect.set_cookie(
        STATE_COOKIE,
        state,
        max_age=int(STATE_TTL.total_seconds()),
        httponly=True,
        secure=auth.IS_PRODUCTION,
        # The callback is a top-level GET navigation from Google, which Lax
        # allows; Strict would drop the cookie and break every sign-in.
        samesite="lax",
        path="/",
    )
    return redirect


# --------------------------------------------------------------------------
# Step 2-4: handle Google's callback
# --------------------------------------------------------------------------

def _exchange_code(code: str) -> dict:
    """Trade the authorization code for tokens, server to server."""
    response = httpx.post(
        TOKEN_ENDPOINT,
        data={
            "code": code,
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "redirect_uri": REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        timeout=10.0,
    )
    if response.status_code != 200:
        logger.warning("Google token exchange failed: %s", response.text[:200])
        raise ValueError("token exchange failed")
    return response.json()


def _verify_id_token(id_token: str, expected_nonce: str) -> dict:
    """Verify the ID token's signature and claims against Google's keys."""
    signing_key = _jwks().get_signing_key_from_jwt(id_token)
    claims = jwt.decode(
        id_token,
        signing_key.key,
        algorithms=["RS256"],
        audience=CLIENT_ID,
        # Confirms the token was minted for this login attempt, not replayed
        # from another one.
        options={"require": ["exp", "iat", "aud", "iss", "sub"]},
    )
    if claims.get("iss") not in ISSUERS:
        raise ValueError("unexpected issuer")
    if expected_nonce and claims.get("nonce") != expected_nonce:
        raise ValueError("nonce mismatch")
    return claims


def _account_for(session: Session, claims: dict) -> User:
    """Find or create the account this Google identity maps to."""
    subject = str(claims.get("sub", "")).strip()
    email = auth.normalise_email(str(claims.get("email", "")))
    verified = claims.get("email_verified") in (True, "true")

    if not subject or not email:
        raise ValueError("Google did not return an email address")

    # Match on `sub` first: it survives the user changing their Google email.
    user = session.scalar(select(User).where(User.google_sub == subject))
    if user is not None:
        if user.email != email and verified:
            user.email = email
        return user

    existing = session.scalar(select(User).where(User.email == email))
    if existing is not None:
        # Linking a Google identity to a password account hands over that
        # account, so it requires Google to actually vouch for the address.
        if not verified:
            raise ValueError(
                "Google has not verified that email address, so it cannot be "
                "linked to an existing account."
            )
        existing.google_sub = subject
        return existing

    user = User(email=email, password_hash=None, google_sub=subject)
    session.add(user)
    return user


@router.get("/callback")
def callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    session: Session = Depends(get_session),
):
    _require_configured()

    if error:
        return _fail("Google sign-in was cancelled.")
    if not code or not state:
        return _fail("Google sign-in did not complete.")

    cookie_state = request.cookies.get(STATE_COOKIE)
    if not cookie_state or not secrets.compare_digest(cookie_state, state):
        # Mismatch means this callback was not started by this browser.
        return _fail("Sign-in session expired. Please try again.")

    try:
        state_claims = jwt.decode(state, auth.SECRET, algorithms=[auth.TOKEN_ALGORITHM])
    except jwt.PyJWTError:
        return _fail("Sign-in session expired. Please try again.")

    try:
        tokens = _exchange_code(code)
        id_token = tokens.get("id_token")
        if not id_token:
            raise ValueError("no id_token in Google's response")
        claims = _verify_id_token(id_token, state_claims.get("nonce", ""))
    except (ValueError, jwt.PyJWTError, httpx.HTTPError) as exc:
        logger.warning("Google sign-in failed: %s", exc)
        return _fail("Could not verify your Google account.")

    try:
        user = _account_for(session, claims)
        session.commit()
    except ValueError as exc:
        session.rollback()
        return _fail(str(exc))
    except IntegrityError:
        session.rollback()
        return _fail("That account is already linked to another sign-in method.")

    session.refresh(user)
    redirect = RedirectResponse(APP_URL, status_code=303)
    auth.set_session_cookie(redirect, auth.create_token(user))
    redirect.delete_cookie(STATE_COOKIE, path="/")
    return redirect
