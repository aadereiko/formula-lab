"""FastAPI application for Formula Lab."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import (
    auth,
    db,
    formulas,
    oauth_google,
    routes_auth,
    routes_categories,
    routes_constants,
    routes_formulas,
    routes_library_pins,
    runner,
)
from .engine import (
    ALLOWED_FUNCTIONS,
    FUNCTION_HELP,
    MAX_EXPONENT,
    MAX_GRID_SAMPLES,
    MAX_NODES,
    MAX_SAMPLES,
    MAX_SYMBOLS,
)
from .models import (
    AnalyzeRequest,
    AnalyzeResponse,
    ErrorResponse,
    EvaluateRequest,
    EvaluateResponse,
    PlotRequest,
    PlotResponse,
)
from .security import MAX_LENGTH, FormulaError

# Ports chosen to avoid collisions with other local projects.
DEFAULT_PORT = 7731
FRONTEND_PORT = 7732


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
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


@app.exception_handler(auth.AuthError)
async def auth_error_handler(_request, exc: auth.AuthError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"error": str(exc)})


@app.exception_handler(FormulaError)
async def formula_error_handler(_request, exc: FormulaError) -> JSONResponse:
    """Turn a user-fixable formula problem into a clean 400.

    These messages are written to be shown verbatim in the UI -- they say what
    to change, never what went wrong internally.
    """
    return JSONResponse(status_code=400, content={"error": str(exc)})


app.include_router(routes_auth.router)
app.include_router(oauth_google.router)
app.include_router(routes_formulas.router)
app.include_router(routes_constants.router)
app.include_router(routes_library_pins.router)
app.include_router(routes_categories.router)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/auth/providers")
async def auth_providers() -> dict[str, bool]:
    """Which sign-in methods this deployment offers.

    Lets the UI hide the Google button rather than offering a route that would
    fail with a 503.
    """
    return {"password": True, "google": oauth_google.is_configured()}


@app.get("/api/capabilities")
async def capabilities() -> dict[str, object]:
    """What the parser accepts -- drives the in-app help panel."""
    return {
        "functions": sorted(ALLOWED_FUNCTIONS),
        # One line each, so the editor can explain a function the moment a
        # formula uses it rather than making someone open the help panel.
        "function_help": {
            name: FUNCTION_HELP[name] for name in sorted(ALLOWED_FUNCTIONS) if name in FUNCTION_HELP
        },
        "limits": {
            "max_length": MAX_LENGTH,
            "max_nodes": MAX_NODES,
            "max_exponent": MAX_EXPONENT,
            "max_symbols": MAX_SYMBOLS,
            "max_samples": MAX_SAMPLES,
            "max_grid_samples": MAX_GRID_SAMPLES,
        },
        "syntax": [
            "Implicit multiplication: `2m` means `2*m`",
            "`^` and `**` both mean exponentiation",
            "Subscripts with underscores: `v_0`, `m_1`, `E_k`",
            "Greek names are spelled out: `theta`, `lambda`, `omega`",
            "Trigonometric functions take radians",
        ],
    }


@app.get("/api/library")
async def formula_library() -> dict[str, object]:
    return {
        "categories": formulas.categories(),
        "formulas": formulas.FORMULAS,
        # Example descriptions per symbol, so the editor can suggest the shape
        # of a good one. Bundled here to keep the page to a single fetch.
        "variable_hints": formulas.variable_hints(),
        "fallback_hint": formulas.FALLBACK_HINT,
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


@app.post(
    "/api/plot",
    response_model=PlotResponse,
    responses={400: {"model": ErrorResponse}},
)
async def plot(request: PlotRequest) -> PlotResponse:
    """Sample a formula over one variable for a curve, or two for a surface.

    Goes through the same validation and the same worker pool as evaluation: a
    plot is several hundred evaluations, so it is exactly the request that must
    not get a laxer parser or a longer leash.
    """
    return PlotResponse(**runner.plot(
        request.expression,
        request.values,
        request.solve_for,
        [axis.model_dump() for axis in request.axes],
        request.samples,
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


# --------------------------------------------------------------------------
# Serving the built front end
# --------------------------------------------------------------------------
#
# In development the two halves run separately and Vite proxies /api. In
# production it is simpler *and safer* to serve the built bundle from this same
# app: one origin means the session cookie is first-party, no CORS configuration is
# involved, and there is a single process to deploy.

STATIC_DIR = Path(
    os.environ.get(
        "FORMULA_LAB_STATIC_DIR",
        str(Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"),
    )
)


def resolve_static_file(root: Path, requested: str) -> Path | None:
    """Map a URL path to a file inside ``root``, or None.

    The containment check is the point: ``FileResponse`` will happily serve
    ``../../etc/passwd`` if handed that path, so the resolved location must be
    confirmed to still sit under the static directory.
    """
    if not requested:
        return None
    try:
        candidate = (root / requested).resolve()
        base = root.resolve()
    except (OSError, RuntimeError):
        return None
    if not candidate.is_relative_to(base) or not candidate.is_file():
        return None
    return candidate


def mount_frontend() -> None:
    index = STATIC_DIR / "index.html"
    if not index.is_file():
        return  # development, or the bundle has not been built yet

    assets = STATIC_DIR / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        """Serve index.html for app routes, and real files when they exist.

        Registered last so every API route wins. An unknown /api path must
        still 404 rather than quietly receive the HTML shell -- otherwise a
        typo'd endpoint looks like a JSON parsing bug to the caller.
        """
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")

        found = resolve_static_file(STATIC_DIR, full_path)
        return FileResponse(found if found else index)


mount_frontend()
