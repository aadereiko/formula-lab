import { FormulaLegend } from "./FormulaLegend";
import { IconClear, IconEdit, IconSave } from "./icons";
import { MathView } from "./MathView";

interface Props {
  value: string;
  onChange: (next: string) => void;
  latex: string | null;
  error: string | null;
  pending: boolean;
  canSave: boolean;
  savedName: string | null;
  description: string | null;
  /** Functions the formula calls, explained beneath the field. */
  functions: string[];
  functionHelp: Record<string, string>;
  onSave: () => void;
  /** Null when there is nothing to clear. */
  onClear: (() => void) | null;
}

export function FormulaInput({
  value,
  onChange,
  latex,
  error,
  pending,
  canSave,
  savedName,
  description,
  functions,
  functionHelp,
  onSave,
  onClear,
}: Props) {
  return (
    <section className="block">
      <div className="block-head">
        <label className="label" htmlFor="formula">
          Formula
        </label>
        {savedName && <span className="saved-badge">{savedName}</span>}
        <span className="block-actions">
          {onClear && (
            <button type="button" className="btn btn-small btn-pop" onClick={onClear}>
              <IconClear />
              Clear
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-small btn-pop"
            disabled={!canSave}
            onClick={onSave}
          >
            {savedName ? <IconEdit /> : <IconSave />}
            {savedName ? "Edit details" : "Save"}
          </button>
        </span>
      </div>

      <input
        id="formula"
        className="formula-input"
        value={value}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="E = 1/2 m v^2"
        onChange={(event) => onChange(event.target.value)}
      />

      {description && <p className="formula-description">{description}</p>}

      <div className="preview" aria-live="polite">
        {error ? (
          <span className="preview-error">{error}</span>
        ) : latex ? (
          <MathView latex={latex} display className={pending ? "is-stale" : undefined} />
        ) : (
          <span className="preview-hint">
            An equation like <code>F = m a</code> solves for any variable. An expression
            like <code>1/2 m v^2</code> is evaluated.
          </span>
        )}
      </div>

      <FormulaLegend functions={functions} functionHelp={functionHelp} />
    </section>
  );
}
