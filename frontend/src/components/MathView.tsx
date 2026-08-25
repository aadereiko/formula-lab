import { useEffect, useRef } from "react";
import katex from "katex";

interface Props {
  latex: string;
  display?: boolean;
  className?: string;
}

/**
 * Renders a LaTeX string produced by SymPy.
 *
 * `throwOnError: false` matters: SymPy can emit constructs KaTeX does not
 * implement, and a maths-rendering gap should degrade to visible source text
 * rather than take down the React tree.
 */
export function MathView({ latex, display = false, className }: Props) {
  const host = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!host.current) return;
    katex.render(latex, host.current, {
      displayMode: display,
      throwOnError: false,
      errorColor: "#b45309",
      output: "html",
    });
  }, [latex, display]);

  return <span ref={host} className={className} aria-label={latex} />;
}
