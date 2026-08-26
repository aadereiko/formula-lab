import { useMemo, useState } from "react";
import { Logo } from "../components/Logo";
import { IconEye, IconPin } from "../components/icons";
import type { StoredFormula } from "../useFormulaStore";

interface Props {
  formulas: StoredFormula[];
  loading: boolean;
  error: string | null;
  signedIn: boolean;
  limit: number;
  onOpen: (formula: StoredFormula) => void;
  onEdit: (formula: StoredFormula) => void;
  onDelete: (formula: StoredFormula) => void;
  onTogglePin: (formula: StoredFormula) => void;
  onToggleHidden: (formula: StoredFormula) => void;
  onSignIn: () => void;
  onNew: () => void;
}

export function FormulasPage({
  formulas,
  loading,
  error,
  signedIn,
  limit,
  onOpen,
  onEdit,
  onDelete,
  onTogglePin,
  onToggleHidden,
  onSignIn,
  onNew,
}: Props) {
  const [query, setQuery] = useState("");
  const [wantPinned, setWantPinned] = useState(false);
  const [wantHidden, setWantHidden] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const pinnedCount = useMemo(
    () => formulas.filter((formula) => formula.pinned).length,
    [formulas],
  );
  const hiddenCount = useMemo(
    () => formulas.filter((formula) => formula.hidden).length,
    [formulas],
  );

  // A filter is only in force while something can match it. Derived rather
  // than reset in an effect, which closes a trap: unhide your last hidden
  // formula while filtering by hidden and the chip disappears, leaving a live
  // filter with nothing left to switch it off.
  const byPinned = wantPinned && pinnedCount > 0;
  const byHidden = wantHidden && hiddenCount > 0;
  const filtering = byPinned || byHidden;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return formulas.filter((formula) => {
      if (byPinned && !formula.pinned) return false;
      if (byHidden && !formula.hidden) return false;
      if (!needle) return true;
      return (
        formula.name.toLowerCase().includes(needle) ||
        formula.expression.toLowerCase().includes(needle) ||
        formula.note.toLowerCase().includes(needle)
      );
    });
  }, [formulas, query, byPinned, byHidden]);

  // An empty page carries its own single call to action, so the header's
  // actions would only compete with it.
  const isEmpty = !loading && formulas.length === 0;

  if (isEmpty) {
    return (
      <div className="page">
        <div className="blank-slate">
          <span className="blank-mark" aria-hidden="true">
            <Logo size={40} />
          </span>
          <h1 className="blank-title">No formulas yet</h1>
          <p className="blank-text">
            Write a formula in the workspace and press Save. It will show up here.
            {!signedIn && " No account needed — it stays in this browser until you sign in."}
          </p>
          <button type="button" className="btn btn-primary" onClick={onNew}>
            Write a formula
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Your formulas</h1>
          <p className="page-sub">
            {signedIn
              ? "Saved to your account."
              : `Saved in this browser, up to ${limit}. Sign in to keep them across devices.`}
          </p>
        </div>
        <div className="page-actions">
          {!signedIn && (
            <button type="button" className="btn" onClick={onSignIn}>
              Sign in to sync
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onNew}>
            New formula
          </button>
        </div>
      </div>

      {error && <p className="banner">{error}</p>}

      {(formulas.length > 6 || pinnedCount > 0 || hiddenCount > 0) && (
        <div className="page-filters">
          {formulas.length > 6 && (
            <input
              className="search page-search"
              value={query}
              placeholder="Search your formulas"
              aria-label="Search your formulas"
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
          {/* Offered only when something would match, so a filter never
              promises a list it cannot produce. The two narrow together:
              asking for both means pinned *and* hidden. */}
          {pinnedCount > 0 && (
            <button
              type="button"
              className={`btn btn-small filter-chip${byPinned ? " is-on" : ""}`}
              aria-pressed={byPinned}
              onClick={() => setWantPinned(!wantPinned)}
            >
              <IconPin size={12} filled={byPinned} />
              Pinned
              <span className="filter-count">{pinnedCount}</span>
            </button>
          )}
          {hiddenCount > 0 && (
            <button
              type="button"
              className={`btn btn-small filter-chip${byHidden ? " is-on" : ""}`}
              aria-pressed={byHidden}
              onClick={() => setWantHidden(!wantHidden)}
            >
              <IconEye size={12} crossed />
              Hidden
              <span className="filter-count">{hiddenCount}</span>
            </button>
          )}
        </div>
      )}

      {loading && <p className="page-sub">Loading…</p>}

      {!loading && visible.length === 0 && (
        <p className="page-sub">
          {query.trim()
            ? `No matches for “${query}”${filtering ? " with these filters" : ""}.`
            : "Nothing matches these filters."}
        </p>
      )}

      <ul className="formula-list">
        {visible.map((formula) => (
          <li key={formula.key} className="formula-row">
            {/* The whole row opens the formula; the buttons beside it stop the
                click from reaching this one. */}
            <button type="button" className="formula-main" onClick={() => onOpen(formula)}>
              <span className="formula-line">
                {formula.pinned && (
                  <span className="pin-marker" aria-label="Pinned">
                    <IconPin size={12} filled />
                  </span>
                )}
                <span className="formula-name">{formula.name}</span>
                {formula.serverId === null && (
                  <span className="card-tag" title="Stored in this browser only">
                    local
                  </span>
                )}
                {formula.hidden && (
                  <span className="card-tag" title="Not shown in the sidebar menu">
                    hidden
                  </span>
                )}
                <code className="formula-expr">{formula.expression}</code>
              </span>
              {formula.note && <span className="formula-note">{formula.note}</span>}
            </button>

            <span className="formula-actions">
              {confirming === formula.key ? (
                <>
                  <button
                    type="button"
                    className="btn btn-small btn-danger"
                    onClick={() => {
                      setConfirming(null);
                      onDelete(formula);
                    }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => setConfirming(null)}
                  >
                    Keep
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={`btn btn-small btn-icon${formula.pinned ? " is-on" : ""}`}
                    aria-pressed={formula.pinned}
                    aria-label={formula.pinned ? `Unpin ${formula.name}` : `Pin ${formula.name}`}
                    title={formula.pinned ? "Unpin" : "Pin to the top"}
                    onClick={() => onTogglePin(formula)}
                  >
                    <IconPin filled={formula.pinned} />
                  </button>
                  <button
                    type="button"
                    className={`btn btn-small btn-icon${formula.hidden ? " is-on" : ""}`}
                    aria-pressed={formula.hidden}
                    aria-label={
                      formula.hidden
                        ? `Show ${formula.name} in the menu`
                        : `Hide ${formula.name} from the menu`
                    }
                    title={formula.hidden ? "Show in the menu" : "Hide from the menu"}
                    onClick={() => onToggleHidden(formula)}
                  >
                    <IconEye crossed={formula.hidden} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => onEdit(formula)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => setConfirming(formula.key)}
                  >
                    Delete
                  </button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
