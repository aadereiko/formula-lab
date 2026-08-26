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
- 44 built-in formulas across nine areas of physics, and 31 constants offered
  as one-click fills when a formula names them — plus any you define yourself

## Quick start

```bash
make install     # backend/.venv + npm dependencies
make dev         # API on 7731, web on 7732
```

Open <http://localhost:7732>. It starts on a blank workspace; no account is
needed for anything.

### Ports

| Service | Port   | Notes                                   |
| ------- | ------ | --------------------------------------- |
| Web app | `7732` | Vite dev server, proxies `/api` to 7731 |
| API     | `7731` | Override with `FORMULA_LAB_PORT`        |

Chosen to sit outside the ranges other local projects use (Vite's 5173–5175,
8080/8123/8765, the 74xx range), so this runs alongside them.

## Using it

Two pages:

| Page | Path | What it is for |
| ---- | ---- | -------------- |
| **Workspace** | `/` | Write a formula, solve it, save it — all in one place |
| **My formulas** | `/formulas` | Everything you have saved |
| **Constants** | `/constants` | The built-in catalogue, plus your own |

Writing, solving and saving are deliberately not separate pages: you type a
formula, fill in whichever values you have, read the answer, and press Save if
it is worth keeping. Nothing forces that order. Pick a formula from the sidebar,
type your own, or reopen one from *Recent*.

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

### What the app recognised

Under the rendered formula sits a strip of the **functions** the parser
recognised, each carrying its explanation as a tooltip — so `T = 2*pi*sqrt(L/g)`
tells you that trigonometry here takes radians without opening the help panel.

A text field cannot be hovered token by token, which is why the strip sits
beneath it rather than annotating inside it. The tooltip answers `:focus` as well
as `:hover`, because a tap focuses but never hovers — on a phone the
hover-only version would have been unreachable.

**Constants are explained on their own chip instead.** Every constant the
formula mentions already has a row in the panel below, with a chip offering its
value; that chip is where the tooltip belongs, because it is the place you act
on the number. Listing it in the strip as well was two hints for one fact. The
chip label stays rounded to keep the row narrow, so the tooltip carries the two
things the digits cannot — which constant it is, and the exact figure. Clicking
inserts that exact figure: it used to paste the rounded label, which quietly
turned `c` into 2.997925e+08.

The functions are read from the **source text**, not the parse tree. The tree
loses them: `sqrt(x)` becomes a `Pow` rather than a `sqrt` node, and `pi` is a
numeric atom. Asking the tree about `2*pi*sqrt(L/g)` reports nothing at all —
precisely the formula whose notation most wants explaining.

### Plots

Under the answer sits a **Plot** panel: the same formula, the same values, and
the same variable you are already solving for — asked over a range instead of at
a point. Pick a variable to sweep and its bounds, and you get a curve of the
answer against it. Press **3D** and a second variable becomes a second axis,
drawn as an isometric surface.

It is a panel rather than a page because a plot is not a different feature. The
value axis is whichever variable the workspace is solving for, so there is no
second selector asking the same question twice: *leave one blank* already decides
which quantity is the answer. Sweeping a variable takes it out of that reckoning,
which is why `F = m a` with only `m` filled in will happily plot F against a —
once `a` is an axis, F is the only blank left.

The **swept** axis defaults to a variable that is not the equation's subject.
`symbols` is ordered for display — shortest name, then alphabetical — which is a
good rule for laying out variable rows and says nothing about which side of the
equals sign a variable sits on. Taking the first one made `F = a*b` sweep F, the
quantity you obviously wanted plotted, and then demand values for both a and b;
`b = a + c` worked only because alphabetical order happened to put a first. So
`analyze` reports a `subject` — the lone symbol on the left of an equation, or
null when there is not one, because `v^2 = ...` is about no single variable and
guessing would be worse than admitting it. F stays selectable by hand: sweeping
it to see how a responds is a fair question, just not the one to assume.

The range defaults to zero-to-twice whatever the variable is currently set to,
keeping the origin in frame; a variable with no value yet defaults to 0–10 and
can be swept without ever being filled in.

**An asymptote is a gap, not an error.** `1/x` has no value at zero, so that
point comes back as null and the curve breaks there rather than the request
failing. The sample count is odd for the same reason — an odd count over a
symmetric range lands on the range's own centre, which is where an asymptote
usually sits. With an even one, `1/x` over −5…5 steps either side of zero without
ever hitting it, and the two limbs get joined by a near-vertical line.

**Both roots are drawn.** `v² = v₀² + 2 a s` solved for `v` is ±√(2as), and
showing one of them would be a lie; the second is dashed rather than given a
second colour, because both are equally true and the app has one accent to
spend. A surface draws one branch and says so in its caption — two isometric
sheets over each other are indistinguishable.

The drawing is **hand-written inline SVG**, with no charting library: about a
hundred lines for the axes, the ticks and the path, and thirty for the surface.
Every colour goes through the theme tokens, so a plot follows dark and light like
everything else. Two details are load-bearing rather than decorative:

- The `viewBox` is set to the panel's **measured pixel width**. A viewBox is its
  own coordinate system, so anything drawn in it scales with the box — a 10px
  axis label would render at 5px on a phone and 20px on a desktop. Measuring
  makes one user unit one pixel at every size.
- The surface is **filled quads painted back to front**, not a wireframe. The
  projection is orthographic and height maps to screen −y only, so depth depends
  on nothing but the two swept coordinates — which makes painter's order *exact*:
  sort by `i + j` and every cell covers the ones behind it. That is the whole
  hidden-surface problem solved by a sort, and it is why a filled mesh was worth
  more here than a wireframe, which without occlusion reads as a tangle.

### Pinning

Any saved formula can be pinned, and pinned ones sort to the top of every list —
the sidebar and the *My formulas* page alike. They also get a group of their own
in the sidebar, above the categories: a pin means "keep this to hand", which
filing it under a rubric would otherwise bury. The order is applied on **read**
rather than when a row changes, so it holds for whatever is already in the store
rather than only for rows touched since the feature existed. The server applies
the same ordering, so the two stores never disagree.

A **library formula can be pinned too**. The library ships read-only, so the pin
cannot live on the formula; it is stored as a reference by id, which also means
a pin survives the library's wording changing underneath it. Pinned library
formulas join the same *Pinned* group as your own, and unknown ids are filtered
on read so a pin can never dangle.

### Rubrics

Saved formulas take a category, offered as a free-text field — so your own
formulas group in the menu the same way the built-in ones do. Uncategorised
formulas collect under *Other*, last, because a heading called "Other" at the
top is the least useful thing on the screen.

**Your own rubrics are remembered.** The suggestions are the built-in library's
plus every category you have coined, kept on the account when signed in and in
the browser otherwise. A category is free text, so a custom rubric works without
any of this — what the store adds is memory: the name comes back spelled the way
you spelled it, and it survives the last formula filed under it being deleted.
Your own are also shown as chips beneath the field, since a `datalist` gives no
sign that it exists; clicking one fills the field, and the `×` stops offering
it.

Case and internal spacing are folded on the way in, so `Optics`, `optics` and
`Optics  rig` cannot become three rubrics for one idea. Removing a name never
touches the formulas filed under it — that would be a far bigger action than the
one asked for — so a rubric still in use goes on being listed, and the `×` is
withheld rather than lying about what it will do.

The built-in library is **collapsed by default** in that menu: it is reference
material, not the work. One click expands it, and a *hide* control removes it
from the sidebar entirely for anyone who never wants it. Both choices stick per
browser.

### Keeping the menu short

Three things stop the sidebar growing without bound:

- **Ten rows, then _Show more_.** The limit spans the groups rather than each
  one, so ten is ten on the screen regardless of how the categories fall.
- **Hiding a formula** takes it out of the menu and nothing else. It stays on
  *My formulas*, badged `HIDDEN`, because a formula you cannot find is
  indistinguishable from one you deleted. This is stored per account on the
  server, so the choice follows you between browsers.

*My formulas* can be filtered by **pinned** and **hidden**, beside its search
box. Each chip carries its count and appears only while something would match
it, so a filter never promises a list it cannot produce. The two narrow
together: asking for both means pinned *and* hidden. Whether a filter is in
force is derived from that count rather than held in state — which closes a
trap, since unhiding your last hidden formula while filtering by hidden would
otherwise leave a live filter with nothing left to switch it off.
- **Search**, at the top, spans your formulas *and* the library in one field —
  including a collapsed or hidden library, since a search that silently skips
  half the corpus is worse than no search.

### Saving your own

Press **Save** and a dialog asks for a name, a description, and — generated
from whatever the formula mentions — **a description for each variable**.

A dialog rather than fields on the page: the workspace already lists every
variable once for its *value*, and a second list of the same symbols for their
*meanings* directly beneath it would be genuinely confusing. The formula and
its values stay visible behind.

Each of those fields suggests an example in the right shape: `v` prompts with
"e.g. velocity (m/s)", `rho` with "e.g. density (kg/m³)". The examples come from
the built-in library rather than a separate table, so they cannot drift out of
step with it; a subscripted name falls back to its base letter, which is why
`v_0` also suggests velocity. Nothing is saved until **Save formula** is
pressed — there is no implicit form submission, so Enter in a field does not
commit a half-written formula.

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

## Constants

Values are shown to their **real** precision, never a fixed number of digits.
That sounds like a detail and is not: the catalogue's constants range from three
significant figures to seventeen, so any fixed count is wrong in both directions
at once. The previous `toExponential(6)` printed `G` as `6.674300e-11`,
inventing two significant figures it does not have, while printing `c` as
`2.997925e+08` and discarding three it does — and since clicking a chip inserted
the label, that rounding entered the arithmetic. `c` went in 42 m/s fast, wrong
in the seventh significant digit of `c²`.

`formatExact` prints the shortest string that reads back as exactly the stored
number, choosing between plain and exponential on whichever is shorter. Nothing
is padded, nothing is truncated, and the chip's label, the value it inserts and
its tooltip are all the same string. One function serves the chips and the
constants table; they previously had separate copies whose thresholds had
already drifted apart (`1e6` against `1e7`), so the same constant could read
differently in two places.


Whenever a formula names a known symbol, its value is offered beside that
variable as a one-click fill: write `T = 2*pi*sqrt(L/g)` and `g` arrives with
9.80665 m/s² attached.

Thirty-one are built in, and **you can define your own** on the Constants page —
the values particular to your work rather than to physics: a material's density,
a rig dimension, a coefficient you keep reusing. They are stored the same way
saved formulas are: on your account when signed in, in this browser otherwise.

Your own **shadow** a built-in of the same name, deliberately. Someone who has
defined `g` as their local gravity means that one, and the built-in row is
labelled *replaced by yours* so the override is visible rather than mysterious.

A few standard symbols are deliberately absent from the built-ins, because a
chip offering the wrong quantity is worse than no chip at all: `F` is force far
more often than it is Faraday's constant, and `alpha` is a thermal expansion
coefficient as often as the fine-structure constant. Where the conventional
symbol is ambiguous the unambiguous spelling is used instead — `amu` rather than
`u`, `b_wien` rather than `b`. You can always define the ambiguous one yourself,
which is the point of it being configurable.

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

### Fly.io — the recommended host

`fly.toml` is committed, so there is no `fly launch` step and nothing to
hand-edit except the app name and the URL:

```bash
fly apps create your-app                     # then set `app` in fly.toml to match
fly volumes create formula_data --size 1     # SQLite is a file; it needs a disk
fly secrets set FORMULA_LAB_SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
fly deploy
```

Then set `FORMULA_LAB_APP_URL` in `fly.toml` to the real URL, because Google
sign-in redirects back to it.

The committed config carries three decisions worth knowing. **512 MB, not 256**:
`runner.py` keeps a pool of two worker processes, and a warm interpreter with
SymPy loaded measures about 57 MB, so parent plus workers runs 150–200 MB under
load — 256 MB survives idle and dies under use. **No scale-to-zero**: the
database is a file on the volume, so stopping the machine saves nothing and
costs a cold start on the next request. **One machine**: two would each mount
their own volume and therefore their own database, and a user would see
different data depending on which answered. Scaling out means Postgres first.

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

Tables are created at startup, so nothing else is needed. New *tables* come
from `create_all` and new *columns* from `ensure_columns`, which is a separate
step precisely because `create_all` never alters a table that already exists.
Neither handles renames or drops — add Alembic before making a destructive
change.

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
sweep a range    ──/api/plot─────▶ validate → rearrange ──────▶ lambdify
                 ◀── samples ───   once, then sample             + N calls
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
formula cannot be one that fails the moment it is reopened. So are plots: the
sweep goes through `analyze` before a single point is taken, because several
hundred evaluations behind one request is exactly what must not get a laxer
parser or a longer leash. The point count is capped at 400, and a surface — being
a grid — is capped at 20 per axis, so one request is one budget's arithmetic
either way.

`lambdify` compiles the rearranged expression to a Python function once, which is
the only reason 400 points is cheap; `subs` then `evalf` per point is orders of
magnitude slower and would spend the whole timeout on a single plot. It is asked
for the `math` module only — numpy is not a dependency, and the real-domain
functions have the useful property that a point outside their domain *raises*
instead of quietly returning a complex number, which is exactly the gap we want.

## API

| Endpoint | Method | Auth | Purpose |
| -------- | ------ | ---- | ------- |
| `/api/analyze` | POST | – | Variables, LaTeX, equation or not |
| `/api/evaluate` | POST | – | Evaluate, or solve for one variable |
| `/api/plot` | POST | – | Sample over one variable, or two |
| `/api/library` | GET | – | Built-in formula catalogue |
| `/api/constants` | GET | – | Built-in physical constants |
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
| `/api/formulas/{id}` | PUT, DELETE | ✓ | Update / delete one of yours (`pinned` included) |
| `/api/my-constants` | GET, POST | ✓ | List / create your own constants |
| `/api/my-constants/{id}` | PUT, DELETE | ✓ | Update / delete one of yours |

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

243 backend tests, a frontend typecheck, and a style check. Several earn their
keep beyond ordinary coverage:

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
- `test_one_account_cannot_touch_anothers_constants` and
  `test_ambiguous_symbols_are_left_out` do the same jobs for constants.
- `test_unknown_library_ids_are_refused` — a pin is a foreign key to a
  file, and nothing else would stop it dangling.
- `test_a_category_in_use_survives_removal` — deleting a rubric must not
  silently re-file somebody's formulas, and the list has to keep reflecting
  that.
- `test_case_and_spacing_do_not_make_a_second_category` — the whole point of
  remembering a rubric is that it comes back the same, not nearly the same.
- `test_the_plotted_variable_ignores_the_value_it_still_holds` — found in a
  browser, not in a test. The workspace keeps whatever was last typed into a
  field, so the variable being plotted usually *does* still carry a value, and
  substituting it rearranged the equation for a symbol that was no longer in it.
- `test_an_asymptote_is_a_gap_not_an_error` and
  `test_a_surface_is_capped_to_the_square_root_of_the_same_budget` — the two
  rules that make sampling safe to expose: one bad point is a hole, and N is
  caller-supplied.

`scripts/check-styles.mjs` runs in `npm run build` and answers a question the
type checker structurally cannot: **does every class the components render have
a rule?** `className="dialog"` is a string, so a stylesheet that lost half its
selectors still typechecks and still bundles — the app just renders unstyled.
The check cross-references the two and names the file rendering each orphan.

It is written in Node, not Python, for a reason worth keeping: it runs inside
`npm run build`, and that script also runs in the Docker web stage, which is
`node:alpine` and has no Python. The Python version passed locally and broke
`docker build` outright. A guard that only works on the author's machine is not
a guard.

## Look

Dark first, in the spirit of Spotify's layered near-blacks, with our blue as the
only accent. Three levels of background rather than one flat colour — page,
card, raised — because that layering is what stops a dark interface reading as a
void. A light variant follows `prefers-color-scheme`.

Type is **Manrope** for the interface and **JetBrains Mono** for formulas,
values and symbols, so an expression never gets confused with prose.

Primary actions are accent-filled pills with near-black text: on a bright
accent that carries far more contrast than white would. A disabled action drops
its colour and becomes a neutral chip rather than a faded blue — a washed-out
accent still reads as "the blue button, but dirty", where a grey chip reads as
unavailable.

## Tags

`local`, `hidden`, `replaced by yours` — small coloured labels, each with a
border and the same hard offset shadow as everything else raised in the app.

The colour is **derived from the name**, not passed in, so a new tag needs no
palette decision and cannot collide with an existing one by accident. A `djb2`
hash of the label picks one of eight hues; only that hue is inlined, and how
light and saturated it reads is left to the theme tokens, so one rule serves
both themes.

Two regions of the wheel are deliberately absent, each reserved elsewhere: the
accent blue, because a tag is not clickable and one wearing the colour of every
button in the app would say otherwise; and red, because that is `--danger`, and
`local` is not a warning.

The **order** of the palette carries as much weight as the values. Short similar
words tend to hash into *neighbouring* buckets, so the list is interleaved
rather than sorted — consecutive entries sit at least 64° apart on the wheel.
Sorted by hue, `local` and `hidden` came out as two adjacent ambers, which is
exactly the pair that must never collide since they appear side by side.
Interleaved, they are orange and cyan, and that property holds for whatever tag
is added next in a way that hand-picking hues for today's pair would not.

One trap worth recording: the labels are lowercase in the source and uppercased
by `text-transform`. Checking the palette against the *displayed* text tests a
different string from the one that gets hashed.

## On a phone

Below 700px the header's nav becomes three icons — a flask, a bookmark, a pi —
and the wordmark gives way to the cube alone. Below 560px every dialog becomes a
sheet rising from the bottom edge rather than a card floating in the middle. Two
practical reasons: the actions land under the thumb, and when the on-screen
keyboard opens it claims the bottom of the viewport, so a centred card is shoved
upward and its buttons go off-screen while a bottom-anchored one is already where
the keyboard pushes it. `env(safe-area-inset-bottom)` clears the home indicator.

Inputs are 16px throughout, which is not a typographic choice: iOS zooms the
page when you focus anything smaller.

A variable's controls wrap on a narrow screen. `c` carries a chip reading
`299792458 m/s`, the chip does not shrink, and input + chip + Solve came to 416px
inside a 378px viewport — which scrolled the whole document sideways, not just
the row. Wrapping moves the chip to a second line and keeps the number readable
in full; shrinking it would have truncated the value instead.

## Theme

Dark, light, or matching the system, cycled from one control in the header and
remembered per browser. Three states rather than two, because *system* is not
the same as picking whichever the system happens to be right now — it keeps
following it.

It is expressed as a `data-theme` attribute on `<html>`, and *system* sets no
attribute at all so the `prefers-color-scheme` query stays in charge. Only the
palette block reads it; every other rule in the app goes through the tokens and
never asks about the scheme, which is what kept adding an explicit override to a
one-place change.

Shadows are the one place the two themes take different values rather than the
same token: on near-black a shadow has to be darker than the page, so it is a
deep navy, while on white that same colour just reads as black and the blue is
lost. Light uses a mid blue instead — light enough to sit under a white surface,
saturated enough to still look blue, and far enough from the accent to stay
visible behind an accent-filled button, which the accent itself was not.

## Hover

Everything the pointer can act on lifts: buttons, navigation, library rows,
saved formulas, history entries. Each steps up and to the left and drops a
**hard offset shadow** — no blur, no gradient. That combination is what reads as
a sticker peeling off the page; a soft blurred shadow reads instead as a
photograph of a lit surface. Pressing pushes the surface back down into its
shadow, which collapses to nothing.

It is CSS only, and it hooks onto the classes the app already has — `.btn`,
`.nav-link`, `.library-item` and so on. There is no JavaScript, no cursor
tracking and no markup attribute to remember: a new button is included by being
a `.btn`. The whole system lives in `frontend/src/hover.css` and is built from
four variables — how far a surface travels, how far its shadow sits behind, and
smaller values of both for small controls.

The mark is the exception: a cube has no rectangular face, so a rectangular
shadow behind it reads as a mistake. It turns instead, and to turn *horizontally*
it has to be a real cube — spinning a picture of one reads as a spinning
picture. So the header mark is six CSS faces in a `preserve-3d` box, each face
divided into four coloured cells, and `rotateY` gives it a genuine turntable
spin: a full turn under the cursor, and one on its own every fifteen seconds
after sitting still for most of the cycle.

The flat SVG mark stays for the favicon and for static decoration, where nothing
needs to rotate. The signed-out control carries the same cube as a wireframe
outline; signed in, it is filled — an assembled cube for an assembled account.

Verbs are words, not tokens: `Clear`, `Copy`. The monospace pill is reserved for
values like `9.80665 m/s²`, and a lowercase monospace `clear` beside a
sans-serif label read like a stray identifier.

The prominent actions do not wait to be touched: they rest on a 3px shadow
already, so they read as physical before the pointer arrives, and hovering
deepens what is there rather than conjuring it — 3px at rest, 6px raised, none
pressed, one gesture in three steps. Each carries a small icon at the same
optical weight as its label.

Two cases are handled rather than ignored. A **disabled** control never lifts,
because it has no colour of its own and rising would promise something it cannot
do. And **reduced motion** stops both idle loops and sets the travel to zero,
keeping the shadow so the state stays legible while nothing moves. The turns
that answer a hover stay, since those are a direct response to an action.

## The icon

An isometric cube built from twelve smaller coloured cubes — each of its three
visible faces divided into four cells, with one cell per face taking a different
hue so it reads as blocks rather than a shaded solid. At favicon size the cells
average into three face shades and the silhouette still reads as a cube; at
large sizes you can see the blocks. Checked at 140, 64, 32, 20 and 16, and on
white.

The cells tile the hexagon exactly, so no seam can open between neighbours.

`scripts/make-icons.py` is the single source of truth for that geometry. It
writes three things — `public/icon.svg`, the PNGs iOS and the manifest need, and
`src/components/logoPaths.ts` for the React component — so the three cannot
drift apart. It has no dependencies (none of rsvg, cairo or PIL turned out to be
installed): it draws the cells with a point-in-polygon test and writes the PNG
with `zlib` and `struct`. Those PNGs are opaque, since transparency on an iOS
home screen renders as black. Rerun it after changing the geometry or the
palette:

```bash
cd frontend && python3 scripts/make-icons.py
```

## Layout

```
backend/
  app/security.py         input whitelist -- the security boundary
  app/engine.py           parse, guard, substitute, solve, sample  (only SymPy)
  app/runner.py           process pool + wall-clock timeout
  app/formulas.py         built-in formula and constant catalogues
  app/db.py               engine, session, ORM models
  app/auth.py             hashing, tokens, throttling, current-user
  app/routes_auth.py      register / login / logout / me
  app/oauth_google.py     Google authorization-code flow
  app/routes_formulas.py  CRUD for a user's own formulas
  app/routes_constants.py CRUD for a user's own constants
  app/routes_categories.py  the rubrics a user invented
  app/routes_library_pins.py  pins on the read-only library, by id
  app/main.py             routes, error handling, static serving
  tests/                  security, engine, HTTP, auth, ownership, OAuth
frontend/
  public/icon.svg         the app mark; PNGs beside it are generated
  scripts/make-icons.py   dependency-free SVG -> PNG rasteriser
  scripts/check-styles.mjs every rendered class has a rule -- see Tests
  src/api.ts              typed client; separates user-fixable errors from ours
  src/plot.ts             tick steps, curve paths, the isometric projection
  src/useAuth.ts          session state, derived from the server
  src/useFormulaStore.ts  saved formulas: one interface over server or browser
  src/useConstantStore.ts the same, for constants, merged over the built-ins
  src/useCategories.ts    the same, for the rubrics you coin
  src/useLibraryPins.ts   the same, for pins on the built-in library
  src/App.tsx             state, debouncing, auto-evaluate
  src/components/         formula input, variables, results, plots, sidebar, dialogs
  src/styles.css          tokens and layout; the light theme is a token swap
  src/hover.css           the cartoon hover system, gated on real class names
Dockerfile                two-stage build; one image serves both halves
```

## Inspecting the database

```bash
make db        # the local file
make db-prod   # the deployed one, over fly ssh
```

`scripts/db.py` is read-only by construction: it counts rows and lists accounts
with their formula counts, and has no code path that writes. It ships inside the
image, which is the only reason `db-prod` is one line — passing that much Python
through `fly ssh console -C` needs a page of nested quoting that nobody can
maintain.

## Version

`backend/app/version.py` owns the number. It lives inside `app/` rather than at
the repository root so it ships with the Docker image without the Dockerfile
needing to know about it — the image copies `backend/app`, and a root-level
VERSION file would simply be absent.

The scheme, for something whose only API consumer is its own front end:

- **major** — stored data or the URL scheme changes incompatibly
- **minor** — a feature somebody would notice (plots, categories, accounts)
- **patch** — fixes and polish

The sidebar footer shows what `/api/capabilities` **reports**, not what the
bundle was built with. That distinction earns its keep after a partial deploy:
the version answering requests is the one worth knowing, and this app has
already been caught serving a front end whose backend predated it by three hours.

Bumping means editing `version.py` and `frontend/package.json` together, and
`test_the_frontend_agrees_about_the_version` fails if they drift — a number on
screen that nothing else in the build agrees with is worse than no number.
Tag the commit to match:

```bash
git tag -a v1.1.0 -m "Plots, custom categories, coloured tags"
git push origin v1.1.0
```

## Licence

MIT
