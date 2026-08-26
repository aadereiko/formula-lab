"""Parsing, evaluation and solving."""

import math

import pytest

from app.engine import analyze, evaluate
from app.security import FormulaError


# -- analyze ---------------------------------------------------------------

def test_analyze_expression():
    info = analyze("1/2 m v^2")
    assert info["is_equation"] is False
    assert info["symbols"] == ["m", "v"]
    assert "frac" in info["latex"]


def test_analyze_equation():
    info = analyze("F = m*a")
    assert info["is_equation"] is True
    assert info["symbols"] == ["F", "a", "m"]
    assert "=" in info["latex"]


def test_multi_letter_names_survive():
    """Regression guard: SymPy's `split_symbols` would shatter these."""
    assert analyze("mass * accel")["symbols"] == ["mass", "accel"]
    assert analyze("E_k = 1/2 m v^2")["symbols"] == ["m", "v", "E_k"]
    assert analyze("lambda_1 + theta")["symbols"] == ["theta", "lambda_1"]


def test_implicit_multiplication_and_caret():
    assert analyze("2m")["symbols"] == ["m"]
    assert evaluate("2m", {"m": 4})["primary"]["value"] == 8
    assert evaluate("v^2", {"v": 3})["primary"]["value"] == 9


def test_known_functions_are_not_variables():
    info = analyze("sin(theta) + sqrt(x)")
    assert info["symbols"] == ["x", "theta"]
    assert "sin" in info["functions_used"]


def test_functions_are_read_from_the_source_not_the_tree():
    """`sqrt` becomes a Pow and `pi` a numeric atom, so the tree loses both."""
    info = analyze("T = 2*pi*sqrt(L/g)")
    assert set(info["functions_used"]) == {"pi", "sqrt"}


def test_a_variable_that_merely_contains_a_function_name_is_not_reported():
    assert analyze("pion + sinew")["functions_used"] == []


# -- evaluate --------------------------------------------------------------

def test_evaluate_kinetic_energy():
    result = evaluate("1/2 m v^2", {"m": 2, "v": 3})
    assert result["mode"] == "evaluate"
    assert result["primary"]["value"] == pytest.approx(9.0)


def test_evaluate_uses_pi_and_radians():
    result = evaluate("sin(pi/2)", {})
    assert result["primary"]["value"] == pytest.approx(1.0)


def test_precision_is_respected():
    result = evaluate("pi", {}, precision=3)
    assert result["primary"]["formatted"] == "3.14"


def test_exact_form_is_preserved():
    result = evaluate("sqrt(2)", {})
    assert result["primary"]["exact"] == "sqrt(2)"
    assert result["primary"]["value"] == pytest.approx(math.sqrt(2))


def test_missing_value_is_reported_by_name():
    with pytest.raises(FormulaError, match="Missing value.*v"):
        evaluate("1/2 m v^2", {"m": 2})


def test_unknown_variable_rejected():
    with pytest.raises(FormulaError, match="does not appear"):
        evaluate("m*a", {"m": 1, "a": 2, "zzz": 3})


def test_non_numeric_value_rejected():
    with pytest.raises(FormulaError, match="not a number"):
        evaluate("m*a", {"m": "heavy", "a": 2})


def test_division_by_zero_is_reported_not_crashed():
    result = evaluate("a/b", {"a": 1, "b": 0})
    assert result["primary"]["formatted"] in {"zoo", "oo", "undefined"}


# -- solving ---------------------------------------------------------------

def test_solve_infers_the_single_blank():
    result = evaluate("F = m*a", {"F": 10, "a": 2})
    assert result["mode"] == "solve"
    assert result["solve_for"] == "m"
    assert result["primary"]["value"] == pytest.approx(5.0)


def test_same_equation_solves_in_every_direction():
    """One formula, three questions -- the point of the whole app."""
    assert evaluate("F = m*a", {"m": 2, "a": 5})["primary"]["value"] == pytest.approx(10)
    assert evaluate("F = m*a", {"F": 10, "a": 5})["primary"]["value"] == pytest.approx(2)
    assert evaluate("F = m*a", {"F": 10, "m": 2})["primary"]["value"] == pytest.approx(5)


def test_explicit_solve_for_overrides_inference():
    result = evaluate("F = m*a", {"F": 10, "m": 2, "a": 5}, solve_for="a")
    assert result["solve_for"] == "a"
    assert result["primary"]["value"] == pytest.approx(5.0)


def test_quadratic_returns_both_roots():
    # v^2 = 0 + 2*2*4 = 16, so v = +/-4. Both are returned; picking the
    # physical one is the user's job, not the solver's.
    result = evaluate("v^2 = v_0^2 + 2*a*s", {"v_0": 0, "a": 2, "s": 4}, solve_for="v")
    assert sorted(s["value"] for s in result["solutions"]) == pytest.approx([-4.0, 4.0])


def test_complex_roots_are_flagged_not_crashed():
    result = evaluate("x^2 = y", {"y": -4}, solve_for="x")
    assert all(s["is_real"] is False for s in result["solutions"])
    assert any("I" in s["exact"] for s in result["solutions"])


def test_too_many_blanks_names_them():
    with pytest.raises(FormulaError, match="Fill in all variables but one"):
        evaluate("F = m*a", {"F": 10})


def test_nothing_blank_asks_for_a_target():
    with pytest.raises(FormulaError, match="Leave one variable blank"):
        evaluate("F = m*a", {"F": 10, "m": 2, "a": 5})


def test_solve_for_on_plain_expression_is_rejected():
    with pytest.raises(FormulaError, match="Add an '='"):
        evaluate("m*a", {"m": 1, "a": 2}, solve_for="m")


def test_steps_are_returned_for_display():
    steps = evaluate("F = m*a", {"F": 10, "a": 2})["steps"]
    assert [s["label"] for s in steps] == ["Formula", "Substituted", "Result"]


# -- resource guards -------------------------------------------------------

def test_exponent_guard():
    with pytest.raises(FormulaError, match="[Ee]xponent"):
        evaluate("2^999999", {})


def test_nested_exponent_tower_rejected():
    with pytest.raises(FormulaError, match="[Ee]xponent"):
        evaluate("2^2^2^2^2", {})


def test_node_count_guard():
    with pytest.raises(FormulaError, match="too complex"):
        analyze("*".join(["a"] * 240))


def test_symbol_count_guard():
    with pytest.raises(FormulaError, match="[Tt]oo many variables"):
        analyze("+".join(f"v_{i}" for i in range(45)))


def test_malformed_formula_gives_readable_error():
    with pytest.raises(FormulaError, match="[Cc]ould not parse"):
        analyze("1 +* 2")
    with pytest.raises(FormulaError, match="Both sides"):
        analyze("F = ")


# -- symbol-name hazards ---------------------------------------------------

def test_lambda_is_usable_as_wavelength():
    """`lambda` is a Python keyword but the standard symbol for wavelength."""
    info = analyze("v = f*lambda")
    assert info["symbols"] == ["f", "v", "lambda"]
    assert r"\lambda" in info["latex"]
    result = evaluate("v = f*lambda", {"f": 100, "lambda": 3})
    assert result["primary"]["value"] == pytest.approx(300.0)


def test_solving_for_lambda():
    result = evaluate("v = f*lambda", {"v": 300, "f": 100})
    assert result["solve_for"] == "lambda"
    assert result["primary"]["value"] == pytest.approx(3.0)


def test_lambda_subscripted_is_untouched():
    assert analyze("lambda_1 + lambda_2")["symbols"] == ["lambda_1", "lambda_2"]


def test_reserved_words_get_a_clear_message():
    with pytest.raises(FormulaError, match="reserved word"):
        analyze("x = if + 2")
    with pytest.raises(FormulaError, match="reserved word"):
        analyze("None + 1")


def test_E_is_energy_not_eulers_number():
    """Regression: SymPy's `E` constant made `E = m*c^2` unsolvable."""
    info = analyze("E = m*c^2")
    assert info["symbols"] == ["E", "c", "m"]
    result = evaluate("E = m*c^2", {"m": 2, "c": 3})
    assert result["solve_for"] == "E"
    assert result["primary"]["value"] == pytest.approx(18.0)


def test_I_is_current_not_the_imaginary_unit():
    """Regression: SymPy's `I` constant broke Ohm's law."""
    assert analyze("V = I*R")["symbols"] == ["I", "R", "V"]
    result = evaluate("V = I*R", {"I": 2, "R": 5})
    assert result["primary"]["value"] == pytest.approx(10.0)


def test_eulers_number_still_available_via_exp():
    assert evaluate("exp(1)", {})["primary"]["value"] == pytest.approx(math.e)


# -- the shipped library must actually work --------------------------------

def test_every_library_formula_parses():
    """The bug that motivated the `lambda` alias was found exactly this way."""
    from app.formulas import FORMULAS

    for formula in FORMULAS:
        info = analyze(formula["expression"])
        documented = {v["symbol"] for v in formula["variables"]}
        found = set(info["symbols"])
        assert found == documented, (
            f"{formula['id']}: documents {sorted(documented)} but parses to {sorted(found)}"
        )


def test_every_library_equation_solves_for_each_variable():
    """Every documented variable must be reachable as the unknown."""
    from app.formulas import FORMULAS

    # Distinct values per symbol: feeding every variable the same number
    # creates degenerate physics (v == v_0 makes acceleration undefined,
    # v == c makes the Lorentz factor infinite) and would fail for real reasons.
    scale = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]

    failures = []
    for formula in FORMULAS:
        info = analyze(formula["expression"])
        if not info["is_equation"]:
            continue
        for target in info["symbols"]:
            others = [s for s in info["symbols"] if s != target]
            values = {s: scale[i % len(scale)] for i, s in enumerate(others)}
            try:
                evaluate(formula["expression"], values, solve_for=target)
            except FormulaError as exc:
                failures.append(f"{formula['id']} solving for {target}: {exc}")
    assert not failures, "\n".join(failures)


# -- degenerate input ------------------------------------------------------

def test_variable_that_cancels_out_is_reported():
    """`a = (v - v_0)/t` with v == v_0 leaves t undetermined."""
    with pytest.raises(FormulaError, match="drops out|cannot be determined"):
        evaluate("a = (v - v_0)/t", {"a": 2, "v": 5, "v_0": 5}, solve_for="t")


def test_identity_is_reported():
    with pytest.raises(FormulaError, match="any 'x'"):
        evaluate("x + y = y + x", {"y": 3}, solve_for="x")


def test_astronomically_large_result_is_explained():
    """CPython's 4300-digit int->str cap would otherwise leak a raw ValueError."""
    with pytest.raises(FormulaError, match="too many digits"):
        evaluate("factorial(120000)", {})


def test_float_value_carries_full_precision():
    """`value` must not inherit rounding noise from the display precision."""
    result = evaluate("c^2", {"c": 299792458}, precision=6)
    assert result["primary"]["value"] == pytest.approx(299792458.0 ** 2, rel=1e-15)
    assert result["primary"]["formatted"] == "8.98755e+16"


def test_infinite_result_is_labelled():
    assert evaluate("1/x", {"x": 0})["primary"]["formatted"] in {"zoo", "infinite"}


def test_result_step_renders_the_target_as_latex():
    """A Greek or subscripted target must not be interpolated as plain text."""
    steps = {s["label"]: s["latex"] for s in evaluate("v = f*lambda", {"v": 300, "f": 100})["steps"]}
    assert steps["Result"].startswith(r"\lambda =")

    steps = {s["label"]: s["latex"] for s in evaluate("v = v_0 + a*t", {"v": 10, "a": 2, "t": 3})["steps"]}
    assert steps["Result"].startswith("v_{0} =")


def test_positive_root_is_the_headline_answer():
    """For a speed, +4 is the useful answer even though SymPy lists -4 first."""
    result = evaluate("v^2 = v_0^2 + 2*a*s", {"v_0": 0, "a": 2, "s": 4}, solve_for="v")
    assert result["primary"]["value"] == pytest.approx(4.0)
    assert len(result["solutions"]) == 2  # the negative root is still returned


def test_negative_only_solution_is_still_returned():
    result = evaluate("x + 5 = y", {"y": 2}, solve_for="x")
    assert result["primary"]["value"] == pytest.approx(-3.0)


def test_result_step_matches_headline_precision():
    result = evaluate("v^2 = v_0^2 + 2*a*s", {"v_0": 0, "a": 2, "s": 8}, precision=6, solve_for="v")
    step = next(s for s in result["steps"] if s["label"] == "Result")
    assert result["primary"]["formatted"] in step["latex"]
    assert "5.65685424949238" not in step["latex"]


def test_scientific_notation_is_typeset_as_latex():
    """"3.3e-10" in a maths context renders as `e` minus 10 unless converted."""
    result = evaluate("lambda = h/(m*v)", {"h": 6.62607015e-34, "m": 9.1093837015e-31, "v": 2.19e6})
    step = next(s for s in result["steps"] if s["label"] == "Result")
    assert r"\cdot 10^{-10}" in step["latex"]
    assert "e-10" not in step["latex"]


def test_plain_numbers_are_left_alone_in_steps():
    step = next(s for s in evaluate("F = m*a", {"m": 2, "a": 3})["steps"] if s["label"] == "Result")
    assert step["latex"] == "F = 6"
