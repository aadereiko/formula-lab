"""Request and response schemas.

Pydantic is the outermost validation layer: it rejects wrong *shapes* (missing
fields, a list where a number belongs) before anything reaches the parser. The
formula's own contents are then vetted by :mod:`app.security`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


class AnalyzeRequest(BaseModel):
    expression: str = Field(..., max_length=500, description="Formula or equation")


class AnalyzeResponse(BaseModel):
    expression: str
    is_equation: bool
    symbols: list[str]
    latex: str
    functions_used: list[str] = []


class EvaluateRequest(BaseModel):
    expression: str = Field(..., max_length=500)
    values: dict[str, Any] = Field(default_factory=dict, description="Variable assignments")
    solve_for: str | None = Field(default=None, description="Variable to solve for")
    precision: int = Field(default=6, ge=1, le=15, description="Significant digits")


class Solution(BaseModel):
    value: float | None
    formatted: str
    exact: str
    latex: str
    is_real: bool | None


class Step(BaseModel):
    label: str
    latex: str


class EvaluateResponse(BaseModel):
    mode: str
    solve_for: str | None
    latex: str
    symbols: list[str]
    solutions: list[Solution]
    primary: Solution
    steps: list[Step]


class ErrorResponse(BaseModel):
    error: str


# --------------------------------------------------------------------------
# Accounts
# --------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=256)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., max_length=256)


class UserResponse(BaseModel):
    id: int
    email: str
    created_at: datetime


# --------------------------------------------------------------------------
# Saved formulas
# --------------------------------------------------------------------------

class SavedFormulaRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    expression: str = Field(..., min_length=1, max_length=500)
    #: What the formula is for. Shown as "Description" in the UI.
    note: str = Field(default="", max_length=2000)
    values: dict[str, str] = Field(default_factory=dict)
    solve_for: str | None = Field(default=None, max_length=64)
    #: What each symbol means: {"m": "mass (kg)"}.
    variable_notes: dict[str, str] = Field(default_factory=dict)
    #: Which rubric it belongs to, matching the built-in library's categories.
    category: str = Field(default="", max_length=60)
    #: Pinned formulas sort to the top of every list.
    pinned: bool = False


class SavedFormulaResponse(BaseModel):
    id: int
    name: str
    expression: str
    note: str
    values: dict[str, str]
    variable_notes: dict[str, str]
    solve_for: str | None
    category: str
    pinned: bool
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------
# User-defined constants
# --------------------------------------------------------------------------

class ConstantRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=64)
    value: float
    name: str = Field(default="", max_length=120)
    unit: str = Field(default="", max_length=40)


class ConstantResponse(BaseModel):
    id: int
    symbol: str
    value: float
    name: str
    unit: str
    created_at: datetime
    updated_at: datetime
