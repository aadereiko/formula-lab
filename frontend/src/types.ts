export interface AnalyzeResponse {
  expression: string;
  is_equation: boolean;
  symbols: string[];
  latex: string;
  functions_used: string[];
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
  functions: string[];
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
  pinned: boolean;
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
  pinned?: boolean;
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
