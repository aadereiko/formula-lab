import { useMemo } from "react";
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

const UNFILED = "Other";

/**
 * Groups the user's own formulas the way the built-in library groups its own.
 *
 * Pinned ones come out into a group of their own first: a pin means "I want
 * this to hand", which a category would otherwise bury. Everything else is
 * filed under its category, with the unfiled last — a category called "Other"
 * at the top would be the least useful heading on the screen.
 */
function group(formulas: StoredFormula[]): { name: string; items: StoredFormula[] }[] {
  const pinned = formulas.filter((formula) => formula.pinned);
  const rest = formulas.filter((formula) => !formula.pinned);

  const byCategory = new Map<string, StoredFormula[]>();
  for (const formula of rest) {
    const name = formula.category.trim() || UNFILED;
    const bucket = byCategory.get(name);
    if (bucket) bucket.push(formula);
    else byCategory.set(name, [formula]);
  }

  const named = [...byCategory.entries()]
    .filter(([name]) => name !== UNFILED)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, items]) => ({ name, items }));

  const unfiled = byCategory.get(UNFILED);

  return [
    ...(pinned.length > 0 ? [{ name: "Pinned", items: pinned }] : []),
    ...named,
    ...(unfiled ? [{ name: UNFILED, items: unfiled }] : []),
  ];
}

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
  const groups = useMemo(() => group(formulas), [formulas]);

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

  return (
    <>
      {groups.map((section) => (
        <div key={section.name} className="library-group">
          {/* One group needs no heading: a lone "Other" says nothing. */}
          {groups.length > 1 && <h3>{section.name}</h3>}
          <ul className="saved-list">
            {section.items.map((formula) => (
              <li
                key={formula.key}
                className={formula.key === activeKey ? "is-active" : undefined}
              >
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
        </div>
      ))}

      <button type="button" className="side-link" onClick={onSeeAll}>
        Manage formulas
        <span aria-hidden="true">→</span>
      </button>
    </>
  );
}
