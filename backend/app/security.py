"""Input hardening for user-supplied formula text.

The evaluator is built on SymPy, whose ``parse_expr`` ultimately calls ``eval``
on transformed source. That makes the *string* the security boundary, not the
parser: ``().__class__.__bases__`` parses into a real Python tuple, and
``sympify("__import__('os')")`` is outright code execution.

So every formula passes through :func:`check_source` before it is parsed. The
gate is a whitelist -- unknown syntax is rejected rather than interpreted.
"""

from __future__ import annotations

import re

MAX_LENGTH = 500

#: Every character we are willing to hand to the parser. Notably absent:
#: quotes (no string literals), brackets (no subscripting), ``:`` and ``;``
#: (no slices, lambdas or statements), ``\`` and ``@``.
_ALLOWED_CHARS = re.compile(r"^[A-Za-z0-9_+\-*/^%().,=\s]*$")

#: A dot is only legitimate inside a decimal number (``0.5``, ``1.``, ``.5``).
#: Anywhere else it is attribute access, which is how sandbox escapes start.
_ATTRIBUTE_DOT = re.compile(r"(?<![0-9])\.(?![0-9])")

_ILLEGAL_SUBSTRINGS = ("__", "..")


class FormulaError(ValueError):
    """A formula the user needs to fix. Safe to show verbatim in the UI."""


def check_source(text: str) -> str:
    """Return the trimmed formula, or raise :class:`FormulaError`.

    Ordered cheapest-check-first so hostile input is dropped before any
    parsing work happens.
    """
    if not isinstance(text, str):
        raise FormulaError("Formula must be text.")

    formula = text.strip()
    if not formula:
        raise FormulaError("Formula is empty.")
    if len(formula) > MAX_LENGTH:
        raise FormulaError(f"Formula is too long (limit {MAX_LENGTH} characters).")

    for bad in _ILLEGAL_SUBSTRINGS:
        if bad in formula:
            raise FormulaError(f"'{bad}' is not allowed in a formula.")

    if not _ALLOWED_CHARS.match(formula):
        offenders = sorted({c for c in formula if not _ALLOWED_CHARS.match(c)})
        shown = " ".join(repr(c) for c in offenders[:5])
        raise FormulaError(f"Unsupported character(s): {shown}")

    if _ATTRIBUTE_DOT.search(formula):
        raise FormulaError("A '.' is only allowed inside a number, e.g. 9.81")

    if formula.count("=") > 1:
        raise FormulaError("Use at most one '=' sign.")

    return formula


def check_symbol_name(name: str) -> str:
    """Validate a variable name supplied as a *key* (not inside the formula)."""
    if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,31}", name):
        raise FormulaError(f"Invalid variable name: {name!r}")
    if "__" in name:
        raise FormulaError(f"Invalid variable name: {name!r}")
    return name
