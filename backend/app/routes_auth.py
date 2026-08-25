"""Account endpoints: register, log in, log out, and identify."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import auth
from .db import User, get_session
from .models import LoginRequest, RegisterRequest, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _as_response(user: User) -> UserResponse:
    return UserResponse(id=user.id, email=user.email, created_at=user.created_at)


def _client_key(request: Request, email: str) -> str:
    """Throttle key: the client address paired with the address being tried.

    Keying on both means one attacker cannot lock a victim out of their own
    account by deliberately failing against it from elsewhere.
    """
    host = request.client.host if request.client else "unknown"
    return f"{host}:{auth.normalise_email(email)}"


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    response: Response,
    session: Session = Depends(get_session),
) -> UserResponse:
    email = auth.normalise_email(payload.email)

    try:
        password_hash = auth.hash_password(payload.password)
    except auth.AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None

    user = User(email=email, password_hash=password_hash)
    session.add(user)
    try:
        session.commit()
    except IntegrityError:
        # The unique index is the real guard: checking first and inserting after
        # leaves a window where two simultaneous registrations both pass.
        session.rollback()
        raise HTTPException(status_code=409, detail="That email is already registered.") from None

    session.refresh(user)
    auth.set_session_cookie(response, auth.create_token(user))
    return _as_response(user)


@router.post("/login", response_model=UserResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> UserResponse:
    key = _client_key(request, payload.email)
    auth.throttle_check(key)

    user = auth.find_user_by_email(session, payload.email)
    if not auth.verify_user_password(user, payload.password):
        auth.throttle_record_failure(key)
        # One message for both "no such account" and "wrong password", so the
        # response cannot be used to discover which addresses are registered.
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    assert user is not None  # verify_user_password returns False when None
    auth.throttle_clear(key)
    auth.set_session_cookie(response, auth.create_token(user))
    return _as_response(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    auth.clear_session_cookie(response)


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(auth.current_user)) -> UserResponse:
    return _as_response(user)
