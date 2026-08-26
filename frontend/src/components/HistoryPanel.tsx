import type { HistoryEntry } from "../types";

interface Props {
  entries: HistoryEntry[];
  onRestore: (entry: HistoryEntry) => void;
  onClear: () => void;
}

export function HistoryPanel({ entries, onRestore, onClear }: Props) {
  if (entries.length === 0) return null;

  return (
    <section className="block">
      <div className="block-head">
        <span className="label">Recent</span>
        <button type="button" className="ghost-btn" onClick={onClear}>
          Clear
        </button>
      </div>
      <ul className="history-list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button type="button" className="history-item" onClick={() => onRestore(entry)}>
              <code>{entry.expression}</code>
              <span className="history-result">
                {entry.resultLabel} = {entry.resultValue}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
