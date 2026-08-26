interface Props {
  /** Functions the formula calls, from the parser. */
  functions: string[];
  functionHelp: Record<string, string>;
}

/**
 * Which functions the formula just called, and what they do.
 *
 * A text input cannot be hovered token by token, so rather than annotating
 * inside the field the recognised calls are listed beneath it, each carrying
 * its explanation as a tooltip.
 *
 * Constants are deliberately absent. Every constant the formula mentions
 * already has a row in the panel below with a chip offering its value, and that
 * chip is where the explanation belongs: it is the place you act on the number,
 * so it is the place worth reading. Repeating it here was two hints for one
 * fact. A function has no such row, which is why these stayed.
 */
export function FormulaLegend({ functions, functionHelp }: Props) {
  const named = functions.filter((name) => functionHelp[name]);
  if (named.length === 0) return null;

  return (
    <div className="legend">
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
