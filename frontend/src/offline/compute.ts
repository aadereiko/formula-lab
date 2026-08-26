/**
 * Evaluating a tree, and solving one for a single unknown -- without algebra.
 *
 * The server rearranges symbolically: SymPy is asked to make `m` the subject of
 * `F = m a` and returns `F/a`. Nothing in a browser can do that without shipping
 * a computer algebra system, so this does the other thing available, and finds
 * the root numerically.
 *
 * That trade is better than it sounds. A numeric root needs no rearrangement at
 * all, which means it works on formulas SymPy would struggle to invert, and it
 * is exact to display precision for any well-behaved root. What it gives up is
 * the exact form -- `sqrt(2)` comes back as 1.41421 and not as `sqrt(2)` -- and
 * any root it cannot bracket.
 */

import { NAMED_VALUES, type Node } from "./parse";

export class ComputeError extends Error {}

const FUNCTION_IMPLS: Record<string, (args: number[]) => number> = {
  sin: ([x]) => Math.sin(x as number),
  cos: ([x]) => Math.cos(x as number),
  tan: ([x]) => Math.tan(x as number),
  asin: ([x]) => Math.asin(x as number),
  acos: ([x]) => Math.acos(x as number),
  atan: ([x]) => Math.atan(x as number),
  atan2: ([y, x]) => Math.atan2(y as number, x as number),
  sinh: ([x]) => Math.sinh(x as number),
  cosh: ([x]) => Math.cosh(x as number),
  tanh: ([x]) => Math.tanh(x as number),
  exp: ([x]) => Math.exp(x as number),
  // `log` is the natural log, as it is in SymPy -- not base 10.
  log: ([x]) => Math.log(x as number),
  ln: ([x]) => Math.log(x as number),
  log10: ([x]) => Math.log10(x as number),
  sqrt: ([x]) => Math.sqrt(x as number),
  cbrt: ([x]) => Math.cbrt(x as number),
  abs: ([x]) => Math.abs(x as number),
  Abs: ([x]) => Math.abs(x as number),
  sign: ([x]) => Math.sign(x as number),
  floor: ([x]) => Math.floor(x as number),
  ceiling: ([x]) => Math.ceil(x as number),
  factorial: ([x]) => {
    const n = x as number;
    if (!Number.isInteger(n) || n < 0 || n > 170) return NaN;
    let out = 1;
    for (let k = 2; k <= n; k += 1) out *= k;
    return out;
  },
  max: (args) => Math.max(...args),
  Max: (args) => Math.max(...args),
  min: (args) => Math.min(...args),
  Min: (args) => Math.min(...args),
};

/** Evaluates a tree against a set of variable values. */
export function evaluateNode(node: Node, bindings: Record<string, number>): number {
  switch (node.kind) {
    case "number":
      return node.value;
    case "symbol": {
      if (node.name in NAMED_VALUES) return NAMED_VALUES[node.name] as number;
      const value = bindings[node.name];
      if (value === undefined) throw new ComputeError(`No value for '${node.name}'.`);
      return value;
    }
    case "call": {
      const impl = FUNCTION_IMPLS[node.name];
      if (!impl) throw new ComputeError(`'${node.name}' is not available offline.`);
      return impl(node.args.map((arg) => evaluateNode(arg, bindings)));
    }
    case "neg":
      return -evaluateNode(node.operand, bindings);
    case "binary": {
      const left = evaluateNode(node.left, bindings);
      const right = evaluateNode(node.right, bindings);
      switch (node.op) {
        case "+": return left + right;
        case "-": return left - right;
        case "*": return left * right;
        case "/": return left / right;
        case "^": return left ** right;
      }
    }
  }
}

/**
 * Candidate points, as two monotone runs rather than one list.
 *
 * Sorting by absolute value looked tidier and broke the search: it interleaves
 * signs -- 0, 1, -1, 3, -3 -- so `1` and `3` are never *adjacent*, and a sign
 * change between them cannot be seen by a scan over consecutive pairs. Each
 * side has to be walked in its own order.
 *
 * Physical quantities cluster near the small end, so the runs start at 1e-12 and
 * reach past Avogadro at the far end.
 */
function ladder(): number[] {
  const out = new Set<number>();
  // A fine linear pass over the small range first. The geometric ladder below is
  // what lets this reach 1e26, and it is useless for anything periodic: `[3, 10]`
  // holds several roots of `sin`, so bisection lands on whichever the sign test
  // happens to bracket -- which came out exactly 2*pi away from the answer the
  // server gives for Snell's law. A quarter-unit grid resolves the trig roots
  // and sharpens everything else near zero, where most answers live anyway.
  for (let x = 0.25; x <= 20; x += 0.25) out.add(Number(x.toFixed(2)));
  for (let exponent = -12; exponent <= 26; exponent += 1) {
    out.add(10 ** exponent);
    out.add(3 * 10 ** exponent);
  }
  return [...out].sort((a, b) => a - b);
}

const UP = ladder();
const DOWN = ladder().map((x) => -x);

/**
 * Every root of `f` this can bracket, nearest zero first.
 *
 * Bisection rather than Newton: it needs no derivative, cannot diverge, and
 * halves the interval every step, so 200 iterations is far past the point where
 * a double stops moving. Newton is faster and would sometimes shoot off to
 * infinity on the formulas people actually type.
 *
 * The two runs are never joined across zero. `v = d/t` has a pole at t = 0, and
 * a pole is not a root: `f` runs from -infinity to +infinity across it, which is
 * a sign change by any test a bracket can apply. Every candidate is therefore
 * checked afterwards as well -- see `isRoot`.
 */
export function findRoots(f: (x: number) => number): number[] {
  const roots: number[] = [];
  const seen = (value: number) =>
    roots.some((root) => Math.abs(root - value) <= 1e-9 * Math.max(1, Math.abs(root)));

  const safe = (x: number): number | null => {
    const y = f(x);
    return Number.isFinite(y) ? y : null;
  };

  /**
   * Whether a converged candidate is a root or a pole.
   *
   * At a root `|f|` is a local minimum and vanishes; at a pole it is a local
   * *maximum* and enormous. Comparing the candidate against two nearby points
   * separates them without needing to know the scale of the formula -- which is
   * the part a fixed tolerance cannot do, given this app spans 1e-34 to 1e26.
   */
  const isRoot = (x: number): boolean => {
    const here = safe(x);
    if (here === null) return false;      // straight through a pole
    if (here === 0) return true;
    const step = Math.max(Math.abs(x), 1) * 1e-6;
    const left = safe(x - step);
    const right = safe(x + step);
    const nearby = Math.max(Math.abs(left ?? 0), Math.abs(right ?? 0));
    return Math.abs(here) <= Math.max(nearby, Number.MIN_VALUE) * 1e-3;
  };

  const scan = (run: number[]): void => {
    for (let i = 0; i < run.length - 1; i += 1) {
      const a = run[i] as number;
      const b = run[i + 1] as number;
      const fa = safe(a);
      const fb = safe(b);
      if (fa === null || fb === null) continue;
      if (fa === 0 && !seen(a)) { roots.push(a); continue; }
      if (fb === 0 && !seen(b)) { roots.push(b); continue; }
      if (fa > 0 === fb > 0) continue;

      let low = a;
      let high = b;
      let flow = fa;
      for (let step = 0; step < 200; step += 1) {
        const mid = (low + high) / 2;
        if (mid === low || mid === high) break;
        const fmid = safe(mid);
        if (fmid === null) break;
        if (fmid === 0) { low = high = mid; break; }
        if (fmid > 0 === flow > 0) { low = mid; flow = fmid; }
        else high = mid;
      }
      const root = (low + high) / 2;
      if (Number.isFinite(root) && isRoot(root) && !seen(root)) roots.push(root);
    }
  };

  scan(UP);
  scan(DOWN);

  // Positive first, then by distance from zero -- the same preference the server
  // applies when a quadratic offers two answers.
  return roots.sort((x, y) => (x >= 0 === y >= 0 ? Math.abs(x) - Math.abs(y) : x >= 0 ? -1 : 1));
}

/**
 * Python's `%g`, which is what the server formats with.
 *
 * `toPrecision` is close but keeps trailing zeros and switches to exponential on
 * different thresholds, so `6.0000` would show where the server shows `6`.
 */
export function formatG(value: number, precision: number): string {
  if (!Number.isFinite(value)) return Number.isNaN(value) ? "undefined" : "infinite";
  if (value === 0) return "0";

  const exponent = Math.floor(Math.log10(Math.abs(value)));
  if (exponent < -4 || exponent >= precision) {
    const [mantissa, exp] = value.toExponential(precision - 1).split("e");
    const trimmed = (mantissa as string).replace(/\.?0+$/, "");
    const sign = (exp as string).startsWith("-") ? "-" : "+";
    const digits = (exp as string).replace(/^[+-]/, "").padStart(2, "0");
    return `${trimmed}e${sign}${digits}`;
  }
  return value.toFixed(Math.max(0, precision - 1 - exponent)).replace(/\.?0+$/, "");
}
