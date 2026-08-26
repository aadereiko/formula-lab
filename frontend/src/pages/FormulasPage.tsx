import { useMemo, useState } from "react";
import { MathView } from "../components/MathView";
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
  onSignIn,
  onNew,
}: Props) {
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return formulas;
    return formulas.filter(
      (formula) =>
        formula.name.toLowerCase().includes(needle) ||
        formula.expression.toLowerCase().includes(needle) ||
        formula.note.toLowerCase().includes(needle),
    );
  }, [formulas, query]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Your formulas</h1>
          <p className="page-sub">
            {signedIn
              ? "Saved to your account."
              : `Saved in this browser (up to ${limit}). Nobody else can see them, and clearing site data removes them.`}
          </p>
        </div>
        <div className="page-actions">
          {!signedIn && formulas.length > 0 && (
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

      {formulas.length > 4 && (
        <input
          className="search page-search"
          value={query}
          placeholder="Search your formulas"
          aria-label="Search your formulas"
          onChange={(event) => setQuery(event.target.value)}
        />
      )}

      {loading && <p className="page-empty">Loading…</p>}

      {!loading && formulas.length === 0 && (
        <div className="page-empty">
          <p>Nothing saved yet.</p>
          <p className="auth-hint">
            Write a formula on the calculator and press Save.
            {!signedIn &&
              " You do not need an account \u2014 formulas are kept in this browser until you sign in."}
          </p>
          <button type="button" className="btn btn-primary" onClick={onNew}>
            Go to the calculator
          </button>
        </div>
      )}

      {!loading && formulas.length > 0 && visible.length === 0 && (
        <p className="page-empty">No matches for “{query}”.</p>
      )}

      <ul className="cards">
        {visible.map((formula) => {
          const entries = Object.entries(formula.values);
          return (
            <li key={formula.key} className="card">
              <div className="card-head">
                <h2 className="card-name">{formula.name}</h2>
                {formula.serverId === null && (
                  <span className="card-tag" title="Stored in this browser only">
                    local
                  </span>
                )}
              </div>

              <div className="card-math preview-strip">
                <MathView latex={latexish(formula.expression)} />
              </div>
              <code className="card-source">{formula.expression}</code>

              {formula.note && <p className="card-note">{formula.note}</p>}

              {Object.keys(formula.variableNotes ?? {}).length > 0 && (
                <dl className="card-legend">
                  {Object.entries(formula.variableNotes).map(([symbol, meaning]) => (
                    <div key={symbol}>
                      <dt>{symbol}</dt>
                      <dd>{meaning}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {entries.length > 0 && (
                <dl className="card-values">
                  {entries.map(([name, value]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <div className="card-actions">
                <button type="button" className="btn btn-small" onClick={() => onOpen(formula)}>
                  Open
                </button>
                <button type="button" className="btn btn-small" onClick={() => onEdit(formula)}>
                  Edit
                </button>
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
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => setConfirming(formula.key)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * A rough source-to-LaTeX pass for the card previews.
 *
 * The authoritative rendering comes from SymPy via /api/analyze, but that is one
 * request per card. These previews are decorative, so a few substitutions are
 * enough — and MathView falls back to showing the source if KaTeX cannot parse
 * the result.
 */
function latexish(expression: string): string {
  return expression
    .replace(/\*\*/g, "^")
    .replace(/\*/g, " \\cdot ")
    .replace(/\b(alpha|beta|gamma|delta|theta|lambda|mu|pi|rho|sigma|tau|phi|omega|eta)\b/g, "\\$1")
    .replace(/\b(sin|cos|tan|log|exp|sqrt)\b/g, "\\$1");
}
