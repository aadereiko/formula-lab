import type { StoredFormula } from "../useFormulaStore";

interface Props {
  formulas: StoredFormula[];
  activeKey: string | null;
  signedIn: boolean;
  loading: boolean;
  error: string | null;
  onOpen: (formula: StoredFormula) => void;
  onDelete: (formula: StoredFormula) => void;
  onSeeAll: () => void;
  onNewFormula: () => void;
}

const PREVIEW_COUNT = 6;

export function SavedPanel({
  formulas,
  activeKey,
  signedIn,
  loading,
  error,
  onOpen,
  onDelete,
  onSeeAll,
  onNewFormula,
}: Props) {
  if (loading) return <div className="saved-empty">Loading…</div>;
  if (error) return <div className="saved-empty is-error">{error}</div>;

  if (formulas.length === 0) {
    return (
      <div className="saved-empty">
        <button type="button" className="link" onClick={onNewFormula}>
          Add a formula
        </button>{" "}
        to keep it{signedIn ? "." : " in this browser."}
      </div>
    );
  }

  const shown = formulas.slice(0, PREVIEW_COUNT);

  return (
    <>
      <ul className="saved-list">
        {shown.map((formula) => (
          <li key={formula.key} className={formula.key === activeKey ? "is-active" : undefined}>
            <button
              type="button"
              className="saved-item"
              aria-current={formula.key === activeKey}
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
      <button type="button" className="link side-link" onClick={onSeeAll}>
        {formulas.length > PREVIEW_COUNT
          ? `See all ${formulas.length}`
          : "Manage formulas"}
      </button>
    </>
  );
}
