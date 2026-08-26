import { useEffect, useMemo, useRef, useState } from "react";
import type { FormulaDraft, StoredFormula } from "../useFormulaStore";
import { MathView } from "./MathView";

interface Props {
  expression: string;
  latex: string | null;
  symbols: string[];
  /** Example description per symbol, shown as placeholder text. */
  hints: Record<string, string>;
  fallbackHint: string;
  existing: StoredFormula | null;
  storageNote: string | null;
  onSave: (draft: Omit<FormulaDraft, "values" | "solveFor">, asNew: boolean) => Promise<void>;
  onCancel: () => void;
}

/**
 * Name, description and the meaning of each symbol.
 *
 * A dialog rather than an inline section: the workspace already lists every
 * variable once for its *value*, and a second list of the same symbols for
 * their *descriptions* directly beneath it would be genuinely confusing. This
 * keeps the formula and its values visible behind, and appears only when Save
 * is pressed.
 */
export function SaveDialog({
  expression,
  latex,
  symbols,
  hints,
  fallbackHint,
  existing,
  storageNote,
  onSave,
  onCancel,
}: Props) {
  const [name, setName] = useState(existing?.name ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [variableNotes, setVariableNotes] = useState<Record<string, string>>(
    existing?.variableNotes ?? {},
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    nameField.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
        return;
      }
      if (event.key !== "Tab" || !dialog.current) return;

      // Keep Tab inside the dialog rather than letting it walk the page behind.
      const focusable = dialog.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const submitted = useMemo(() => {
    const kept: Record<string, string> = {};
    for (const symbol of symbols) {
      const text = variableNotes[symbol]?.trim();
      if (text) kept[symbol] = text;
    }
    return kept;
  }, [symbols, variableNotes]);

  /**
   * Falls back to the base letter for subscripted names: `v_0` has no example
   * of its own but `v` does, and "velocity (m/s)" beats a generic suggestion.
   */
  const hintFor = (symbol: string): string => {
    const base = symbol.split("_")[0] ?? symbol;
    return hints[symbol] ?? hints[base] ?? fallbackHint;
  };

  const save = async (asNew: boolean) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the formula a name.");
      nameField.current?.focus();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSave({ name: trimmed, note: note.trim(), expression, variableNotes: submitted }, asNew);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const describedCount = Object.keys(submitted).length;

  return (
    <div className="overlay" onMouseDown={onCancel}>
      <div
        ref={dialog}
        className="dialog dialog-save"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <h2 className="dialog-title" id="save-title">
            {existing ? "Update formula" : "Save formula"}
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </div>

        <div className="dialog-body">
          <div className="preview-strip dialog-formula">
            {latex ? <MathView latex={latex} /> : <code>{expression}</code>}
          </div>
          {storageNote && <p className="auth-hint">{storageNote}</p>}

          <label className="field">
            <span className="label">Name</span>
            <input
              ref={nameField}
              className="text-input"
              value={name}
              maxLength={120}
              placeholder="Kinetic energy"
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="label">Description</span>
            <textarea
              className="text-input"
              value={note}
              maxLength={2000}
              rows={2}
              placeholder="What this formula is for, and when to use it."
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          {symbols.length > 0 && (
            <div className="field">
              <span className="label">
                What each part means
                <span className="auth-hint field-count">
                  {describedCount} of {symbols.length}
                </span>
              </span>
              <div className="meaning-list">
                {symbols.map((symbol) => (
                  <div key={symbol} className="meaning-row">
                    <span className="variable-symbol">{symbol}</span>
                    <input
                      className="text-input"
                      value={variableNotes[symbol] ?? ""}
                      maxLength={200}
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
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="dialog-actions">
          {error && <p className="auth-error dialog-error">{error}</p>}
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          {existing && (
            <button type="button" className="btn" disabled={busy} onClick={() => void save(true)}>
              Save as new
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void save(false)}
          >
            {busy ? "…" : existing ? "Save changes" : "Save formula"}
          </button>
        </div>
      </div>
    </div>
  );
}
