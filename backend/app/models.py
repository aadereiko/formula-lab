"""Request and response schemas.

Pydantic is the outermost validation layer: it rejects wrong *shapes* (missing
fields, a list where a number belongs) before anything reaches the parser. The
formula's own contents are then vetted by :mod:`app.security`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field

from .engine import DEFAULT_SAMPLES, MAX_SAMPLES


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
# Plots
# --------------------------------------------------------------------------

class PlotAxis(BaseModel):
    """One variable to sweep, and over what."""

    variable: str = Field(..., max_length=64)
    #: Not constrained to be finite here -- pydantic accepts inf and nan as
    #: floats, so the engine checks. Nor ordered: "min above max" is a message
    #: worth writing ourselves rather than leaving to a 422.
    min: float
    max: float


class PlotRequest(BaseModel):
    expression: str = Field(..., max_length=500)
    values: dict[str, Any] = Field(default_factory=dict)
    #: Which variable the plot is *of*. Inferred from the single blank when the
    #: formula is an equation and only one is left, exactly as evaluation does.
    solve_for: str | None = Field(default=None, max_length=64)
    #: One axis draws a curve, two a surface.
    axes: list[PlotAxis] = Field(..., min_length=1, max_length=2)
    #: Points along each axis. The engine lowers this for a surface, where the
    #: grid is the square of it, and reports back what it actually used.
    samples: int = Field(default=DEFAULT_SAMPLES, ge=2, le=MAX_SAMPLES)


class PlotAxisResponse(PlotAxis):
    samples: int


class PlotSeries(BaseModel):
    label: str
    #: One row per step of the second axis; a curve has a single row. ``None`` is
    #: a point where the formula has no real value -- a gap, not a zero.
    samples: list[list[float | None]]


class PlotResponse(BaseModel):
    mode: str
    latex: str
    value_label: str
    axes: list[PlotAxisResponse]
    series: list[PlotSeries]
    value_min: float | None
    value_max: float | None
    note: str = ""


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
    #: Kept out of the sidebar menu, still listed on the formulas page.
    hidden: bool = False


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
    hidden: bool
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------
# User-defined categories
# --------------------------------------------------------------------------

class CategoryRequest(BaseModel):
    #: Trimmed and whitespace-collapsed server-side, so the length cap here is
    #: a bound on the payload rather than the final name.
    name: str = Field(..., min_length=1, max_length=120)


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
