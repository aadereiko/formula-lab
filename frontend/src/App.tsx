import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "./api";
import { ApiError } from "./api";
import { useDebouncedValue, usePersistentState } from "./hooks";
import { FormulaInput } from "./components/FormulaInput";
import { HelpPanel } from "./components/HelpPanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { LibraryPanel } from "./components/LibraryPanel";
import { ResultPanel } from "./components/ResultPanel";
import { VariablePanel } from "./components/VariablePanel";
import type {
  AnalyzeResponse,
  Capabilities,
  Constant,
  EvaluateResponse,
  HistoryEntry,
  Library,
  LibraryFormula,
} from "./types";

const HISTORY_LIMIT = 12;

/** Aborted requests are superseded keystrokes, not errors worth showing. */
const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

const describeError = (error: unknown) =>
  error instanceof ApiError ? error.message : "Something went wrong.";

export default function App() {
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

  const [activeId, setActiveId] = useState<string | null>("newton2");
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [history, setHistory] = usePersistentState<HistoryEntry[]>("formula-lab.history", []);

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

  // A target that is no longer in the formula would be rejected by the API,
  // so drop it as soon as the formula stops mentioning it.
  useEffect(() => {
    if (solveFor && analysis && !analysis.symbols.includes(solveFor)) setSolveFor(null);
  }, [analysis, solveFor]);

  /**
   * Only the current formula's variables may be sent: the API rejects unknown
   * names outright. Values for symbols that have dropped out are kept in state
   * (so switching formulas back restores them) but filtered out here.
   */
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

  /**
   * Whether the form is complete enough to be worth sending. Auto-evaluating an
   * incomplete form would replace the result with "Missing value for: v" on
   * every keystroke, so we wait until the request can actually succeed.
   */
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
          if (id !== requestId.current) return; // a newer request has landed
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

  // -- interactions --------------------------------------------------------
  const pickFormula = (formula: LibraryFormula) => {
    setExpression(formula.expression);
    setActiveId(formula.id);
    setSolveFor(null);
    setValues({});
    setResult(null);
    setResultError(null);
    setDescriptions(
      Object.fromEntries(formula.variables.map((v) => [v.symbol, v.description])),
    );
  };

  const restore = (entry: HistoryEntry) => {
    setExpression(entry.expression);
    setValues(entry.values);
    setSolveFor(entry.solveFor);
    setActiveId(null);
  };

  const onExpressionChange = (next: string) => {
    setExpression(next);
    setActiveId(null);
    setResult(null);
    setResultError(null);
  };

  return (
    <div className="app">
      <LibraryPanel library={library} activeId={activeId} onPick={pickFormula} />

      <main className="workspace">
        {offline && <div className="banner">{offline}</div>}

        <FormulaInput
          value={expression}
          onChange={onExpressionChange}
          latex={analysis?.latex ?? null}
          error={analyzeError}
          pending={expression.trim() !== debouncedExpression.trim()}
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
              <span className="toolbar-hint">
                Leave one variable blank, or press <em>solve</em> next to one.
              </span>
            )}
          </div>
        )}

        <ResultPanel result={result} error={resultError} busy={busy} />
        <HistoryPanel entries={history} onRestore={restore} onClear={() => setHistory([])} />
        <HelpPanel capabilities={capabilities} />
      </main>
    </div>
  );
}
