"""Rubrics a user invented.

A formula's category is free text, so a custom rubric works without this
endpoint -- but only while a formula is still filed under it. Keeping the names
separately is what lets one be offered back to the person who coined it, which
is the difference between a rubric and a typo.

Create is idempotent: asking for a category you already have is a success,
because the caller's intent is satisfied either way.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import auth
from .db import SavedFormula, User, UserCategory, get_session
from .models import CategoryRequest

router = APIRouter(prefix="/api/categories", tags=["formulas"])

MAX_PER_USER = 60
MAX_LENGTH = 60


def _clean(name: str) -> str:
    """One rubric per idea, not one per way of typing it."""
    # Collapse internal runs of whitespace too: "Optics  rig" and "Optics rig"
    # are the same rubric, and only one of them can be suggested.
    cleaned = " ".join(name.split())
    if not cleaned:
        raise HTTPException(status_code=422, detail="A category needs a name.")
    if len(cleaned) > MAX_LENGTH:
        raise HTTPException(
            status_code=422, detail=f"Keep a category under {MAX_LENGTH} characters."
        )
    return cleaned


def _existing(session: Session, user_id: int, name: str) -> UserCategory | None:
    """Matched without regard to case, so `Optics` cannot join `optics`."""
    return session.scalar(
        select(UserCategory).where(
            UserCategory.user_id == user_id,
            func.lower(UserCategory.name) == name.lower(),
        )
    )


@router.get("", response_model=list[str])
def list_categories(
    user: User = Depends(auth.current_user),
    session: Session = Depends(get_session),
) -> list[str]:
    """Every rubric this account can be offered, alphabetically.

    Categories still in use by a formula are included even if the name was
    never recorded here -- formulas saved before this endpoint existed, or
    written by an older client, should not lose their rubric from the list.
    """
    recorded = session.scalars(
        select(UserCategory.name).where(UserCategory.user_id == user.id)
    ).all()
    in_use = session.scalars(
        select(SavedFormula.category).where(
            SavedFormula.user_id == user.id, SavedFormula.category != ""
        )
    ).all()

    seen: dict[str, str] = {}
    for name in list(recorded) + list(in_use):
        seen.setdefault(name.lower(), name)
    return sorted(seen.values(), key=str.casefold)


@router.post("", status_code=status.HTTP_204_NO_CONTENT)
def add_category(
    payload: CategoryRequest,
    user: User = Depends(auth.current_user),
    session: Session = Depends(get_session),
) -> None:
    name = _clean(payload.name)

    if _existing(session, user.id, name) is not None:
        return  # already recorded, under this spelling or another case

    count = len(
        session.scalars(
            select(UserCategory.id).where(UserCategory.user_id == user.id)
        ).all()
    )
    if count >= MAX_PER_USER:
        raise HTTPException(
            status_code=400,
            detail=f"You have reached the limit of {MAX_PER_USER} categories.",
        )

    session.add(UserCategory(user_id=user.id, name=name))
    try:
        session.commit()
    except IntegrityError:
        # Two requests raced for the same name. Either one satisfies the caller.
        session.rollback()


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def remove_category(
    name: str = Query(..., max_length=MAX_LENGTH),
    user: User = Depends(auth.current_user),
    session: Session = Depends(get_session),
) -> None:
    """Stops offering a rubric. Formulas filed under it are left alone.

    Deleting the name is not deleting the formulas, and silently re-filing
    somebody's work would be a far bigger action than the one they asked for.
    The rubric therefore keeps appearing while anything still uses it -- which
    `list_categories` reflects, so the button tells the truth.
    """
    existing = _existing(session, user.id, " ".join(name.split()))
    # Removing something already absent is also a success.
    if existing is not None:
        session.delete(existing)
        session.commit()
