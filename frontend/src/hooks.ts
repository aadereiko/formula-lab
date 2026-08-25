import { useEffect, useState } from "react";

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
