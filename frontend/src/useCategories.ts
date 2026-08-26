import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "./api";
import { usePersistentState } from "./hooks";

const LOCAL_KEY = "formula-lab.local-categories";

/** Collapses case and internal spacing, matching what the server does. */
const fold = (name: string) => name.split(/\s+/).filter(Boolean).join(" ");
const key = (name: string) => fold(name).toLowerCase();

/** First spelling wins, and the result is ordered for display. */
function merge(...groups: string[][]): string[] {
  const seen = new Map<string, string>();
  for (const group of groups) {
    for (const name of group) {
      const cleaned = fold(name);
      if (cleaned && !seen.has(key(cleaned))) seen.set(key(cleaned), cleaned);
    }
  }
  return [...seen.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

/**
 * Rubrics the user invented, on the account when signed in and in the browser
 * otherwise — the same arrangement as saved formulas, constants and pins.
 *
 * A formula's category is free text, so a custom rubric already works without
 * this. What it adds is memory: the name comes back as a suggestion next time,
 * spelled the way it was spelled before, and it survives the last formula
 * filed under it being deleted.
 *
 * `inUse` folds in the categories the stored formulas actually carry, so a
 * rubric typed straight into the dialog is offered again even though nothing
 * recorded it — including formulas saved before any of this existed.
 */
export function useCategories(signedIn: boolean, inUse: string[]) {
  const [local, setLocal] = usePersistentState<string[]>(LOCAL_KEY, []);
  const [server, setServer] = useState<string[]>([]);

  useEffect(() => {
    if (!signedIn) {
      setServer([]);
      return;
    }
    let active = true;
    api
      .fetchCategories()
      .then((names) => active && setServer(names))
      .catch(() => {
        /* an unreachable suggestion list is not worth an error banner */
      });
    return () => {
      active = false;
    };
  }, [signedIn]);

  const stored = signedIn ? server : local;
  const categories = useMemo(() => merge(stored, inUse), [stored, inUse]);

  /** Records a rubric so it can be offered again. Idempotent. */
  const remember = useCallback(
    async (raw: string) => {
      const name = fold(raw);
      if (!name) return;
      if (stored.some((existing) => key(existing) === key(name))) return;

      if (!signedIn) {
        setLocal([...local, name]);
        return;
      }
      const previous = server;
      setServer([...server, name]);
      try {
        await api.addCategory(name);
      } catch {
        setServer(previous);
      }
    },
    [local, server, signedIn, stored, setLocal],
  );

  /**
   * Stops offering a rubric. Formulas keep theirs — so a name still in use goes
   * on appearing, which is why this reads from `stored` rather than the merged
   * list to decide what it can remove.
   */
  const forget = useCallback(
    async (raw: string) => {
      const name = fold(raw);
      const next = stored.filter((existing) => key(existing) !== key(name));

      if (!signedIn) {
        setLocal(next);
        return;
      }
      const previous = server;
      setServer(next);
      try {
        await api.removeCategory(name);
      } catch {
        setServer(previous);
      }
    },
    [server, signedIn, stored, setLocal],
  );

  /** Whether removing this rubric would actually take it off the list. */
  const canForget = useCallback(
    (name: string) => !inUse.some((used) => key(used) === key(name)),
    [inUse],
  );

  return { categories, remember, forget, canForget };
}
