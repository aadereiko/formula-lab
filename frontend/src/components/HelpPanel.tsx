import { useState } from "react";
import type { Capabilities } from "../types";

/** Renders the backtick spans the API sends as real code, the way the rest of
 *  the app writes inline code. Splitting on the delimiter puts every odd
 *  segment inside a pair of backticks, so the index carries the markup. */
function withCode(line: string) {
  return line.split("`").map((part, i) =>
    i % 2 === 1 ? <code key={i}>{part}</code> : <span key={i}>{part}</span>,
  );
}

export function HelpPanel({ capabilities }: { capabilities: Capabilities | null }) {
  const [open, setOpen] = useState(false);
  if (!capabilities) return null;

  return (
    <section className="block">
      <button type="button" className="help-toggle" onClick={() => setOpen(!open)}>
        {open ? "Hide" : "Show"} syntax &amp; functions
      </button>
      {open && (
        <div className="help-body help-note">
          <ul className="help-syntax">
            {capabilities.syntax.map((line) => (
              <li key={line}>{withCode(line)}</li>
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
