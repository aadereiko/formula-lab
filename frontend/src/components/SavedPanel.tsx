import type { StoredFormula } from "../useFormulaStore";
import { IconPin } from "./icons";

interface Props {
  formulas: StoredFormula[];
  activeKey: string | null;
  signedIn: boolean;
  loading: boolean;
  error: string | null;
  onOpen: (formula: StoredFormula) => void;
  onDelete: (formula: StoredFormula) => void;
  onTogglePin: (formula: StoredFormula) => void;
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
  onTogglePin,
  onSeeAll,
  onNewFormula,
}: Props) {
  if (loading) return <div className="saved-empty">Loading…</div>;
  if (error) return <div className="saved-empty is-error">{error}</div>;

  if (formulas.length === 0) {
    return (
      <div className="saved-empty">
        <button type="button" className="link" onClick={onNewFormula}>
          Write a formula
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
              <span className="saved-name">
                {formula.pinned && (
                  <span className="pin-marker" aria-label="Pinned">
                    <IconPin size={11} filled />
                  </span>
                )}
                {formula.name}
              </span>
              <code className="saved-expr">{formula.expression}</code>
            </button>
            <button
              type="button"
              className={`saved-pin${formula.pinned ? " is-on" : ""}`}
              aria-pressed={formula.pinned}
              aria-label={formula.pinned ? `Unpin ${formula.name}` : `Pin ${formula.name}`}
              title={formula.pinned ? "Unpin" : "Pin to the top"}
              onClick={() => onTogglePin(formula)}
            >
              <IconPin size={12} filled={formula.pinned} />
            </button>
            <button
              type="button"
              className="saved-delete"
              aria-label={`Delete ${formula.name}`}
              title={`Delete ${formula.name}`}
              onClick={() => onDelete(formula)}
            >
              <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="side-link" onClick={onSeeAll}>
        {formulas.length > PREVIEW_COUNT ? `See all ${formulas.length}` : "Manage formulas"}
        <span aria-hidden="true">→</span>
      </button>
    </>
  );
}
