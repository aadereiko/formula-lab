/**
 * A tree as LaTeX, so the rendered preview survives losing the network.
 *
 * The server sends LaTeX with every response and KaTeX draws it, so without
 * this the formula would fall back to plain text the moment the connection
 * dropped -- the most visible part of the app going first.
 *
 * Deliberately not a general pretty-printer. It reproduces what SymPy emits for
 * the shapes this app deals in: fractions stacked, powers raised, subscripts
 * after an underscore, Greek names as Greek letters.
 */

import { type Node } from "./parse";

/** Names SymPy renders as symbols rather than as letters. */
const GREEK = new Set([
  "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota",
  "kappa", "lambda", "mu", "nu", "xi", "omicron", "pi", "rho", "sigma", "tau",
  "upsilon", "phi", "chi", "psi", "omega", "Gamma", "Delta", "Theta", "Lambda",
  "Xi", "Pi", "Sigma", "Phi", "Psi", "Omega",
]);

/** `v_0` becomes `v_{0}`, and a Greek name becomes its letter. */
function symbolLatex(name: string): string {
  const [head, ...rest] = name.split("_");
  const base = GREEK.has(head as string) ? `\\${head}` : (head as string);
  return rest.length ? `${base}_{${rest.join("\\_")}}` : base;
}

/** Precedence, so parentheses appear exactly where they are needed. */
const RANK: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 4 };

function rank(node: Node): number {
  if (node.kind === "binary") return RANK[node.op] as number;
  if (node.kind === "neg") return 1;
  return 5;
}

function wrap(node: Node, minimum: number): string {
  const text = toLatex(node);
  return rank(node) < minimum ? `\\left(${text}\\right)` : text;
}

export function toLatex(node: Node): string {
  switch (node.kind) {
    case "number":
      return formatNumber(node.value);
    case "symbol":
      return symbolLatex(node.name);
    case "call": {
      const args = node.args.map(toLatex).join(", ");
      if (node.name === "sqrt") return `\\sqrt{${args}}`;
      if (node.name === "cbrt") return `\\sqrt[3]{${args}}`;
      if (node.name === "abs" || node.name === "Abs") return `\\left|${args}\\right|`;
      if (node.name === "ln" || node.name === "log") return `\\log{\\left(${args}\\right)}`;
      if (node.name === "factorial") return `${wrap(node.args[0] as Node, 5)}!`;
      return `\\${node.name}{\\left(${args}\\right)}`;
    }
    case "neg":
      return `- ${wrap(node.operand, 2)}`;
    case "binary":
      switch (node.op) {
        case "+":
          return `${wrap(node.left, 1)} + ${wrap(node.right, 1)}`;
        case "-":
          return `${wrap(node.left, 1)} - ${wrap(node.right, 2)}`;
        case "*":
          // No `\cdot`: SymPy sets a product as juxtaposition, and `F = m a`
          // reads better than `F = m \cdot a`.
          return `${wrap(node.left, 2)} ${wrap(node.right, 2)}`;
        case "/":
          return `\\frac{${toLatex(node.left)}}{${toLatex(node.right)}}`;
        case "^":
          return `${wrap(node.left, 5)}^{${toLatex(node.right)}}`;
      }
  }
}

/** A number as maths, not as a float: `3.32e-10` should not read as
 *  "3.32e minus 10" in the middle of an equation. */
export function formatNumber(value: number): string {
  const text = String(value);
  if (!text.includes("e")) return text;
  const [mantissa, exponent] = text.split("e");
  const power = Number(exponent);
  return `${mantissa} \\cdot 10^{${power}}`;
}
