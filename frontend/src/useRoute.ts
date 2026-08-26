import { useCallback, useEffect, useState } from "react";

/**
 * Two pages: the workspace, and the list of saved formulas.
 *
 * Writing a formula, solving it and saving it all happen in one place, so
 * there is no separate calculator route any more.
 */
export type Route = "home" | "formulas" | "constants";

const PATHS: Record<Route, string> = {
  home: "/",
  formulas: "/formulas",
  constants: "/constants",
};

function routeFor(pathname: string): Route {
  const path = pathname.replace(/\/+$/, "");
  if (path === "/formulas") return "formulas";
  if (path === "/constants") return "constants";
  return "home";
}

/** The calculator used to live on its own path; keep old links working. */
const RETIRED_PATHS = new Set(["/calculator"]);

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => routeFor(window.location.pathname));

  useEffect(() => {
    // Rewrite rather than redirect, so the back button does not bounce.
    if (RETIRED_PATHS.has(window.location.pathname.replace(/\/+$/, ""))) {
      window.history.replaceState({}, "", "/");
    }
  }, []);

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
