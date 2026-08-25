import { MathView } from "./MathView";

interface Props {
  value: string;
  onChange: (next: string) => void;
  latex: string | null;
  error: string | null;
  pending: boolean;
}

export function FormulaInput({ value, onChange, latex, error, pending }: Props) {
  return (
    <section className="panel formula-panel">
      <label className="panel-label" htmlFor="formula">
        Formula
      </label>
      <input
        id="formula"
        className="formula-input"
        value={value}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        placeholder="e.g.  E = 1/2 m v^2"
        onChange={(event) => onChange(event.target.value)}
      />

      <div className="formula-preview" aria-live="polite">
        {error ? (
          <span className="preview-error">{error}</span>
        ) : latex ? (
          <MathView latex={latex} display className={pending ? "is-stale" : undefined} />
        ) : (
          <span className="preview-hint">
            Write an equation like <code>F = m a</code> to solve for any variable,
            or an expression like <code>1/2 m v^2</code> to evaluate it.
          </span>
        )}
      </div>
    </section>
  );
}
