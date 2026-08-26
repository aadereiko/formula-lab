/**
 * A parser for the formula syntax, in the browser.
 *
 * The server parses with SymPy, which means `eval`, which is why it needs a
 * character whitelist ahead of it. Nothing here evaluates a string, so the
 * parser *is* the boundary: an input it cannot describe as a tree is simply
 * rejected. That difference is worth stating, because copying the server's
 * whitelist across would look prudent and protect against nothing.
 *
 * The grammar matches what the API accepts, including the two things people
 * actually type: implicit multiplication (`1/2 m v^2`) and subscripts (`v_0`).
 */

export type Node =
  | { kind: "number"; value: number }
  | { kind: "symbol"; name: string }
  | { kind: "call"; name: string; args: Node[] }
  | { kind: "neg"; operand: Node }
  | { kind: "binary"; op: "+" | "-" | "*" | "/" | "^"; left: Node; right: Node };

export class ParseError extends Error {}

/** Functions the server implements. Anything else is a variable. */
export const FUNCTIONS = new Set([
  "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
  "sinh", "cosh", "tanh", "exp", "log", "ln", "log10",
  "sqrt", "cbrt", "abs", "Abs", "sign", "floor", "ceiling",
  "factorial", "max", "min", "Max", "Min",
]);

/** Constants the parser resolves itself. `E` and `I` are deliberately absent:
 *  the server excludes them too, because they shadow energy and current. */
export const NAMED_VALUES: Record<string, number> = { pi: Math.PI };

type Token =
  | { type: "num"; value: number }
  | { type: "name"; value: string }
  | { type: "op"; value: string };

const NAME_START = /[A-Za-z]/;
const NAME_REST = /[A-Za-z0-9_]/;

function tokenise(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i] as string;
    if (ch === " " || ch === "\t") {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < source.length && /[0-9.]/.test(source[j] as string)) j += 1;
      // An exponent is part of the number, but only when a digit follows the
      // sign -- otherwise `2e` is a number times a variable.
      if (/[eE]/.test(source[j] ?? "") && /[0-9+-]/.test(source[j + 1] ?? "")) {
        let k = j + 1;
        if (/[+-]/.test(source[k] as string)) k += 1;
        if (/[0-9]/.test(source[k] ?? "")) {
          while (k < source.length && /[0-9]/.test(source[k] as string)) k += 1;
          j = k;
        }
      }
      const text = source.slice(i, j);
      const value = Number(text);
      if (!Number.isFinite(value)) throw new ParseError(`'${text}' is not a number.`);
      tokens.push({ type: "num", value });
      i = j;
      continue;
    }
    if (NAME_START.test(ch)) {
      let j = i;
      while (j < source.length && NAME_REST.test(source[j] as string)) j += 1;
      tokens.push({ type: "name", value: source.slice(i, j) });
      i = j;
      continue;
    }
    if (ch === "*" && source[i + 1] === "*") {
      tokens.push({ type: "op", value: "^" });
      i += 2;
      continue;
    }
    if ("+-*/^(),".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i += 1;
      continue;
    }
    throw new ParseError(`'${ch}' is not allowed in a formula.`);
  }
  return tokens;
}

class Parser {
  private at = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.at];
  }

  private eat(value: string): boolean {
    const token = this.peek();
    if (token && token.type === "op" && token.value === value) {
      this.at += 1;
      return true;
    }
    return false;
  }

  private expect(value: string): void {
    if (!this.eat(value)) throw new ParseError(`Expected '${value}'.`);
  }

  parse(): Node {
    const node = this.sum();
    if (this.at < this.tokens.length) throw new ParseError("Unexpected trailing input.");
    return node;
  }

  private sum(): Node {
    let left = this.product();
    for (;;) {
      if (this.eat("+")) left = { kind: "binary", op: "+", left, right: this.product() };
      else if (this.eat("-")) left = { kind: "binary", op: "-", left, right: this.product() };
      else return left;
    }
  }

  private product(): Node {
    let left = this.power();
    for (;;) {
      if (this.eat("*")) left = { kind: "binary", op: "*", left, right: this.power() };
      else if (this.eat("/")) left = { kind: "binary", op: "/", left, right: this.power() };
      else if (this.startsValue()) {
        // Implicit multiplication: `1/2 m v^2`. Adjacency is the operator.
        left = { kind: "binary", op: "*", left, right: this.power() };
      } else return left;
    }
  }

  /** Whether the next token could begin a value, which is what makes adjacency
   *  multiplication rather than a syntax error. */
  private startsValue(): boolean {
    const token = this.peek();
    if (!token) return false;
    if (token.type === "num" || token.type === "name") return true;
    return token.value === "(";
  }

  private power(): Node {
    const base = this.unary();
    // Right-associative, so `2^3^2` is 2^(3^2) as everywhere else in maths.
    if (this.eat("^")) return { kind: "binary", op: "^", left: base, right: this.power() };
    return base;
  }

  private unary(): Node {
    if (this.eat("-")) return { kind: "neg", operand: this.unary() };
    if (this.eat("+")) return this.unary();
    return this.primary();
  }

  private primary(): Node {
    const token = this.peek();
    if (!token) throw new ParseError("The formula ends before it is finished.");

    if (token.type === "num") {
      this.at += 1;
      return { kind: "number", value: token.value };
    }

    if (token.type === "name") {
      this.at += 1;
      const name = token.value;
      // A name followed by `(` is a call only if it names a function; otherwise
      // `a(b + c)` is `a * (b + c)`, which is what the server does too.
      if (FUNCTIONS.has(name) && this.eat("(")) {
        const args: Node[] = [];
        if (!this.eat(")")) {
          do args.push(this.sum());
          while (this.eat(","));
          this.expect(")");
        }
        return { kind: "call", name, args };
      }
      return { kind: "symbol", name };
    }

    if (token.value === "(") {
      this.at += 1;
      const inner = this.sum();
      this.expect(")");
      return inner;
    }

    throw new ParseError(`Unexpected '${token.value}'.`);
  }
}

export function parse(source: string): Node {
  const trimmed = source.trim();
  if (!trimmed) throw new ParseError("Write a formula first.");
  return new Parser(tokenise(trimmed)).parse();
}

/** Splits `lhs = rhs`, or returns null for a plain expression. */
export function splitEquation(source: string): [string, string] | null {
  const parts = source.split("=");
  if (parts.length === 1) return null;
  if (parts.length > 2) throw new ParseError("Use a single '=' sign.");
  return [parts[0] as string, parts[1] as string];
}

/** Every variable the tree mentions, ordered as the app orders them:
 *  shortest name first, then alphabetically. */
export function symbolsOf(node: Node): string[] {
  const found = new Set<string>();
  const walk = (n: Node): void => {
    switch (n.kind) {
      case "symbol":
        if (!(n.name in NAMED_VALUES)) found.add(n.name);
        return;
      case "call":
        n.args.forEach(walk);
        return;
      case "neg":
        walk(n.operand);
        return;
      case "binary":
        walk(n.left);
        walk(n.right);
        return;
      default:
        return;
    }
  };
  walk(node);
  return [...found].sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
}

/** Functions the source text names, read from the text rather than the tree for
 *  the same reason the server does it: `sqrt(x)` leaves no `sqrt` node behind. */
export function functionsUsed(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/[A-Za-z][A-Za-z0-9_]*/g)) {
    if (FUNCTIONS.has(match[0])) found.add(match[0]);
  }
  return [...found].sort();
}
