import { useCallback, useEffect, useState } from "react";

/**
 * Delays a value so we do not fire a request per keystroke.
 *
 * The parser runs as the user types, and a half-typed formula ("1/2 m v^")
 * would produce a parse error on every character. Waiting for a pause means the
 * user sees errors about what they meant, not what they were mid-way through.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}

/** State that survives a reload, stored as JSON under `key`. */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial; // private browsing, quota, or corrupt JSON
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* not worth interrupting the user over */
    }
  }, [key, value]);

  return [value, setValue] as const;
}

/**
 * A ref to attach, and the measured content width of whatever it lands on.
 *
 * For the plot, which draws itself in SVG. A `viewBox` is its own coordinate
 * system, so everything inside it scales with the box: a 10px axis label becomes
 * 5px on a phone and 20px on a desktop, and hairlines thicken with it. Measuring
 * the container and using those pixels *as* the viewBox makes one user unit one
 * pixel at every width, which is the only way the labels stay the size they were
 * chosen to be.
 *
 * A callback ref rather than a `useRef`, because the element it watches is
 * conditionally rendered: an effect keyed on nothing reads `ref.current` once, at
 * a mount where the box does not exist yet, and then never looks again. Keeping
 * the node in state re-runs the observer whenever it actually appears.
 *
 * `fallback` is what a browser with no ResizeObserver gets -- a plot that scales,
 * rather than no plot.
 */
export function useElementWidth<T extends HTMLElement>(fallback: number) {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(fallback);
  const attach = useCallback((element: T | null) => setNode(element), []);

  useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width;
      if (measured) setWidth(Math.round(measured));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [attach, width] as const;
}
