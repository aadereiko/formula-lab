import { useCallback, useEffect } from "react";
import { usePersistentState } from "./hooks";

export type Theme = "system" | "light" | "dark";

const ORDER: Theme[] = ["system", "light", "dark"];

/**
 * Which palette to use, remembered per browser.
 *
 * Three states rather than two: "system" is not the same as picking whichever
 * the system currently happens to be, because it keeps following the system
 * when that changes. It is expressed as a `data-theme` attribute on <html>,
 * which the stylesheet reads — `system` sets no attribute at all, leaving the
 * `prefers-color-scheme` query in charge.
 */
export function useTheme() {
  const [theme, setTheme] = usePersistentState<Theme>("formula-lab.theme", "system");

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  const cycle = useCallback(() => {
    setTheme((current) => ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!);
  }, [setTheme]);

  return { theme, setTheme, cycle, next: ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]! };
}
