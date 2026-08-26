import type { Route } from "../useRoute";
import type { User } from "../types";
import { Logo } from "./Logo";

interface Props {
  user: User | null;
  checking: boolean;
  menuOpen: boolean;
  showMenu: boolean;
  route: Route;
  savedCount: number;
  onNavigate: (next: Route) => void;
  onNewFormula: () => void;
  onToggleMenu: () => void;
  onAccount: () => void;
}

export function Header({
  user,
  checking,
  menuOpen,
  showMenu,
  route,
  savedCount,
  onNavigate,
  onNewFormula,
  onToggleMenu,
  onAccount,
}: Props) {
  return (
    <header className="header">
      {showMenu && (
        <button
          type="button"
          className="icon-btn menu-btn"
          aria-label={menuOpen ? "Close formula list" : "Open formula list"}
          aria-expanded={menuOpen}
          onClick={onToggleMenu}
        >
          <span className="menu-icon" aria-hidden="true" />
        </button>
      )}

      <button type="button" className="brand" onClick={() => onNavigate("home")}>
        <Logo size={20} />
        <span className="brand-name">Formula Lab</span>
      </button>

      <nav className="nav">
        <button
          type="button"
          className={`nav-link${route === "home" ? " is-active" : ""}`}
          aria-current={route === "home"}
          onClick={() => onNavigate("home")}
        >
          Workspace
        </button>
        <button
          type="button"
          className={`nav-link${route === "formulas" ? " is-active" : ""}`}
          aria-current={route === "formulas"}
          onClick={() => onNavigate("formulas")}
        >
          My formulas
          {savedCount > 0 && <span className="nav-count">{savedCount}</span>}
        </button>
      </nav>

      <div className="header-end">
        <button type="button" className="btn btn-small" onClick={onNewFormula}>
          New
        </button>
        <button type="button" className="account-btn" onClick={onAccount}>
          {checking ? "…" : user ? shortEmail(user.email) : "Sign in"}
        </button>
      </div>
    </header>
  );
}

/** Keeps a long address from pushing the header around on a phone. */
function shortEmail(email: string): string {
  const [name = ""] = email.split("@");
  return name.length > 12 ? `${name.slice(0, 11)}…` : name;
}
