import { useCallback, useEffect, useState } from "react";

/** `editor` is the default landing page: a blank formula waiting to be written. */
export type Route = "editor" | "calculator" | "formulas";

const PATHS: Record<Route, string> = {
  editor: "/",
  calculator: "/calculator",
  formulas: "/formulas",
};

function routeFor(pathname: string): Route {
  const path = pathname.replace(/\/+$/, "");
  if (path === "/formulas") return "formulas";
  if (path === "/calculator") return "calculator";
  return "editor";
}

/**
 * Minimal history-API routing.
 *
 * No router dependency: there are three destinations, and the server already
 * serves index.html for unknown paths (as does Vite in development), so real
 * URLs work without hash fragments.
 */
export function useRoute() {
  const [route, setRoute] = useState<Route>(() => routeFor(window.location.pathname));

  useEffect(() => {
    // Fires on browser back/forward, which pushState does not trigger itself.
    const onPop = () => setRoute(routeFor(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((next: Route) => {
    if (routeFor(window.location.pathname) !== next) {
      window.history.pushState({}, "", PATHS[next]);
    }
    setRoute(next);
    window.scrollTo(0, 0);
  }, []);

  return { route, navigate };
}
