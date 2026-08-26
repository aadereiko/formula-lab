interface Props {
  enabled: boolean;
  onChange: (next: boolean) => void;
}

/** Turns the 3D hover effects off without touching the code. */
export function TiltToggle({ enabled, onChange }: Props) {
  return (
    <div className="setting-row">
      <span className="setting-label">3D hover</span>
      <button
        type="button"
        className={`switch${enabled ? " is-on" : ""}`}
        role="switch"
        aria-checked={enabled}
        aria-label="3D hover effects"
        onClick={() => onChange(!enabled)}
      >
        <span className="switch-knob" aria-hidden="true" />
      </button>
      <span className="setting-state">{enabled ? "on" : "off"}</span>
    </div>
  );
}
