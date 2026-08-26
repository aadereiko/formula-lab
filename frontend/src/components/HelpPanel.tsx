import { useState } from "react";
import type { Capabilities } from "../types";
import { TiltToggle } from "./TiltToggle";

interface Props {
  capabilities: Capabilities | null;
  tilt: boolean;
  onTiltChange: (next: boolean) => void;
}

export function HelpPanel({ capabilities, tilt, onTiltChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section className="block help-block">
      <div className="help-head">
        {capabilities && (
          <button type="button" className="help-toggle" onClick={() => setOpen(!open)}>
            {open ? "Hide" : "Show"} syntax &amp; functions
          </button>
        )}
        <TiltToggle enabled={tilt} onChange={onTiltChange} />
      </div>
      {open && capabilities && (
        <div className="help-body">
          <ul className="help-syntax">
            {capabilities.syntax.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="help-functions">
            {capabilities.functions.map((name) => (
              <code key={name}>{name}</code>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
