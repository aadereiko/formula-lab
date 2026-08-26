/**
 * The offline engine, wearing the API's shape.
 *
 * These two functions return exactly what `/api/analyze` and `/api/evaluate`
 * return, so the app can fall back to them without knowing it has. Anything
 * that reads a response stays untouched -- which is the point: an offline mode
 * that needed its own rendering path would be a second app to maintain.
 */

import type { AnalyzeResponse, EvaluateResponse, Solution, Step } from "../types";
import { ComputeError, evaluateNode, findRoots, formatG } from "./compute";
import { toLatex } from "./latex";
import { functionsUsed, ParseError, parse, splitEquation, symbolsOf, type Node } from "./parse";

export { ComputeError, ParseError };

/** Raised for anything the offline engine cannot do but the server could. */
export class OfflineLimit extends Error {}

function solutionFor(value: number, precision: number): Solution {
  const formatted = formatG(value, precision);
  return {
    value: Number.isFinite(value) ? value : null,
    formatted,
    // No exact form offline: a numeric root is a number, and claiming
    // `sqrt(2)` when all we found is 1.4142135623730951 would be a lie.
    exact: formatted,
    latex: formatted.includes("e") ? formatted.replace(/e([+-])0*(\d+)/, " \\cdot 10^{$1$2}") : formatted,
    is_real: true,
  };
}

export function analyzeOffline(expression: string): AnalyzeResponse {
  const sides = splitEquation(expression);
  if (!sides) {
    const tree = parse(expression);
    return {
      expression,
      is_equation: false,
      symbols: symbolsOf(tree),
      latex: toLatex(tree),
      functions_used: functionsUsed(expression),
      subject: null,
    };
  }

  const [lhsText, rhsText] = sides;
  const lhs = parse(lhsText);
  const rhs = parse(rhsText);
  const merged = { kind: "binary", op: "-", left: lhs, right: rhs } as Node;
  return {
    expression,
    is_equation: true,
    symbols: symbolsOf(merged),
    latex: `${toLatex(lhs)} = ${toLatex(rhs)}`,
    functions_used: functionsUsed(expression),
    subject: lhs.kind === "symbol" ? lhs.name : null,
  };
}

export function evaluateOffline(
  expression: string,
  values: Record<string, string>,
  precision: number,
  solveFor: string | null,
): EvaluateResponse {
  const cleaned: Record<string, number> = {};
  for (const [name, raw] of Object.entries(values)) {
    if (raw === "" || raw === undefined) continue;
    const number = Number(raw);
    if (!Number.isFinite(number)) {
      throw new ComputeError(`Value for '${name}' is not a number: '${raw}'`);
    }
    cleaned[name] = number;
  }

  const sides = splitEquation(expression);

  // A plain expression: substitute and compute. Nothing to rearrange.
  if (!sides) {
    const tree = parse(expression);
    const symbols = symbolsOf(tree);
    const missing = symbols.filter((name) => !(name in cleaned));
    if (missing.length) throw new ComputeError(`Missing value(s) for: ${missing.join(", ")}`);
    const value = evaluateNode(tree, cleaned);
    const solution = solutionFor(value, precision);
    return {
      mode: "evaluate",
      solve_for: null,
      latex: toLatex(tree),
      symbols,
      solutions: [solution],
      primary: solution,
      steps: [
        { label: "Formula", latex: toLatex(tree) },
        { label: "Result", latex: solution.latex },
      ],
    };
  }

  const [lhsText, rhsText] = sides;
  const lhs = parse(lhsText);
  const rhs = parse(rhsText);
  const symbols = symbolsOf({ kind: "binary", op: "-", left: lhs, right: rhs } as Node);

  const blank = symbols.filter((name) => !(name in cleaned));
  const target = solveFor ?? (blank.length === 1 ? (blank[0] as string) : null);
  if (!target) {
    if (!blank.length) throw new ComputeError("Leave one variable blank, or choose one to solve for.");
    throw new ComputeError(`Fill in all variables but one. Still blank: ${blank.join(", ")}`);
  }
  const stillBlank = blank.filter((name) => name !== target);
  if (stillBlank.length) throw new ComputeError(`Missing value(s) for: ${stillBlank.join(", ")}`);

  const known = { ...cleaned };
  delete known[target];

  const residual = (x: number): number =>
    evaluateNode(lhs, { ...known, [target]: x }) - evaluateNode(rhs, { ...known, [target]: x });

  const roots = findRoots(residual);
  if (!roots.length) {
    throw new OfflineLimit(
      `Could not find '${target}' offline. Reconnect to solve this one exactly.`,
    );
  }

  const solutions = roots.map((root) => solutionFor(root, precision));
  const primary = solutions[0] as Solution;
  const steps: Step[] = [
    { label: "Formula", latex: `${toLatex(lhs)} = ${toLatex(rhs)}` },
    { label: "Result", latex: `${toLatex({ kind: "symbol", name: target })} = ${primary.latex}` },
  ];

  return { mode: "solve", solve_for: target, latex: `${toLatex(lhs)} = ${toLatex(rhs)}`, symbols, solutions, primary, steps };
}
