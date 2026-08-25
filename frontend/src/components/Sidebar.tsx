import { useMemo, useState } from "react";
import type { LibraryFormula, Library, SavedFormula } from "../types";
import { SavedPanel } from "./SavedPanel";

interface Props {
  open: boolean;
  onClose: () => void;
  library: Library | null;
  activeLibraryId: string | null;
  onPickLibrary: (formula: LibraryFormula) => void;
  saved: SavedFormula[];
  activeSavedId: number | null;
  savedLoading: boolean;
  savedError: string | null;
  signedIn: boolean;
  onOpenSaved: (formula: SavedFormula) => void;
  onDeleteSaved: (formula: SavedFormula) => void;
  onSignInPrompt: () => void;
}

export function Sidebar({
  open,
  onClose,
  library,
  activeLibraryId,
  onPickLibrary,
  saved,
  activeSavedId,
  savedLoading,
  savedError,
  signedIn,
  onOpenSaved,
  onDeleteSaved,
  onSignInPrompt,
}: Props) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
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
    <>
      {/* Only rendered on small screens, where the sidebar is an overlay. */}
      {open && <div className="scrim" onClick={onClose} aria-hidden="true" />}

      <aside className={`sidebar${open ? " is-open" : ""}`}>
        <div className="sidebar-scroll">
          <section className="side-section">
            <h2 className="side-heading">Your formulas</h2>
            <SavedPanel
              formulas={saved}
              activeId={activeSavedId}
              signedIn={signedIn}
              loading={savedLoading}
              error={savedError}
              onOpen={onOpenSaved}
              onDelete={onDeleteSaved}
              onSignInPrompt={onSignInPrompt}
            />
          </section>

          <section className="side-section">
            <h2 className="side-heading">Library</h2>
            <input
              className="search"
              value={query}
              placeholder="Search"
              aria-label="Search the formula library"
              onChange={(event) => setQuery(event.target.value)}
            />

            {groups.map((group) => (
              <div key={group.category} className="library-group">
                <h3>{group.category}</h3>
                <ul>
                  {group.formulas.map((formula) => (
                    <li key={formula.id}>
                      <button
                        type="button"
                        className={`library-item${formula.id === activeLibraryId ? " is-active" : ""}`}
                        aria-label={`${formula.name}: ${formula.expression}`}
                        aria-current={formula.id === activeLibraryId}
                        onClick={() => onPickLibrary(formula)}
                      >
                        <span className="library-name">{formula.name}</span>
                        <code className="library-expr">{formula.expression}</code>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {library && groups.length === 0 && (
              <p className="side-empty">No matches for “{query}”.</p>
            )}
            {!library && <p className="side-empty">Loading…</p>}
          </section>
        </div>
      </aside>
    </>
  );
}
