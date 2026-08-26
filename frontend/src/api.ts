import type {
  AnalyzeResponse,
  AuthProviders,
  Capabilities,
  Constant,
  EvaluateResponse,
  Library,
  PlotRequest,
  PlotResponse,
  SavedFormula,
  SavedFormulaInput,
  User,
  UserConstant,
  UserConstantInput,
} from "./types";
import { analyzeOffline, evaluateOffline } from "./offline";

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
    // The port hint is for whoever forgot to start the backend; a user on a
    // train needs to hear that they are offline, not a port number.
    throw new ApiError(
      import.meta.env.DEV
        ? "Cannot reach the API. Is the backend running on port 7731?"
        : "No connection.",
      false,
    );
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

/**
 * The server first, the local engine when it cannot be reached.
 *
 * Only a *transport* failure falls through. A 400 is the server having read the
 * formula and rejected it, and answering that from a second engine would mean
 * two different verdicts on the same input -- so a rejection stands.
 *
 * `navigator.onLine` is not consulted. It reports whether an interface is up,
 * not whether anything is reachable, and it lies in both directions: true on a
 * captive-portal wifi, false on some VPNs. A failed request is the only honest
 * signal, so the attempt *is* the check.
 */
async function withOfflineFallback<T>(
  attempt: () => Promise<T>,
  offline: () => T,
): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    const unreachable = error instanceof ApiError && !error.userFacing && error.status === 0;
    if (!unreachable) throw error;
    try {
      const result = offline();
      offlineListeners.forEach((listener) => listener(true));
      return result;
    } catch (localError) {
      offlineListeners.forEach((listener) => listener(true));
      // The local engine's own message is the useful one: it knows whether the
      // formula was unparseable or merely beyond what it can solve.
      throw new ApiError((localError as Error).message, true, 0);
    }
  }
}

type OfflineListener = (offline: boolean) => void;
const offlineListeners = new Set<OfflineListener>();

/** Notifies the UI the first time a request has to be answered locally. */
export function onOfflineChange(listener: OfflineListener): () => void {
  offlineListeners.add(listener);
  return () => offlineListeners.delete(listener);
}

/** Called once a request succeeds again, so the banner can clear itself. */
export function reportOnline(): void {
  offlineListeners.forEach((listener) => listener(false));
}

export const analyze = (expression: string, signal?: AbortSignal) =>
  withOfflineFallback(
    async () => {
      const result = await post<AnalyzeResponse>("/api/analyze", { expression }, signal);
      reportOnline();
      return result;
    },
    () => analyzeOffline(expression),
  );

export const evaluate = (
  expression: string,
  values: Record<string, string>,
  solveFor: string | null,
  precision: number,
  signal?: AbortSignal,
) =>
  withOfflineFallback(
    async () => {
      const result = await post<EvaluateResponse>(
        "/api/evaluate",
        { expression, values, solve_for: solveFor, precision },
        signal,
      );
      reportOnline();
      return result;
    },
    () => evaluateOffline(expression, values, precision, solveFor),
  );

/** Several hundred evaluations in one request, so the body carries the sweep
 *  itself rather than the client asking point by point. */
export const plot = (request: PlotRequest, signal?: AbortSignal) =>
  post<PlotResponse>("/api/plot", request, signal);

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

export const fetchCategories = () => request<string[]>("/api/categories");
export const addCategory = (name: string) => post<void>("/api/categories", { name });
// The name goes in the query rather than the path: a rubric is free text, and
// `Optics / bench` would otherwise read as two path segments.
export const removeCategory = (name: string) =>
  send<void>("DELETE", `/api/categories?name=${encodeURIComponent(name)}`);
