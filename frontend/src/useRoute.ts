import { useCallback, useEffect, useState } from "react";

export type Route = "calculator" | "formulas";

const PATHS: Record<Route, string> = {
  calculator: "/",
  formulas: "/formulas",
};

function routeFor(pathname: string): Route {
  return pathname.replace(/\/+$/, "") === "/formulas" ? "formulas" : "calculator";
}

/**
 * Minimal history-API routing for two views.
 *
 * No router dependency: there are two destinations, and the server already
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
