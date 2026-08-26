import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "./api";
import { ApiError } from "./api";
import { usePersistentState } from "./hooks";
import type { Constant, UserConstant } from "./types";

/**
 * A constant the user defined, wherever it lives.
 *
 * Same shape as the built-in ones plus the bookkeeping, so the two can be
 * merged into a single lookup without every consumer branching.
 */
export interface StoredConstant {
  key: string;
  serverId: number | null;
  symbol: string;
  value: number;
  name: string;
  unit: string;
}

export interface ConstantDraft {
  symbol: string;
  value: number;
  name: string;
  unit: string;
}

const LOCAL_KEY = "formula-lab.local-constants";
const LOCAL_LIMIT = 50;

const fromServer = (row: UserConstant): StoredConstant => ({
  key: `server-${row.id}`,
  serverId: row.id,
  symbol: row.symbol,
  value: row.value,
  name: row.name,
  unit: row.unit,
});

let localCounter = 0;
const nextLocalKey = () => `local-${Date.now().toString(36)}-${localCounter++}`;

const describe = (error: unknown) =>
  error instanceof ApiError || error instanceof Error
    ? error.message
    : "Something went wrong.";

/** Mirrors the server's rule so switching storage cannot change what is accepted. */
const SYMBOL = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

export function useConstantStore(signedIn: boolean, builtIn: Constant[]) {
  const [local, setLocal] = usePersistentState<StoredConstant[]>(LOCAL_KEY, []);
  const [server, setServer] = useState<StoredConstant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!signedIn) {
      setServer([]);
      return;
    }
    setLoading(true);
    api
      .fetchMyConstants()
      .then((rows) => {
        setServer(rows.map(fromServer));
        setError(null);
      })
      .catch((caught) => setError(describe(caught)))
      .finally(() => setLoading(false));
  }, [signedIn]);

  useEffect(reload, [reload]);

  const constants = signedIn ? server : local;

  const validate = useCallback(
    (draft: ConstantDraft, exceptKey?: string) => {
      const symbol = draft.symbol.trim();
      if (!SYMBOL.test(symbol) || symbol.includes("__")) {
        throw new Error("A symbol starts with a letter and holds letters, digits and _.");
      }
      if (!Number.isFinite(draft.value)) {
        throw new Error("Value must be a finite number.");
      }
      if (
        constants.some(
          (item) => item.key !== exceptKey && item.symbol === symbol,
        )
      ) {
        throw new Error(`You already have a constant called '${symbol}'.`);
      }
      return symbol;
    },
    [constants],
  );

  const save = useCallback(
    async (draft: ConstantDraft): Promise<StoredConstant> => {
      const symbol = validate(draft);
      const payload = { ...draft, symbol };

      if (signedIn) {
        const created = fromServer(await api.createConstant(payload));
        setServer((rows) => [...rows, created].sort((a, b) => a.symbol.localeCompare(b.symbol)));
        return created;
      }

      if (local.length >= LOCAL_LIMIT) {
        throw new Error(`This browser can hold ${LOCAL_LIMIT} constants. Sign in to save more.`);
      }
      const created: StoredConstant = { key: nextLocalKey(), serverId: null, ...payload };
      setLocal((rows) => [...rows, created].sort((a, b) => a.symbol.localeCompare(b.symbol)));
      return created;
    },
    [signedIn, local.length, setLocal, validate],
  );

  const update = useCallback(
    async (target: StoredConstant, draft: ConstantDraft): Promise<StoredConstant> => {
      const symbol = validate(draft, target.key);
      const payload = { ...draft, symbol };

      if (signedIn && target.serverId !== null) {
        const saved = fromServer(await api.updateConstant(target.serverId, payload));
        setServer((rows) => rows.map((row) => (row.key === saved.key ? saved : row)));
        return saved;
      }

      const updated: StoredConstant = { ...target, ...payload };
      setLocal((rows) => rows.map((row) => (row.key === target.key ? updated : row)));
      return updated;
    },
    [signedIn, setLocal, validate],
  );

  const remove = useCallback(
    async (target: StoredConstant) => {
      if (signedIn && target.serverId !== null) {
        const previous = server;
        setServer((rows) => rows.filter((row) => row.key !== target.key));
        try {
          await api.deleteConstant(target.serverId);
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
   * What the workspace actually offers as chips: the built-in catalogue with
   * the user's own layered on top.
   *
   * The user's wins on a clash, deliberately -- someone who has defined `g` as
   * their local gravity means that one, not the standard value.
   */
  const effective = useMemo<Constant[]>(() => {
    const merged = new Map<string, Constant>();
    for (const constant of builtIn) merged.set(constant.symbol, constant);
    for (const constant of constants) {
      merged.set(constant.symbol, {
        symbol: constant.symbol,
        value: constant.value,
        name: constant.name || "Your constant",
        unit: constant.unit,
      });
    }
    return [...merged.values()];
  }, [builtIn, constants]);

  return {
    constants,
    effective,
    loading,
    error,
    localCount: local.length,
    limit: LOCAL_LIMIT,
    save,
    update,
    remove,
    reload,
  };
}
