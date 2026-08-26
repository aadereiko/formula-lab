import { useEffect, useRef, useState } from "react";
import type { StoredFormula } from "../useFormulaStore";

interface Props {
  expression: string;
  existing: StoredFormula | null;
  /** Explains where an unauthenticated save actually goes. */
  storageNote: string | null;
  onSave: (name: string, note: string, asNew: boolean) => Promise<void>;
  onCancel: () => void;
}

/** Name and note for a formula being saved, in a focus-trapped dialog. */
export function SaveDialog({ expression, existing, storageNote, onSave, onCancel }: Props) {
  const [name, setName] = useState(existing?.name ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameField.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const save = async (asNew: boolean) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the formula a name.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSave(trimmed, note.trim(), asNew);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void save(false);
  };

  return (
    <div className="overlay" onClick={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={existing ? "Update formula" : "Save formula"}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="dialog-title">{existing ? "Update formula" : "Save formula"}</h2>
        <code className="dialog-expression">{expression}</code>
        {storageNote && <p className="auth-hint dialog-storage">{storageNote}</p>}

        <form onSubmit={submit}>
          <label>
            Name
            <input
              ref={nameField}
              value={name}
              maxLength={120}
              placeholder="Kinetic energy"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            {/* The label is a flex column, so the caption needs to be one
                element or "optional" drops onto its own line. */}
            <span className="field-label">
              Note <span className="optional">optional</span>
            </span>
            <textarea
              value={note}
              maxLength={2000}
              rows={2}
              placeholder="What this is for"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
            {/* Editing an open formula usually means updating it, but not
                always -- a tweak worth keeping alongside the original needs a
                copy, and renaming would otherwise lose the original. */}
            {existing && (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void save(true)}
              >
                Save as new
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "…" : existing ? "Update" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
