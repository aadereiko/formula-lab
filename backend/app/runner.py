"""Runs the SymPy engine in a worker process with a hard wall-clock timeout.

Input validation stops malicious formulas, but it cannot stop *slow* ones.
``factorial(100000)`` is nine characters, passes every static guard, and will
occupy a CPU for a long time once ``evalf`` touches it. Static analysis cannot
decide this in general -- so the backstop is a real timeout, which means real
preemption, which means a separate process. A thread would not do: CPU-bound
SymPy holds the GIL and cannot be cancelled.

Consequence of ``spawn`` (the default on macOS): a worker re-imports the module
containing its target function. Both this module and :mod:`app.engine` are
therefore free of FastAPI imports.
"""

from __future__ import annotations

import concurrent.futures as futures
from typing import Any

from . import engine
from .security import FormulaError

WORKERS = 2
ANALYZE_TIMEOUT = 3.0
EVALUATE_TIMEOUT = 5.0

_pool: futures.ProcessPoolExecutor | None = None


def _get_pool() -> futures.ProcessPoolExecutor:
    global _pool
    if _pool is None:
        _pool = futures.ProcessPoolExecutor(max_workers=WORKERS)
    return _pool


def _discard_pool() -> None:
    """Drop the pool after a timeout or crash.

    A timed-out task is still burning CPU in its worker, so the pool cannot be
    reused as-is. ``cancel_futures`` drops anything queued and ``wait=False``
    keeps us from blocking on the runaway task; the next call builds a fresh
    pool and the OS reaps the abandoned worker.
    """
    global _pool
    doomed, _pool = _pool, None
    if doomed is not None:
        doomed.shutdown(wait=False, cancel_futures=True)


def _worker(operation: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Entry point executed inside the worker process.

    Returns a plain dict rather than raising, so error text crosses the process
    boundary without depending on exception pickling.
    """
    try:
        if operation == "analyze":
            return {"ok": True, "data": engine.analyze(payload["expression"])}
        if operation == "evaluate":
            return {"ok": True, "data": engine.evaluate(
                payload["expression"],
                payload.get("values"),
                payload.get("solve_for"),
                payload.get("precision", 6),
            )}
        return {"ok": False, "error": f"Unknown operation: {operation}"}
    except FormulaError as exc:
        return {"ok": False, "error": str(exc)}
    except RecursionError:
        return {"ok": False, "error": "Formula is nested too deeply."}
    except MemoryError:
        return {"ok": False, "error": "Formula needs too much memory to evaluate."}
    except Exception as exc:  # noqa: BLE001 - never leak a traceback to the UI
        return {"ok": False, "error": f"Could not compute this formula ({type(exc).__name__})."}


def _call(operation: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    try:
        future = _get_pool().submit(_worker, operation, payload)
        result = future.result(timeout=timeout)
    except futures.TimeoutError:
        _discard_pool()
        raise FormulaError(f"Formula took longer than {timeout:g}s to evaluate.") from None
    except futures.process.BrokenProcessPool:
        _discard_pool()
        raise FormulaError("Evaluation exhausted available resources.") from None

    if not result.get("ok"):
        raise FormulaError(result.get("error", "Unknown error."))
    return result["data"]


def analyze(expression: str) -> dict[str, Any]:
    return _call("analyze", {"expression": expression}, ANALYZE_TIMEOUT)


def evaluate(
    expression: str,
    values: dict[str, Any] | None = None,
    solve_for: str | None = None,
    precision: int = 6,
) -> dict[str, Any]:
    payload = {
        "expression": expression,
        "values": values,
        "solve_for": solve_for,
        "precision": precision,
    }
    return _call("evaluate", payload, EVALUATE_TIMEOUT)


def warmup() -> None:
    """Pre-import SymPy in the workers so the first real request is not slow."""
    try:
        analyze("1 + 1")
    except Exception:  # noqa: BLE001 - warmup is best-effort
        pass


def shutdown() -> None:
    _discard_pool()
