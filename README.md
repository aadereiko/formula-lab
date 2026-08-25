# Formula Lab

Type a physics formula, fill in what you know, and get what you don't.

Write an equation like `F = m*a`, leave one variable blank, and Formula Lab
solves for it. The same formula answers every question you can ask of it — force
from mass and acceleration, or mass from force and acceleration — without you
rearranging anything by hand.

- **React + TypeScript** front end with live LaTeX rendering
- **Python + FastAPI + SymPy** back end that parses, rearranges and evaluates
- 44 built-in formulas across kinematics, dynamics, energy, gravitation,
  electricity, waves, thermodynamics and modern physics
- 16 physical constants, offered as one-click fills when a formula names them

## Quick start

```bash
make install     # create backend/.venv, install Python + npm dependencies
make dev         # start both servers
```

Then open <http://localhost:7732>.

Or run the two halves separately:

```bash
cd backend  && .venv/bin/python -m app.main    # API on 7731
cd frontend && npm run dev                     # web on 7732
```

### Ports

| Service  | Port   | Notes                                    |
| -------- | ------ | ---------------------------------------- |
| Web app  | `7732` | Vite dev server, proxies `/api` to 7731  |
| API      | `7731` | Override with `FORMULA_LAB_PORT`         |

These sit outside the ranges other local projects use (Vite's 5173–5175,
8080/8123/8765, and the 74xx range), so Formula Lab can run alongside them.

## Using it

Pick a formula from the sidebar, or type your own.

| You type            | You get                                          |
| ------------------- | ------------------------------------------------ |
| `F = m*a`           | an equation — leave any one variable blank        |
| `1/2 m v^2`         | an expression — fill in everything, get a number  |

The variable fields are generated from whatever your formula mentions, so
`E_k = 1/2 m v^2` immediately asks for `E_k`, `m` and `v`.

### Syntax

| Feature                | Example                     |
| ---------------------- | --------------------------- |
| Implicit multiplication | `1/2 m v^2` = `1/2*m*v**2`  |
| Either power operator   | `v^2` or `v**2`             |
| Subscripts             | `v_0`, `m_1`, `E_out`       |
| Greek letters          | `theta`, `lambda`, `omega`  |
| Functions              | `sin`, `sqrt`, `exp`, `log`, … |

Trigonometric functions take **radians** — write 45° as `pi/4`.

Units shown next to each field are labels, not part of the arithmetic: enter
values in a consistent (SI) system. Full dimensional analysis is a much larger
feature, and half-doing it silently would be worse than being explicit.

`E` and `I` are ordinary variables here (energy and current), not Euler's number
and the imaginary unit. Write `exp(1)` if you want *e*.

## How it works

```
React (7732)                       FastAPI (7731)                worker process
────────────                       ──────────────                ──────────────
type a formula   ──/api/analyze──▶ validate → parse ──────────▶ SymPy parse
                 ◀── variables ──  return free symbols          + guard checks
render inputs
fill values      ──/api/evaluate─▶ validate ──────────────────▶ substitute
                 ◀─── result ────  solve for the unknown         + solve/evalf
```

Every formula crosses three checks before it is worth anything:

1. **A character whitelist** (`backend/app/security.py`). SymPy's `parse_expr`
   ultimately calls `eval`, so the string itself is the security boundary —
   `().__class__.__bases__` parses into a real Python tuple, and
   `sympify("__import__('os')")` is code execution. Quotes, brackets, `:`, `;`
   and stray `.` never reach the parser.
2. **Static complexity guards** (`backend/app/engine.py`). `2**2**2**2**2` is
   nine nodes and contains nothing hostile, yet evaluating it materialises a
   20 000-digit number. Guards run against the *inert* (`evaluate=False`) parse
   tree, before any arithmetic happens.
3. **A wall-clock timeout in a separate process** (`backend/app/runner.py`).
   `exp(exp(exp(9)))` passes every static check and then occupies a CPU
   indefinitely. Static analysis cannot decide this in general, so the backstop
   is real preemption — which needs a process, since CPU-bound SymPy holds the
   GIL and cannot be cancelled in a thread.

## API

| Endpoint            | Method | Purpose                                       |
| ------------------- | ------ | --------------------------------------------- |
| `/api/analyze`      | POST   | Variables, LaTeX, and whether it's an equation |
| `/api/evaluate`     | POST   | Evaluate, or solve for one variable            |
| `/api/formulas`     | GET    | The built-in formula library                   |
| `/api/constants`    | GET    | Physical constants                             |
| `/api/capabilities` | GET    | Allowed functions and current limits           |
| `/api/health`       | GET    | Liveness                                       |

```bash
curl -X POST localhost:7731/api/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"expression": "F = m*a", "values": {"F": 10, "a": 2}}'
```

```json
{
  "mode": "solve",
  "solve_for": "m",
  "solutions": [{ "value": 5.0, "formatted": "5", "exact": "5.00000000000000" }],
  "steps": [
    { "label": "Formula",     "latex": "F = a m" },
    { "label": "Substituted", "latex": "10.0 = 2.0 m" },
    { "label": "Result",      "latex": "m = 5" }
  ]
}
```

Interactive docs are at <http://localhost:7731/docs>.

A formula the user can fix returns **400** with `{"error": "..."}`, and those
messages are written to be shown verbatim in the UI. Malformed *requests* return
422 from Pydantic.

## Tests

```bash
make test
```

88 backend tests plus a frontend typecheck. Beyond the usual unit coverage, two
of them earn their keep:

- `test_every_library_formula_parses` runs all 44 shipped formulas through the
  parser. This is what caught `lambda` being a Python keyword — SymPy cannot wrap
  it in a `Symbol`, so `v = f*lambda` was a raw `SyntaxError`. (It now aliases to
  SymPy's `lamda`, which typesets as `\lambda`.)
- `test_every_library_equation_solves_for_each_variable` solves every formula for
  every one of its variables — 153 solves, and the reason the app can promise
  that any variable is reachable.

## Layout

```
backend/
  app/security.py    input whitelist -- the security boundary
  app/engine.py      parse, guard, substitute, solve  (imports only SymPy)
  app/runner.py      process pool + wall-clock timeout
  app/formulas.py    formula and constant catalogues
  app/main.py        FastAPI routes
  tests/             security, engine and HTTP tests
frontend/
  src/api.ts         typed client; separates user-fixable errors from ours
  src/App.tsx        state, debouncing, auto-evaluate
  src/components/    formula input, variable panel, results, library, history
```

## Licence

MIT
