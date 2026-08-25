import { useState } from "react";
import type { Capabilities } from "../types";

export function HelpPanel({ capabilities }: { capabilities: Capabilities | null }) {
  const [open, setOpen] = useState(false);
  if (!capabilities) return null;

  return (
    <section className="panel help-panel">
      <button type="button" className="help-toggle" onClick={() => setOpen(!open)}>
        {open ? "Hide" : "Show"} syntax &amp; functions
      </button>
      {open && (
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
