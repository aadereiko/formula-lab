"""Formula parsing, solving and numeric evaluation.

This module is intentionally a *leaf*: it imports SymPy and :mod:`app.security`
and nothing else from the application. Evaluation runs in a worker process
(see :mod:`app.runner`), and ``multiprocessing`` uses the ``spawn`` start method
on macOS and Windows -- each worker re-imports the module holding its target
function. Keeping FastAPI out of that import path keeps workers cheap.

Every public function here takes and returns plain data (str / dict / list) so
it can cross the process boundary without custom pickling.
"""

from __future__ import annotations

import keyword
import re
from typing import Any

import sympy
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication,
    parse_expr,
    standard_transformations,
)

from .security import FormulaError, check_source, check_symbol_name

# --------------------------------------------------------------------------
# Parser configuration
# --------------------------------------------------------------------------

#: Functions and constants a formula may name. Anything else becomes a plain
#: symbol (i.e. an input the user is asked to fill in), never a callable.
ALLOWED_FUNCTIONS: dict[str, Any] = {
    "sin": sympy.sin, "cos": sympy.cos, "tan": sympy.tan,
    "asin": sympy.asin, "acos": sympy.acos, "atan": sympy.atan, "atan2": sympy.atan2,
    "sinh": sympy.sinh, "cosh": sympy.cosh, "tanh": sympy.tanh,
    "exp": sympy.exp, "log": sympy.log, "ln": sympy.log, "log10": lambda x: sympy.log(x, 10),
    "sqrt": sympy.sqrt, "cbrt": sympy.cbrt, "Abs": sympy.Abs, "abs": sympy.Abs,
    "sign": sympy.sign, "factorial": sympy.factorial,
    "min": sympy.Min, "max": sympy.Max, "Min": sympy.Min, "Max": sympy.Max,
    "floor": sympy.floor, "ceiling": sympy.ceiling,
    "pi": sympy.pi,
}

# Deliberately NOT exposed: SymPy's ``E`` (Euler's number) and ``I`` (imaginary
# unit). In physics those letters are energy and current far more often, and
# whitelisting them silently broke ``E = m*c^2`` and ``V = I*R`` -- the constant
# won, so the variable could never be solved for. Users who want Euler's number
# write ``exp(1)``.

#: One line per function, for the hint the editor shows when a formula uses it.
#: Written for someone who knows the maths but not this parser's conventions --
#: which is why every angle entry says "radians".
FUNCTION_HELP: dict[str, str] = {
    "sin": "sine of an angle in radians",
    "cos": "cosine of an angle in radians",
    "tan": "tangent of an angle in radians",
    "asin": "inverse sine, returns radians",
    "acos": "inverse cosine, returns radians",
    "atan": "inverse tangent, returns radians",
    "atan2": "angle of the point (y, x), in radians",
    "sinh": "hyperbolic sine",
    "cosh": "hyperbolic cosine",
    "tanh": "hyperbolic tangent",
    "exp": "e raised to this power",
    "log": "natural logarithm; log(x, b) for base b",
    "ln": "natural logarithm, same as log",
    "log10": "logarithm base 10",
    "sqrt": "square root",
    "cbrt": "cube root",
    "Abs": "absolute value, distance from zero",
    "abs": "absolute value, distance from zero",
    "sign": "-1, 0 or 1 depending on the sign",
    "factorial": "n! -- the product of every integer up to n",
    "min": "the smallest of its arguments",
    "max": "the largest of its arguments",
    "Min": "the smallest of its arguments",
    "Max": "the largest of its arguments",
    "floor": "rounds down to a whole number",
    "ceiling": "rounds up to a whole number",
    "pi": "3.14159..., the ratio of a circle's circumference to its diameter",
}

#: Constructors SymPy's own transformations emit into the generated source.
#: ``1/2`` becomes ``Integer(1)/Integer(2)``, and ``evaluate=False`` rewrites
#: operators into ``Mul``/``Add``/``Pow`` calls -- so these must be in scope or
#: parsing fails with a confusing NameError.
_PARSER_INTERNALS = ("Symbol", "Integer", "Float", "Rational", "Mul", "Add", "Pow", "Function")

#: ``standard_transformations`` includes ``auto_symbol``, which turns unknown
#: names into ``Symbol``s. We add implicit multiplication (``2m`` -> ``2*m``)
#: and caret exponentiation (``v^2`` -> ``v**2``).
#:
#: We deliberately do NOT use ``implicit_multiplication_application``: that
#: bundle includes ``split_symbols``, which shatters multi-letter names into
#: products of single letters -- turning ``mass`` into ``m*a*s*s``. Fatal for a
#: physics tool where ``v_0``, ``E_k`` and ``theta`` must stay intact.
_TRANSFORMATIONS = standard_transformations + (convert_xor, implicit_multiplication)

# --------------------------------------------------------------------------
# Resource guards
# --------------------------------------------------------------------------

MAX_NODES = 200          # expression-tree size
MAX_EXPONENT = 10_000    # |exponent| in any power
MAX_SYMBOLS = 40         # distinct variables

#: Sampling budget for a plot. A curve spends all of it along one axis; a
#: surface is a grid, so its per-axis limit is the square root of the same
#: number -- one request is one budget's worth of arithmetic either way.
MAX_SAMPLES = 400
MAX_GRID_SAMPLES = 20
DEFAULT_SAMPLES = 160


# ``lambda`` is a Python keyword, so ``auto_symbol`` cannot wrap it in a
# ``Symbol`` call -- the generated source ``Symbol('f')*lambda`` is a raw
# SyntaxError. But lambda is *the* symbol for wavelength, so it gets a
# first-class alias: SymPy treats the misspelling ``lamda`` as the Greek letter
# and renders it ``\lambda``, which makes the swap invisible in the output.
_LAMBDA_ALIAS = "lamda"
_LAMBDA_PATTERN = re.compile(r"\blambda\b")

#: Other Python keywords would fail the same way. Rather than silently mangling
#: them we reject them by name -- none is a plausible physics symbol.
_RESERVED_WORDS = frozenset(keyword.kwlist) - {"lambda"}
_WORD_PATTERN = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


def _to_internal(text: str) -> str:
    """Rewrite user text into something the Python-based parser can accept."""
    for word in _WORD_PATTERN.findall(text):
        if word in _RESERVED_WORDS:
            raise FormulaError(f"'{word}' is a reserved word; please rename that variable.")
    return _LAMBDA_PATTERN.sub(_LAMBDA_ALIAS, text)


def _to_display(name: str) -> str:
    """Undo :func:`_to_internal` for names shown in the UI."""
    return "lambda" if name == _LAMBDA_ALIAS else name


def _global_dict() -> dict[str, Any]:
    ns: dict[str, Any] = {name: getattr(sympy, name) for name in _PARSER_INTERNALS}
    ns.update(ALLOWED_FUNCTIONS)
    return ns


def _parse_side(text: str, *, evaluate: bool = True) -> sympy.Expr:
    """Parse one side of a formula into a SymPy expression."""
    try:
        expr = parse_expr(
            text,
            global_dict=_global_dict(),
            local_dict={},          # nothing pre-bound; unknown names -> Symbol
            transformations=_TRANSFORMATIONS,
            evaluate=evaluate,
        )
    except FormulaError:
        raise
    except SyntaxError as exc:
        raise FormulaError(f"Could not parse '{text.strip()}': check brackets and operators.") from exc
    except Exception as exc:  # SymPy raises a wide variety here
        raise FormulaError(f"Could not parse '{text.strip()}': {type(exc).__name__}") from exc

    if not isinstance(expr, sympy.Basic):
        raise FormulaError("That is not a mathematical expression.")
    return expr


def _digits_error(exc: ValueError) -> Exception:
    """Translate CPython's int -> str cap into something a user can act on.

    Since 3.11, converting an integer wider than 4300 digits raises. SymPy hits
    this while *printing*, far from where the number was built, so the raw error
    ("use sys.set_int_max_str_digits") is meaningless to someone who just typed
    a large factorial.
    """
    if "digits" in str(exc):
        return FormulaError("The result has too many digits to display. Try a smaller input.")
    return exc


_SCIENTIFIC = re.compile(r"^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$")


def _number_latex(formatted: str) -> str:
    """Typeset a formatted float for a LaTeX context.

    Python's "3.32e-10" is not LaTeX: KaTeX reads it as the variable *e* minus
    10 and renders "3.32e - 10". Non-numeric labels ("undefined", "infinite")
    pass through untouched.
    """
    if not _SCIENTIFIC.match(formatted):
        return formatted
    mantissa, _, exponent = formatted.lower().partition("e")
    return rf"{mantissa} \cdot 10^{{{int(exponent)}}}"


def _latex(expr: sympy.Basic) -> str:
    try:
        return sympy.latex(expr)
    except ValueError as exc:
        raise _digits_error(exc) from None


def _text(expr: sympy.Basic) -> str:
    try:
        return str(expr)
    except ValueError as exc:
        raise _digits_error(exc) from None


def _guard_complexity(expr: sympy.Basic) -> None:
    """Reject expressions that are cheap to *write* but ruinous to evaluate.

    ``2**2**2**2**2`` is only nine nodes and contains nothing hostile, yet
    asking SymPy to evaluate it materialises a number with ~20 000 digits.
    Run this on the inert (``evaluate=False``) tree, before any real work.
    """
    nodes = sum(1 for _ in sympy.preorder_traversal(expr))
    if nodes > MAX_NODES:
        raise FormulaError(f"Formula is too complex ({nodes} terms, limit {MAX_NODES}).")

    for power in expr.atoms(sympy.Pow):
        exponent = power.exp
        if not exponent.is_number:
            continue
        try:
            magnitude = abs(float(exponent))
        except (TypeError, ValueError, OverflowError):
            raise FormulaError("Exponent is too large to evaluate.") from None
        if magnitude > MAX_EXPONENT:
            raise FormulaError(f"Exponent {magnitude:g} exceeds the limit of {MAX_EXPONENT}.")


def _split_equation(formula: str) -> tuple[str, str | None]:
    if "=" not in formula:
        return formula, None
    lhs, rhs = formula.split("=")
    if not lhs.strip() or not rhs.strip():
        raise FormulaError("Both sides of '=' must be filled in.")
    return lhs, rhs


def _names_used(source: str) -> list[str]:
    """Which allowed function names the source text actually mentions.

    Read from the text rather than from the parse tree, because the tree loses
    them: `sqrt(x)` becomes a `Pow`, not a `sqrt` node, and `pi` is a numeric
    atom rather than a function. Asking the tree therefore reports nothing for
    `2*pi*sqrt(L/g)` -- precisely the formula whose notation most wants
    explaining.

    Word boundaries keep `pi` out of `pion`.
    """
    found = {name for name in _WORD_PATTERN.findall(source) if name in ALLOWED_FUNCTIONS}
    return sorted(found)


def _sorted_symbols(expr: sympy.Basic) -> list[str]:
    """Variable names for the UI: shortest first, then alphabetical.

    Short names tend to be the headline quantities (``F``, ``m``, ``a``) while
    longer ones are qualified (``v_0``, ``E_out``), so this ordering usually
    matches how the formula is written.
    """
    names = (_to_display(str(s)) for s in expr.free_symbols)
    return sorted(names, key=lambda n: (len(n), n))


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------

def analyze(expression: str) -> dict[str, Any]:
    """Describe a formula without evaluating it.

    Drives the UI: the returned ``symbols`` list is what the frontend turns
    into input fields, and ``is_equation`` tells it to offer a solve-for
    selector.
    """
    formula = check_source(expression)
    lhs_text, rhs_text = _split_equation(_to_internal(formula))

    # Inspect the inert tree first -- guards run before any evaluation.
    inert_sides = [_parse_side(lhs_text, evaluate=False)]
    if rhs_text is not None:
        inert_sides.append(_parse_side(rhs_text, evaluate=False))
    for side in inert_sides:
        _guard_complexity(side)

    lhs = _parse_side(lhs_text)
    if rhs_text is None:
        expr: sympy.Basic = lhs
        latex = _latex(lhs)
    else:
        rhs = _parse_side(rhs_text)
        expr = sympy.Eq(lhs, rhs, evaluate=False)
        latex = f"{_latex(lhs)} = {_latex(rhs)}"

    symbols = _sorted_symbols(expr)
    if len(symbols) > MAX_SYMBOLS:
        raise FormulaError(f"Too many variables ({len(symbols)}, limit {MAX_SYMBOLS}).")

    return {
        "expression": formula,
        "is_equation": rhs_text is not None,
        "symbols": symbols,
        "latex": latex,
        "functions_used": _names_used(formula),
    }


def _clean_values(values: dict[str, Any] | None) -> dict[str, sympy.Float]:
    """Validate variable assignments, keyed by the name the user sees.

    Kept in *display* space so error messages name the variable the user typed;
    the conversion to internal symbols happens at substitution time.
    """
    out: dict[str, sympy.Float] = {}
    for name, raw in (values or {}).items():
        check_symbol_name(name)
        if raw is None or raw == "":
            continue  # a blank field means "solve for this", not "zero"
        try:
            number = float(raw)
        except (TypeError, ValueError):
            raise FormulaError(f"Value for '{name}' is not a number: {raw!r}") from None
        if number != number or number in (float("inf"), float("-inf")):
            raise FormulaError(f"Value for '{name}' must be finite.")
        out[name] = sympy.Float(number)
    return out


def _symbol_for(display_name: str) -> sympy.Symbol:
    """The internal SymPy symbol behind a display name."""
    return sympy.Symbol(_to_internal(display_name))


def _describe_number(value: sympy.Basic, precision: int) -> dict[str, Any]:
    """Render one solution as both an exact form and a float, when possible.

    Keeping the exact form matters: a pendulum period is ``2*pi*sqrt(L/g)``, and
    showing ``sqrt(2)`` alongside ``1.41421`` is more useful than the decimal
    alone.
    """
    exact = sympy.simplify(value)

    payload: dict[str, Any] = {
        "exact": _text(exact),
        "latex": _latex(exact),
        "is_real": bool(exact.is_real) if exact.is_real is not None else None,
        "value": None,
        # Complex or still-symbolic results fall back to this rounded rendering.
        "formatted": _text(exact.evalf(precision)),
    }

    # Convert to float from a FULL-precision evaluation, not from the rounded
    # display value. `evalf(6)` returns a low-precision Float whose binary form
    # carries noise past the sixth digit, and float() preserves that noise --
    # which made `value` disagree with `exact` around the eighth digit.
    try:
        as_float = float(exact.evalf(17))
    except (TypeError, ValueError):
        return payload  # complex or symbolic -- the exact form is all we have

    if as_float != as_float:
        payload["formatted"] = "undefined"
        return payload
    if as_float in (float("inf"), float("-inf")):
        payload["formatted"] = "infinite"
        return payload

    payload["value"] = as_float
    payload["formatted"] = f"{as_float:.{precision}g}"
    return payload


def _rearrange(
    lhs_text: str,
    rhs_text: str,
    known: dict[sympy.Symbol, sympy.Float],
    target: str,
) -> tuple[list[sympy.Expr], sympy.Expr, sympy.Expr]:
    """Substitute the known values and solve an equation for one symbol.

    Shared by :func:`evaluate` and :func:`plot`, because the substitution trick
    and the three degenerate outcomes are the same rule whether the caller wants
    one number or four hundred sample points -- and two copies of a rule like
    that drift.

    Substitution happens into each side separately rather than into an ``Eq``.
    ``Eq(2.0, 0)`` auto-evaluates to the boolean ``False`` -- which has no
    ``.lhs`` -- and that is reachable from ordinary input: in
    ``a = (v - v_0)/t``, entering v equal to v_0 collapses the equation. Working
    with the two sides keeps a real expression in hand.
    """
    target_symbol = _symbol_for(target)
    lhs_expr = _parse_side(lhs_text).subs(known)
    rhs_expr = _parse_side(rhs_text).subs(known)

    raw = lhs_expr - rhs_expr
    # Two questions, two forms. Deciding whether the equation still says
    # anything needs a normalised residual, so that test gets `simplify`.
    # ``solve`` does not, and is better off without it: ``simplify`` rewrites
    # ``sign(x)`` into a ``Piecewise``, which ``solve`` then splits into two
    # spurious branches, one of them ``nan``.
    residual = sympy.simplify(raw)
    if residual == 0:
        raise FormulaError(f"These values satisfy the equation for any '{target}'.")
    if target_symbol not in residual.free_symbols:
        raise FormulaError(
            f"'{target}' drops out of the equation with these values, "
            "so it cannot be determined."
        )

    try:
        roots = sympy.solve(raw, target_symbol, dict=False)
    except Exception as exc:
        raise FormulaError(f"Could not solve for '{target}' ({type(exc).__name__}).") from exc
    if not roots:
        raise FormulaError(f"No solution for '{target}' with these values.")
    return roots, lhs_expr, rhs_expr


def evaluate(
    expression: str,
    values: dict[str, Any] | None = None,
    solve_for: str | None = None,
    precision: int = 6,
) -> dict[str, Any]:
    """Compute a formula's value, or solve an equation for one variable.

    Two modes, chosen by the formula itself:

    * plain expression (``1/2 m v^2``) -- every symbol needs a value, and the
      expression is evaluated numerically.
    * equation (``F = m a``) -- all symbols but one need a value, and the
      remaining one is solved for. That is what makes a physics formula
      reusable in every direction: one ``F = m a`` answers all three questions
      (force, mass, or acceleration) without the user rearranging anything.
    """
    precision = max(1, min(int(precision), 15))
    info = analyze(expression)
    symbols: list[str] = info["symbols"]
    assignments = _clean_values(values)

    if solve_for:
        check_symbol_name(solve_for)

    unknown = [name for name in assignments if name not in symbols]
    if unknown:
        raise FormulaError(f"'{unknown[0]}' does not appear in the formula.")

    missing = [name for name in symbols if name not in assignments]
    lhs_text, rhs_text = _split_equation(_to_internal(info["expression"]))
    steps: list[dict[str, str]] = [{"label": "Formula", "latex": info["latex"]}]

    if info["is_equation"]:
        # With exactly one blank, the intent is unambiguous -- no need to make
        # the user also pick a target.
        target = solve_for or (missing[0] if len(missing) == 1 else None)
        if target is None:
            if not missing:
                raise FormulaError(
                    "Leave one variable blank, or choose which one to solve for."
                )
            raise FormulaError(
                "Fill in all variables but one. Still blank: " + ", ".join(missing)
            )
        if target not in symbols:
            raise FormulaError(f"Cannot solve for '{target}': it is not in the formula.")

        still_missing = [name for name in missing if name != target]
        if still_missing:
            raise FormulaError("Missing value(s) for: " + ", ".join(still_missing))

        target_symbol = _symbol_for(target)
        known = {
            _symbol_for(name): value
            for name, value in assignments.items()
            if name != target
        }

        roots, lhs_expr, rhs_expr = _rearrange(lhs_text, rhs_text, known, target)
        steps.append({
            "label": "Substituted",
            "latex": f"{_latex(lhs_expr)} = {_latex(rhs_expr)}",
        })

        solutions = [_describe_number(root, precision) for root in roots]

        # A quadratic gives two roots and SymPy returns them in its own order,
        # which for v^2 = 2as puts -5.66 before +5.66. Prefer a real,
        # non-negative root as the headline answer: for the quantities these
        # formulas describe (speed, mass, distance, time) that is nearly always
        # the intended one. Every root is still returned -- deciding which is
        # physical is the user's call, not ours.
        real = [s for s in solutions if s["is_real"] is not False]
        ranked = sorted(real, key=lambda s: 0 if (s["value"] is None or s["value"] >= 0) else 1)
        primary = (ranked or solutions)[0]
        return {
            "mode": "solve",
            "solve_for": target,
            "latex": info["latex"],
            "solutions": solutions,
            "primary": primary,
            # The target must be rendered as LaTeX, not interpolated as text:
            # "lambda" typesets as six italic letters, whereas the symbol's own
            # LaTeX is "\lambda". Same for subscripts -- v_0 vs v_{0}.
            "steps": steps + [{
                "label": "Result",
                # Match the headline's precision. Falling back to the exact
                # LaTeX only when there is no float keeps symbolic answers
                # (2*pi, sqrt(2)) readable instead of decimalising them.
                "latex": f"{_latex(target_symbol)} = " + (
                    _number_latex(primary["formatted"])
                    if primary["value"] is not None
                    else primary["latex"]
                ),
            }],
            "symbols": symbols,
        }

    if missing:
        raise FormulaError("Missing value(s) for: " + ", ".join(missing))
    if solve_for:
        raise FormulaError("Add an '=' to the formula to solve for a variable.")

    expr = _parse_side(lhs_text)
    substituted = expr.subs({_symbol_for(n): v for n, v in assignments.items()})
    if assignments:
        steps.append({"label": "Substituted", "latex": _latex(substituted)})

    result = _describe_number(substituted, precision)
    return {
        "mode": "evaluate",
        "solve_for": None,
        "latex": info["latex"],
        "solutions": [result],
        "primary": result,
        "steps": steps + [{
            "label": "Result",
            "latex": _number_latex(result["formatted"]) if result["value"] is not None else result["latex"],
        }],
        "symbols": symbols,
    }


# --------------------------------------------------------------------------
# Sampling a formula for a plot
# --------------------------------------------------------------------------

#: How many solution branches a curve draws. A quadratic has two real roots and
#: both are honest answers, so silently drawing one would be a lie -- but past
#: two the picture stops being readable. A surface draws one: overlapping sheets
#: in an isometric view are indistinguishable from each other.
MAX_CURVE_BRANCHES = 2


def _finite(value: Any) -> float | None:
    """Coerce one sampled value to a plottable float, or ``None`` for a gap.

    A gap is the honest answer at a point where the formula simply has no real
    value: ``1/x`` at zero, ``sqrt`` of a negative, anything past the float
    range. Reporting that per point instead of failing the request is what makes
    an asymptote read as a break in the curve rather than an error message.
    """
    if isinstance(value, complex):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return number


def _axis_bounds(name: str, axis: dict[str, Any]) -> tuple[float, float]:
    try:
        low = float(axis["min"])
        high = float(axis["max"])
    except (KeyError, TypeError, ValueError):
        raise FormulaError(f"The range for '{name}' needs two numbers.") from None
    for edge in (low, high):
        # Pydantic accepts inf and nan as floats, so this is not redundant.
        if edge != edge or edge in (float("inf"), float("-inf")):
            raise FormulaError(f"The range for '{name}' must be finite.")
    if low >= high:
        raise FormulaError(f"The range for '{name}' must start below where it ends.")
    return low, high


def _axis_steps(low: float, high: float, count: int) -> list[float]:
    """``count`` evenly spaced values, endpoints included.

    Computed from the fraction rather than by accumulating a step, so the last
    sample is exactly ``high`` and the curve reaches the edge of its frame.
    """
    span = high - low
    return [low + span * index / (count - 1) for index in range(count)]


def _sample(
    expr: sympy.Expr,
    args: list[sympy.Symbol],
    grids: list[list[float]],
) -> list[list[float | None]]:
    """Sample one expression over a one- or two-dimensional grid.

    One row per step of the *second* axis, so ``rows[j][i]`` is the value at the
    i-th step of the first and the j-th of the second. A curve is a single row.

    ``lambdify`` compiles the expression to a Python function once, which is the
    only reason four hundred points is cheap: ``subs`` then ``evalf`` per point
    is orders of magnitude slower and would spend the whole timeout on a single
    plot. ``modules=["math"]`` keeps numpy out of it (it is not a dependency)
    and has a second benefit -- a point outside the real domain raises rather
    than quietly returning a complex number, which is exactly the gap we want.

    ``dummify`` renames the parameters in the generated source. Our symbol names
    are already identifier-shaped, so this is belt-and-braces around a function
    body that is built by ``exec``.
    """
    try:
        f = sympy.lambdify(args, expr, modules=["math"], dummify=True)
    except Exception as exc:  # noqa: BLE001 - SymPy raises widely here
        raise FormulaError(f"Cannot sample this formula ({type(exc).__name__}).") from exc

    def row(rest: tuple[float, ...]) -> list[float | None]:
        out: list[float | None] = []
        for x in grids[0]:
            try:
                out.append(_finite(f(x, *rest)))
            except Exception:  # noqa: BLE001 - one bad point is a gap, not a failure
                out.append(None)
        return out

    if len(grids) == 1:
        return [row(())]
    return [row((second,)) for second in grids[1]]


def _plot_axes(symbols: list[str], axes: list[dict[str, Any]]) -> tuple[list[str], list[tuple[float, float]]]:
    if not 1 <= len(axes) <= 2:
        raise FormulaError("A plot sweeps one variable, or two for a surface.")

    swept: list[str] = []
    bounds: list[tuple[float, float]] = []
    for axis in axes:
        name = check_symbol_name(str(axis.get("variable", "")))
        if name not in symbols:
            raise FormulaError(f"'{name}' does not appear in the formula.")
        if name in swept:
            raise FormulaError(f"'{name}' cannot be both axes of a plot.")
        swept.append(name)
        bounds.append(_axis_bounds(name, axis))
    return swept, bounds


def plot(
    expression: str,
    values: dict[str, Any] | None = None,
    solve_for: str | None = None,
    axes: list[dict[str, Any]] | None = None,
    samples: int = DEFAULT_SAMPLES,
) -> dict[str, Any]:
    """Sample a formula across one or two variables, for a curve or a surface.

    The same three checks as every other endpoint: :func:`analyze` runs the
    character whitelist and the complexity guards first, so sampling never sees
    a string the evaluator would have refused.

    An equation is rearranged for its unknown *once*, symbolically, and the
    resulting expression is sampled. Solving numerically at every point would be
    correct too and around a hundred times slower.
    """
    info = analyze(expression)
    symbols: list[str] = info["symbols"]
    swept, bounds = _plot_axes(symbols, list(axes or []))
    surface = len(swept) == 2
    count = max(2, min(int(samples), MAX_GRID_SAMPLES if surface else MAX_SAMPLES))

    assignments = _clean_values(values)
    unknown = [name for name in assignments if name not in symbols]
    if unknown:
        raise FormulaError(f"'{unknown[0]}' does not appear in the formula.")
    # A swept variable's value is ignored rather than refused. The workspace
    # holds a value for every field it renders, and making the caller strip the
    # one it is sweeping would only move that bookkeeping across the wire.
    assignments = {name: value for name, value in assignments.items() if name not in swept}

    blank = [name for name in symbols if name not in swept and name not in assignments]
    lhs_text, rhs_text = _split_equation(_to_internal(info["expression"]))

    if info["is_equation"]:
        if solve_for:
            check_symbol_name(solve_for)
        # With exactly one blank left the intent is unambiguous, exactly as it is
        # for a single evaluation.
        target = solve_for or (blank[0] if len(blank) == 1 else None)
        if target is None:
            if not blank:
                raise FormulaError("Leave one variable blank, or choose which one to plot.")
            raise FormulaError(
                "Fill in every variable except the axes and one to plot. Still blank: "
                + ", ".join(blank)
            )
        if target not in symbols:
            raise FormulaError(f"Cannot plot '{target}': it is not in the formula.")
        if target in swept:
            raise FormulaError(f"'{target}' is already an axis of this plot.")

        still_blank = [name for name in blank if name != target]
        if still_blank:
            raise FormulaError("Missing value(s) for: " + ", ".join(still_blank))

        # The target's own value is left out. It is routinely still filled in --
        # the workspace keeps whatever was last typed there, and a plot is
        # perfectly reasonable while it holds a value -- and substituting it
        # would rearrange the equation for a symbol that is no longer in it.
        known = {
            _symbol_for(name): value
            for name, value in assignments.items()
            if name != target
        }
        roots, _lhs, _rhs = _rearrange(lhs_text, rhs_text, known, target)
        target_symbol = _symbol_for(target)
        # A root still mentioning the target is an implicit condition, not a
        # value we can evaluate at a point.
        branches = [root for root in roots if target_symbol not in root.free_symbols]
        if not branches:
            raise FormulaError(f"Could not rearrange the formula to plot '{target}'.")
        label = target
    else:
        if solve_for:
            raise FormulaError("Add an '=' to the formula to plot one variable against another.")
        if blank:
            raise FormulaError("Missing value(s) for: " + ", ".join(blank))
        known = {_symbol_for(name): value for name, value in assignments.items()}
        branches = [_parse_side(lhs_text).subs(known)]
        label = "value"

    drawn = branches[: 1 if surface else MAX_CURVE_BRANCHES]
    axis_symbols = [_symbol_for(name) for name in swept]
    grids = [_axis_steps(low, high, count) for low, high in bounds]

    series: list[dict[str, Any]] = []
    seen: list[float] = []
    for index, branch in enumerate(drawn):
        rows = _sample(branch, axis_symbols, grids)
        series.append({
            "label": label if len(drawn) == 1 else f"{label} (branch {index + 1})",
            "samples": rows,
        })
        seen.extend(value for row in rows for value in row if value is not None)

    if not seen:
        raise FormulaError(
            f"'{label}' has no real value anywhere in that range. Try a different range."
        )

    return {
        "mode": "surface" if surface else "curve",
        "latex": info["latex"],
        "value_label": label,
        "axes": [
            {"variable": name, "min": low, "max": high, "samples": count}
            for name, (low, high) in zip(swept, bounds)
        ],
        "series": series,
        "value_min": min(seen),
        "value_max": max(seen),
        # Said out loud rather than left for the reader to notice: a curve that
        # is one of several branches looks exactly like a complete answer.
        "note": (
            f"Showing {len(drawn)} of {len(branches)} solutions for '{label}'."
            if len(branches) > len(drawn) else ""
        ),
    }
