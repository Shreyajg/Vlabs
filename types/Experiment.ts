import type { Timestamp } from "firebase/firestore";

/**
 * Untrusted Firestore document body. Experiments are not uniform: field names,
 * list names (runInputs vs runFields) and graph shapes (graph vs graphConfigs) vary.
 * Never read it directly; go through normalizeExperiment.
 */
export type RawExperimentData = Record<string, unknown>;

/** 'number' fields enter the calculation scope; 'choice' fields (dropdowns) do not. */
export type FieldKind = "number" | "choice";

export interface NormalizedConstant {
  /** Variable name. Constants without a key exist in Firestore and cannot enter the scope. */
  key?: string;
  name: string;
  symbol?: string;
  value: number;
  unit?: string;
}

/** Used for both setup inputs (inputFields) and per-run measurements (runFields / runInputs). */
export interface NormalizedField {
  key: string;
  label: string;
  kind: FieldKind;
  /** Allowed units. Empty when the field has no unit metadata. */
  units: string[];
  defaultUnit?: string;
  /** Unit the formulas expect. Falls back to defaultUnit, then the first unit. */
  calculationUnit?: string;
  defaultValue?: number | string;
  options: string[];
  /**
   * True for a number field that may be left blank. A blank optional field is simply not in the
   * formulas' scope (it is not an error); one that is filled in is validated and converted as usual.
   * Formulas read it through coalesce(field, fallback). Absent for required fields.
   */
  optional?: boolean;
}

/**
 * A domain rule for a formula, checked before the formula runs. The expression is evaluated with the same safe
 * evaluator as formulas; the result must be greater than zero ("positive") or at least zero ("nonNegative").
 * When it is not, the run fails with the check's own message instead of a wrong number or a bare arithmetic error.
 */
export type FormulaCheckRule = "positive" | "nonNegative";

export interface NormalizedFormulaCheck {
  expression: string;
  rule: FormulaCheckRule;
  /** What the student is told. */
  message?: string;
  /** The input or run field the problem is in, so the message can be shown next to it. */
  field?: string;
}

export interface NormalizedFormula {
  key?: string;
  name: string;
  /** Machine-readable calculation. Never derived from `formula`. */
  expression?: string;
  /** Human-readable display text only. */
  formula?: string;
  /** Domain rules checked before this formula runs. Absent when the formula has none. */
  checks?: NormalizedFormulaCheck[];
}

export interface NormalizedOutput {
  key: string;
  label: string;
  decimals?: number;
  unit?: string;
}

export interface NormalizedGraphConfig {
  title: string;
  type?: string;
  /** Present only for machine-readable graph definitions. */
  xKey?: string;
  yKey?: string;
  xLabel: string;
  yLabel: string;
  /** The scale of both axes. Per-axis scales, when the definition gives them, are in xScale and yScale. */
  scale: "linear" | "log";
  /** Scale of the x axis alone (for a semi-log graph). Present only when the definition states it. */
  xScale?: "linear" | "log";
  /** Scale of the y axis alone. Present only when the definition states it. */
  yScale?: "linear" | "log";
  /**
   * Lines drawn on one graph. An entry with a yKey is plotted against xKey; a graph with such entries
   * has several series. An entry may give its own xKey (for example efficiency against the suction head and
   * against the delivery head), which then replaces the graph's xKey for that line. Entries with only a label
   * are display text and plot nothing.
   */
  series: { label: string; yKey?: string; xKey?: string }[];
  source: "graph" | "graphConfigs";
}

export interface NormalizedExperiment {
  id: string;
  subjectId: string;
  title: string;
  aim: string[];
  theory: string;
  procedure: string[];

  constants: NormalizedConstant[];
  inputFields: NormalizedField[];
  runFields: NormalizedField[];

  formulas: NormalizedFormula[];
  outputs: NormalizedOutput[];
  graphConfigs: NormalizedGraphConfig[];

  route?: string;
  isPublished: boolean;
  createdBy?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;

  /** Data quality notes found while normalizing. For developers, not students. */
  warnings: string[];
}

export type Experiment = NormalizedExperiment;
