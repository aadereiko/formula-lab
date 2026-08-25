import { useMemo, useState } from "react";
import type { Library, LibraryFormula } from "../types";

interface Props {
  library: Library | null;
  activeId: string | null;
  onPick: (formula: LibraryFormula) => void;
}

export function LibraryPanel({ library, activeId, onPick }: Props) {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    if (!library) return [];
    const needle = query.trim().toLowerCase();
    const matches = library.formulas.filter(
      (formula) =>
        !needle ||
        formula.name.toLowerCase().includes(needle) ||
        formula.expression.toLowerCase().includes(needle) ||
        formula.category.toLowerCase().includes(needle),
    );
    return library.categories
      .map((category) => ({
        category,
        formulas: matches.filter((formula) => formula.category === category),
      }))
      .filter((group) => group.formulas.length > 0);
  }, [library, query]);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <h1 className="brand">
          Formula<span>Lab</span>
        </h1>
        <input
          className="search"
          value={query}
          placeholder="Search formulas"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <nav className="library">
        {grouped.map((group) => (
          <div key={group.category} className="library-group">
            <h2>{group.category}</h2>
            <ul>
              {group.formulas.map((formula) => (
                <li key={formula.id}>
                  <button
                    type="button"
                    className={`library-item${formula.id === activeId ? " is-active" : ""}`}
                    // The visible label is split across two elements, which
                    // leaves the button without a usable accessible name.
                    aria-label={`${formula.name}: ${formula.expression}`}
                    aria-current={formula.id === activeId}
                    onClick={() => onPick(formula)}
                  >
                    <span className="library-name">{formula.name}</span>
                    <code className="library-expr">{formula.expression}</code>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {library && grouped.length === 0 && (
          <p className="library-empty">No formulas match “{query}”.</p>
        )}
        {!library && <p className="library-empty">Loading library…</p>}
      </nav>
    </aside>
  );
}
