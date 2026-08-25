import type {
  AnalyzeResponse,
  Capabilities,
  Constant,
  EvaluateResponse,
  Library,
} from "./types";

/**
 * The backend distinguishes two failure kinds, and the UI must too:
 * a 400 carries a message written for the user ("Missing value for: v"),
 * while anything else is our problem, not theirs.
 */
export class ApiError extends Error {
  readonly userFacing: boolean;

  constructor(message: string, userFacing: boolean) {
    super(message);
    this.name = "ApiError";
    this.userFacing = userFacing;
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

  if (response.ok) return (await response.json()) as T;

  let detail = `Request failed (${response.status})`;
  try {
    const body = await response.json();
    // 400 -> our own {error}. 422 -> pydantic's {detail: [...]}.
    if (typeof body.error === "string") detail = body.error;
    else if (Array.isArray(body.detail) && body.detail[0]?.msg) detail = body.detail[0].msg;
  } catch {
    /* keep the status-code fallback */
  }
  throw new ApiError(detail, response.status === 400 || response.status === 422);
}

function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

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

export const fetchLibrary = () => request<Library>("/api/formulas");
export const fetchConstants = () =>
  request<{ constants: Constant[] }>("/api/constants").then((r) => r.constants);
export const fetchCapabilities = () => request<Capabilities>("/api/capabilities");
