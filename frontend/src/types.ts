export interface AnalyzeResponse {
  expression: string;
  is_equation: boolean;
  symbols: string[];
  latex: string;
  functions_used: string[];
  /** The variable the equation is written about, when the left side is a bare
   *  symbol. Null for an expression or a compound left side. */
  subject: string | null;
}

export interface Solution {
  value: number | null;
  formatted: string;
  exact: string;
  latex: string;
  is_real: boolean | null;
}

export interface Step {
  label: string;
  latex: string;
}

export interface EvaluateResponse {
  mode: "evaluate" | "solve";
  solve_for: string | null;
  latex: string;
  symbols: string[];
  solutions: Solution[];
  primary: Solution;
  steps: Step[];
}

/** One variable to sweep, and over what. */
export interface PlotAxisInput {
  variable: string;
  min: number;
  max: number;
}

export interface PlotRequest {
  expression: string;
  values: Record<string, string>;
  solve_for: string | null;
  /** One axis draws a curve, two a surface. */
  axes: PlotAxisInput[];
  samples: number;
}

/** An axis as the server resolved it, carrying the sample count it settled on. */
export interface PlotAxis extends PlotAxisInput {
  samples: number;
}

export interface PlotSeries {
  label: string;
  /** One row per step of the second axis; a curve has a single row. `null` is a
   *  point where the formula has no real value — a gap, not a zero. */
  samples: (number | null)[][];
}

export interface PlotResponse {
  mode: "curve" | "surface";
  latex: string;
  /** What the vertical axis is: the variable solved for, or "value". */
  value_label: string;
  axes: PlotAxis[];
  series: PlotSeries[];
  value_min: number | null;
  value_max: number | null;
  /** Non-empty when something about the plot needs saying out loud. */
  note: string;
}

export interface FormulaVariable {
  symbol: string;
  description: string;
}

export interface LibraryFormula {
  id: string;
  name: string;
  category: string;
  expression: string;
  variables: FormulaVariable[];
  note: string;
}

export interface Library {
  categories: string[];
  formulas: LibraryFormula[];
  /** Example description per symbol, e.g. { m: "mass (kg)" }. */
  variable_hints: Record<string, string>;
  /** Used when a symbol has no example of its own. */
  fallback_hint: string;
}

export interface Constant {
  symbol: string;
  name: string;
  value: number;
  unit: string;
}

export interface Capabilities {
  /** What the server is running, which is the version worth showing. */
  version: string;
  functions: string[];
  /** One line per function, shown when a formula uses it. */
  function_help: Record<string, string>;
  limits: Record<string, number>;
  syntax: string[];
}

/** A finished calculation, kept in localStorage. */
export interface HistoryEntry {
  id: string;
  expression: string;
  values: Record<string, string>;
  solveFor: string | null;
  resultLabel: string;
  resultValue: string;
}

export interface User {
  id: number;
  email: string;
  created_at: string;
}

export interface AuthProviders {
  password: boolean;
  google: boolean;
}

export interface SavedFormula {
  id: number;
  name: string;
  expression: string;
  note: string;
  values: Record<string, string>;
  variable_notes: Record<string, string>;
  solve_for: string | null;
  category: string;
  pinned: boolean;
  hidden: boolean;
  created_at: string;
  updated_at: string;
}

export interface SavedFormulaInput {
  name: string;
  expression: string;
  note?: string;
  values?: Record<string, string>;
  variable_notes?: Record<string, string>;
  solve_for?: string | null;
  category?: string;
  pinned?: boolean;
  hidden?: boolean;
}

export interface UserConstant {
  id: number;
  symbol: string;
  value: number;
  name: string;
  unit: string;
  created_at: string;
  updated_at: string;
}

export interface UserConstantInput {
  symbol: string;
  value: number;
  name?: string;
  unit?: string;
}
