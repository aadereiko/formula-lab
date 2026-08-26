import type { User } from "../types";

interface Props {
  user: User;
  localCount: number;
  onMigrate: () => void;
  onSignOut: () => void;
  onClose: () => void;
}

export function AccountDialog({ user, localCount, onMigrate, onSignOut, onClose }: Props) {
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="dialog dialog-auth"
        role="dialog"
        aria-modal="true"
        aria-label="Account"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <h2 className="dialog-title">Account</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <p className="auth-signed-in">
          Signed in as <strong>{user.email}</strong>
        </p>

        {localCount > 0 && (
          <div className="migrate">
            <p>
              {localCount === 1
                ? "1 formula is saved in this browser only."
                : `${localCount} formulas are saved in this browser only.`}
            </p>
            <button type="button" className="btn btn-primary" onClick={onMigrate}>
              Move to my account
            </button>
          </div>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
