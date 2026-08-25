"""FastAPI application for Formula Lab."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import formulas, runner
from .engine import ALLOWED_FUNCTIONS, MAX_EXPONENT, MAX_NODES, MAX_SYMBOLS
from .models import (
    AnalyzeRequest,
    AnalyzeResponse,
    ErrorResponse,
    EvaluateRequest,
    EvaluateResponse,
)
from .security import MAX_LENGTH, FormulaError

# Ports chosen to avoid collisions with other local projects.
DEFAULT_PORT = 7731
FRONTEND_PORT = 7732


@asynccontextmanager
async def lifespan(app: FastAPI):
    # First request pays the SymPy import cost in a worker otherwise (~1s).
    runner.warmup()
    yield
    runner.shutdown()


app = FastAPI(
    title="Formula Lab API",
    description="Parse, evaluate and rearrange physics formulas.",
    version="1.0.0",
    lifespan=lifespan,
)

_origins = os.environ.get(
    "FORMULA_LAB_ORIGINS",
    f"http://localhost:{FRONTEND_PORT},http://127.0.0.1:{FRONTEND_PORT}",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.exception_handler(FormulaError)
async def formula_error_handler(_request, exc: FormulaError) -> JSONResponse:
    """Turn a user-fixable formula problem into a clean 400.

    These messages are written to be shown verbatim in the UI -- they say what
    to change, never what went wrong internally.
    """
    return JSONResponse(status_code=400, content={"error": str(exc)})


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/capabilities")
async def capabilities() -> dict[str, object]:
    """What the parser accepts -- drives the in-app help panel."""
    return {
        "functions": sorted(ALLOWED_FUNCTIONS),
        "limits": {
            "max_length": MAX_LENGTH,
            "max_nodes": MAX_NODES,
            "max_exponent": MAX_EXPONENT,
            "max_symbols": MAX_SYMBOLS,
        },
        "syntax": [
            "Implicit multiplication: `2m` means `2*m`",
            "`^` and `**` both mean exponentiation",
            "Subscripts with underscores: `v_0`, `m_1`, `E_k`",
            "Greek names are spelled out: `theta`, `lambda`, `omega`",
            "Trigonometric functions take radians",
        ],
    }


@app.get("/api/formulas")
async def formula_library() -> dict[str, object]:
    return {
        "categories": formulas.categories(),
        "formulas": formulas.FORMULAS,
    }


@app.get("/api/constants")
async def constants() -> dict[str, object]:
    return {"constants": formulas.CONSTANTS}


@app.post(
    "/api/analyze",
    response_model=AnalyzeResponse,
    responses={400: {"model": ErrorResponse}},
)
async def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    """Inspect a formula: its variables, whether it is an equation, its LaTeX.

    Called as the user types, so the UI can render input fields for exactly the
    variables the formula mentions.
    """
    return AnalyzeResponse(**runner.analyze(request.expression))


@app.post(
    "/api/evaluate",
    response_model=EvaluateResponse,
    responses={400: {"model": ErrorResponse}},
)
async def evaluate(request: EvaluateRequest) -> EvaluateResponse:
    """Evaluate an expression, or solve an equation for its one unknown."""
    return EvaluateResponse(**runner.evaluate(
        request.expression,
        request.values,
        request.solve_for,
        request.precision,
    ))


def main() -> None:
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=os.environ.get("FORMULA_LAB_HOST", "127.0.0.1"),
        port=int(os.environ.get("FORMULA_LAB_PORT", DEFAULT_PORT)),
        reload=bool(os.environ.get("FORMULA_LAB_RELOAD")),
    )


if __name__ == "__main__":
    main()
