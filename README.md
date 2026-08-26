# Formula Lab

Type a physics formula, fill in what you know, and get what you don't.

Write an equation like `F = m*a`, leave one variable blank, and Formula Lab
solves for it. The same formula answers every question you can ask of it —
force from mass and acceleration, or mass from force and acceleration — without
you rearranging anything by hand.

- **React + TypeScript** front end, live LaTeX, minimal UI, works on a phone
- Save your own formulas — **with or without an account**
- **Python + FastAPI + SymPy** back end that parses, rearranges and evaluates
- **Accounts** — email/password or Google — so your own formulas are saved
- 44 built-in formulas across nine areas of physics, and 16 constants offered
  as one-click fills when a formula names them

## Quick start

```bash
make install     # backend/.venv + npm dependencies
make dev         # API on 7731, web on 7732
```

Open <http://localhost:7732>. It starts on a blank **New formula** page; no
account is needed for anything.

### Ports

| Service | Port   | Notes                                   |
| ------- | ------ | --------------------------------------- |
| Web app | `7732` | Vite dev server, proxies `/api` to 7731 |
| API     | `7731` | Override with `FORMULA_LAB_PORT`        |

Chosen to sit outside the ranges other local projects use (Vite's 5173–5175,
8080/8123/8765, the 74xx range), so this runs alongside them.

## Using it

Three pages:

| Page | Path | What it is for |
| ---- | ---- | -------------- |
| **New** | `/` | Write a formula, describe it, save it. The landing page |
| **Calculator** | `/calculator` | Fill in values and solve |
| **My formulas** | `/formulas` | Everything you have saved |

Pick a formula from the sidebar, type your own, or open one you saved.

| You type    | You get                                          |
| ----------- | ------------------------------------------------ |
| `F = m*a`   | an equation — leave any one variable blank        |
| `1/2 m v^2` | an expression — fill everything in, get a number  |

The input fields are generated from whatever your formula mentions, so
`E_k = 1/2 m v^2` immediately asks for `E_k`, `m` and `v`.

### Syntax

| Feature                 | Example                       |
| ----------------------- | ----------------------------- |
| Implicit multiplication | `1/2 m v^2` = `1/2*m*v**2`    |
| Either power operator   | `v^2` or `v**2`               |
| Subscripts              | `v_0`, `m_1`, `E_out`         |
| Greek letters           | `theta`, `lambda`, `omega`    |
| Functions               | `sin`, `sqrt`, `exp`, `log`, … |

Trigonometric functions take **radians** — write 45° as `pi/4`.

Units shown beside each field are labels, not part of the arithmetic: enter
values in a consistent (SI) system. Full dimensional analysis is a much larger
feature, and half-doing it silently would be worse than being explicit.

`E` and `I` are ordinary variables here (energy and current), not Euler's
number and the imaginary unit. Write `exp(1)` if you want *e*.

### Saving your own

The **New** page is where a formula gets written. Alongside the expression it
takes a name, a description, and — generated from whatever the formula
mentions — **a description for each variable**. Type `F = 1/2 rho C_d A v^2` and
five description fields appear, one per symbol, with a running "3 of 5
described" count.

Those descriptions are then shown wherever the formula is used: under its name
on the calculator, beside every input field, and as a legend on its card. A
formula you saved months ago explains its own symbols.

Saved formulas also keep the values you last used, so reopening one lands on a
working example rather than an empty form. **Edit** returns to the same page
with everything filled in, offering *Save changes* or *Save as new*.

Descriptions for symbols the expression no longer mentions are dropped on save,
so renaming a variable does not leave a legend entry for something that is gone.

**No account needed.** Without one, formulas are kept in this browser's
`localStorage` (up to 50) — private to that browser, and gone if you clear site
data. Sign in later and the app offers to move them to your account; that step
is deliberately a prompt rather than automatic, since uploading silently from
every device someone signs in on would duplicate the same formulas repeatedly.
A name already taken on the account gets a `(copy)` suffix instead of
overwriting, and local copies are only cleared once every upload succeeds.

## Accounts

Two ways in, both optional to the calculator itself:

- **Email and password.** Hashed with Argon2 — chosen over bcrypt, which
  silently truncates at 72 bytes and needs a pre-hashing workaround for long
  passphrases.
- **Google.** Standard authorization-code flow; see the setup below.

The session is a JWT in an **httpOnly, `SameSite=Lax` cookie**, not a token in
`localStorage`. An injected script cannot read an httpOnly cookie, and `Lax`
keeps it off cross-site POSTs, which covers CSRF without a separate token.

Repeated failed logins are throttled per client-and-address. That state is
in-process, so with several workers the effective limit is per worker — fine
for a small deployment, but a larger one wants Redis.

### Enabling Google sign-in

The Google button only appears once the server is configured; until then the
app offers email and password only. You need to create the credentials
yourself — they identify *your* deployment:

1. In [Google Cloud Console](https://console.cloud.google.com/) create (or pick)
   a project.
2. **APIs & Services → OAuth consent screen.** Choose *External*, fill in the
   app name and support email. The only scopes needed are `openid` and `email`.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID.**
   Application type *Web application*.
4. Add an **Authorised redirect URI** matching exactly where your app runs:
   - development: `http://localhost:7732/api/auth/google/callback`
   - production: `https://your-domain/api/auth/google/callback`
5. Copy the client ID and secret into your environment:

```bash
export FORMULA_LAB_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
export FORMULA_LAB_GOOGLE_CLIENT_SECRET=...
export FORMULA_LAB_GOOGLE_REDIRECT_URI=http://localhost:7732/api/auth/google/callback
```

Restart the API and the button appears.

If an address already has a password account, signing in with Google **links**
the two — but only when Google reports `email_verified`. Without that check,
anyone able to mint a token for an unverified address could take over an
existing account.

## Configuration

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `FORMULA_LAB_ENV` | `development` | `production` enables Secure cookies and requires a secret |
| `FORMULA_LAB_SECRET` | generated | Signs session cookies. **Required** in production |
| `FORMULA_LAB_DATABASE_URL` | `sqlite:///backend/formula_lab.db` | Any SQLAlchemy URL |
| `FORMULA_LAB_APP_URL` | `http://localhost:7732/` | Where sign-in redirects land |
| `FORMULA_LAB_STATIC_DIR` | `frontend/dist` | Built bundle to serve |
| `FORMULA_LAB_PORT` / `_HOST` | `7731` / `127.0.0.1` | API binding |
| `FORMULA_LAB_GOOGLE_*` | unset | See above |

In development the secret is generated once and cached in `backend/.secret`
(gitignored) so restarting does not sign you out. In production a missing
secret is a startup error, not a warning — silently running with an ephemeral
signing key is the kind of thing that should never happen by accident.

## Deploying

In production the API serves the built front end itself. That is deliberate:
one origin makes the session cookie first-party, removes CORS from the picture,
and leaves a single process to deploy.

### Docker (any host)

```bash
cp .env.example .env
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # paste into .env
docker compose up --build
```

Open <http://localhost:7731>. The SQLite file lives on a named volume so it
survives rebuilds.

### Fly.io

```bash
fly launch --no-deploy                       # generates fly.toml from the Dockerfile
fly volumes create formula_data --size 1     # SQLite needs persistent disk
fly secrets set FORMULA_LAB_SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
fly secrets set FORMULA_LAB_APP_URL="https://your-app.fly.dev/"
fly deploy
```

In `fly.toml`, mount the volume and expose the port:

```toml
[[mounts]]
  source = "formula_data"
  destination = "/data"

[http_service]
  internal_port = 7731
  force_https = true
```

### Render / Railway

Both build the `Dockerfile` directly. Set `FORMULA_LAB_ENV=production`,
`FORMULA_LAB_SECRET`, and `FORMULA_LAB_APP_URL`, and attach a disk at `/data`.
If the platform injects its own `PORT`, change the start command to
`uvicorn app.main:app --host 0.0.0.0 --port $PORT`.

### Postgres instead of SQLite

SQLite is one file and no server, which suits a single small instance. Move to
Postgres if you want more than one instance or managed backups:

```bash
pip install "psycopg[binary]"
export FORMULA_LAB_DATABASE_URL="postgresql+psycopg://user:pass@host:5432/formula_lab"
```

Tables are created at startup, so nothing else is needed. The schema is created
with `create_all`, which handles new tables and columns but not renames or
drops — add Alembic before making a destructive change.

### Before going live

- [ ] `FORMULA_LAB_ENV=production` and a real `FORMULA_LAB_SECRET`
- [ ] HTTPS terminated in front of the app (cookies are `Secure` in production,
      so they will not be sent over plain http)
- [ ] `FORMULA_LAB_APP_URL` matches the public URL
- [ ] Google redirect URI updated to the production domain, if used
- [ ] A persistent volume mounted for SQLite, or a Postgres URL set

## How it works

```
React (7732)                       FastAPI (7731)                worker process
────────────                       ──────────────                ──────────────
type a formula   ──/api/analyze──▶ validate → parse ──────────▶ SymPy parse
                 ◀── variables ──  return free symbols          + guard checks
render inputs
fill values      ──/api/evaluate─▶ validate ──────────────────▶ substitute
                 ◀─── result ────  solve for the unknown         + solve/evalf
press Save       ──/api/formulas─▶ authenticate → own row ────▶ SQLite
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

Saved formulas are validated by the same parser on the way in, so a stored
formula cannot be one that fails the moment it is reopened.

## API

| Endpoint | Method | Auth | Purpose |
| -------- | ------ | ---- | ------- |
| `/api/analyze` | POST | – | Variables, LaTeX, equation or not |
| `/api/evaluate` | POST | – | Evaluate, or solve for one variable |
| `/api/library` | GET | – | Built-in formula catalogue |
| `/api/constants` | GET | – | Physical constants |
| `/api/capabilities` | GET | – | Allowed functions and limits |
| `/api/health` | GET | – | Liveness |
| `/api/auth/providers` | GET | – | Which sign-in methods are enabled |
| `/api/auth/register` | POST | – | Create an account |
| `/api/auth/login` | POST | – | Start a session |
| `/api/auth/logout` | POST | – | End it |
| `/api/auth/me` | GET | ✓ | Current user |
| `/api/auth/google/start` | GET | – | Begin Google sign-in |
| `/api/auth/google/callback` | GET | – | Google returns here |
| `/api/formulas` | GET, POST | ✓ | List / create your formulas |
| `/api/formulas/{id}` | PUT, DELETE | ✓ | Update / delete one of yours |

```bash
curl -X POST localhost:7731/api/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"expression": "F = m*a", "values": {"F": 10, "a": 2}}'
```

Interactive docs at <http://localhost:7731/docs>.

A problem the user can fix returns **400** with a message written to be shown
verbatim. Malformed requests return **422** from Pydantic. Asking for someone
else's formula returns **404**, not 403 — a 403 would confirm the id exists.

## Tests

```bash
make test
```

142 backend tests plus a frontend typecheck. Several earn their keep beyond
ordinary coverage:

- `test_every_library_formula_parses` runs all 44 shipped formulas through the
  parser. This caught `lambda` being a Python keyword — SymPy cannot wrap it in
  a `Symbol`, so `v = f*lambda` was a raw `SyntaxError`. (It now aliases to
  SymPy's `lamda`, which typesets as `\lambda`.)
- `test_every_library_equation_solves_for_each_variable` — 153 solves, and the
  reason the app can promise any variable is reachable.
- `test_one_account_cannot_read_anothers_formula` and
  `test_enumerating_ids_reveals_nothing` walk other people's ids on purpose.
  This class of bug is invisible in normal use.
- `test_unverified_google_email_cannot_take_over_an_account` is the account
  linking rule, asserted rather than assumed.
- `test_static_paths_cannot_escape_the_bundle_directory` — `FileResponse` will
  serve `../../etc/passwd` if handed that path.

## Layout

```
backend/
  app/security.py         input whitelist -- the security boundary
  app/engine.py           parse, guard, substitute, solve  (imports only SymPy)
  app/runner.py           process pool + wall-clock timeout
  app/formulas.py         built-in formula and constant catalogues
  app/db.py               engine, session, ORM models
  app/auth.py             hashing, tokens, throttling, current-user
  app/routes_auth.py      register / login / logout / me
  app/oauth_google.py     Google authorization-code flow
  app/routes_formulas.py  CRUD for a user's own formulas
  app/main.py             routes, error handling, static serving
  tests/                  security, engine, HTTP, auth, ownership, OAuth
frontend/
  src/api.ts              typed client; separates user-fixable errors from ours
  src/useAuth.ts          session state, derived from the server
  src/App.tsx             state, debouncing, auto-evaluate
  src/components/         formula input, variables, results, sidebar, auth, dialogs
Dockerfile                two-stage build; one image serves both halves
```

## Licence

MIT
