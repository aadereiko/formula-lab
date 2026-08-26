import type {
  AnalyzeResponse,
  AuthProviders,
  Capabilities,
  Constant,
  EvaluateResponse,
  Library,
  SavedFormula,
  SavedFormulaInput,
  User,
  UserConstant,
  UserConstantInput,
} from "./types";

/**
 * The backend distinguishes two failure kinds, and the UI must too:
 * a 400 carries a message written for the user ("Missing value for: v"),
 * while anything else is our problem, not theirs.
 */
export class ApiError extends Error {
  readonly userFacing: boolean;
  readonly status: number;

  constructor(message: string, userFacing: boolean, status = 0) {
    super(message);
    this.name = "ApiError";
    this.userFacing = userFacing;
    this.status = status;
  }

  /** A 401 means "sign in", which callers handle rather than display. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    // An aborted request is a superseded keystroke, not a network failure --
    // rethrow it unchanged so callers can recognise and ignore it.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Cannot reach the API. Is the backend running on port 7731?", false);
  }

  if (response.ok) {
    // 204 No Content has no body to parse.
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  let detail = `Request failed (${response.status})`;
  try {
    const body = await response.json();
    // Our own handlers return {error}; FastAPI's HTTPException returns
    // {detail}; Pydantic validation returns {detail: [{msg, loc}, ...]}.
    if (typeof body.error === "string") detail = body.error;
    else if (typeof body.detail === "string") detail = body.detail;
    else if (Array.isArray(body.detail) && body.detail[0]?.msg) {
      const first = body.detail[0];
      const field = Array.isArray(first.loc) ? String(first.loc[first.loc.length - 1]) : "";
      detail = field ? `${field}: ${first.msg}` : first.msg;
    }
  } catch {
    /* keep the status-code fallback */
  }
  throw new ApiError(detail, response.status < 500, response.status);
}

function send<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
}

const post = <T>(path: string, body?: unknown, signal?: AbortSignal) =>
  send<T>("POST", path, body, signal);

export const analyze = (expression: string, signal?: AbortSignal) =>
  post<AnalyzeResponse>("/api/analyze", { expression }, signal);

export const evaluate = (
  expression: string,
  values: Record<string, string>,
  solveFor: string | null,
  precision: number,
  signal?: AbortSignal,
) =>
  post<EvaluateResponse>(
    "/api/evaluate",
    { expression, values, solve_for: solveFor, precision },
    signal,
  );

export const fetchLibrary = () => request<Library>("/api/library");
export const fetchConstants = () =>
  request<{ constants: Constant[] }>("/api/constants").then((r) => r.constants);
export const fetchCapabilities = () => request<Capabilities>("/api/capabilities");

// -- accounts --------------------------------------------------------------
// The session lives in an httpOnly cookie, so there is no token to attach here.
// Same-origin requests carry it automatically.

export const fetchProviders = () => request<AuthProviders>("/api/auth/providers");
export const fetchMe = () => request<User>("/api/auth/me");
export const register = (email: string, password: string) =>
  post<User>("/api/auth/register", { email, password });
export const login = (email: string, password: string) =>
  post<User>("/api/auth/login", { email, password });
export const logout = () => post<void>("/api/auth/logout");

/** Google sign-in is a full page navigation, not a fetch: the browser must
 *  follow redirects to Google and back for the cookies to be set. */
export const googleSignInUrl = "/api/auth/google/start";

// -- saved formulas --------------------------------------------------------

export const fetchSaved = () => request<SavedFormula[]>("/api/formulas");
export const createSaved = (input: SavedFormulaInput) =>
  post<SavedFormula>("/api/formulas", input);
export const updateSaved = (id: number, input: SavedFormulaInput) =>
  send<SavedFormula>("PUT", `/api/formulas/${id}`, input);
export const deleteSaved = (id: number) => send<void>("DELETE", `/api/formulas/${id}`);

// -- the user's own constants ---------------------------------------------

export const fetchMyConstants = () => request<UserConstant[]>("/api/my-constants");
export const createConstant = (input: UserConstantInput) =>
  post<UserConstant>("/api/my-constants", input);
export const updateConstant = (id: number, input: UserConstantInput) =>
  send<UserConstant>("PUT", `/api/my-constants/${id}`, input);
export const deleteConstant = (id: number) => send<void>("DELETE", `/api/my-constants/${id}`);

// -- pins on the built-in library ------------------------------------------
// Idempotent by design: pinning something already pinned succeeds, because the
// caller's intent is satisfied either way.

export const fetchLibraryPins = () => request<string[]>("/api/pinned-library");
export const pinLibrary = (id: string) => send<void>("PUT", `/api/pinned-library/${id}`);
export const unpinLibrary = (id: string) => send<void>("DELETE", `/api/pinned-library/${id}`);
