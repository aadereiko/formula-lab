import { useEffect, useMemo, useState } from "react";
import { MathView } from "../components/MathView";
import type { AnalyzeResponse } from "../types";
import type { FormulaDraft, StoredFormula } from "../useFormulaStore";

interface Props {
  /** The formula being edited, or null when writing a new one. */
  existing: StoredFormula | null;
  expression: string;
  onExpressionChange: (next: string) => void;
  analysis: AnalyzeResponse | null;
  analyzeError: string | null;
  pending: boolean;
  signedIn: boolean;
  /** Example description per symbol, shown as placeholder text. */
  hints: Record<string, string>;
  fallbackHint: string;
  values: Record<string, string>;
  solveFor: string | null;
  onSave: (draft: FormulaDraft, asNew: boolean) => Promise<void>;
  onCancel: (() => void) | null;
}

/**
 * Two steps, not one long form.
 *
 * Writing the formula comes first and on its own; the name, the description and
 * the per-variable descriptions only appear once Save is pressed. That ordering
 * matches how the work actually goes -- there is nothing to describe until
 * there is a formula, and the variable fields cannot even exist until the
 * expression has been parsed.
 */
type Step = "formula" | "details";

export function EditorPage({
  existing,
  expression,
  onExpressionChange,
  analysis,
  analyzeError,
  pending,
  signedIn,
  hints,
  fallbackHint,
  values,
  solveFor,
  onSave,
  onCancel,
}: Props) {
  const [name, setName] = useState(existing?.name ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [variableNotes, setVariableNotes] = useState<Record<string, string>>(
    existing?.variableNotes ?? {},
  );
  // Editing an existing formula skips step one: the formula is already written.
  const [step, setStep] = useState<Step>(existing ? "details" : "formula");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(existing?.name ?? "");
    setNote(existing?.note ?? "");
    setVariableNotes(existing?.variableNotes ?? {});
    setStep(existing ? "details" : "formula");
    setError(null);
  }, [existing]);

  // Emptying the formula sends you back: there is nothing left to describe.
  useEffect(() => {
    if (step === "details" && !expression.trim()) setStep("formula");
  }, [step, expression]);

  const symbols = analysis?.symbols ?? [];

  /**
   * Descriptions for symbols the formula no longer mentions are kept in state
   * but not submitted, so renaming a variable and changing it back does not
   * lose what was already written.
   */
  const submittedNotes = useMemo(() => {
    const kept: Record<string, string> = {};
    for (const symbol of symbols) {
      const text = variableNotes[symbol]?.trim();
      if (text) kept[symbol] = text;
    }
    return kept;
  }, [symbols, variableNotes]);

  const describedCount = Object.keys(submittedNotes).length;

  /**
   * An example description for a symbol.
   *
   * Falls back to the base letter for subscripted names, which is where most
   * physics variables live: `v_0` has no entry of its own but `v` does, and
   * "velocity (m/s)" is a far better suggestion than a generic one.
   */
  const hintFor = (symbol: string): string => {
    const base = symbol.split("_")[0] ?? symbol;
    return hints[symbol] ?? hints[base] ?? fallbackHint;
  };

  /** Only ever reached from a Save button's onClick. */
  const submit = async (asNew: boolean) => {
    const trimmed = name.trim();
    if (!analysis) {
      setError("Write a formula first.");
      return;
    }
    if (!trimmed) {
      setError("Give the formula a name.");
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await onSave(
        {
          name: trimmed,
          note: note.trim(),
          expression: analysis.expression,
          values,
          variableNotes: submittedNotes,
          solveFor,
        },
        asNew,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const heading = existing ? "Edit formula" : step === "formula" ? "New formula" : "Describe it";

  return (
    <div className="page editor">
      <div className="page-head">
        <div>
          <h1 className="page-title">{heading}</h1>
          <p className="page-sub">
            {step === "formula"
              ? "Write a formula, then add a name and describe what each part means."
              : signedIn
                ? "Saved to your account."
                : "Saved in this browser. Sign in later to keep it across devices."}
          </p>
        </div>
      </div>

      {/* Deliberately not a <form>: implicit submission means Enter in any
          field saves, and saving should take a press of the Save button. */}
      <div className="editor-form surface">
        {step === "formula" ? (
          <section className="surface-section">
            <div className="block-head">
              <label className="label" htmlFor="editor-expression">
                Formula
              </label>
              <button
                type="button"
                className="btn btn-primary btn-small"
                disabled={!analysis}
                onClick={() => {
                  setError(null);
                  setStep("details");
                }}
              >
                Save
              </button>
            </div>

            <input
              id="editor-expression"
              className="formula-input"
              value={expression}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="E = 1/2 m v^2"
              onChange={(event) => onExpressionChange(event.target.value)}
            />

            <div className="preview preview-strip" aria-live="polite">
              {analyzeError ? (
                <span className="preview-error">{analyzeError}</span>
              ) : analysis ? (
                <MathView
                  latex={analysis.latex}
                  display
                  className={pending ? "is-stale" : undefined}
                />
              ) : (
                <span className="preview-hint">
                  Write an equation like <code>F = m a</code>, or an expression like{" "}
                  <code>1/2 m v^2</code>. Press Save to name and describe it.
                </span>
              )}
            </div>
          </section>
        ) : (
          <>
            <section className="surface-section step-formula">
              <div className="block-head">
                <span className="label">Formula</span>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setError(null);
                    setStep("formula");
                  }}
                >
                  Change
                </button>
              </div>
              <div className="preview-strip">
                {analysis ? <MathView latex={analysis.latex} display /> : <code>{expression}</code>}
              </div>
            </section>

            <section className="surface-section">
              <label className="label" htmlFor="editor-name">
                Name
              </label>
              <input
                id="editor-name"
                className="text-input"
                value={name}
                maxLength={120}
                placeholder="Kinetic energy"
                onChange={(event) => setName(event.target.value)}
              />
            </section>

            <section className="surface-section">
              <label className="label" htmlFor="editor-note">
                Description
              </label>
              <textarea
                id="editor-note"
                className="text-input"
                value={note}
                maxLength={2000}
                rows={3}
                placeholder="What this formula is for, and when to use it."
                onChange={(event) => setNote(event.target.value)}
              />
            </section>

            <section className="surface-section">
              <div className="block-head">
                <span className="label">What each part means</span>
                {symbols.length > 0 && (
                  <span className="auth-hint">
                    {describedCount} of {symbols.length} described
                  </span>
                )}
              </div>

              {symbols.length === 0 ? (
                <p className="page-sub">This formula has no variables to describe.</p>
              ) : (
                <div className="variable-grid">
                  {symbols.map((symbol) => (
                    <div key={symbol} className="variable-row">
                      <div className="variable-id">
                        <span className="variable-symbol">{symbol}</span>
                      </div>
                      <div className="variable-controls">
                        <input
                          className="variable-input note-input"
                          value={variableNotes[symbol] ?? ""}
                          maxLength={200}
                          // A concrete example beats an instruction: "e.g.
                          // velocity (m/s)" shows both the wording and the unit
                          // convention the field is asking for.
                          placeholder={`e.g. ${hintFor(symbol)}`}
                          aria-label={`Description of ${symbol}`}
                          onChange={(event) =>
                            setVariableNotes((previous) => ({
                              ...previous,
                              [symbol]: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="editor-actions">
              {error && <p className="auth-error editor-error">{error}</p>}
              {onCancel && (
                <button type="button" className="btn" onClick={onCancel}>
                  Cancel
                </button>
              )}
              {existing && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !analysis}
                  onClick={() => void submit(true)}
                >
                  Save as new
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !analysis}
                onClick={() => void submit(false)}
              >
                {busy ? "…" : existing ? "Save changes" : "Save formula"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
