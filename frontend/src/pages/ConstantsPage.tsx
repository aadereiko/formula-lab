import { useMemo, useState } from "react";
import { formatExact } from "../format";
import type { Constant } from "../types";
import type { ConstantDraft, StoredConstant } from "../useConstantStore";
import { Tag } from "../components/Tag";

interface Props {
  own: StoredConstant[];
  builtIn: Constant[];
  loading: boolean;
  error: string | null;
  signedIn: boolean;
  limit: number;
  onSave: (draft: ConstantDraft, editing: StoredConstant | null) => Promise<void>;
  onDelete: (constant: StoredConstant) => void;
  onSignIn: () => void;
}

const EMPTY: ConstantDraft = { symbol: "", value: 0, name: "", unit: "" };

export function ConstantsPage({
  own,
  builtIn,
  loading,
  error,
  signedIn,
  limit,
  onSave,
  onDelete,
  onSignIn,
}: Props) {
  const [draft, setDraft] = useState<ConstantDraft & { valueText: string }>({
    ...EMPTY,
    valueText: "",
  });
  const [editing, setEditing] = useState<StoredConstant | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const shadowed = useMemo(
    () => new Set(own.map((constant) => constant.symbol)),
    [own],
  );

  const visibleBuiltIn = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return builtIn;
    return builtIn.filter(
      (constant) =>
        constant.symbol.toLowerCase().includes(needle) ||
        constant.name.toLowerCase().includes(needle),
    );
  }, [builtIn, query]);

  const reset = () => {
    setDraft({ ...EMPTY, valueText: "" });
    setEditing(null);
    setFormError(null);
  };

  const submit = async () => {
    const value = Number(draft.valueText.trim());
    if (!draft.valueText.trim() || Number.isNaN(value)) {
      setFormError("Give the constant a numeric value.");
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      await onSave(
        { symbol: draft.symbol, value, name: draft.name, unit: draft.unit },
        editing,
      );
      reset();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (constant: StoredConstant) => {
    setEditing(constant);
    setDraft({
      symbol: constant.symbol,
      value: constant.value,
      name: constant.name,
      unit: constant.unit,
      valueText: String(constant.value),
    });
    setFormError(null);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Constants</h1>
          <p className="page-sub">
            Whenever a formula names one of these symbols, its value is offered as a
            one-click fill.{" "}
            {signedIn
              ? "Your own are saved to your account."
              : `Your own are saved in this browser, up to ${limit}.`}
          </p>
        </div>
        {!signedIn && own.length > 0 && (
          <div className="page-actions">
            <button type="button" className="btn" onClick={onSignIn}>
              Sign in to sync
            </button>
          </div>
        )}
      </div>

      {error && <p className="banner">{error}</p>}

      <section className="constants-section">
        <h2 className="side-heading">{editing ? "Edit constant" : "Add a constant"}</h2>
        <div className="constant-form surface">
          <div className="constant-fields">
            <label className="field">
              <span className="label">Symbol</span>
              <input
                className="text-input mono-input"
                value={draft.symbol}
                maxLength={32}
                placeholder="rho_steel"
                onChange={(event) => setDraft({ ...draft, symbol: event.target.value })}
              />
            </label>
            <label className="field">
              <span className="label">Value</span>
              <input
                className="text-input mono-input"
                value={draft.valueText}
                inputMode="decimal"
                maxLength={32}
                placeholder="7850"
                onChange={(event) => setDraft({ ...draft, valueText: event.target.value })}
              />
            </label>
            <label className="field">
              <span className="label">Unit</span>
              <input
                className="text-input"
                value={draft.unit}
                maxLength={40}
                placeholder="kg/m³"
                onChange={(event) => setDraft({ ...draft, unit: event.target.value })}
              />
            </label>
            <label className="field field-wide">
              <span className="label">Name</span>
              <input
                className="text-input"
                value={draft.name}
                maxLength={120}
                placeholder="Density of steel"
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
          </div>

          <div className="constant-form-actions">
            {formError && <p className="auth-error dialog-error">{formError}</p>}
            {editing && (
              <button type="button" className="btn" onClick={reset}>
                Cancel
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? "…" : editing ? "Save changes" : "Add constant"}
            </button>
          </div>
        </div>
      </section>

      <section className="constants-section">
        <h2 className="side-heading">Your constants</h2>
        {loading && <p className="page-sub">Loading…</p>}
        {!loading && own.length === 0 && (
          <p className="page-sub">
            None yet. Add the values you keep reusing — a material density, a rig
            dimension, a coefficient.
          </p>
        )}
        <ul className="constant-list">
          {own.map((constant) => (
            <li key={constant.key} className="constant-row">
              <code className="constant-symbol">{constant.symbol}</code>
              <span className="constant-value">{formatExact(constant.value)}</span>
              <span className="constant-unit">{constant.unit}</span>
              <span className="constant-name">{constant.name}</span>
              <span className="constant-actions">
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => startEdit(constant)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="icon-btn remove-btn"
                  aria-label={`Delete ${constant.symbol}`}
                  title={`Delete ${constant.symbol}`}
                  onClick={() => onDelete(constant)}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="constants-section">
        <div className="block-head">
          <h2 className="side-heading">Built in</h2>
          <input
            className="search constants-search"
            value={query}
            placeholder="Search"
            aria-label="Search built-in constants"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <ul className="constant-list is-readonly">
          {visibleBuiltIn.map((constant) => (
            <li key={constant.symbol} className="constant-row">
              <code className="constant-symbol">{constant.symbol}</code>
              <span className="constant-value">{formatExact(constant.value)}</span>
              <span className="constant-unit">{constant.unit}</span>
              <span className="constant-name">
                {constant.name}
                {shadowed.has(constant.symbol) && (
                  <Tag label="replaced by yours" title="Your value is used instead of the built-in one" />
                )}
              </span>
            </li>
          ))}
        </ul>
        {visibleBuiltIn.length === 0 && <p className="page-sub">No matches for “{query}”.</p>}
      </section>
    </div>
  );
}
