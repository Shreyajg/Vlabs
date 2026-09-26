import {
  FormulaSyntaxError,
  isValidVariableKey,
  parseFormulaExpression,
} from "./calculation/formulaEvaluator";
import type { NormalizedExperiment, NormalizedField, RawExperimentData } from "../types/Experiment";

/** One editable row in a faculty-authored list (a constant, a field, a formula, ...). Defined here, not
 *  in the UI layer, so this pure module never depends on a component file; ItemListEditor re-exports it. */
export type ListItem = { id: string } & Record<string, string>;

// Pure module: no Firebase or UI imports. Maps the faculty ExperimentForm's flat, string-valued ListItem rows
// onto the real Firestore experiment schema (constants/inputFields/runFields/formulas/outputs/graphConfigs)
// that normalizeExperiment() and calculateExperiment() already consume, and back again when editing a real
// document. Validation reuses the actual formula parser (parseFormulaExpression/isValidVariableKey) the Run
// screen relies on — never a second, parallel notion of what a valid expression or variable key is.
//
// Two real structures are deliberately NOT authorable here: a formula's `checks` (per-field domain rules)
// and a graph's `series` (multi-line graphs). Both are nested object arrays with no sensible flat-row
// editor; editing a formula/graph that already has one carries it through unchanged via a hidden JSON
// field on that row (not rendered, not editable) so an edit never silently drops it. Only removing the
// whole row removes it.

let nextRowId = 0;
const createRowId = () => `row-${nextRowId++}`;

export interface ExperimentFormValues {
  title: string;
  /** Real subjects/{subjectId} id, chosen from getSubjects() — never a free-typed or mock subject name. */
  subjectId: string;
  /** One aim per line. */
  aim: string;
  theory: string;
  procedure: string[];
  constants: ListItem[];
  inputs: ListItem[];
  runFields: ListItem[];
  formulas: ListItem[];
  outputs: ListItem[];
  graphs: ListItem[];
}

export const EMPTY_EXPERIMENT_FORM: ExperimentFormValues = {
  title: "",
  subjectId: "",
  aim: "",
  theory: "",
  procedure: [""],
  constants: [],
  inputs: [],
  runFields: [],
  formulas: [],
  outputs: [],
  graphs: [],
};

/** A new experiment id, matching the existing convention (pipeflow, centrifugalpump, ...): a plain
 *  lowercase slug with no separators. */
export function slugifyExperimentId(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function encodeJSON(value: unknown): string {
  return value === undefined || value === null ? "" : JSON.stringify(value);
}

function decodeJSON<T>(raw: string | undefined): T | undefined {
  if (!raw) return undefined;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function fieldToItem(field: NormalizedField): ListItem {
  return {
    id: createRowId(),
    key: field.key,
    label: field.label,
    type: field.kind,
    units: field.units.join(", "),
    defaultUnit: field.defaultUnit ?? "",
    calculationUnit: field.calculationUnit ?? "",
    defaultValue: field.defaultValue === undefined ? "" : String(field.defaultValue),
    options: field.options.join(", "),
    optional: field.optional ? "true" : "",
  };
}

/** Populates the form from a real, already-normalized Firestore document (getExperiment()'s result). */
export function experimentToFormValues(experiment: NormalizedExperiment): ExperimentFormValues {
  return {
    title: experiment.title,
    subjectId: experiment.subjectId,
    aim: experiment.aim.join("\n"),
    theory: experiment.theory,
    procedure: experiment.procedure.length > 0 ? experiment.procedure : [""],

    constants: experiment.constants.map((constant) => ({
      id: createRowId(),
      key: constant.key ?? "",
      name: constant.name,
      symbol: constant.symbol ?? "",
      value: String(constant.value),
      unit: constant.unit ?? "",
    })),

    inputs: experiment.inputFields.map(fieldToItem),
    runFields: experiment.runFields.map(fieldToItem),

    formulas: experiment.formulas.map((formula) => ({
      id: createRowId(),
      key: formula.key ?? "",
      name: formula.name,
      formula: formula.formula ?? "",
      expression: formula.expression ?? "",
      _checks: formula.checks && formula.checks.length > 0 ? encodeJSON(formula.checks) : "",
    })),

    outputs: experiment.outputs.map((output) => ({
      id: createRowId(),
      key: output.key,
      label: output.label,
      decimals: output.decimals === undefined ? "" : String(output.decimals),
      unit: output.unit ?? "",
    })),

    graphs: experiment.graphConfigs.map((graph) => ({
      id: createRowId(),
      title: graph.title,
      type: graph.type ?? "",
      xKey: graph.xKey ?? "",
      yKey: graph.yKey ?? "",
      xAxis: graph.xLabel,
      yAxis: graph.yLabel,
      scale: graph.scale,
      xScale: graph.xScale ?? "",
      yScale: graph.yScale ?? "",
      _series: graph.series.length > 0 ? encodeJSON(graph.series) : "",
    })),
  };
}

function isBlankRow(item: ListItem, keys: readonly string[]): boolean {
  return keys.every((key) => !(item[key] ?? "").trim());
}

function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim();

  if (trimmed === "") return undefined;

  const value = Number(trimmed);

  return Number.isFinite(value) ? value : NaN; // NaN signals "present but invalid" to the caller
}

function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

export interface ExperimentDraft {
  title: string;
  subjectId: string;
  aim: string[];
  theory: string;
  procedure: string[];
  constants: Record<string, unknown>[];
  inputFields: Record<string, unknown>[];
  runFields: Record<string, unknown>[];
  formulas: Record<string, unknown>[];
  outputs: Record<string, unknown>[];
  graphConfigs: Record<string, unknown>[];
}

export interface BuildExperimentDraftResult {
  draft: ExperimentDraft | null;
  errors: string[];
}

const CONSTANT_KEYS = ["key", "name", "symbol", "value", "unit"] as const;
const FIELD_KEYS = [
  "key", "label", "type", "units", "defaultUnit", "calculationUnit", "defaultValue", "options", "optional",
] as const;
const FORMULA_KEYS = ["key", "name", "formula", "expression"] as const;
const OUTPUT_KEYS = ["key", "label", "decimals", "unit"] as const;
const GRAPH_KEYS = ["title", "type", "xKey", "yKey", "xAxis", "yAxis", "scale", "xScale", "yScale"] as const;

/**
 * Validates and converts the form into the raw shape written to Firestore. Reuses the real formula parser
 * for every expression, so a formula that would fail in calculateExperiment fails here instead, with a
 * message that names the row. Returns `draft: null` when anything blocks save; blank (untouched) rows are
 * silently dropped rather than treated as errors.
 */
export function buildExperimentDraft(values: ExperimentFormValues): BuildExperimentDraftResult {
  const errors: string[] = [];
  const usedKeys = new Map<string, string>(); // key -> where it was first used, for duplicate messages

  function claimKey(key: string, where: string): boolean {
    if (!isValidVariableKey(key)) {
      errors.push(`${where}: "${key}" is not a valid variable key.`);
      return false;
    }

    const owner = usedKeys.get(key);

    if (owner) {
      errors.push(`${where}: variable key "${key}" is already used by ${owner}.`);
      return false;
    }

    usedKeys.set(key, where);
    return true;
  }

  const title = values.title.trim();
  if (!title) errors.push("Enter an experiment title.");

  const subjectId = values.subjectId.trim();
  if (!subjectId) errors.push("Choose a subject.");

  const aim = values.aim.split("\n").map((line) => line.trim()).filter(Boolean);
  const procedure = values.procedure.map((step) => step.trim()).filter(Boolean);

  const constants: Record<string, unknown>[] = [];

  values.constants.forEach((item, index) => {
    if (isBlankRow(item, CONSTANT_KEYS)) return;

    const where = `Constant ${index + 1} (${item.name || item.key || "untitled"})`;
    const key = item.key.trim();
    const value = parseOptionalNumber(item.value);

    if (!key) {
      errors.push(`${where}: a variable key is required.`);
      return;
    }
    if (value === undefined || Number.isNaN(value)) {
      errors.push(`${where}: a numeric value is required.`);
      return;
    }
    if (!claimKey(key, where)) return;

    constants.push({
      key,
      name: item.name.trim() || key,
      ...(item.symbol.trim() ? { symbol: item.symbol.trim() } : {}),
      value,
      ...(item.unit.trim() ? { unit: item.unit.trim() } : {}),
    });
  });

  function buildFields(items: ListItem[], label: string): Record<string, unknown>[] {
    const fields: Record<string, unknown>[] = [];

    items.forEach((item, index) => {
      if (isBlankRow(item, FIELD_KEYS)) return;

      const where = `${label} ${index + 1} (${item.label || item.key || "untitled"})`;
      const key = item.key.trim();

      if (!key) {
        errors.push(`${where}: a variable key is required.`);
        return;
      }
      if (!item.label.trim()) {
        errors.push(`${where}: a label is required.`);
        return;
      }
      if (!claimKey(key, where)) return;

      const defaultValue = parseOptionalNumber(item.defaultValue);
      if (defaultValue !== undefined && Number.isNaN(defaultValue)) {
        errors.push(`${where}: default value must be numeric.`);
        return;
      }

      fields.push({
        key,
        label: item.label.trim(),
        type: item.type.trim() || "number",
        units: splitList(item.units),
        ...(item.defaultUnit.trim() ? { defaultUnit: item.defaultUnit.trim() } : {}),
        ...(item.calculationUnit.trim() ? { calculationUnit: item.calculationUnit.trim() } : {}),
        ...(defaultValue !== undefined ? { defaultValue } : {}),
        ...(item.options.trim() ? { options: splitList(item.options) } : {}),
        ...(item.optional.trim().toLowerCase() === "true" ? { optional: true } : {}),
      });
    });

    return fields;
  }

  const inputFields = buildFields(values.inputs, "Input");
  const runFields = buildFields(values.runFields, "Run field");

  const formulas: Record<string, unknown>[] = [];

  values.formulas.forEach((item, index) => {
    if (isBlankRow(item, FORMULA_KEYS)) return;

    const where = `Formula ${index + 1} (${item.name || item.key || "untitled"})`;
    const key = item.key.trim();
    const expression = item.expression.trim();

    if (!key) {
      errors.push(`${where}: a variable key is required.`);
      return;
    }
    if (!expression) {
      errors.push(`${where}: a calculation expression is required.`);
      return;
    }

    try {
      parseFormulaExpression(expression);
    } catch (error) {
      if (error instanceof FormulaSyntaxError) {
        errors.push(`${where}: ${error.message}`);
      } else {
        throw error;
      }
      return;
    }

    if (!claimKey(key, where)) return;

    const checks = decodeJSON<unknown[]>(item._checks);

    formulas.push({
      key,
      name: item.name.trim() || key,
      ...(item.formula.trim() ? { formula: item.formula.trim() } : {}),
      expression,
      ...(checks && checks.length > 0 ? { checks } : {}),
    });
  });

  const outputs: Record<string, unknown>[] = [];

  values.outputs.forEach((item, index) => {
    if (isBlankRow(item, OUTPUT_KEYS)) return;

    const where = `Output ${index + 1} (${item.label || item.key || "untitled"})`;
    const key = item.key.trim();

    if (!key) {
      errors.push(`${where}: a variable key is required.`);
      return;
    }
    if (!isValidVariableKey(key)) {
      errors.push(`${where}: "${key}" is not a valid variable key.`);
      return;
    }

    const decimals = parseOptionalNumber(item.decimals);
    if (decimals !== undefined && Number.isNaN(decimals)) {
      errors.push(`${where}: decimals must be numeric.`);
      return;
    }

    outputs.push({
      key,
      label: item.label.trim() || key,
      ...(decimals !== undefined ? { decimals: Math.max(0, Math.trunc(decimals)) } : {}),
      ...(item.unit.trim() ? { unit: item.unit.trim() } : {}),
    });
  });

  const graphConfigs: Record<string, unknown>[] = [];

  values.graphs.forEach((item, index) => {
    if (isBlankRow(item, GRAPH_KEYS)) return;

    const where = `Graph ${index + 1} (${item.title || "untitled"})`;

    if (!item.title.trim()) {
      errors.push(`${where}: a title is required.`);
      return;
    }

    const series = decodeJSON<{ yKey?: string }[]>(item._series);
    const hasPlotData =
      (item.xKey.trim() && item.yKey.trim()) || (series && series.some((line) => line.yKey));

    if (!hasPlotData) {
      errors.push(`${where}: needs both an X key and a Y key (or must keep its existing series) to plot anything.`);
      return;
    }

    graphConfigs.push({
      title: item.title.trim(),
      ...((item.type ?? "").trim() ? { type: (item.type ?? "").trim() } : {}),
      ...(item.xKey.trim() ? { xKey: item.xKey.trim() } : {}),
      ...(item.yKey.trim() ? { yKey: item.yKey.trim() } : {}),
      xAxis: item.xAxis.trim(),
      yAxis: item.yAxis.trim(),
      scale: item.scale.trim().toLowerCase() === "log" ? "log" : "linear",
      ...((item.xScale ?? "").trim() ? { xScale: (item.xScale ?? "").trim() } : {}),
      ...((item.yScale ?? "").trim() ? { yScale: (item.yScale ?? "").trim() } : {}),
      ...(series && series.length > 0 ? { series } : {}),
    });
  });

  if (errors.length > 0) return { draft: null, errors };

  return {
    draft: {
      title,
      subjectId,
      aim,
      theory: values.theory.trim(),
      procedure,
      constants,
      inputFields,
      runFields,
      formulas,
      outputs,
      graphConfigs,
    },
    errors: [],
  };
}

/** The draft's writable content fields as a plain Firestore document body (no id/subjectId/isPublished/
 *  createdBy/createdAt — those are metadata the create/update service functions own, not the form). */
export function draftToRawExperimentData(draft: ExperimentDraft): RawExperimentData {
  return {
    title: draft.title,
    aim: draft.aim,
    theory: draft.theory,
    procedure: draft.procedure,
    constants: draft.constants,
    inputFields: draft.inputFields,
    runFields: draft.runFields,
    formulas: draft.formulas,
    outputs: draft.outputs,
    graphConfigs: draft.graphConfigs,
  };
}
