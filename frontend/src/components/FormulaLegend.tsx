import type { Constant } from "../types";

interface Props {
  /** Variables the formula mentions, from the parser. */
  symbols: string[];
  /** Functions it calls, from the parser. */
  functions: string[];
  constants: Constant[];
  functionHelp: Record<string, string>;
}

/** Compact enough to read: 6.674e-11 rather than 0.0000000000667. */
function formatValue(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude < 1e-4 || magnitude >= 1e7)) {
    return value.toExponential(4).replace(/e([+-])(\d)$/, "e$10$2");
  }
  return String(value);
}

/**
 * What the app recognised in the formula just written.
 *
 * A text input cannot be hovered token by token, so rather than trying to
 * annotate inside the field, the recognised pieces are listed beneath it: any
 * symbol that is a known constant, and any function that was called. Each
 * carries the full explanation as a tooltip, so the strip stays short while the
 * detail is one hover away.
 *
 * Only recognised things appear. An ordinary variable is not listed, because
 * there is nothing to say about it that the formula does not already say.
 */
export function FormulaLegend({ symbols, functions, constants, functionHelp }: Props) {
  const known = new Map(constants.map((constant) => [constant.symbol, constant]));

  const matched = symbols
    .map((symbol) => known.get(symbol))
    .filter((constant): constant is Constant => constant !== undefined);

  const named = functions.filter((name) => functionHelp[name]);

  if (matched.length === 0 && named.length === 0) return null;

  return (
    <div className="legend">
      {matched.map((constant) => (
        <span
          key={constant.symbol}
          className="legend-chip is-constant"
          data-tip={`${constant.name} = ${constant.value} ${constant.unit}`.trim()}
          tabIndex={0}
        >
          <code>{constant.symbol}</code>
          <span className="legend-value">
            {formatValue(constant.value)}
            {constant.unit && <span className="legend-unit">{constant.unit}</span>}
          </span>
        </span>
      ))}

      {named.map((name) => (
        <span
          key={name}
          className="legend-chip is-function"
          data-tip={functionHelp[name]}
          tabIndex={0}
        >
          <code>{name}</code>
        </span>
      ))}
    </div>
  );
}
