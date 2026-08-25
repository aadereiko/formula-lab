import type { User } from "../types";

interface Props {
  user: User | null;
  checking: boolean;
  onToggleMenu: () => void;
  onAccount: () => void;
  menuOpen: boolean;
}

export function Header({ user, checking, onToggleMenu, onAccount, menuOpen }: Props) {
  return (
    <header className="header">
      <button
        type="button"
        className="icon-btn menu-btn"
        aria-label={menuOpen ? "Close formula list" : "Open formula list"}
        aria-expanded={menuOpen}
        onClick={onToggleMenu}
      >
        <span className="menu-icon" aria-hidden="true" />
      </button>

      <span className="brand">Formula Lab</span>

      <button type="button" className="account-btn" onClick={onAccount}>
        {checking ? "…" : user ? shortEmail(user.email) : "Sign in"}
      </button>
    </header>
  );
}

/** Keeps a long address from pushing the header around on a phone. */
function shortEmail(email: string): string {
  const [name = ""] = email.split("@");
  return name.length > 12 ? `${name.slice(0, 11)}…` : name;
}
