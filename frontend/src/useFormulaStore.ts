import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "./api";
import { ApiError } from "./api";
import { usePersistentState } from "./hooks";
import type { SavedFormula, SavedFormulaInput } from "./types";

/**
 * One formula, wherever it lives.
 *
 * `serverId` is the only place the storage distinction survives: everything
 * else in the app works with this shape, so no component has to branch on
 * whether the user is signed in.
 */
export interface StoredFormula {
  key: string;
  serverId: number | null;
  name: string;
  expression: string;
  /** What the formula is for. Labelled "Description" in the UI. */
  note: string;
  values: Record<string, string>;
  /** What each symbol means: { m: "mass (kg)" }. */
  variableNotes: Record<string, string>;
  solveFor: string | null;
  /** Pinned formulas sort to the top of every list. */
  pinned: boolean;
  updatedAt: string;
}

export interface FormulaDraft {
  name: string;
  expression: string;
  note: string;
  values: Record<string, string>;
  variableNotes: Record<string, string>;
  solveFor: string | null;
  pinned: boolean;
}

const LOCAL_KEY = "formula-lab.local-formulas";
/** localStorage is a few megabytes per origin and shared with history. */
const LOCAL_LIMIT = 50;

const fromServer = (row: SavedFormula): StoredFormula => ({
  key: `server-${row.id}`,
  serverId: row.id,
  name: row.name,
  expression: row.expression,
  note: row.note,
  values: row.values,
  variableNotes: row.variable_notes,
  solveFor: row.solve_for,
  pinned: row.pinned,
  updatedAt: row.updated_at,
});

const toRequest = (draft: FormulaDraft): SavedFormulaInput => ({
  name: draft.name,
  expression: draft.expression,
  note: draft.note,
  values: draft.values,
  variable_notes: draft.variableNotes,
  solve_for: draft.solveFor,
  pinned: draft.pinned,
});

/** Ids only need to be unique within this browser. */
let localCounter = 0;
const nextLocalKey = () => `local-${Date.now().toString(36)}-${localCounter++}`;

/** Pinned first, then most recently touched: the same order the server applies. */
const byPinThenRecency = (a: StoredFormula, b: StoredFormula) =>
  Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt);

const describe = (error: unknown) =>
  error instanceof ApiError || error instanceof Error
    ? error.message
    : "Something went wrong.";

export function useFormulaStore(signedIn: boolean) {
  const [local, setLocal] = usePersistentState<StoredFormula[]>(LOCAL_KEY, []);
  const [server, setServer] = useState<StoredFormula[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!signedIn) {
      setServer([]);
      return;
    }
    setLoading(true);
    api
      .fetchSaved()
      .then((rows) => {
        setServer(rows.map(fromServer));
        setError(null);
      })
      .catch((caught) => setError(describe(caught)))
      .finally(() => setLoading(false));
  }, [signedIn]);

  useEffect(reload, [reload]);

  /**
   * Sorted on read, not on write.
   *
   * Sorting only when a row changed left whatever localStorage already held in
   * its stored order, so a pinned formula saved before the feature existed --
   * or simply written by an older version -- stayed where it was. One sort over
   * whichever source is active is both simpler and correct.
   */
  const formulas = useMemo(
    () => [...(signedIn ? server : local)].sort(byPinThenRecency),
    [signedIn, server, local],
  );

  const nameTaken = useCallback(
    (name: string, exceptKey?: string) =>
      local.some(
        (item) =>
          item.key !== exceptKey && item.name.toLowerCase() === name.toLowerCase(),
      ),
    [local],
  );

  const save = useCallback(
    async (draft: FormulaDraft): Promise<StoredFormula> => {
      if (signedIn) {
        const created = fromServer(await api.createSaved(toRequest(draft)));
        setServer((rows) => [created, ...rows]);
        return created;
      }

      // Mirror the server's rules locally so switching storage does not change
      // what the app accepts.
      if (local.length >= LOCAL_LIMIT) {
        throw new Error(
          `This browser can hold ${LOCAL_LIMIT} formulas. Sign in to save more.`,
        );
      }
      if (nameTaken(draft.name)) {
        throw new Error(`You already have a formula named '${draft.name}'.`);
      }

      const created: StoredFormula = {
        key: nextLocalKey(),
        serverId: null,
        updatedAt: new Date().toISOString(),
        ...draft,
      };
      setLocal((rows) => [created, ...rows]);
      return created;
    },
    [signedIn, local.length, nameTaken, setLocal],
  );

  const update = useCallback(
    async (target: StoredFormula, draft: FormulaDraft): Promise<StoredFormula> => {
      if (signedIn && target.serverId !== null) {
        const saved = fromServer(await api.updateSaved(target.serverId, toRequest(draft)));
        setServer((rows) => rows.map((row) => (row.key === saved.key ? saved : row)));
        return saved;
      }

      if (nameTaken(draft.name, target.key)) {
        throw new Error(`You already have a formula named '${draft.name}'.`);
      }
      const updated: StoredFormula = {
        ...target,
        ...draft,
        updatedAt: new Date().toISOString(),
      };
      setLocal((rows) => rows.map((row) => (row.key === target.key ? updated : row)));
      return updated;
    },
    [signedIn, nameTaken, setLocal],
  );

  const togglePin = useCallback(
    async (target: StoredFormula): Promise<StoredFormula> =>
      update(target, {
        name: target.name,
        expression: target.expression,
        note: target.note,
        values: target.values,
        variableNotes: target.variableNotes,
        solveFor: target.solveFor,
        pinned: !target.pinned,
      }),
    [update],
  );

  const remove = useCallback(
    async (target: StoredFormula) => {
      if (signedIn && target.serverId !== null) {
        const previous = server;
        setServer((rows) => rows.filter((row) => row.key !== target.key));
        try {
          await api.deleteSaved(target.serverId);
        } catch (caught) {
          setServer(previous); // put it back rather than lie about the delete
          setError(describe(caught));
          throw caught;
        }
        return;
      }
      setLocal((rows) => rows.filter((row) => row.key !== target.key));
    },
    [signedIn, server, setLocal],
  );

  /**
   * Copy this browser's formulas into the signed-in account.
   *
   * Deliberately explicit rather than automatic on sign-in: doing it silently
   * would duplicate the same formulas from every device someone signs in from.
   * A name already taken on the account gets a suffix rather than overwriting,
   * and local copies are only cleared once every upload has succeeded.
   */
  const migrateLocal = useCallback(async (): Promise<{ moved: number; failed: number }> => {
    if (!signedIn || local.length === 0) return { moved: 0, failed: 0 };

    let moved = 0;
    let failed = 0;
    const leftover: StoredFormula[] = [];

    for (const item of [...local].reverse()) {
      const draft: FormulaDraft = {
        name: item.name,
        expression: item.expression,
        note: item.note,
        values: item.values,
        variableNotes: item.variableNotes ?? {},
        solveFor: item.solveFor,
        pinned: item.pinned ?? false,
      };
      try {
        await api.createSaved(toRequest(draft));
        moved += 1;
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 409) {
          try {
            await api.createSaved(toRequest({ ...draft, name: `${draft.name} (copy)` }));
            moved += 1;
            continue;
          } catch {
            /* fall through to keeping it locally */
          }
        }
        failed += 1;
        leftover.push(item);
      }
    }

    setLocal(leftover);
    reload();
    return { moved, failed };
  }, [signedIn, local, setLocal, reload]);

  return {
    formulas,
    loading,
    error,
    localCount: local.length,
    limit: LOCAL_LIMIT,
    save,
    update,
    remove,
    togglePin,
    migrateLocal,
    reload,
  };
}
