import type { Constant } from "../types";

interface Props {
  symbols: string[];
  values: Record<string, string>;
  onValueChange: (symbol: string, value: string) => void;
  isEquation: boolean;
  solveFor: string | null;
  onSolveForChange: (symbol: string | null) => void;
  descriptions: Record<string, string>;
  constants: Constant[];
  onSubmit: () => void;
}

/** Formats a constant compactly: 6.674e-11 rather than 0.00000000006674. */
function formatConstant(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude < 1e-4 || magnitude >= 1e6)) {
    return value.toExponential(6).replace(/e([+-])(\d)$/, "e$10$2");
  }
  return String(value);
}

export function VariablePanel({
  symbols,
  values,
  onValueChange,
  isEquation,
  solveFor,
  onSolveForChange,
  descriptions,
  constants,
  onSubmit,
}: Props) {
  if (symbols.length === 0) return null;

  const constantFor = new Map(constants.map((c) => [c.symbol, c]));
  const blanks = symbols.filter((s) => !values[s]?.trim());
  // With exactly one blank the intent is unambiguous, so the backend infers the
  // target and the UI just reports it.
  const inferred = isEquation && blanks.length === 1 ? blanks[0]! : null;
  const target = solveFor ?? inferred;

  return (
    <section className="panel">
      <div className="panel-header">
        <span className="panel-label">Variables</span>
        {isEquation && (
          <span className="panel-note">
            {target ? (
              <>
                solving for <strong>{target}</strong>
              </>
            ) : (
              "leave one blank, or pick a target"
            )}
          </span>
        )}
      </div>

      <div className="variable-grid">
        {symbols.map((symbol) => {
          const constant = constantFor.get(symbol);
          const isTarget = symbol === target;
          return (
            <div key={symbol} className={`variable-row${isTarget ? " is-target" : ""}`}>
              <div className="variable-id">
                <span className="variable-symbol">{symbol}</span>
                {descriptions[symbol] && (
                  <span className="variable-desc">{descriptions[symbol]}</span>
                )}
              </div>

              <div className="variable-controls">
                <input
                  className="variable-input"
                  type="text"
                  inputMode="decimal"
                  value={values[symbol] ?? ""}
                  placeholder={isTarget ? "solving for this" : "value"}
                  disabled={isTarget}
                  onChange={(event) => onValueChange(symbol, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") onSubmit();
                  }}
                />

                {constant && (
                  <button
                    type="button"
                    className="chip"
                    title={`${constant.name} = ${constant.value} ${constant.unit}`}
                    disabled={isTarget}
                    onClick={() => onValueChange(symbol, formatConstant(constant.value))}
                  >
                    {formatConstant(constant.value)}
                    <span className="chip-unit">{constant.unit}</span>
                  </button>
                )}

                {isEquation && (
                  <button
                    type="button"
                    className={`solve-toggle${isTarget ? " is-active" : ""}`}
                    title={isTarget ? "Stop solving for this" : `Solve for ${symbol}`}
                    onClick={() => onSolveForChange(isTarget ? null : symbol)}
                  >
                    solve
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
