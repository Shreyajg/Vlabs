import type { NormalizedExperiment } from "./Experiment";

/** A value as the student entered it, before unit conversion. */
export interface QuantityInput {
  value: string | number;
  unit?: string;
}

export type QuantityInputs = Record<string, QuantityInput>;

export type CalculationIssueCode =
  // Student input problems
  | "INPUT_REQUIRED"
  | "INPUT_INVALID_NUMBER"
  | "INVALID_CHOICE"
  | "UNSUPPORTED_UNIT"
  // Experiment definition problems (Firestore data)
  | "NO_FORMULAS_DEFINED"
  | "FORMULA_EXPRESSION_MISSING"
  | "FORMULA_KEY_MISSING"
  | "FORMULA_PARSE_ERROR"
  | "UNSUPPORTED_FORMULA_SYNTAX"
  | "UNKNOWN_FORMULA_VARIABLE"
  | "FORMULA_DEPENDENCY_FAILED"
  | "INVALID_VARIABLE_KEY"
  | "DUPLICATE_VARIABLE_KEY"
  // Evaluation problems
  | "DOMAIN_CHECK_FAILED"
  | "DIVISION_BY_ZERO"
  | "FORMULA_EVALUATION_ERROR"
  // Warnings
  | "NO_OUTPUTS_DEFINED"
  | "OUTPUT_VARIABLE_UNAVAILABLE"
  | "GRAPH_CONFIG_INCOMPLETE"
  | "GRAPH_VARIABLE_UNAVAILABLE"
  | "GRAPH_LOG_SCALE_INVALID";

export interface CalculationIssue {
  code: CalculationIssueCode;
  severity: "error" | "warning";
  /** Detailed text for developers and logs. */
  message: string;
  /** Safe text for students. Never contains internals. */
  userMessage: string;
  fieldKey?: string;
  fieldKind?: "input" | "run";
  formulaKey?: string;
  formulaName?: string;
  variable?: string;
  unit?: string;
  graphTitle?: string;
}

export interface OutputValue {
  key: string;
  label: string;
  value: number;
  decimals?: number;
  displayValue: string;
}

export interface GraphPoint {
  x: number;
  y: number;
  /** Which run produced the point. Set when the graph is built from several runs. */
  runId?: string;
}

/** One line of a graph that plots several variables against the same x. */
export interface GraphSeries {
  label: string;
  yKey: string;
  /** Present only when this line has its own x variable; otherwise it is plotted against the graph's xKey. */
  xKey?: string;
  /** One point per run that could be plotted for this series. */
  points: GraphPoint[];
}

export interface GraphData {
  /** Index into experiment.graphConfigs. */
  configIndex: number;
  title: string;
  xKey: string;
  yKey: string;
  xLabel: string;
  yLabel: string;
  /** The scale of both axes. See xScale and yScale for a graph that is logarithmic on one axis only. */
  scale: "linear" | "log";
  /** Present only for a graph whose definition gives per-axis scales (for example semi-log: x log, y linear). */
  xScale?: "linear" | "log";
  yScale?: "linear" | "log";
  /** One point per run. Curves come from aggregating saved runs later. For a multi-series graph, the first series. */
  points: GraphPoint[];
  /**
   * Present only for a graph with several series (each with its own yKey). Graphs with one series do
   * not have this field at all, so they keep exactly the shape they always had.
   */
  series?: GraphSeries[];
}

export interface CalculateExperimentParams {
  experiment: NormalizedExperiment;
  inputs: QuantityInputs;
  runValues: QuantityInputs;
}

export type CalculationSuccess = Extract<CalculationResult, { ok: true }>;

export type CalculationResult =
  | {
      ok: true;
      /** Every variable available to formulas, after unit conversion. */
      scope: Record<string, number>;
      /** Values of every formula that was calculated. */
      calculated: Record<string, number>;
      /** Values for the experiment's outputs. */
      results: Record<string, number>;
      outputs: OutputValue[];
      graphData: GraphData[];
      warnings: CalculationIssue[];
    }
  | {
      ok: false;
      errors: CalculationIssue[];
      warnings: CalculationIssue[];
    };
