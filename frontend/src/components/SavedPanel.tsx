import type { SavedFormula } from "../types";

interface Props {
  formulas: SavedFormula[];
  activeId: number | null;
  signedIn: boolean;
  loading: boolean;
  error: string | null;
  onOpen: (formula: SavedFormula) => void;
  onDelete: (formula: SavedFormula) => void;
  onSignInPrompt: () => void;
}

export function SavedPanel({
  formulas,
  activeId,
  signedIn,
  loading,
  error,
  onOpen,
  onDelete,
  onSignInPrompt,
}: Props) {
  if (!signedIn) {
    return (
      <div className="saved-empty">
        <button type="button" className="link" onClick={onSignInPrompt}>
          Sign in
        </button>{" "}
        to save your own formulas.
      </div>
    );
  }

  if (loading) return <div className="saved-empty">Loading…</div>;
  if (error) return <div className="saved-empty is-error">{error}</div>;
  if (formulas.length === 0) {
    return <div className="saved-empty">Nothing saved yet. Write a formula and press Save.</div>;
  }

  return (
    <ul className="saved-list">
      {formulas.map((formula) => (
        <li key={formula.id} className={formula.id === activeId ? "is-active" : undefined}>
          <button
            type="button"
            className="saved-item"
            aria-current={formula.id === activeId}
            onClick={() => onOpen(formula)}
          >
            <span className="saved-name">{formula.name}</span>
            <code className="saved-expr">{formula.expression}</code>
          </button>
          <button
            type="button"
            className="saved-delete"
            aria-label={`Delete ${formula.name}`}
            title={`Delete ${formula.name}`}
            onClick={() => onDelete(formula)}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
