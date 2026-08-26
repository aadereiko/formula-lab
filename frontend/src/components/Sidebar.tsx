import { useMemo, useState } from "react";
import { usePersistentState } from "../hooks";
import type { Library, LibraryFormula } from "../types";
import type { StoredFormula } from "../useFormulaStore";
import { IconPin, IconSearch } from "./icons";

interface Props {
  open: boolean;
  /** Reported by the server, so the footer states what is actually running. */
  version: string | null;
  onClose: () => void;
  library: Library | null;
  activeLibraryId: string | null;
  onPickLibrary: (formula: LibraryFormula) => void;
  libraryPinned: Set<string>;
  onToggleLibraryPin: (id: string) => void;
  saved: StoredFormula[];
  activeSavedKey: string | null;
  savedLoading: boolean;
  savedError: string | null;
  signedIn: boolean;
  onOpenSaved: (formula: StoredFormula) => void;
  onDeleteSaved: (formula: StoredFormula) => void;
  onTogglePin: (formula: StoredFormula) => void;
  onToggleHidden: (formula: StoredFormula) => void;
  onSeeAll: () => void;
  onNewFormula: () => void;
}

const UNFILED = "Other";
/** Beyond this the menu stops being a menu, so the rest goes behind a button. */
const VISIBLE_LIMIT = 10;

export function Sidebar(props: Props) {
  const {
    open,
    version,
    onClose,
    library,
    activeLibraryId,
    onPickLibrary,
    libraryPinned,
    onToggleLibraryPin,
    saved,
    activeSavedKey,
    savedLoading,
    savedError,
    signedIn,
    onOpenSaved,
    onDeleteSaved,
    onTogglePin,
    onToggleHidden,
    onSeeAll,
    onNewFormula,
  } = props;

  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  /* The library is reference material, not the work: collapsed until asked
     for, and removable outright. Both choices stick per browser. */
  const [libraryOpen, setLibraryOpen] = usePersistentState("formula-lab.library-open", false);
  const [libraryHidden, setLibraryHidden] = usePersistentState("formula-lab.library-hidden", false);

  const needle = query.trim().toLowerCase();

  /** Hidden formulas are out of the menu but still on the formulas page. */
  const visible = useMemo(() => saved.filter((formula) => !formula.hidden), [saved]);

  const pinnedLibrary = useMemo(
    () => (library?.formulas ?? []).filter((formula) => libraryPinned.has(formula.id)),
    [library, libraryPinned],
  );

  /**
   * One search across both sources.
   *
   * Somebody looking for "kinetic" does not care whether they wrote it or
   * whether it shipped with the app, so searching only the library would send
   * them to the wrong place. Their own formulas come first.
   */
  const results = useMemo(() => {
    if (!needle) return null;
    const matches = (text: string) => text.toLowerCase().includes(needle);
    return {
      own: visible.filter(
        (formula) =>
          matches(formula.name) || matches(formula.expression) || matches(formula.category),
      ),
      built: (library?.formulas ?? []).filter(
        (formula) =>
          matches(formula.name) || matches(formula.expression) || matches(formula.category),
      ),
    };
  }, [needle, visible, library]);

  /** Pinned first, then each category, then the unfiled. */
  const groups = useMemo(() => {
    const pinned = visible.filter((formula) => formula.pinned);
    const rest = visible.filter((formula) => !formula.pinned);

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
      .map(([name, items]) => ({ name, own: items, built: [] as LibraryFormula[] }));

    const unfiled = byCategory.get(UNFILED);

    return [
      ...(pinned.length > 0 || pinnedLibrary.length > 0
        ? [{ name: "Pinned", own: pinned, built: pinnedLibrary }]
        : []),
      ...named,
      ...(unfiled ? [{ name: UNFILED, own: unfiled, built: [] as LibraryFormula[] }] : []),
    ];
  }, [visible, pinnedLibrary]);

  const total = groups.reduce((sum, g) => sum + g.own.length + g.built.length, 0);
  const overflowing = !needle && total > VISIBLE_LIMIT && !expanded;

  /** Trims the groups to the first N entries without splitting a row. */
  const shown = useMemo(() => {
    if (!overflowing) return groups;
    let budget = VISIBLE_LIMIT;
    const kept: typeof groups = [];
    for (const group of groups) {
      if (budget <= 0) break;
      const built = group.built.slice(0, budget);
      budget -= built.length;
      const own = group.own.slice(0, Math.max(0, budget));
      budget -= own.length;
      if (built.length > 0 || own.length > 0) kept.push({ ...group, own, built });
    }
    return kept;
  }, [groups, overflowing]);

  const librarySections = useMemo(() => {
    if (!library) return [];
    return library.categories
      .map((category) => ({
        category,
        formulas: library.formulas.filter((formula) => formula.category === category),
      }))
      .filter((group) => group.formulas.length > 0);
  }, [library]);

  const savedRow = (formula: StoredFormula) => (
    <li key={formula.key} className={formula.key === activeSavedKey ? "is-active" : undefined}>
      <button
        type="button"
        className="saved-item"
        aria-current={formula.key === activeSavedKey}
        onClick={() => onOpenSaved(formula)}
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
      <span className="row-tools">
        <button
          type="button"
          className={`row-tool${formula.pinned ? " is-on" : ""}`}
          aria-pressed={formula.pinned}
          aria-label={formula.pinned ? `Unpin ${formula.name}` : `Pin ${formula.name}`}
          title={formula.pinned ? "Unpin" : "Pin to the top"}
          onClick={() => onTogglePin(formula)}
        >
          <IconPin size={12} filled={formula.pinned} />
        </button>
        <button
          type="button"
          className="row-tool"
          aria-label={`Hide ${formula.name} from this menu`}
          title="Hide from this menu"
          onClick={() => onToggleHidden(formula)}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M2 8s2.2-3.6 6-3.6S14 8 14 8s-2.2 3.6-6 3.6S2 8 2 8z" />
            <path d="M3 13L13 3" />
          </svg>
        </button>
        <button
          type="button"
          className="row-tool is-danger"
          aria-label={`Delete ${formula.name}`}
          title="Delete"
          onClick={() => onDeleteSaved(formula)}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.7"
              strokeLinecap="round" fill="none" />
          </svg>
        </button>
      </span>
    </li>
  );

  const libraryRow = (formula: LibraryFormula) => {
    const isPinned = libraryPinned.has(formula.id);
    return (
      <li key={formula.id} className={formula.id === activeLibraryId ? "is-active" : undefined}>
        <button
          type="button"
          className="saved-item"
          aria-label={`${formula.name}: ${formula.expression}`}
          aria-current={formula.id === activeLibraryId}
          onClick={() => onPickLibrary(formula)}
        >
          <span className="saved-name">
            {isPinned && (
              <span className="pin-marker" aria-label="Pinned">
                <IconPin size={11} filled />
              </span>
            )}
            {formula.name}
          </span>
          <code className="saved-expr">{formula.expression}</code>
        </button>
        <span className="row-tools">
          <button
            type="button"
            className={`row-tool${isPinned ? " is-on" : ""}`}
            aria-pressed={isPinned}
            aria-label={isPinned ? `Unpin ${formula.name}` : `Pin ${formula.name}`}
            title={isPinned ? "Unpin" : "Pin to the top"}
            onClick={() => onToggleLibraryPin(formula.id)}
          >
            <IconPin size={12} filled={isPinned} />
          </button>
        </span>
      </li>
    );
  };

  return (
    <>
      {open && <div className="scrim" onClick={onClose} aria-hidden="true" />}

      <aside className={`sidebar${open ? " is-open" : ""}`}>
        <div className="sidebar-scroll">
          {/* Search leads, because finding is the commonest thing anyone does
              with a menu this long. */}
          <div className="search-field">
            <IconSearch />
            <input
              className="search-input"
              value={query}
              placeholder="Search formulas"
              aria-label="Search your formulas and the library"
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                type="button"
                className="search-clear"
                aria-label="Clear the search"
                onClick={() => setQuery("")}
              >
                ×
              </button>
            )}
          </div>

          {results ? (
            <section className="side-section">
              {results.own.length > 0 && (
                <div className="library-group">
                  <h3>Yours</h3>
                  <ul className="saved-list">{results.own.map(savedRow)}</ul>
                </div>
              )}
              {results.built.length > 0 && (
                <div className="library-group">
                  <h3>Library</h3>
                  <ul className="saved-list">{results.built.map(libraryRow)}</ul>
                </div>
              )}
              {results.own.length === 0 && results.built.length === 0 && (
                <p className="side-empty">No matches for “{query}”.</p>
              )}
            </section>
          ) : (
            <>
              <section className="side-section">
                <h2 className="side-heading">Your formulas</h2>

                {savedLoading && <div className="saved-empty">Loading…</div>}
                {savedError && <div className="saved-empty is-error">{savedError}</div>}

                {!savedLoading && !savedError && total === 0 && (
                  <div className="saved-empty">
                    <button type="button" className="link" onClick={onNewFormula}>
                      Write a formula
                    </button>{" "}
                    to keep it{signedIn ? "." : " in this browser."}
                  </div>
                )}

                {shown.map((group) => (
                  <div key={group.name} className="library-group">
                    {groups.length > 1 && <h3>{group.name}</h3>}
                    <ul className="saved-list">
                      {group.built.map(libraryRow)}
                      {group.own.map(savedRow)}
                    </ul>
                  </div>
                ))}

                {overflowing && (
                  <button type="button" className="side-more" onClick={() => setExpanded(true)}>
                    Show {total - VISIBLE_LIMIT} more
                  </button>
                )}
                {!needle && expanded && total > VISIBLE_LIMIT && (
                  <button type="button" className="side-more" onClick={() => setExpanded(false)}>
                    Show fewer
                  </button>
                )}

                {total > 0 && (
                  <button type="button" className="side-link" onClick={onSeeAll}>
                    Manage formulas
                    <span aria-hidden="true">→</span>
                  </button>
                )}
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
                      <span
                        className={`disclosure-mark${libraryOpen ? " is-open" : ""}`}
                        aria-hidden="true"
                      />
                      {library ? `${library.formulas.length} built-in formulas` : "Loading…"}
                    </button>

                    {libraryOpen &&
                      librarySections.map((group) => (
                        <div key={group.category} className="library-group">
                          <h3>{group.category}</h3>
                          <ul className="saved-list">{group.formulas.map(libraryRow)}</ul>
                        </div>
                      ))}
                  </>
                )}
              </section>
            </>
          )}
        </div>

        {/* Outside `.sidebar-scroll` on purpose: a credit you have to scroll
            past the whole built-in library to reach is not a credit. */}
        <footer className="side-footer">
          <a
            className="side-credit"
            href="https://github.com/aadereiko"
            target="_blank"
            rel="noreferrer noopener"
          >
            Developed by aadereiko
          </a>
          {version && <span className="side-version">v{version}</span>}
        </footer>
      </aside>
    </>
  );
}
