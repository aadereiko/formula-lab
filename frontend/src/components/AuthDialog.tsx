import { useEffect, useRef, useState } from "react";
import { googleSignInUrl } from "../api";
import type { AuthProviders } from "../types";

interface Props {
  providers: AuthProviders;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onClose: () => void;
  initialError?: string | null;
  /** Shown when sign-in was triggered by trying to do something that needs it. */
  reason?: string | null;
}

type Mode = "signin" | "signup";

export function AuthDialog({
  providers,
  onSignIn,
  onSignUp,
  onClose,
  initialError,
  reason,
}: Props) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);
  const emailField = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    emailField.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog.current) return;

      // Keep Tab inside the dialog: without this, focus walks into the page
      // behind the overlay, where nothing is clickable.
      const focusable = dialog.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await (mode === "signin" ? onSignIn(email, password) : onSignUp(email, password));
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        ref={dialog}
        className="dialog dialog-auth"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <h2 className="dialog-title" id="auth-title">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        {reason && <p className="auth-reason">{reason}</p>}

        <div className="auth-tabs" role="tablist">
          {(["signin", "signup"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              className={`auth-tab${mode === value ? " is-active" : ""}`}
              onClick={() => {
                setMode(value);
                setError(null);
              }}
            >
              {value === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        {providers.google && (
          <>
            {/* A link, not a fetch: the browser must follow the redirect chain
                to Google and back for the session cookie to be set. */}
            <a className="btn btn-google" href={googleSignInUrl}>
              <GoogleMark />
              Continue with Google
            </a>
            <div className="auth-divider">
              <span>or</span>
            </div>
          </>
        )}

        <form className="auth-form" onSubmit={submit}>
          <label>
            Email
            <input
              ref={emailField}
              type="email"
              value={email}
              required
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              required
              minLength={8}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {mode === "signup" && <p className="auth-hint">At least 8 characters.</p>}
          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        {mode === "signin" && providers.google && (
          <p className="auth-hint">If you signed up with Google, use the button above.</p>
        )}
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.61Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}
