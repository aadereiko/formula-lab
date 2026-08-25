import { useCallback, useEffect, useState } from "react";
import * as api from "./api";
import { ApiError } from "./api";
import type { AuthProviders, User } from "./types";

/**
 * Session state, derived from the server rather than stored locally.
 *
 * Because the session is an httpOnly cookie, the client cannot inspect it — so
 * "am I signed in?" is answered by asking `/api/auth/me` once on load. A 401
 * there is the normal signed-out case, not an error to surface.
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [providers, setProviders] = useState<AuthProviders>({ password: true, google: false });
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    api
      .fetchProviders()
      .then((value) => active && setProviders(value))
      .catch(() => {
        /* the sign-in options just stay at their defaults */
      });

    api
      .fetchMe()
      .then((value) => active && setUser(value))
      .catch((error) => {
        if (!(error instanceof ApiError && error.isUnauthenticated)) {
          // Anything other than a 401 is worth knowing about while developing.
          console.warn("Could not determine sign-in state:", error);
        }
      })
      .finally(() => active && setChecking(false));

    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setUser(await api.login(email, password));
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setUser(await api.register(email, password));
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      // Clear locally even if the request failed: the cookie may already be
      // gone, and leaving a stale user on screen is worse.
      setUser(null);
    }
  }, []);

  return { user, providers, checking, signIn, signUp, signOut };
}

/**
 * Reads and clears the `?auth_error=` the Google callback redirects back with.
 *
 * The OAuth callback cannot render a message itself — it hands control back to
 * the app — so it passes the reason in the URL, and the app removes it from
 * history so a refresh does not show the same error again.
 */
export function useOAuthError(): string | null {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("auth_error");
    if (!value) return;

    setMessage(value);
    params.delete("auth_error");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (query ? `?${query}` : ""),
    );
  }, []);

  return message;
}
