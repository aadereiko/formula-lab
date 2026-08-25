"""CRUD for a user's own saved formulas.

Every route resolves the formula through :func:`_owned_formula`, which filters
by owner in the query itself. Fetching by id and *then* comparing owners is the
same logic but one forgotten check away from letting anyone read anyone's data
by changing a number in the URL.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import auth, runner
from .db import SavedFormula, User, get_session
from .models import SavedFormulaRequest, SavedFormulaResponse
from .security import FormulaError, check_symbol_name

router = APIRouter(prefix="/api/formulas", tags=["formulas"])

MAX_SAVED_PER_USER = 200


def _as_response(formula: SavedFormula) -> SavedFormulaResponse:
    try:
        values = json.loads(formula.values_json)
        if not isinstance(values, dict):
            values = {}
    except (TypeError, ValueError):
        values = {}

    return SavedFormulaResponse(
        id=formula.id,
        name=formula.name,
        expression=formula.expression,
        note=formula.note,
        values={str(k): str(v) for k, v in values.items()},
        solve_for=formula.solve_for,
        created_at=formula.created_at,
        updated_at=formula.updated_at,
    )


def _owned_formula(formula_id: int, user: User, session: Session) -> SavedFormula:
    """Load a formula belonging to this user, or 404.

    404 rather than 403: a 403 would confirm the id exists and belongs to
    somebody, which is information the requester has no business having.
    """
    formula = session.scalar(
        select(SavedFormula).where(
            SavedFormula.id == formula_id, SavedFormula.user_id == user.id
        )
    )
    if formula is None:
        raise HTTPException(status_code=404, detail="Formula not found.")
    return formula


def _validated_payload(payload: SavedFormulaRequest) -> tuple[str, str]:
    """Check the expression parses, and normalise the name.

    Saving a formula that cannot be parsed would produce a library entry that
    fails the moment it is opened, so the parser is the gate here too.
    """
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Give the formula a name.")

    try:
        analysis = runner.analyze(payload.expression)
    except FormulaError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None

    if payload.solve_for is not None:
        try:
            check_symbol_name(payload.solve_for)
        except FormulaError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from None
        if payload.solve_for not in analysis["symbols"]:
            raise HTTPException(
                status_code=400,
                detail=f"'{payload.solve_for}' is not a variable in this formula.",
            )

    return name, analysis["expression"]


def _values_json(payload: SavedFormulaRequest) -> str:
    # Names are validated so a saved formula cannot carry junk keys that would
    # be rejected on every later evaluate call.
    cleaned: dict[str, str] = {}
    for key, value in payload.values.items():
        try:
            check_symbol_name(key)
        except FormulaError:
            continue
        text = str(value).strip()
        if text:
            cleaned[key] = text[:64]
    return json.dumps(cleaned)


@router.get("", response_model=list[SavedFormulaResponse])
def list_formulas(
    user: User = Depends(auth.current_user),
    session: Session = Depends(get_session),
) -> list[SavedFormulaResponse]:
    rows = session.scalars(
        select(SavedFormula)
        .where(SavedFormula.user_id == user.id)
        .order_by(SavedFormula.updated_at.desc())
    ).all()
    return [_as_response(row) for row in rows]


@router.post("", response_model=SavedFormulaResponse, status_code=status.HTTP_201_CREATED)
def create_formula(
    payload: SavedFormulaRequest,
    user: User = Depends(auth.current_user),
    session: Session = Depends(get_session),
) -> SavedFormulaResponse:
    count = len(session.scalars(
        select(SavedFormula.id).where(SavedFormula.user_id == user.id)
    ).all())
    if count >= MAX_SAVED_PER_USER:
        raise HTTPException(
            status_code=400,
            detail=f"You have reached the limit of {MAX_SAVED_PER_USER} saved formulas.",
        )

    name, expression = _validated_payload(payload)
    formula = SavedFormula(
        user_id=user.id,
        name=name,
        expression=expression,
        note=payload.note.strip(),
        values_json=_values_json(payload),
        solve_for=payload.solve_for,
    )
    session.add(formula)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=409, detail=f"You already have a formula named '{name}'."
        ) from None

    session.refresh(formula)
    return _as_response(formula)


@router.put("/{formula_id}", response_model=SavedFormulaResponse)
def update_formula(
    formula_id: int,
    payload: SavedFormulaRequest,
    user: User = Depends(auth.current_user),
    session: Session = Depends(get_session),
) -> SavedFormulaResponse:
    formula = _owned_formula(formula_id, user, session)
    name, expression = _validated_payload(payload)

    formula.name = name
    formula.expression = expression
    formula.note = payload.note.strip()
    formula.values_json = _values_json(payload)
    formula.solve_for = payload.solve_for
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=409, detail=f"You already have a formula named '{name}'."
        ) from None

    session.refresh(formula)
    return _as_response(formula)


@router.delete("/{formula_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_formula(
    formula_id: int,
    user: User = Depends(auth.current_user),
    session: Session = Depends(get_session),
) -> None:
    session.delete(_owned_formula(formula_id, user, session))
    session.commit()
