"""Sampling a formula for a 2D curve or a 3D surface.

A plot is several hundred evaluations behind one request, so most of what is
asserted here is about *limits*: the sample cap, the range checks, and the fact
that sampling goes through the same whitelist and guards as everything else.
"""

import pytest

from app.engine import MAX_GRID_SAMPLES, MAX_SAMPLES, plot
from app.security import FormulaError


def curve(result):
    """The one row of a curve's samples."""
    assert result["mode"] == "curve"
    return result["series"][0]["samples"][0]


# -- what a plot is --------------------------------------------------------

def test_expression_is_swept_directly():
    result = plot("1/2 m v^2", {"m": 2}, axes=[{"variable": "v", "min": 0, "max": 4}], samples=5)
    assert result["value_label"] == "value"
    assert curve(result) == pytest.approx([0, 1, 4, 9, 16])


def test_equation_is_rearranged_then_swept():
    """The whole point: `F = m*a` plots F against a without being rewritten."""
    result = plot("F = m*a", {"m": 2}, axes=[{"variable": "a", "min": 0, "max": 5}], samples=6)
    assert result["value_label"] == "F"
    assert curve(result) == pytest.approx([0, 2, 4, 6, 8, 10])


def test_the_same_equation_plots_in_every_direction():
    """As with solving, one formula answers whichever question is asked of it."""
    against_a = plot("F = m*a", {"m": 2}, axes=[{"variable": "a", "min": 1, "max": 2}], samples=2)
    against_m = plot("F = m*a", {"a": 2}, axes=[{"variable": "m", "min": 1, "max": 2}], samples=2)
    assert curve(against_a) == pytest.approx([2, 4])
    assert curve(against_m) == pytest.approx([2, 4])

    # And the swept variable can be the one a value was given for: solving for
    # m while sweeping F is the third question.
    against_f = plot(
        "F = m*a", {"a": 2}, solve_for="m",
        axes=[{"variable": "F", "min": 2, "max": 4}], samples=2,
    )
    assert against_f["value_label"] == "m"
    assert curve(against_f) == pytest.approx([1, 2])


def test_endpoints_are_exact():
    """Sampled from the fraction, not by accumulating a step, so the curve
    actually reaches the edge of its frame."""
    row = curve(plot("y = x", axes=[{"variable": "x", "min": -0.3, "max": 0.7}], samples=101))
    assert row[0] == pytest.approx(-0.3)
    assert row[-1] == pytest.approx(0.7)


def test_a_swept_variable_ignores_the_value_it_was_given():
    """The workspace holds a value for every field it renders. Refusing the one
    being swept would only move that bookkeeping across the wire."""
    result = plot("F = m*a", {"m": 2, "a": 99}, axes=[{"variable": "a", "min": 0, "max": 1}], samples=2)
    assert curve(result) == pytest.approx([0, 2])


def test_the_plotted_variable_ignores_the_value_it_still_holds():
    """Found in the browser, not in a test. The workspace keeps whatever was
    last typed into a field, so the variable being plotted usually *does* still
    carry a value -- and substituting it rearranged the equation for a symbol
    that was no longer in it: "'v' drops out of the equation"."""
    result = plot(
        "v^2 = v_0^2 + 2*a*s", {"a": 2, "v_0": 0, "v": 3}, solve_for="v",
        axes=[{"variable": "s", "min": 0, "max": 2}], samples=3,
    )
    assert result["value_label"] == "v"
    assert len(result["series"]) == 2


def test_lambda_can_be_an_axis():
    """`lambda` is aliased internally, so the axis name has to survive the trip."""
    result = plot("v = f*lambda", {"f": 100}, axes=[{"variable": "lambda", "min": 0, "max": 3}], samples=4)
    assert result["axes"][0]["variable"] == "lambda"
    assert curve(result) == pytest.approx([0, 100, 200, 300])


# -- gaps rather than failures --------------------------------------------

def test_an_asymptote_is_a_gap_not_an_error():
    """`1/x` at zero has no value. One null point beats failing the request."""
    row = curve(plot("y = 1/x", axes=[{"variable": "x", "min": -2, "max": 2}], samples=5))
    assert row[2] is None
    assert row == [pytest.approx(-0.5), pytest.approx(-1.0), None,
                   pytest.approx(1.0), pytest.approx(0.5)]


def test_outside_the_real_domain_is_a_gap_too():
    row = curve(plot("y = sqrt(x)", axes=[{"variable": "x", "min": -2, "max": 2}], samples=5))
    assert row[:2] == [None, None]
    assert row[4] == pytest.approx(2 ** 0.5)


def test_the_reported_range_covers_only_finite_samples():
    result = plot("y = 1/x", axes=[{"variable": "x", "min": -2, "max": 2}], samples=5)
    assert result["value_min"] == pytest.approx(-1.0)
    assert result["value_max"] == pytest.approx(1.0)


def test_nothing_finite_anywhere_is_reported_as_such():
    """A curve of nothing but gaps is not a plot; say so rather than draw air."""
    with pytest.raises(FormulaError, match="no real value"):
        plot("y = sqrt(-x)", axes=[{"variable": "x", "min": 1, "max": 5}], samples=10)


# -- more than one answer -------------------------------------------------

def test_both_roots_of_a_quadratic_are_drawn():
    """Drawing one branch of ± sqrt and calling it the answer would be a lie."""
    result = plot(
        "v^2 = v_0^2 + 2*a*s", {"v_0": 0, "a": 2}, solve_for="v",
        axes=[{"variable": "s", "min": 0, "max": 2}], samples=3,
    )
    assert len(result["series"]) == 2
    assert result["note"] == ""     # both fit, so there is nothing to disclose
    # v = ±sqrt(2*a*s) = ±sqrt(8) at the far end of the sweep.
    ends = sorted(series["samples"][0][-1] for series in result["series"])
    assert ends == pytest.approx([-(8 ** 0.5), 8 ** 0.5])


def test_a_surface_draws_one_branch_and_says_so():
    """Two isometric sheets over each other are indistinguishable, so a surface
    takes the first branch -- and admits it."""
    result = plot(
        "v^2 = v_0^2 + 2*a*s", {"v_0": 0}, solve_for="v",
        axes=[{"variable": "a", "min": 1, "max": 2}, {"variable": "s", "min": 1, "max": 2}],
        samples=4,
    )
    assert len(result["series"]) == 1
    assert "of 2 solutions" in result["note"]


# -- surfaces --------------------------------------------------------------

def test_a_surface_is_a_grid_of_rows():
    result = plot(
        "z = x*y", axes=[{"variable": "x", "min": 0, "max": 2}, {"variable": "y", "min": 0, "max": 2}],
        samples=3,
    )
    assert result["mode"] == "surface"
    rows = result["series"][0]["samples"]
    assert len(rows) == 3 and all(len(row) == 3 for row in rows)
    # One row per step of the second axis, so rows[j][i] is f(x_i, y_j).
    assert rows[0] == pytest.approx([0, 0, 0])          # y = 0
    assert rows[2] == pytest.approx([0, 2, 4])          # y = 2


def test_a_surface_needs_two_different_variables():
    with pytest.raises(FormulaError, match="both axes"):
        plot("z = x*y", {"y": 1}, axes=[{"variable": "x", "min": 0, "max": 1}] * 2)


def test_an_axis_cannot_also_be_the_variable_being_plotted():
    with pytest.raises(FormulaError, match="already an axis"):
        plot("F = m*a", {"m": 2}, solve_for="a", axes=[{"variable": "a", "min": 0, "max": 1}])


# -- the sampling budget ---------------------------------------------------

def test_the_sample_count_is_capped():
    """The cap is the point of the endpoint being safe: N is caller-supplied."""
    result = plot("y = x", axes=[{"variable": "x", "min": 0, "max": 1}], samples=10 ** 6)
    assert result["axes"][0]["samples"] == MAX_SAMPLES
    assert len(curve(result)) == MAX_SAMPLES


def test_a_surface_is_capped_to_the_square_root_of_the_same_budget():
    """A grid squares the count, so one request stays one budget's arithmetic."""
    result = plot(
        "z = x*y", axes=[{"variable": "x", "min": 0, "max": 1}, {"variable": "y", "min": 0, "max": 1}],
        samples=MAX_SAMPLES,
    )
    assert [axis["samples"] for axis in result["axes"]] == [MAX_GRID_SAMPLES] * 2
    assert MAX_GRID_SAMPLES ** 2 <= MAX_SAMPLES


def test_two_samples_is_the_floor():
    result = plot("y = x", axes=[{"variable": "x", "min": 0, "max": 1}], samples=0)
    assert result["axes"][0]["samples"] == 2


# -- ranges ----------------------------------------------------------------

@pytest.mark.parametrize("low, high", [(1, 1), (5, 1)])
def test_a_range_must_go_somewhere(low, high):
    with pytest.raises(FormulaError, match="start below where it ends"):
        plot("y = x", axes=[{"variable": "x", "min": low, "max": high}])


@pytest.mark.parametrize("edge", [float("inf"), float("-inf"), float("nan")])
def test_a_range_must_be_finite(edge):
    """Pydantic accepts inf and nan as floats, so this check is not redundant."""
    with pytest.raises(FormulaError, match="must be finite"):
        plot("y = x", axes=[{"variable": "x", "min": 0, "max": edge}])


def test_a_range_of_non_numbers_is_refused():
    with pytest.raises(FormulaError, match="needs two numbers"):
        plot("y = x", axes=[{"variable": "x", "min": "a", "max": "b"}])


# -- the same three checks as everything else ------------------------------

@pytest.mark.parametrize("expression", [
    "__import__('os').system('id')",
    "().__class__",
    "y = open('/etc/passwd')",
])
def test_hostile_expressions_never_reach_the_sampler(expression):
    """Sampling goes through `analyze`, so the character whitelist runs first --
    there is deliberately no second, laxer path into the parser."""
    with pytest.raises(FormulaError):
        plot(expression, axes=[{"variable": "x", "min": 0, "max": 1}])


def test_the_complexity_guards_still_apply():
    with pytest.raises(FormulaError, match="[Ee]xponent"):
        plot("y = x^999999", axes=[{"variable": "x", "min": 0, "max": 1}])


def test_an_axis_must_be_in_the_formula():
    with pytest.raises(FormulaError, match="does not appear"):
        plot("F = m*a", {"m": 2}, axes=[{"variable": "q", "min": 0, "max": 1}])


def test_an_invalid_axis_name_is_refused():
    with pytest.raises(FormulaError, match="Invalid variable name"):
        plot("y = x", axes=[{"variable": "x; import os", "min": 0, "max": 1}])


def test_missing_values_are_named():
    with pytest.raises(FormulaError, match="Missing value.*m"):
        plot("1/2 m v^2", axes=[{"variable": "v", "min": 0, "max": 1}])


def test_too_many_blanks_asks_which_one_to_plot():
    with pytest.raises(FormulaError, match="Still blank"):
        plot("v = v_0 + a*t", axes=[{"variable": "t", "min": 0, "max": 1}])


def test_solve_for_on_a_plain_expression_is_rejected():
    with pytest.raises(FormulaError, match="Add an '='"):
        plot("m*a", {"m": 2}, solve_for="m", axes=[{"variable": "a", "min": 0, "max": 1}])


# -- over HTTP -------------------------------------------------------------

def test_plot_endpoint_returns_a_curve(client):
    response = client.post("/api/plot", json={
        "expression": "F = m*a",
        "values": {"m": 2},
        "axes": [{"variable": "a", "min": 0, "max": 5}],
        "samples": 6,
    })
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "curve"
    assert body["value_label"] == "F"
    assert body["axes"] == [{"variable": "a", "min": 0.0, "max": 5.0, "samples": 6}]
    assert body["series"][0]["samples"] == [[0, 2, 4, 6, 8, 10]]


def test_plot_endpoint_returns_a_surface(client):
    response = client.post("/api/plot", json={
        "expression": "z = x*y",
        "axes": [
            {"variable": "x", "min": 0, "max": 2},
            {"variable": "y", "min": 0, "max": 2},
        ],
        "samples": 3,
    })
    body = response.json()
    assert body["mode"] == "surface"
    assert body["series"][0]["samples"][2] == [0, 2, 4]


def test_plot_endpoint_reports_a_gap_as_null(client):
    response = client.post("/api/plot", json={
        "expression": "y = 1/x",
        "axes": [{"variable": "x", "min": -2, "max": 2}],
        "samples": 5,
    })
    assert response.json()["series"][0]["samples"][0][2] is None


def test_plot_endpoint_400s_on_a_hostile_expression(client):
    response = client.post("/api/plot", json={
        "expression": "__import__('os').system('id')",
        "axes": [{"variable": "x", "min": 0, "max": 1}],
    })
    assert response.status_code == 400
    assert "error" in response.json()


def test_plot_endpoint_422s_beyond_the_sample_cap(client):
    """Rejected by the schema, before anything is parsed -- as `precision` is."""
    response = client.post("/api/plot", json={
        "expression": "y = x",
        "axes": [{"variable": "x", "min": 0, "max": 1}],
        "samples": MAX_SAMPLES + 1,
    })
    assert response.status_code == 422


def test_plot_endpoint_422s_on_three_axes(client):
    """A plot has at most two dimensions to sweep; the schema says so."""
    response = client.post("/api/plot", json={
        "expression": "y = x",
        "axes": [{"variable": name, "min": 0, "max": 1} for name in "xyz"],
    })
    assert response.status_code == 422


def test_plot_endpoint_400s_on_a_backwards_range(client):
    response = client.post("/api/plot", json={
        "expression": "y = x",
        "axes": [{"variable": "x", "min": 5, "max": 1}],
    })
    assert response.status_code == 400
    assert "x" in response.json()["error"]


def test_capabilities_publishes_the_sampling_limits(client):
    limits = client.get("/api/capabilities").json()["limits"]
    assert limits["max_samples"] == MAX_SAMPLES
    assert limits["max_grid_samples"] == MAX_GRID_SAMPLES
