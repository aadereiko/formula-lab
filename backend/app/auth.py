"""Authentication: password hashing, session tokens, and the current-user dependency.

Design choices worth knowing:

* **Argon2, not bcrypt.** bcrypt silently truncates at 72 bytes, so a long
  passphrase is weaker than it looks and needs a pre-hashing workaround. Argon2
  has no such limit.
* **JWT in an httpOnly cookie, not localStorage.** A token in localStorage is
  readable by any injected script; an httpOnly cookie is not. ``SameSite=Lax``
  keeps the cookie off cross-site POSTs, which covers CSRF without a separate
  token exchange.
* **Production fails fast.** Running without a configured secret is safe to do
  by accident in development and never in production, so the environment
  decides whether a missing secret is a warning or an error.
"""

from __future__ import annotations

import logging
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Cookie, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import User, get_session

logger = logging.getLogger("formula_lab.auth")

ENVIRONMENT = os.environ.get("FORMULA_LAB_ENV", "development").lower()
IS_PRODUCTION = ENVIRONMENT == "production"

COOKIE_NAME = "formula_lab_session"
TOKEN_ALGORITHM = "HS256"
TOKEN_TTL = timedelta(days=14)

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 256

_hasher = PasswordHasher()


# --------------------------------------------------------------------------
# Secret
# --------------------------------------------------------------------------

def _load_secret() -> str:
    configured = os.environ.get("FORMULA_LAB_SECRET", "").strip()
    if configured:
        return configured

    if IS_PRODUCTION:
        raise RuntimeError(
            "FORMULA_LAB_SECRET must be set when FORMULA_LAB_ENV=production. "
            "Generate one with: python -c 'import secrets; print(secrets.token_urlsafe(48))'"
        )

    # Development: persist a generated secret so restarting the server does not
    # log everyone out. 0600 and gitignored.
    secret_file = Path(__file__).resolve().parent.parent / ".secret"
    if secret_file.exists():
        return secret_file.read_text().strip()

    generated = secrets.token_urlsafe(48)
    secret_file.write_text(generated)
    secret_file.chmod(0o600)
    logger.warning("Generated a development secret at %s -- do not use in production.", secret_file)
    return generated


SECRET = _load_secret()


# --------------------------------------------------------------------------
# Passwords
# --------------------------------------------------------------------------

class AuthError(Exception):
    """Something the user can fix; the message is safe to display."""


def validate_password(password: str) -> str:
    if not isinstance(password, str):
        raise AuthError("Password must be text.")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise AuthError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
    if len(password) > MAX_PASSWORD_LENGTH:
        raise AuthError(f"Password must be at most {MAX_PASSWORD_LENGTH} characters.")
    return password


def hash_password(password: str) -> str:
    return _hasher.hash(validate_password(password))


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False  # a Google-only account has no password to check
    try:
        _hasher.verify(password_hash, password)
        return True
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


#: A real Argon2 hash of a throwaway value. Verifying against it when an email
#: is unknown makes a failed login cost the same either way, so response timing
#: does not reveal which addresses have accounts.
_DUMMY_HASH = _hasher.hash("timing-equalisation-placeholder")


def verify_user_password(user: User | None, password: str) -> bool:
    """Check a password, at constant-ish cost whether or not the account exists.

    Also covers the Google-only case: no stored hash means no password login,
    and we still burn one Argon2 verification so the timing matches.
    """
    if user is None or not user.password_hash:
        verify_password(password, _DUMMY_HASH)
        return False
    return verify_password(password, user.password_hash)


# --------------------------------------------------------------------------
# Login throttling
# --------------------------------------------------------------------------

FAILURE_WINDOW = 15 * 60
MAX_FAILURES = 10

#: In-memory, therefore per-process: with several workers the effective limit
#: is MAX_FAILURES per worker. Enough to blunt a script against a small
#: deployment; a multi-worker or multi-instance setup wants Redis instead.
_failures: dict[str, list[float]] = {}


def _recent(key: str, now: float) -> list[float]:
    kept = [t for t in _failures.get(key, []) if now - t < FAILURE_WINDOW]
    if kept:
        _failures[key] = kept
    else:
        _failures.pop(key, None)
    return kept


def throttle_check(key: str) -> None:
    if len(_recent(key, time.time())) >= MAX_FAILURES:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Try again in a few minutes.",
        )


def throttle_record_failure(key: str) -> None:
    now = time.time()
    _failures.setdefault(key, _recent(key, now)).append(now)


def throttle_clear(key: str) -> None:
    _failures.pop(key, None)


# --------------------------------------------------------------------------
# Tokens and cookies
# --------------------------------------------------------------------------

def create_token(user: User) -> str:
    issued = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": str(user.id), "iat": issued, "exp": issued + TOKEN_TTL},
        SECRET,
        algorithm=TOKEN_ALGORITHM,
    )


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=int(TOKEN_TTL.total_seconds()),
        httponly=True,
        # HTTPS-only in production; local development is served over http.
        secure=IS_PRODUCTION,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="lax")


# --------------------------------------------------------------------------
# Dependencies
# --------------------------------------------------------------------------

_UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to continue."
)


def current_user_optional(
    session: Session = Depends(get_session),
    formula_lab_session: str | None = Cookie(default=None),
) -> User | None:
    """The signed-in user, or None. For endpoints that work either way."""
    if not formula_lab_session:
        return None
    try:
        payload = jwt.decode(formula_lab_session, SECRET, algorithms=[TOKEN_ALGORITHM])
    except jwt.PyJWTError:
        return None  # expired, tampered with, or signed by a previous secret

    subject = payload.get("sub")
    if not subject:
        return None
    try:
        user_id = int(subject)
    except (TypeError, ValueError):
        return None

    return session.get(User, user_id)


def current_user(user: User | None = Depends(current_user_optional)) -> User:
    """The signed-in user, or a 401. For endpoints that require an account."""
    if user is None:
        raise _UNAUTHENTICATED
    return user


def find_user_by_email(session: Session, email: str) -> User | None:
    return session.scalar(select(User).where(User.email == normalise_email(email)))


def normalise_email(email: str) -> str:
    return email.strip().lower()
