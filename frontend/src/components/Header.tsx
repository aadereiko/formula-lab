import type { Route } from "../useRoute";
import type { User } from "../types";
import type { Theme } from "../useTheme";
import { CubeGlyph } from "./CubeGlyph";
import { CubeMark } from "./CubeMark";
import { ThemeSwitch } from "./ThemeSwitch";

interface Props {
  user: User | null;
  checking: boolean;
  menuOpen: boolean;
  showMenu: boolean;
  route: Route;
  savedCount: number;
  theme: Theme;
  nextTheme: Theme;
  onCycleTheme: () => void;
  onNavigate: (next: Route) => void;
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
  theme,
  nextTheme,
  onCycleTheme,
  onNavigate,
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
        <CubeMark size={16} />
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
        <button
          type="button"
          className={`nav-link${route === "constants" ? " is-active" : ""}`}
          aria-current={route === "constants"}
          onClick={() => onNavigate("constants")}
        >
          Constants
        </button>
      </nav>

      <div className="header-end">
        <ThemeSwitch theme={theme} next={nextTheme} onCycle={onCycleTheme} />
        <button
          type="button"
          className={`account-btn${user ? "" : " is-invitation"}`}
          onClick={onAccount}
        >
          {checking ? (
            "…"
          ) : user ? (
            <>
              <CubeGlyph solid />
              {shortEmail(user.email)}
            </>
          ) : (
            <>
              <CubeGlyph />
              Sign in
            </>
          )}
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
