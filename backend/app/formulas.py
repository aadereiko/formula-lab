"""Curated physics formulas and constants.

Static reference data. Units here are *documentation*: they label inputs and
results in the UI but are not carried through the arithmetic, so the values you
type must be in a consistent (SI) system. That trade-off is deliberate -- full
dimensional analysis is a much larger feature, and silently half-doing it would
be worse than being explicit about it.
"""

from __future__ import annotations

from typing import Any


def _f(
    id: str, name: str, category: str, expression: str, variables: dict[str, str],
    note: str = "",
) -> dict[str, Any]:
    return {
        "id": id, "name": name, "category": category, "expression": expression,
        "variables": [{"symbol": s, "description": d} for s, d in variables.items()],
        "note": note,
    }


FORMULAS: list[dict[str, Any]] = [
    # -- Kinematics ---------------------------------------------------------
    _f("velocity", "Average velocity", "Kinematics", "v = d / t",
       {"v": "velocity (m/s)", "d": "distance (m)", "t": "time (s)"}),
    _f("accel", "Acceleration", "Kinematics", "a = (v - v_0) / t",
       {"a": "acceleration (m/s²)", "v": "final velocity (m/s)",
        "v_0": "initial velocity (m/s)", "t": "time (s)"}),
    _f("suvat-v", "Velocity after time", "Kinematics", "v = v_0 + a*t",
       {"v": "final velocity (m/s)", "v_0": "initial velocity (m/s)",
        "a": "acceleration (m/s²)", "t": "time (s)"}),
    _f("suvat-s", "Displacement under constant acceleration", "Kinematics",
       "s = v_0*t + 1/2 a t^2",
       {"s": "displacement (m)", "v_0": "initial velocity (m/s)",
        "t": "time (s)", "a": "acceleration (m/s²)"}),
    _f("suvat-v2", "Velocity–displacement relation", "Kinematics",
       "v^2 = v_0^2 + 2 a s",
       {"v": "final velocity (m/s)", "v_0": "initial velocity (m/s)",
        "a": "acceleration (m/s²)", "s": "displacement (m)"},
       "Two roots: the object may pass a point moving either way."),
    _f("projectile-range", "Projectile range", "Kinematics",
       "R = v_0^2 * sin(2*theta) / g",
       {"R": "range (m)", "v_0": "launch speed (m/s)",
        "theta": "launch angle (radians)", "g": "gravity (m/s²)"},
       "Angles are in radians: 45° = pi/4."),

    # -- Dynamics ----------------------------------------------------------
    _f("newton2", "Newton's second law", "Dynamics", "F = m*a",
       {"F": "force (N)", "m": "mass (kg)", "a": "acceleration (m/s²)"}),
    _f("weight", "Weight", "Dynamics", "W = m*g",
       {"W": "weight (N)", "m": "mass (kg)", "g": "gravity (m/s²)"}),
    _f("momentum", "Momentum", "Dynamics", "p = m*v",
       {"p": "momentum (kg·m/s)", "m": "mass (kg)", "v": "velocity (m/s)"}),
    _f("impulse", "Impulse", "Dynamics", "J = F*t",
       {"J": "impulse (N·s)", "F": "force (N)", "t": "time (s)"}),
    _f("friction", "Friction force", "Dynamics", "F = mu*N",
       {"F": "friction force (N)", "mu": "coefficient of friction",
        "N": "normal force (N)"}),
    _f("hooke", "Hooke's law", "Dynamics", "F = k*x",
       {"F": "restoring force (N)", "k": "spring constant (N/m)",
        "x": "displacement (m)"}),
    _f("centripetal", "Centripetal force", "Dynamics", "F = m*v^2 / r",
       {"F": "force (N)", "m": "mass (kg)", "v": "speed (m/s)",
        "r": "radius (m)"}),
    _f("pressure", "Pressure", "Dynamics", "P = F / A",
       {"P": "pressure (Pa)", "F": "force (N)", "A": "area (m²)"}),

    # -- Energy ------------------------------------------------------------
    _f("kinetic", "Kinetic energy", "Energy", "E = 1/2 m v^2",
       {"E": "kinetic energy (J)", "m": "mass (kg)", "v": "speed (m/s)"}),
    _f("potential", "Gravitational potential energy", "Energy", "E = m*g*h",
       {"E": "potential energy (J)", "m": "mass (kg)",
        "g": "gravity (m/s²)", "h": "height (m)"}),
    _f("spring-energy", "Elastic potential energy", "Energy", "E = 1/2 k x^2",
       {"E": "stored energy (J)", "k": "spring constant (N/m)",
        "x": "extension (m)"}),
    _f("work", "Work done by a force", "Energy", "W = F*d*cos(theta)",
       {"W": "work (J)", "F": "force (N)", "d": "displacement (m)",
        "theta": "angle between F and d (radians)"}),
    _f("power", "Power", "Energy", "P = W / t",
       {"P": "power (W)", "W": "work (J)", "t": "time (s)"}),
    _f("efficiency", "Efficiency", "Energy", "eta = E_out / E_in",
       {"eta": "efficiency (0–1)", "E_out": "useful energy out (J)",
        "E_in": "total energy in (J)"}),

    # -- Rotation ----------------------------------------------------------
    _f("torque", "Torque", "Rotation", "tau = r*F*sin(theta)",
       {"tau": "torque (N·m)", "r": "lever arm (m)", "F": "force (N)",
        "theta": "angle (radians)"}),
    _f("angular-v", "Angular velocity", "Rotation", "omega = 2*pi / T",
       {"omega": "angular velocity (rad/s)", "T": "period (s)"}),
    _f("rot-energy", "Rotational kinetic energy", "Rotation",
       "E = 1/2 I omega^2",
       {"E": "energy (J)", "I": "moment of inertia (kg·m²)",
        "omega": "angular velocity (rad/s)"}),

    # -- Gravitation -------------------------------------------------------
    _f("gravitation", "Newton's law of gravitation", "Gravitation",
       "F = G*m_1*m_2 / r^2",
       {"F": "force (N)", "G": "gravitational constant", "m_1": "first mass (kg)",
        "m_2": "second mass (kg)", "r": "separation (m)"}),
    _f("escape-v", "Escape velocity", "Gravitation", "v = sqrt(2*G*M / r)",
       {"v": "escape velocity (m/s)", "G": "gravitational constant",
        "M": "mass of the body (kg)", "r": "radius (m)"}),
    _f("orbital-period", "Orbital period (Kepler III)", "Gravitation",
       "T^2 = 4*pi^2*r^3 / (G*M)",
       {"T": "period (s)", "r": "orbital radius (m)",
        "G": "gravitational constant", "M": "central mass (kg)"}),

    # -- Electricity -------------------------------------------------------
    _f("ohm", "Ohm's law", "Electricity", "V = I*R",
       {"V": "voltage (V)", "I": "current (A)", "R": "resistance (Ω)"}),
    _f("elec-power", "Electrical power", "Electricity", "P = V*I",
       {"P": "power (W)", "V": "voltage (V)", "I": "current (A)"}),
    _f("coulomb", "Coulomb's law", "Electricity", "F = k_e*q_1*q_2 / r^2",
       {"F": "force (N)", "k_e": "Coulomb constant", "q_1": "first charge (C)",
        "q_2": "second charge (C)", "r": "separation (m)"}),
    _f("capacitance", "Capacitance", "Electricity", "C = Q / V",
       {"C": "capacitance (F)", "Q": "charge (C)", "V": "voltage (V)"}),
    _f("resistivity", "Resistance of a wire", "Electricity", "R = rho*L / A",
       {"R": "resistance (Ω)", "rho": "resistivity (Ω·m)", "L": "length (m)",
        "A": "cross-section (m²)"}),

    # -- Waves & optics ----------------------------------------------------
    _f("wave-speed", "Wave equation", "Waves & Optics", "v = f*lambda",
       {"v": "wave speed (m/s)", "f": "frequency (Hz)",
        "lambda": "wavelength (m)"}),
    _f("period-freq", "Period and frequency", "Waves & Optics", "T = 1 / f",
       {"T": "period (s)", "f": "frequency (Hz)"}),
    _f("snell", "Snell's law", "Waves & Optics",
       "n_1*sin(theta_1) = n_2*sin(theta_2)",
       {"n_1": "first refractive index", "theta_1": "incident angle (radians)",
        "n_2": "second refractive index", "theta_2": "refracted angle (radians)"}),
    _f("lens", "Thin lens equation", "Waves & Optics", "1/f = 1/d_o + 1/d_i",
       {"f": "focal length (m)", "d_o": "object distance (m)",
        "d_i": "image distance (m)"}),
    _f("pendulum", "Simple pendulum period", "Waves & Optics",
       "T = 2*pi*sqrt(L / g)",
       {"T": "period (s)", "L": "length (m)", "g": "gravity (m/s²)"}),

    # -- Thermodynamics ----------------------------------------------------
    _f("ideal-gas", "Ideal gas law", "Thermodynamics", "P*V = n*R*T",
       {"P": "pressure (Pa)", "V": "volume (m³)", "n": "amount (mol)",
        "R": "gas constant", "T": "temperature (K)"}),
    _f("heat", "Sensible heat", "Thermodynamics", "Q = m*c*dT",
       {"Q": "heat (J)", "m": "mass (kg)",
        "c": "specific heat capacity (J/kg·K)", "dT": "temperature change (K)"}),
    _f("thermal-exp", "Linear thermal expansion", "Thermodynamics",
       "dL = alpha*L_0*dT",
       {"dL": "change in length (m)", "alpha": "expansion coefficient (1/K)",
        "L_0": "original length (m)", "dT": "temperature change (K)"}),

    # -- Modern physics ----------------------------------------------------
    _f("mass-energy", "Mass–energy equivalence", "Modern Physics", "E = m*c^2",
       {"E": "energy (J)", "m": "mass (kg)", "c": "speed of light (m/s)"}),
    _f("photon", "Photon energy", "Modern Physics", "E = h*f",
       {"E": "energy (J)", "h": "Planck constant", "f": "frequency (Hz)"}),
    _f("de-broglie", "De Broglie wavelength", "Modern Physics",
       "lambda = h / (m*v)",
       {"lambda": "wavelength (m)", "h": "Planck constant", "m": "mass (kg)",
        "v": "speed (m/s)"}),
    _f("lorentz", "Lorentz factor", "Modern Physics",
       "gamma = 1 / sqrt(1 - v^2/c^2)",
       {"gamma": "Lorentz factor", "v": "speed (m/s)",
        "c": "speed of light (m/s)"}),
    _f("half-life", "Radioactive decay", "Modern Physics",
       "N = N_0 * exp(-lambda*t)",
       {"N": "remaining nuclei", "N_0": "initial nuclei",
        "lambda": "decay constant (1/s)", "t": "time (s)"}),
]


CONSTANTS: list[dict[str, Any]] = [
    {"symbol": "g", "name": "Standard gravity", "value": 9.80665, "unit": "m/s²"},
    {"symbol": "c", "name": "Speed of light", "value": 299792458.0, "unit": "m/s"},
    {"symbol": "G", "name": "Gravitational constant", "value": 6.67430e-11, "unit": "m³/kg·s²"},
    {"symbol": "h", "name": "Planck constant", "value": 6.62607015e-34, "unit": "J·s"},
    {"symbol": "k_e", "name": "Coulomb constant", "value": 8.9875517873681764e9, "unit": "N·m²/C²"},
    {"symbol": "e", "name": "Elementary charge", "value": 1.602176634e-19, "unit": "C"},
    {"symbol": "m_e", "name": "Electron mass", "value": 9.1093837015e-31, "unit": "kg"},
    {"symbol": "m_p", "name": "Proton mass", "value": 1.67262192369e-27, "unit": "kg"},
    {"symbol": "k_B", "name": "Boltzmann constant", "value": 1.380649e-23, "unit": "J/K"},
    {"symbol": "N_A", "name": "Avogadro constant", "value": 6.02214076e23, "unit": "1/mol"},
    {"symbol": "R", "name": "Gas constant", "value": 8.314462618, "unit": "J/mol·K"},
    {"symbol": "sigma", "name": "Stefan–Boltzmann constant", "value": 5.670374419e-8, "unit": "W/m²·K⁴"},
    {"symbol": "epsilon_0", "name": "Vacuum permittivity", "value": 8.8541878128e-12, "unit": "F/m"},
    {"symbol": "mu_0", "name": "Vacuum permeability", "value": 1.25663706212e-6, "unit": "N/A²"},
    {"symbol": "M_earth", "name": "Earth mass", "value": 5.9722e24, "unit": "kg"},
    {"symbol": "R_earth", "name": "Earth radius (mean)", "value": 6371000.0, "unit": "m"},
    {"symbol": "h_bar", "name": "Reduced Planck constant", "value": 1.054571817e-34, "unit": "J·s"},
    {"symbol": "m_n", "name": "Neutron mass", "value": 1.67492749804e-27, "unit": "kg"},
    {"symbol": "amu", "name": "Atomic mass unit", "value": 1.66053906660e-27, "unit": "kg"},
    {"symbol": "a_0", "name": "Bohr radius", "value": 5.29177210903e-11, "unit": "m"},
    {"symbol": "atm", "name": "Standard atmosphere", "value": 101325.0, "unit": "Pa"},
    {"symbol": "T_0", "name": "Ice point", "value": 273.15, "unit": "K"},
    {"symbol": "V_m", "name": "Molar volume at STP", "value": 0.02241396954, "unit": "m³/mol"},
    {"symbol": "Z_0", "name": "Impedance of vacuum", "value": 376.730313668, "unit": "Ω"},
    {"symbol": "b_wien", "name": "Wien displacement constant", "value": 2.897771955e-3, "unit": "m·K"},
    {"symbol": "g_moon", "name": "Lunar surface gravity", "value": 1.625, "unit": "m/s²"},
    {"symbol": "M_sun", "name": "Solar mass", "value": 1.98892e30, "unit": "kg"},
    {"symbol": "R_sun", "name": "Solar radius", "value": 6.957e8, "unit": "m"},
    {"symbol": "AU", "name": "Astronomical unit", "value": 1.495978707e11, "unit": "m"},
    {"symbol": "ly", "name": "Light year", "value": 9.4607304725808e15, "unit": "m"},
    {"symbol": "pc", "name": "Parsec", "value": 3.0856775814913673e16, "unit": "m"},
]

# Symbols deliberately left out, because a chip offering the wrong quantity is
# worse than no chip: `F` (Faraday, but force far more often), `alpha` (fine
# structure, but also thermal expansion), `b` (Wien, but also an arbitrary
# length). Where the standard symbol is ambiguous the unambiguous spelling is
# used instead -- `amu` rather than `u`, `b_wien` rather than `b`.


#: Shown when a symbol has no example of its own, purely to demonstrate the
#: "name (unit)" shape a good description has.
FALLBACK_HINT = "mass (kg)"


#: A few symbols whose everyday meaning is broader than their first appearance
#: in the library. `rho` is density far more often than resistivity, and
#: `theta` is an angle before it is a launch angle. Kept deliberately short --
#: the library is still the source for the other fifty-odd.
_HINT_OVERRIDES = {
    "rho": "density (kg/m³)",
    "theta": "angle (radians)",
    "phi": "angle (radians)",
    # The library mentions moment of inertia before current, but `I` alongside
    # V and R is the more common reading.
    "I": "current (A)",
}


def variable_hints() -> dict[str, str]:
    """An example description per symbol, drawn from the built-in library.

    Used as placeholder text when someone writes their own formula, so the
    field suggests "velocity (m/s)" rather than leaving the format to guess.

    Derived rather than hand-written: the library already says what `m`, `v`
    and `theta` mean, and a second table would drift out of step with it.
    First mention wins, which favours the earlier, more elementary formulas.
    """
    hints: dict[str, str] = {}
    for formula in FORMULAS:
        for variable in formula["variables"]:
            hints.setdefault(variable["symbol"], variable["description"])
    hints.update(_HINT_OVERRIDES)
    return hints


def categories() -> list[str]:
    """Category names in the order they first appear in :data:`FORMULAS`."""
    seen: list[str] = []
    for formula in FORMULAS:
        if formula["category"] not in seen:
            seen.append(formula["category"])
    return seen
