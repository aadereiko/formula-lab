import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "./api";
import { ApiError } from "./api";
import { useDebouncedValue, usePersistentState } from "./hooks";
import { useAuth, useOAuthError } from "./useAuth";
import { AuthPanel } from "./components/AuthPanel";
import { FormulaInput } from "./components/FormulaInput";
import { Header } from "./components/Header";
import { HelpPanel } from "./components/HelpPanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { ResultPanel } from "./components/ResultPanel";
import { SaveDialog } from "./components/SaveDialog";
import { Sidebar } from "./components/Sidebar";
import { VariablePanel } from "./components/VariablePanel";
import type {
  AnalyzeResponse,
  Capabilities,
  Constant,
  EvaluateResponse,
  HistoryEntry,
  Library,
  LibraryFormula,
  SavedFormula,
} from "./types";

const HISTORY_LIMIT = 10;

const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

const describeError = (error: unknown) =>
  error instanceof ApiError ? error.message : "Something went wrong.";

export default function App() {
  const auth = useAuth();
  const oauthError = useOAuthError();

  const [expression, setExpression] = useState("F = m*a");
  const [values, setValues] = useState<Record<string, string>>({ F: "10", a: "2" });
  const [solveFor, setSolveFor] = useState<string | null>(null);
  const [precision, setPrecision] = useState(6);

  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [result, setResult] = useState<EvaluateResponse | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [library, setLibrary] = useState<Library | null>(null);
  const [constants, setConstants] = useState<Constant[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [offline, setOffline] = useState<string | null>(null);

  const [saved, setSaved] = useState<SavedFormula[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [activeSaved, setActiveSaved] = useState<SavedFormula | null>(null);

  const [activeLibraryId, setActiveLibraryId] = useState<string | null>("newton2");
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [history, setHistory] = usePersistentState<HistoryEntry[]>("formula-lab.history", []);

  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const debouncedExpression = useDebouncedValue(expression, 300);
  const debouncedValues = useDebouncedValue(values, 300);

  // -- reference data ------------------------------------------------------
  useEffect(() => {
    Promise.all([api.fetchLibrary(), api.fetchConstants(), api.fetchCapabilities()])
      .then(([lib, consts, caps]) => {
        setLibrary(lib);
        setConstants(consts);
        setCapabilities(caps);
        setOffline(null);
      })
      .catch((error) => setOffline(describeError(error)));
  }, []);

  // A Google redirect lands back here with the failure reason in the URL.
  useEffect(() => {
    if (oauthError) setAuthOpen(true);
  }, [oauthError]);

  // -- saved formulas ------------------------------------------------------
  const reloadSaved = useCallback(() => {
    if (!auth.user) {
      setSaved([]);
      setActiveSaved(null);
      return;
    }
    setSavedLoading(true);
    api
      .fetchSaved()
      .then((rows) => {
        setSaved(rows);
        setSavedError(null);
      })
      .catch((error) => setSavedError(describeError(error)))
      .finally(() => setSavedLoading(false));
  }, [auth.user]);

  useEffect(reloadSaved, [reloadSaved]);

  // -- parse as the user types --------------------------------------------
  useEffect(() => {
    const trimmed = debouncedExpression.trim();
    if (!trimmed) {
      setAnalysis(null);
      setAnalyzeError(null);
      return;
    }

    const controller = new AbortController();
    api
      .analyze(trimmed, controller.signal)
      .then((next) => {
        setAnalysis(next);
        setAnalyzeError(null);
      })
      .catch((error) => {
        if (isAbort(error)) return;
        setAnalysis(null);
        setAnalyzeError(describeError(error));
      });
    return () => controller.abort();
  }, [debouncedExpression]);

  const symbols = analysis?.symbols ?? [];

  useEffect(() => {
    if (solveFor && analysis && !analysis.symbols.includes(solveFor)) setSolveFor(null);
  }, [analysis, solveFor]);

  /** Only the current formula's variables: the API rejects unknown names. */
  const relevantValues = useMemo(() => {
    const filtered: Record<string, string> = {};
    for (const symbol of symbols) {
      const value = debouncedValues[symbol];
      if (value !== undefined && value.trim() !== "") filtered[symbol] = value.trim();
    }
    return filtered;
  }, [symbols, debouncedValues]);

  const blanks = symbols.filter((symbol) => relevantValues[symbol] === undefined);
  const isEquation = analysis?.is_equation ?? false;
  const target = solveFor ?? (isEquation && blanks.length === 1 ? blanks[0]! : null);

  const ready = useMemo(() => {
    if (!analysis || analyzeError) return false;
    if (!isEquation) return blanks.length === 0;
    if (!target) return false;
    return blanks.every((symbol) => symbol === target);
  }, [analysis, analyzeError, isEquation, blanks, target]);

  const pushHistory = useCallback(
    (entry: HistoryEntry) => {
      setHistory((previous) => {
        const deduped = previous.filter(
          (item) =>
            item.expression !== entry.expression ||
            JSON.stringify(item.values) !== JSON.stringify(entry.values),
        );
        return [entry, ...deduped].slice(0, HISTORY_LIMIT);
      });
    },
    [setHistory],
  );

  // -- evaluate ------------------------------------------------------------
  const requestId = useRef(0);

  const runEvaluate = useCallback(
    (signal?: AbortSignal) => {
      if (!analysis || !ready) return;
      const id = ++requestId.current;
      setBusy(true);
      api
        .evaluate(analysis.expression, relevantValues, solveFor, precision, signal)
        .then((next) => {
          if (id !== requestId.current) return;
          setResult(next);
          setResultError(null);
          pushHistory({
            id: `${Date.now()}-${id}`,
            expression: analysis.expression,
            values: relevantValues,
            solveFor,
            resultLabel: next.solve_for ?? "value",
            resultValue: next.primary.formatted,
          });
        })
        .catch((error) => {
          if (isAbort(error) || id !== requestId.current) return;
          setResult(null);
          setResultError(describeError(error));
        })
        .finally(() => {
          if (id === requestId.current) setBusy(false);
        });
    },
    [analysis, ready, relevantValues, solveFor, precision, pushHistory],
  );

  useEffect(() => {
    if (!ready) {
      setResult(null);
      setResultError(null);
      return;
    }
    const controller = new AbortController();
    runEvaluate(controller.signal);
    return () => controller.abort();
  }, [ready, runEvaluate]);

  // -- transient confirmations --------------------------------------------
  const flash = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 2200);
  }, []);

  // -- opening formulas ----------------------------------------------------
  const pickLibrary = (formula: LibraryFormula) => {
    setExpression(formula.expression);
    setActiveLibraryId(formula.id);
    setActiveSaved(null);
    setSolveFor(null);
    setValues({});
    setResult(null);
    setResultError(null);
    setDescriptions(
      Object.fromEntries(formula.variables.map((v) => [v.symbol, v.description])),
    );
    setMenuOpen(false);
  };

  const openSaved = (formula: SavedFormula) => {
    setExpression(formula.expression);
    setValues(formula.values);
    setSolveFor(formula.solve_for);
    setActiveSaved(formula);
    setActiveLibraryId(null);
    setDescriptions({});
    setResult(null);
    setResultError(null);
    setMenuOpen(false);
  };

  const restore = (entry: HistoryEntry) => {
    setExpression(entry.expression);
    setValues(entry.values);
    setSolveFor(entry.solveFor);
    setActiveLibraryId(null);
    setActiveSaved(null);
  };

  const onExpressionChange = (next: string) => {
    setExpression(next);
    setActiveLibraryId(null);
    setResult(null);
    setResultError(null);
  };

  // -- saving --------------------------------------------------------------
  const requestSave = () => {
    if (!analysis) return;
    if (!auth.user) {
      setAuthOpen(true);
      return;
    }
    setSaveOpen(true);
  };

  const performSave = async (name: string, note: string, asNew: boolean) => {
    if (!analysis) return;
    const payload = {
      name,
      note,
      expression: analysis.expression,
      values: relevantValues,
      solve_for: solveFor,
    };

    const stored =
      activeSaved && !asNew
        ? await api.updateSaved(activeSaved.id, payload)
        : await api.createSaved(payload);

    setActiveSaved(stored);
    setActiveLibraryId(null);
    setSaveOpen(false);
    reloadSaved();
    flash(activeSaved && !asNew ? "Updated" : "Saved");
  };

  const deleteSaved = async (formula: SavedFormula) => {
    // Optimistic: put the row back if the request fails.
    const previous = saved;
    setSaved((rows) => rows.filter((row) => row.id !== formula.id));
    if (activeSaved?.id === formula.id) setActiveSaved(null);
    try {
      await api.deleteSaved(formula.id);
      flash("Deleted");
    } catch (error) {
      setSaved(previous);
      setSavedError(describeError(error));
    }
  };

  const signOut = async () => {
    await auth.signOut();
    setSaved([]);
    setActiveSaved(null);
    setAuthOpen(false);
  };

  return (
    <div className="app">
      <Header
        user={auth.user}
        checking={auth.checking}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        onAccount={() => setAuthOpen((open) => !open)}
      />

      <Sidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        library={library}
        activeLibraryId={activeLibraryId}
        onPickLibrary={pickLibrary}
        saved={saved}
        activeSavedId={activeSaved?.id ?? null}
        savedLoading={savedLoading}
        savedError={savedError}
        signedIn={Boolean(auth.user)}
        onOpenSaved={openSaved}
        onDeleteSaved={deleteSaved}
        onSignInPrompt={() => {
          setMenuOpen(false);
          setAuthOpen(true);
        }}
      />

      <main className="workspace">
        {offline && <p className="banner">{offline}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}

        {authOpen && (
          <AuthPanel
            user={auth.user}
            providers={auth.providers}
            initialError={oauthError}
            onSignIn={auth.signIn}
            onSignUp={auth.signUp}
            onSignOut={signOut}
            onClose={() => setAuthOpen(false)}
          />
        )}

        <FormulaInput
          value={expression}
          onChange={onExpressionChange}
          latex={analysis?.latex ?? null}
          error={analyzeError}
          pending={expression.trim() !== debouncedExpression.trim()}
          canSave={Boolean(analysis)}
          savedName={activeSaved?.name ?? null}
          onSave={requestSave}
        />

        <VariablePanel
          symbols={symbols}
          values={values}
          onValueChange={(symbol, value) =>
            setValues((previous) => ({ ...previous, [symbol]: value }))
          }
          isEquation={isEquation}
          solveFor={solveFor}
          onSolveForChange={setSolveFor}
          descriptions={descriptions}
          constants={constants}
          onSubmit={() => runEvaluate()}
        />

        {symbols.length > 0 && (
          <div className="toolbar">
            <label htmlFor="precision">
              Precision
              <select
                id="precision"
                value={precision}
                onChange={(event) => setPrecision(Number(event.target.value))}
              >
                {[3, 4, 6, 8, 10, 12].map((digits) => (
                  <option key={digits} value={digits}>
                    {digits} digits
                  </option>
                ))}
              </select>
            </label>
            {isEquation && !target && (
              <span className="toolbar-hint">Leave one variable blank to solve for it.</span>
            )}
          </div>
        )}

        <ResultPanel result={result} error={resultError} busy={busy} />
        <HistoryPanel entries={history} onRestore={restore} onClear={() => setHistory([])} />
        <HelpPanel capabilities={capabilities} />
      </main>

      {saveOpen && analysis && (
        <SaveDialog
          expression={analysis.expression}
          existing={activeSaved}
          onSave={performSave}
          onCancel={() => setSaveOpen(false)}
        />
      )}
    </div>
  );
}
