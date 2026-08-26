import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "./api";
import { ApiError } from "./api";
import { useDebouncedValue, usePersistentState } from "./hooks";
import { useRoute } from "./useRoute";
import { useAuth, useOAuthError } from "./useAuth";
import { useFormulaStore, type FormulaDraft, type StoredFormula } from "./useFormulaStore";
import { AccountDialog } from "./components/AccountDialog";
import { AuthDialog } from "./components/AuthDialog";
import { FormulaInput } from "./components/FormulaInput";
import { Header } from "./components/Header";
import { HelpPanel } from "./components/HelpPanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { ResultPanel } from "./components/ResultPanel";
import { SaveDialog } from "./components/SaveDialog";
import { Sidebar } from "./components/Sidebar";
import { VariablePanel } from "./components/VariablePanel";
import { FormulasPage } from "./pages/FormulasPage";
import type {
  AnalyzeResponse,
  Capabilities,
  Constant,
  EvaluateResponse,
  HistoryEntry,
  Library,
  LibraryFormula,
} from "./types";

const HISTORY_LIMIT = 10;

type SaveIntent =
  | { mode: "current"; existing: StoredFormula | null }
  | { mode: "edit"; existing: StoredFormula };

const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

const describeError = (error: unknown) =>
  error instanceof ApiError || error instanceof Error
    ? error.message
    : "Something went wrong.";

export default function App() {
  const auth = useAuth();
  const oauthError = useOAuthError();
  const { route, navigate } = useRoute();
  const signedIn = Boolean(auth.user);
  const store = useFormulaStore(signedIn);

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

  const [activeSaved, setActiveSaved] = useState<StoredFormula | null>(null);
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>("newton2");
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [history, setHistory] = usePersistentState<HistoryEntry[]>("formula-lab.history", []);

  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authReason, setAuthReason] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  /**
   * What a save is meant to do. Stated rather than inferred: "Save" on the
   * calculator writes the current working state, while "Rename" on the
   * formulas page must touch only the name and note -- comparing object
   * identity to guess between them would quietly overwrite a saved
   * expression with whatever the calculator happened to hold.
   */
  const [saveIntent, setSaveIntent] = useState<SaveIntent | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [migrateDismissed, setMigrateDismissed] = useState(false);

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

  useEffect(() => {
    if (oauthError) setAuthOpen(true);
  }, [oauthError]);

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

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 2400);
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
    navigate("calculator");
  };

  const openSaved = (formula: StoredFormula) => {
    setExpression(formula.expression);
    setValues(formula.values);
    setSolveFor(formula.solveFor);
    setActiveSaved(formula);
    setActiveLibraryId(null);
    setDescriptions({});
    setResult(null);
    setResultError(null);
    setMenuOpen(false);
    navigate("calculator");
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
  // No account required: a guest's formulas go to localStorage, and the store
  // presents both the same way.
  const performSave = async (name: string, note: string, asNew: boolean) => {
    const intent = saveIntent;
    if (!intent) return;

    const source =
      intent.mode === "edit"
        ? {
            expression: intent.existing.expression,
            values: intent.existing.values,
            solveFor: intent.existing.solveFor,
          }
        : { expression: analysis!.expression, values: relevantValues, solveFor };

    const draft: FormulaDraft = { name, note, ...source };
    const updating = intent.existing !== null && !asNew;
    const stored = updating
      ? await store.update(intent.existing!, draft)
      : await store.save(draft);

    // Keep the calculator's badge in step, but never adopt a formula that a
    // rename-and-duplicate produced somewhere else.
    if (intent.mode === "current" && !asNew) setActiveSaved(stored);
    else if (intent.mode === "edit" && updating && activeSaved?.key === stored.key) {
      setActiveSaved(stored);
    }

    setActiveLibraryId(null);
    setSaveIntent(null);
    flash(updating ? "Updated" : signedIn ? "Saved" : "Saved in this browser");
  };

  const deleteSaved = async (formula: StoredFormula) => {
    try {
      await store.remove(formula);
      if (activeSaved?.key === formula.key) setActiveSaved(null);
      flash("Deleted");
    } catch {
      /* the store restores the row and records the error */
    }
  };

  const promptSignIn = (reason?: string) => {
    setAuthReason(reason ?? null);
    setMenuOpen(false);
    setAuthOpen(true);
  };

  const signOut = async () => {
    await auth.signOut();
    setActiveSaved(null);
    setAccountOpen(false);
    setMigrateDismissed(false);
  };

  const migrate = async () => {
    const { moved, failed } = await store.migrateLocal();
    setAccountOpen(false);
    setMigrateDismissed(true);
    flash(
      failed === 0
        ? `Moved ${moved} formula${moved === 1 ? "" : "s"} to your account`
        : `Moved ${moved}, kept ${failed} in this browser`,
    );
  };

  const showMigratePrompt = signedIn && store.localCount > 0 && !migrateDismissed;

  return (
    <div className="app">
      <Header
        user={auth.user}
        checking={auth.checking}
        menuOpen={menuOpen}
        route={route}
        showMenu={route === "calculator"}
        savedCount={store.formulas.length}
        onNavigate={navigate}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        onAccount={() => (auth.user ? setAccountOpen(true) : promptSignIn())}
      />

      {route === "calculator" && (
        <Sidebar
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          library={library}
          activeLibraryId={activeLibraryId}
          onPickLibrary={pickLibrary}
          saved={store.formulas}
          activeSavedKey={activeSaved?.key ?? null}
          savedLoading={store.loading}
          savedError={store.error}
          signedIn={signedIn}
          onOpenSaved={openSaved}
          onDeleteSaved={deleteSaved}
          onSeeAll={() => navigate("formulas")}
        />
      )}

      <main className={`workspace${route === "formulas" ? " is-full" : ""}`}>
        {offline && <p className="banner">{offline}</p>}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}

        {showMigratePrompt && (
          <div className="notice notice-action">
            <span>
              {store.localCount === 1
                ? "1 formula is saved in this browser only."
                : `${store.localCount} formulas are saved in this browser only.`}
            </span>
            <span className="notice-buttons">
              <button type="button" className="btn btn-small btn-primary" onClick={migrate}>
                Move to my account
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setMigrateDismissed(true)}
              >
                Later
              </button>
            </span>
          </div>
        )}

        {route === "formulas" ? (
          <FormulasPage
            formulas={store.formulas}
            loading={store.loading}
            error={store.error}
            signedIn={signedIn}
            limit={store.limit}
            onOpen={openSaved}
            onEdit={(formula) => setSaveIntent({ mode: "edit", existing: formula })}
            onDelete={deleteSaved}
            onSignIn={() => promptSignIn("Sign in to keep your formulas across devices.")}
            onNew={() => navigate("calculator")}
          />
        ) : (
          <div className="panes">
            <div className="pane">
              <FormulaInput
                value={expression}
                onChange={onExpressionChange}
                latex={analysis?.latex ?? null}
                error={analyzeError}
                pending={expression.trim() !== debouncedExpression.trim()}
                canSave={Boolean(analysis)}
                savedName={activeSaved?.name ?? null}
                onSave={() => setSaveIntent({ mode: "current", existing: activeSaved })}
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
            </div>

            <div className="pane">
              <ResultPanel result={result} error={resultError} busy={busy} />
              <HistoryPanel entries={history} onRestore={restore} onClear={() => setHistory([])} />
              <HelpPanel capabilities={capabilities} />
            </div>
          </div>
        )}
      </main>

      {saveIntent && (saveIntent.existing || analysis) && (
        <SaveDialog
          expression={(saveIntent.existing ?? analysis!).expression}
          existing={saveIntent.existing}
          storageNote={signedIn ? null : "Saved in this browser until you sign in."}
          onSave={performSave}
          onCancel={() => setSaveIntent(null)}
        />
      )}

      {authOpen && !auth.user && (
        <AuthDialog
          providers={auth.providers}
          initialError={oauthError}
          reason={authReason}
          onSignIn={auth.signIn}
          onSignUp={auth.signUp}
          onClose={() => {
            setAuthOpen(false);
            setAuthReason(null);
          }}
        />
      )}

      {accountOpen && auth.user && (
        <AccountDialog
          user={auth.user}
          localCount={store.localCount}
          onMigrate={migrate}
          onSignOut={signOut}
          onClose={() => setAccountOpen(false)}
        />
      )}
    </div>
  );
}
