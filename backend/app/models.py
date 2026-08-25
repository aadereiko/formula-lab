"""Request and response schemas.

Pydantic is the outermost validation layer: it rejects wrong *shapes* (missing
fields, a list where a number belongs) before anything reaches the parser. The
formula's own contents are then vetted by :mod:`app.security`.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


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
