"""The input gate is the security boundary -- these are its proof."""

import pytest

from app.security import MAX_LENGTH, FormulaError, check_source, check_symbol_name


@pytest.mark.parametrize("attack", [
    "__import__('os').system('id')",     # direct code execution
    "().__class__.__bases__",            # the classic sandbox escape
    "[x for x in range(9)]",             # comprehension
    "lambda: 1",                         # ':' is not allowed
    "open('/etc/passwd')",               # quotes are not allowed
    "eval('1+1')",
    "m.__dict__",
    "a; import os",
    "x @ y",
    "{'a': 1}",
    "f'{1}'",
    "m\\n",
])
def test_hostile_input_is_rejected(attack):
    with pytest.raises(FormulaError):
        check_source(attack)


@pytest.mark.parametrize("formula", [
    "1/2 m v^2",
    "F = m*a",
    "0.5*m*v**2",
    "sqrt(2*g*h)",
    "v_0 + a*t",
    "n_1*sin(theta_1) = n_2*sin(theta_2)",
    "E = m*c^2",
    ".5*x",
    "100 % 7",
])
def test_legitimate_formulas_pass(formula):
    assert check_source(formula) == formula.strip()


def test_attribute_dot_blocked_but_decimals_allowed():
    assert check_source("9.81*m") == "9.81*m"
    with pytest.raises(FormulaError, match="'\\.'"):
        check_source("m.real")


def test_length_limit():
    with pytest.raises(FormulaError, match="too long"):
        check_source("1+" * MAX_LENGTH)


def test_empty_and_non_string():
    with pytest.raises(FormulaError, match="empty"):
        check_source("   ")
    with pytest.raises(FormulaError, match="text"):
        check_source(42)


def test_single_equals_only():
    with pytest.raises(FormulaError, match="at most one"):
        check_source("a = b = c")


def test_symbol_names():
    assert check_symbol_name("v_0") == "v_0"
    for bad in ["0v", "__x", "a-b", "", "x" * 40]:
        with pytest.raises(FormulaError):
            check_symbol_name(bad)
