"""Pins on the built-in library.

The library is read-only, so a pin cannot be stored on the formula. It is held
here as a reference by id, which has a useful side effect: a pin survives the
library's wording or expression changing underneath it.

The two writing verbs are idempotent on purpose -- pinning something already
pinned is a success, not a conflict, because the caller's intent is satisfied
either way.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import auth, formulas
from .db import PinnedLibraryFormula, User, get_session

router = APIRouter(prefix="/api/pinned-library", tags=["formulas"])

MAX_PER_USER = 100
_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,79}$")


def _known_ids() -> set[str]:
    return {formula["id"] for formula in formulas.FORMULAS}


def _validated(library_id: str) -> str:
    """Only ids the library actually has, so a pin can never dangle."""
    if not _ID.match(library_id) or library_id not in _known_ids():
        raise HTTPException(status_code=404, detail="No such library formula.")
    return library_id


@router.get("", response_model=list[str])
def list_pins(
    user: User = Depends(auth.current_user),
    session: Session = Depends(get_session),
) -> list[str]:
    rows = session.scalars(
        select(PinnedLibraryFormula.library_id)
        .where(PinnedLibraryFormula.user_id == user.id)
        .order_by(PinnedLibraryFormula.created_at)
    ).all()
    # Filter against the current library: a formula removed from a later
    # release should stop appearing rather than 404 on open.
    known = _known_ids()
    return [row for row in rows if row in known]


@router.put("/{library_id}", status_code=status.HTTP_204_NO_CONTENT)
def pin(
    library_id: str,
    user: User = Depends(auth.current_user),
    session: Session = Depends(get_session),
) -> None:
    library_id = _validated(library_id)

    count = len(session.scalars(
        select(PinnedLibraryFormula.id).where(PinnedLibraryFormula.user_id == user.id)
    ).all())
    if count >= MAX_PER_USER:
        raise HTTPException(
            status_code=400, detail=f"You have reached the limit of {MAX_PER_USER} pins."
        )

    session.add(PinnedLibraryFormula(user_id=user.id, library_id=library_id))
    try:
        session.commit()
    except IntegrityError:
        # Already pinned. The caller wanted it pinned; it is.
        session.rollback()


@router.delete("/{library_id}", status_code=status.HTTP_204_NO_CONTENT)
def unpin(
    library_id: str,
    user: User = Depends(auth.current_user),
    session: Session = Depends(get_session),
) -> None:
    existing = session.scalar(
        select(PinnedLibraryFormula).where(
            PinnedLibraryFormula.user_id == user.id,
            PinnedLibraryFormula.library_id == library_id,
        )
    )
    # Unpinning something that is not pinned is also a success.
    if existing is not None:
        session.delete(existing)
        session.commit()
