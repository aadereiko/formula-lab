import { formatExact } from "../format";
import type { Constant } from "../types";
import { IconTarget } from "./icons";

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

/**
 * What the chip is offering. The label carries the exact figure now, so the
 * tooltip's job is the name -- the one thing the digits cannot tell you. The
 * value is repeated because the chip is the first thing to narrow on a small
 * screen.
 */
function chipTip(constant: Constant): string {
  const value = [formatExact(constant.value), constant.unit].filter(Boolean).join(" ");
  return constant.name ? `${constant.name} · ${value}` : value;
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
    <section className="block">
      <div className="block-head">
        <span className="label">Variables</span>
        {isEquation && (
          <span className="auth-hint">
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
                  // `title` as well as visible text: a description the user
                  // wrote themselves can be longer than the column is wide.
                  <span className="variable-desc" title={descriptions[symbol]}>
                    {descriptions[symbol]}
                  </span>
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
                    data-tip={chipTip(constant)}
                    disabled={isTarget}
                    onClick={() => onValueChange(symbol, formatExact(constant.value))}
                  >
                    {formatExact(constant.value)}
                    <span className="chip-unit">{constant.unit}</span>
                  </button>
                )}

                {isEquation && (
                  <button
                    type="button"
                    className={`solve-toggle${isTarget ? " is-active" : ""}`}
                    aria-pressed={isTarget}
                    title={isTarget ? "Stop solving for this" : `Solve for ${symbol}`}
                    onClick={() => onSolveForChange(isTarget ? null : symbol)}
                  >
                    <IconTarget />
                    Solve
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
