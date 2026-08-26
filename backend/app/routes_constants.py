"""CRUD for a user's own constants.

The built-in catalogue at ``/api/constants`` covers the usual physical
constants. These are the values particular to somebody's work -- a material's
density, a rig's lever arm, a coefficient they keep reusing -- and the UI offers
them the same way, as a one-click fill when a formula names that symbol.

Ownership is resolved in the query, as with saved formulas: fetching by id and
comparing afterwards is the same logic one forgotten check away from letting
anyone read anyone's data.
"""

from __future__ import annotations

import math

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import auth
from .db import User, UserConstant, get_session
from .models import ConstantRequest, ConstantResponse
from .security import FormulaError, check_symbol_name

router = APIRouter(prefix="/api/my-constants", tags=["constants"])

MAX_PER_USER = 100


def _as_response(constant: UserConstant) -> ConstantResponse:
    return ConstantResponse(
        id=constant.id,
        symbol=constant.symbol,
        value=constant.value,
        name=constant.name,
        unit=constant.unit,
        created_at=constant.created_at,
        updated_at=constant.updated_at,
    )


def _owned(constant_id: int, user: User, session: Session) -> UserConstant:
    constant = session.scalar(
        select(UserConstant).where(
            UserConstant.id == constant_id, UserConstant.user_id == user.id
        )
    )
    if constant is None:
        # 404 rather than 403: a 403 would confirm the id exists.
        raise HTTPException(status_code=404, detail="Constant not found.")
    return constant


def _validated(payload: ConstantRequest) -> tuple[str, float]:
    """Check the symbol is usable in a formula and the value is a real number."""
    try:
        symbol = check_symbol_name(payload.symbol.strip())
    except FormulaError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None

    if not math.isfinite(payload.value):
        raise HTTPException(status_code=400, detail="Value must be a finite number.")

    return symbol, float(payload.value)


@router.get("", response_model=list[ConstantResponse])
def list_constants(
    user: User = Depends(auth.current_user),
    session: Session = Depends(get_session),
) -> list[ConstantResponse]:
    rows = session.scalars(
        select(UserConstant)
        .where(UserConstant.user_id == user.id)
        .order_by(UserConstant.symbol)
    ).all()
    return [_as_response(row) for row in rows]


@router.post("", response_model=ConstantResponse, status_code=status.HTTP_201_CREATED)
def create_constant(
    payload: ConstantRequest,
    user: User = Depends(auth.current_user),
    session: Session = Depends(get_session),
) -> ConstantResponse:
    count = len(session.scalars(
        select(UserConstant.id).where(UserConstant.user_id == user.id)
    ).all())
    if count >= MAX_PER_USER:
        raise HTTPException(
            status_code=400,
            detail=f"You have reached the limit of {MAX_PER_USER} constants.",
        )

    symbol, value = _validated(payload)
    constant = UserConstant(
        user_id=user.id,
        symbol=symbol,
        value=value,
        name=payload.name.strip(),
        unit=payload.unit.strip(),
    )
    session.add(constant)
    try:
        session.commit()
    except IntegrityError:
        # The unique index is the real guard: checking first and inserting after
        # leaves a window where two simultaneous writes both pass.
        session.rollback()
        raise HTTPException(
            status_code=409, detail=f"You already have a constant called '{symbol}'."
        ) from None

    session.refresh(constant)
    return _as_response(constant)


@router.put("/{constant_id}", response_model=ConstantResponse)
def update_constant(
    constant_id: int,
    payload: ConstantRequest,
    user: User = Depends(auth.current_user),
    session: Session = Depends(get_session),
) -> ConstantResponse:
    constant = _owned(constant_id, user, session)
    symbol, value = _validated(payload)

    constant.symbol = symbol
    constant.value = value
    constant.name = payload.name.strip()
    constant.unit = payload.unit.strip()
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=409, detail=f"You already have a constant called '{symbol}'."
        ) from None

    session.refresh(constant)
    return _as_response(constant)


@router.delete("/{constant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_constant(
    constant_id: int,
    user: User = Depends(auth.current_user),
    session: Session = Depends(get_session),
) -> None:
    session.delete(_owned(constant_id, user, session))
    session.commit()
