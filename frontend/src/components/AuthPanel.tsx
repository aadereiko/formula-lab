import { useState } from "react";
import { googleSignInUrl } from "../api";
import type { AuthProviders, User } from "../types";

interface Props {
  user: User | null;
  providers: AuthProviders;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onSignOut: () => void;
  onClose: () => void;
  initialError?: string | null;
}

type Mode = "signin" | "signup";

export function AuthPanel({
  user,
  providers,
  onSignIn,
  onSignUp,
  onSignOut,
  onClose,
  initialError,
}: Props) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);

  if (user) {
    return (
      <div className="auth">
        <p className="auth-signed-in">
          Signed in as <strong>{user.email}</strong>
        </p>
        <button type="button" className="btn" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    );
  }

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
    <div className="auth">
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
          {/* A plain link, not a fetch: the browser has to follow the redirect
              chain to Google and back for the session cookie to be set. */}
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
