import type {
  CalculateExperimentParams,
  CalculationIssue,
  CalculationResult,
  CalculationSuccess,
  GraphData,
  QuantityInputs,
} from "../../types/Calculation";
import type { NormalizedExperiment, NormalizedField } from "../../types/Experiment";
import { calculateExperiment } from "./calculateExperiment";
import {
  generateGraphData,
  plottedPointCount,
  type GraphGeneration,
  type GraphRunValues,
} from "./graphData";
import { GRAPH_DRAW_FAILED_MESSAGE, GRAPH_NEEDS_MORE_RUNS_MESSAGE, GRAPH_NEEDS_RUNS_MESSAGE, GRAPH_UNAVAILABLE_MESSAGE } from "./issues";

// Pure module. Drafts live in React state; nothing here reads or writes Firestore.
// Only saveDraftRuns() calls a persistence function, and it receives that function from the caller.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DraftRunStatus = "draft" | "calculated" | "error";

export interface DraftRun {
  id: string;
  /** Per-run measurements exactly as the student entered them. */
  runValues: QuantityInputs;
  status: DraftRunStatus;
  /** Present only while status is "calculated". */
  result?: CalculationSuccess;
  /** Problems specific to this run. Present only while status is "error". */
  errors: CalculationIssue[];
  /** Set once the run has been saved. A saved run is frozen. */
  savedRunId?: string;
  /** Friendly text when the last attempt to save this run failed. */
  saveError?: string;
}

// ---------------------------------------------------------------------------
// Quantities (used for the experiment setup and for each run)
// ---------------------------------------------------------------------------

/** Starting values for a list of fields: the default value and default unit where defined. */
export function initialQuantities(fields: readonly NormalizedField[]): QuantityInputs {
  const quantities: QuantityInputs = {};

  for (const field of fields) {
    const unit = field.defaultUnit ?? field.units[0];
    const value = field.defaultValue !== undefined ? String(field.defaultValue) : "";

    quantities[field.key] = unit ? { value, unit } : { value };
  }

  return quantities;
}

export function setQuantityValue(
  quantities: QuantityInputs,
  key: string,
  value: string,
): QuantityInputs {
  const current = quantities[key];

  return { ...quantities, [key]: current?.unit ? { value, unit: current.unit } : { value } };
}

export function setQuantityUnit(
  quantities: QuantityInputs,
  key: string,
  unit: string,
): QuantityInputs {
  return { ...quantities, [key]: { value: quantities[key]?.value ?? "", unit } };
}

// ---------------------------------------------------------------------------
// Draft run editing
// ---------------------------------------------------------------------------

export function createDraftRun(id: string, runFields: readonly NormalizedField[]): DraftRun {
  return { id, runValues: initialQuantities(runFields), status: "draft", errors: [] };
}

export function isRunSaved(run: DraftRun): boolean {
  return run.savedRunId !== undefined;
}

export function hasSavedRuns(runs: readonly DraftRun[]): boolean {
  return runs.some(isRunSaved);
}

export function addDraftRun(
  runs: readonly DraftRun[],
  id: string,
  runFields: readonly NormalizedField[],
): DraftRun[] {
  return [...runs, createDraftRun(id, runFields)];
}

/** Saved runs are never removed: deleting them here would not delete them from Firestore. */
export function removeDraftRun(runs: readonly DraftRun[], id: string): DraftRun[] {
  return runs.filter((run) => run.id !== id || isRunSaved(run));
}

/** Any edit discards the run's old results, so results never outlive the values that produced them. */
function reset(run: DraftRun, runValues: QuantityInputs): DraftRun {
  return { id: run.id, runValues, status: "draft", errors: [] };
}

function editRun(
  runs: readonly DraftRun[],
  id: string,
  change: (run: DraftRun) => QuantityInputs,
): DraftRun[] {
  return runs.map((run) => (run.id === id && !isRunSaved(run) ? reset(run, change(run)) : run));
}

export function editDraftRunValue(
  runs: readonly DraftRun[],
  id: string,
  key: string,
  value: string,
): DraftRun[] {
  return editRun(runs, id, (run) => setQuantityValue(run.runValues, key, value));
}

export function editDraftRunUnit(
  runs: readonly DraftRun[],
  id: string,
  key: string,
  unit: string,
): DraftRun[] {
  return editRun(runs, id, (run) => setQuantityUnit(run.runValues, key, unit));
}

/**
 * Call when the experiment setup changes: every calculation depends on it, so all unsaved runs
 * go back to draft. Saved runs are frozen snapshots and are left alone.
 */
export function invalidateCalculatedRuns(runs: readonly DraftRun[]): DraftRun[] {
  return runs.map((run) => (isRunSaved(run) ? run : reset(run, run.runValues)));
}

// ---------------------------------------------------------------------------
// Calculate All
// ---------------------------------------------------------------------------

export type IssueLevel = "setup" | "run" | "definition";

const DEFINITION_CODES: ReadonlySet<string> = new Set([
  "NO_FORMULAS_DEFINED",
  "FORMULA_EXPRESSION_MISSING",
  "FORMULA_KEY_MISSING",
  "FORMULA_PARSE_ERROR",
  "UNSUPPORTED_FORMULA_SYNTAX",
  "UNKNOWN_FORMULA_VARIABLE",
  "INVALID_VARIABLE_KEY",
  "DUPLICATE_VARIABLE_KEY",
]);

/**
 * Decides whose problem an engine issue is, without changing the engine:
 *  setup       an experiment-level input field (shared by every run)
 *  run         this run's own values or arithmetic (for example, time = 0)
 *  definition  the experiment's Firestore definition (nothing the student can fix)
 */
export function classifyIssue(
  issue: CalculationIssue,
  resultHasDefinitionIssue: boolean,
): IssueLevel {
  if (issue.fieldKind === "input") return "setup";
  if (issue.fieldKind === "run") return "run";
  if (DEFINITION_CODES.has(issue.code)) return "definition";
  if (issue.code === "FORMULA_DEPENDENCY_FAILED") {
    return resultHasDefinitionIssue ? "definition" : "run";
  }

  return "run";
}

const issueKey = (issue: CalculationIssue): string =>
  [issue.code, issue.fieldKey, issue.formulaKey ?? issue.formulaName, issue.variable].join("|");

export interface CalculateAllParams {
  experiment: NormalizedExperiment;
  /** Experiment-level input values, shared by every run. */
  setup: QuantityInputs;
  runs: readonly DraftRun[];
  /** Defaults to the existing generic engine. Injectable for tests. */
  calculate?: (params: CalculateExperimentParams) => CalculationResult;
}

export interface CalculateAllOutcome {
  runs: DraftRun[];
  /** Problems with the shared setup inputs, reported once rather than once per run. */
  setupIssues: CalculationIssue[];
  /** Problems with the experiment definition, reported once. */
  definitionIssues: CalculationIssue[];
}

/**
 * Runs the existing calculateExperiment() for every unsaved run. A failing run is marked "error"
 * and never discards the runs that succeeded. Nothing is written anywhere.
 */
export function calculateAllDraftRuns({
  experiment,
  setup,
  runs,
  calculate = calculateExperiment,
}: CalculateAllParams): CalculateAllOutcome {
  const setupIssues = new Map<string, CalculationIssue>();
  const definitionIssues = new Map<string, CalculationIssue>();

  const calculated = runs.map((run): DraftRun => {
    if (isRunSaved(run)) return run;

    const result = calculate({ experiment, inputs: setup, runValues: run.runValues });

    if (result.ok) {
      return { ...run, status: "calculated", result, errors: [], saveError: undefined };
    }

    const hasDefinitionIssue = result.errors.some(
      (issue) => classifyIssue(issue, false) === "definition",
    );
    const runIssues: CalculationIssue[] = [];

    for (const issue of result.errors) {
      const level = classifyIssue(issue, hasDefinitionIssue);

      if (level === "setup") setupIssues.set(issueKey(issue), issue);
      else if (level === "definition") definitionIssues.set(issueKey(issue), issue);
      else runIssues.push(issue);
    }

    // A run that only failed because of setup or definition problems stays a draft: the fault is not its own.
    return {
      id: run.id,
      runValues: run.runValues,
      status: runIssues.length > 0 ? "error" : "draft",
      errors: runIssues,
    };
  });

  return {
    runs: calculated,
    setupIssues: [...setupIssues.values()],
    definitionIssues: [...definitionIssues.values()],
  };
}

// ---------------------------------------------------------------------------
// Graphs
// ---------------------------------------------------------------------------

export const runLabel = (runs: readonly DraftRun[], id: string): string =>
  `Run ${runs.findIndex((run) => run.id === id) + 1}`;

/** Calculated values of every calculated run, in run order, ready for the graph generator. */
export function calculatedRunValues(runs: readonly DraftRun[]): GraphRunValues[] {
  const values: GraphRunValues[] = [];

  runs.forEach((run, index) => {
    if (run.status === "calculated" && run.result) {
      values.push({ id: run.id, label: `Run ${index + 1}`, values: run.result.scope });
    }
  });

  return values;
}

/** One graph per graph config, built from all calculated runs. */
export function buildRunGraphs(
  experiment: NormalizedExperiment,
  runs: readonly DraftRun[],
): GraphGeneration[] {
  const results = calculatedRunValues(runs);

  return experiment.graphConfigs.map((graphConfig, configIndex) =>
    generateGraphData({ graphConfig, configIndex, results }),
  );
}

const ONLY_ONE_PLOTTABLE_MESSAGE = "Only one run can be plotted so far.";
const NOTHING_PLOTTABLE_MESSAGE = "None of the calculated runs can be plotted.";

export type GraphView =
  | { kind: "chart"; graph: GraphData; notes: string[] }
  | { kind: "message"; message: string; graph?: GraphData; notes: string[] };

/** Turns a generation result into what the screen should show, with one specific message per cause. */
export function describeGraphState(
  generation: GraphGeneration,
  calculatedRunCount: number,
): GraphView {
  const notes = generation.issues
    .filter((issue) => issue.code === "GRAPH_LOG_SCALE_INVALID")
    .map((issue) => issue.userMessage);

  if (generation.status === "incomplete") {
    return { kind: "message", message: GRAPH_UNAVAILABLE_MESSAGE, notes: [] };
  }

  if (calculatedRunCount === 0) {
    return { kind: "message", message: GRAPH_NEEDS_RUNS_MESSAGE, notes: [] };
  }

  const graph = generation.graph;

  if (graph && plottedPointCount(graph) >= 2) {
    return { kind: "chart", graph, notes };
  }

  if (graph) {
    // One plottable point. With a single calculated run that simply means "add another";
    // with several it means the others could not be plotted, and the notes say which.
    return {
      kind: "message",
      message: calculatedRunCount >= 2 ? ONLY_ONE_PLOTTABLE_MESSAGE : GRAPH_NEEDS_MORE_RUNS_MESSAGE,
      graph,
      notes,
    };
  }

  return {
    kind: "message",
    message: notes.length > 0 ? NOTHING_PLOTTABLE_MESSAGE : GRAPH_DRAW_FAILED_MESSAGE,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Save All Runs
// ---------------------------------------------------------------------------

export interface SaveDraftRunsParams {
  runs: readonly DraftRun[];
  /** Persists one calculated run and returns its new document id. */
  save: (run: DraftRun) => Promise<string>;
  /** Receives the underlying error for logging. Never shown to students. */
  onError?: (run: DraftRun, error: unknown) => void;
}

export interface SaveDraftRunsOutcome {
  runs: DraftRun[];
  savedCount: number;
  failedRunIds: string[];
  /** Runs left alone: already saved, not calculated, or failed to calculate. */
  skippedCount: number;
}

export const SAVE_FAILED_MESSAGE = "This run could not be saved.";

/**
 * Saves every calculated run that has not been saved yet, one at a time.
 * - Runs that are already saved are skipped, so nothing is ever saved twice.
 * - Draft and error runs are never saved.
 * - A failure leaves that run exactly as it was (still calculated, still unsaved) with a saveError.
 */
export async function saveDraftRuns({
  runs,
  save,
  onError,
}: SaveDraftRunsParams): Promise<SaveDraftRunsOutcome> {
  const updated: DraftRun[] = [];
  const failedRunIds: string[] = [];
  let savedCount = 0;
  let skippedCount = 0;

  for (const run of runs) {
    if (isRunSaved(run) || run.status !== "calculated" || !run.result) {
      updated.push(run);
      skippedCount += 1;
      continue;
    }

    try {
      const savedRunId = await save(run);

      updated.push({ ...run, savedRunId, saveError: undefined });
      savedCount += 1;
    } catch (error) {
      onError?.(run, error);
      updated.push({ ...run, saveError: SAVE_FAILED_MESSAGE });
      failedRunIds.push(run.id);
    }
  }

  return { runs: updated, savedCount, failedRunIds, skippedCount };
}

/**
 * Makes an async task single-flight: while one is running, further calls return the same promise
 * instead of starting another. This stops a double tap from saving every run twice.
 */
export function createSingleFlight<T>(): (task: () => Promise<T>) => Promise<T> {
  let current: Promise<T> | null = null;

  return (task) => {
    if (current) return current;

    const started = task().finally(() => {
      current = null;
    });

    current = started;

    return started;
  };
}
