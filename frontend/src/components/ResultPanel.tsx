import { useState } from "react";
import type { EvaluateResponse } from "../types";
import { MathView } from "./MathView";

interface Props {
  result: EvaluateResponse | null;
  error: string | null;
  busy: boolean;
}

/**
 * True when the exact form adds information beyond the rounded decimal --
 * `sqrt(2)` or `2*pi`, not simply more digits of the same number.
 *
 * Testing for letters is not enough: "3.32e-10" contains an `e` and would be
 * misread as symbolic. Anything JavaScript can parse as a number is just a
 * number, however it is spelled.
 */
function exactIsInteresting(exact: string, formatted: string): boolean {
  if (exact.trim() === "" || Number.isFinite(Number(exact))) return false;
  return exact !== formatted;
}

export function ResultPanel({ result, error, busy }: Props) {
  const [copied, setCopied] = useState(false);

  if (error) {
    return (
      <section className="block result is-error">
        <span className="label">Result</span>
        <p className="result-error">{error}</p>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="block result">
        <span className="label">Result</span>
        <p className="result-placeholder">Fill in the variables to see a result.</p>
      </section>
    );
  }

  const { primary, solutions, solve_for: solveFor, steps } = result;
  const label = solveFor ?? "value";
  // Compare by content, not identity: `primary` and `solutions[0]` are
  // serialised separately by the API, so they arrive as distinct objects with
  // equal values and a reference check would report a phantom extra root.
  const others = solutions.filter((candidate) => candidate.exact !== primary.exact);

  const copy = () => {
    const text = primary.value !== null ? String(primary.value) : primary.formatted;
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <section className={`block result${busy ? " is-busy" : ""}`}>
      <div className="block-head">
        <span className="label">Result</span>
        <button type="button" className="chip" onClick={copy}>
          {copied ? "copied" : "copy"}
        </button>
      </div>

      <div className="result-headline">
        <span className="result-name">{label}</span>
        <span className="result-equals">=</span>
        <span className="result-value">{primary.formatted}</span>
      </div>

      {exactIsInteresting(primary.exact, primary.formatted) && (
        <div className="result-exact">
          exact: <MathView latex={primary.latex} />
        </div>
      )}

      {others.length > 0 && (
        <div className="result-others">
          <span className="result-others-label">
            {others.length === 1 ? "Other root" : "Other roots"}
          </span>
          <ul>
            {others.map((solution, index) => (
              <li key={index}>
                {/* `formatted` honours the precision selector; `latex` would
                    print the full exact value and disagree with the headline. */}
                <code className="result-other-value">{solution.formatted}</code>
                {solution.is_real === false && <span className="tag">complex</span>}
              </li>
            ))}
          </ul>
          <p className="result-hint">
            The equation is satisfied by more than one value. Which is physical
            depends on the situation.
          </p>
        </div>
      )}

      <ol className="steps">
        {steps.map((step) => (
          <li key={step.label}>
            <span className="step-label">{step.label}</span>
            <MathView latex={step.latex} className="step-math" />
          </li>
        ))}
      </ol>
    </section>
  );
}
