import { useMemo, useState } from "react";
import { usePersistentState } from "../hooks";
import type { LibraryFormula, Library } from "../types";
import type { StoredFormula } from "../useFormulaStore";
import { SavedPanel } from "./SavedPanel";

interface Props {
  open: boolean;
  onClose: () => void;
  library: Library | null;
  activeLibraryId: string | null;
  onPickLibrary: (formula: LibraryFormula) => void;
  saved: StoredFormula[];
  activeSavedKey: string | null;
  savedLoading: boolean;
  savedError: string | null;
  signedIn: boolean;
  onOpenSaved: (formula: StoredFormula) => void;
  onDeleteSaved: (formula: StoredFormula) => void;
  onTogglePin: (formula: StoredFormula) => void;
  onSeeAll: () => void;
  onNewFormula: () => void;
}

export function Sidebar({
  open,
  onClose,
  library,
  activeLibraryId,
  onPickLibrary,
  saved,
  activeSavedKey,
  savedLoading,
  savedError,
  signedIn,
  onOpenSaved,
  onDeleteSaved,
  onTogglePin,
  onSeeAll,
  onNewFormula,
}: Props) {
  const [query, setQuery] = useState("");
  /* The library is reference material, not the work: collapsed until asked for,
     and removable outright for anyone who never wants it. Both choices stick. */
  const [libraryOpen, setLibraryOpen] = usePersistentState("formula-lab.library-open", false);
  const [libraryHidden, setLibraryHidden] = usePersistentState("formula-lab.library-hidden", false);

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
              activeKey={activeSavedKey}
              signedIn={signedIn}
              loading={savedLoading}
              error={savedError}
              onOpen={onOpenSaved}
              onDelete={onDeleteSaved}
              onTogglePin={onTogglePin}
              onSeeAll={onSeeAll}
              onNewFormula={onNewFormula}
            />
          </section>

          <section className="side-section">
            <div className="side-section-head">
              <h2 className="side-heading">Library</h2>
              <button
                type="button"
                className="side-toggle"
                aria-pressed={!libraryHidden}
                title={libraryHidden ? "Show the built-in library" : "Hide the built-in library"}
                onClick={() => setLibraryHidden(!libraryHidden)}
              >
                {libraryHidden ? "show" : "hide"}
              </button>
            </div>

            {!libraryHidden && (
              <>
                <button
                  type="button"
                  className="side-disclosure"
                  aria-expanded={libraryOpen}
                  onClick={() => setLibraryOpen(!libraryOpen)}
                >
                  <span className={`disclosure-mark${libraryOpen ? " is-open" : ""}`} aria-hidden="true" />
                  {library ? `${library.formulas.length} built-in formulas` : "Loading…"}
                </button>

                {libraryOpen && (
                  <>
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
                  </>
                )}
              </>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
