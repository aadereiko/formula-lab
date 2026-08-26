import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "./api";
import { usePersistentState } from "./hooks";

const LOCAL_KEY = "formula-lab.local-library-pins";

/**
 * Which built-in formulas somebody wants to hand.
 *
 * The library is read-only, so a pin cannot live on the formula; it is a set of
 * ids, kept on the account when signed in and in the browser otherwise —
 * the same arrangement as saved formulas and constants.
 *
 * Writes are optimistic. Both verbs are idempotent on the server, so a retry
 * or a double click cannot produce a conflict, and reverting on failure is
 * enough to keep the button honest.
 */
export function useLibraryPins(signedIn: boolean) {
  const [local, setLocal] = usePersistentState<string[]>(LOCAL_KEY, []);
  const [server, setServer] = useState<string[]>([]);

  useEffect(() => {
    if (!signedIn) {
      setServer([]);
      return;
    }
    let active = true;
    api
      .fetchLibraryPins()
      .then((ids) => active && setServer(ids))
      .catch(() => {
        /* an unreachable pin list is not worth an error banner */
      });
    return () => {
      active = false;
    };
  }, [signedIn]);

  const ids = signedIn ? server : local;
  const pinned = useMemo(() => new Set(ids), [ids]);

  const toggle = useCallback(
    async (id: string) => {
      const isPinned = pinned.has(id);
      const next = isPinned ? ids.filter((value) => value !== id) : [...ids, id];

      if (!signedIn) {
        setLocal(next);
        return;
      }

      const previous = server;
      setServer(next);
      try {
        await (isPinned ? api.unpinLibrary(id) : api.pinLibrary(id));
      } catch {
        setServer(previous);
      }
    },
    [ids, pinned, server, signedIn, setLocal],
  );

  return { pinned, toggle };
}
