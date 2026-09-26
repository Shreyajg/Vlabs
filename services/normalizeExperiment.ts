import type { Timestamp } from "firebase/firestore";
import type {
  FieldKind,
  FormulaCheckRule,
  NormalizedConstant,
  NormalizedExperiment,
  NormalizedField,
  NormalizedFormula,
  NormalizedFormulaCheck,
  NormalizedGraphConfig,
  NormalizedOutput,
  RawExperimentData,
} from "../types/Experiment";

// Pure module: no Firebase imports at runtime, so it is unit-testable in Node.

const NUMERIC_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

const CHOICE_TYPES = new Set(["dropdown", "select", "choice", "enum", "option"]);
const NUMBER_TYPES = new Set(["number", "numeric"]);

type Warnings = string[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && NUMERIC_PATTERN.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    const single = asString(value);
    return single ? [single] : [];
  }

  if (!Array.isArray(value)) return [];

  return value
    .map((item) => asString(item))
    .filter((item): item is string => item !== undefined);
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isTimestampLike(value: unknown): value is Timestamp {
  return isRecord(value) && typeof value.toDate === "function";
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/** Unit lists sometimes arrive comma-joined in one string, e.g. ["m²,cm²"]. */
function normalizeUnitList(value: unknown, context: string, warnings: Warnings): string[] {
  const entries = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  const units: string[] = [];

  for (const entry of entries) {
    if (typeof entry !== "string") continue;

    const parts = entry
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "");

    if (parts.length > 1) {
      warnings.push(`${context}: unit entry "${entry}" was split into ${parts.length} units.`);
    }

    units.push(...parts);
  }

  return unique(units);
}

function normalizeField(
  raw: Record<string, unknown>,
  context: string,
  warnings: Warnings,
): NormalizedField | null {
  const key = asString(raw.key);

  if (!key) {
    warnings.push(`${context} has no key and was skipped.`);
    return null;
  }

  const rawType = asString(raw.type)?.toLowerCase();
  const kind: FieldKind = rawType && CHOICE_TYPES.has(rawType) ? "choice" : "number";

  if (rawType && !CHOICE_TYPES.has(rawType) && !NUMBER_TYPES.has(rawType)) {
    warnings.push(`${context} (${key}) has unknown type "${rawType}"; treated as a number.`);
  }

  let units = normalizeUnitList(raw.units, `${context} (${key})`, warnings);

  const defaultUnit = asString(raw.defaultUnit) ?? asString(raw.unit) ?? asString(raw.Unit) ?? units[0];

  if (defaultUnit && !units.includes(defaultUnit)) {
    warnings.push(`${context} (${key}): default unit "${defaultUnit}" was not in its unit list.`);
    units = [defaultUnit, ...units];
  }

  const defaultValue =
    kind === "number"
      ? asFiniteNumber(raw.defaultValue ?? raw.default)
      : asString(raw.defaultValue ?? raw.default);

  return {
    key,
    label: asString(raw.label) ?? asString(raw.name) ?? key,
    kind,
    units,
    defaultUnit,
    calculationUnit: asString(raw.calculationUnit),
    defaultValue,
    options: asStringArray(raw.options),
    // Only ever set to true, so fields that do not use it keep exactly the shape they had.
    ...(raw.optional === true ? { optional: true } : {}),
  };
}

function normalizeFields(value: unknown, context: string, warnings: Warnings): NormalizedField[] {
  const fields: NormalizedField[] = [];
  const seen = new Set<string>();

  asRecords(value).forEach((raw, index) => {
    const field = normalizeField(raw, `${context}[${index}]`, warnings);

    if (!field) return;

    if (seen.has(field.key)) {
      warnings.push(`${context}[${index}]: duplicate key "${field.key}" was skipped.`);
      return;
    }

    seen.add(field.key);
    fields.push(field);
  });

  return fields;
}

function normalizeConstants(value: unknown, warnings: Warnings): NormalizedConstant[] {
  const constants: NormalizedConstant[] = [];

  asRecords(value).forEach((raw, index) => {
    const key = asString(raw.key);
    const numericValue = asFiniteNumber(raw.value);

    if (numericValue === undefined) {
      warnings.push(`constants[${index}] has no numeric value and was skipped.`);
      return;
    }

    constants.push({
      key,
      name: asString(raw.name) ?? asString(raw.label) ?? key ?? asString(raw.symbol) ?? "",
      symbol: asString(raw.symbol),
      value: numericValue,
      unit: asString(raw.unit),
    });
  });

  return constants;
}

const CHECK_RULES: ReadonlySet<string> = new Set<FormulaCheckRule>(["positive", "nonNegative"]);

function normalizeChecks(value: unknown, context: string, warnings: Warnings): NormalizedFormulaCheck[] {
  const checks: NormalizedFormulaCheck[] = [];

  asRecords(value).forEach((raw, index) => {
    const expression = asString(raw.expression);
    const rule = asString(raw.rule);

    if (!expression || !rule || !CHECK_RULES.has(rule)) {
      // A rule that cannot be read is reported, never silently dropped: it was put there to protect a value.
      warnings.push(`${context}.checks[${index}] needs an expression and a rule of "positive" or "nonNegative"; it was skipped.`);
      return;
    }

    const message = asString(raw.message);
    const field = asString(raw.field);

    checks.push({
      expression,
      rule: rule as FormulaCheckRule,
      ...(message ? { message } : {}),
      ...(field ? { field } : {}),
    });
  });

  return checks;
}

function normalizeFormulas(value: unknown, warnings: Warnings): NormalizedFormula[] {
  return asRecords(value).map((raw, index) => {
    const key = asString(raw.key);
    const formula = asString(raw.formula);
    const checks = normalizeChecks(raw.checks, `formulas[${index}]`, warnings);

    return {
      key,
      name: asString(raw.name) ?? asString(raw.label) ?? key ?? formula ?? "",
      expression: asString(raw.expression),
      formula,
      // Only present when the formula has checks, so formulas without them keep exactly their old shape.
      ...(checks.length > 0 ? { checks } : {}),
    };
  });
}

function normalizeOutputs(value: unknown, warnings: Warnings): NormalizedOutput[] {
  const outputs: NormalizedOutput[] = [];

  asRecords(value).forEach((raw, index) => {
    const key = asString(raw.key);

    if (!key) {
      warnings.push(`outputs[${index}] has no key and was skipped.`);
      return;
    }

    const decimals = asFiniteNumber(raw.decimals);

    outputs.push({
      key,
      label: asString(raw.label) ?? asString(raw.name) ?? key,
      decimals: decimals === undefined ? undefined : Math.max(0, Math.trunc(decimals)),
      unit: asString(raw.unit),
    });
  });

  return outputs;
}

function asAxisScale(value: unknown): "linear" | "log" | undefined {
  const scale = asString(value)?.toLowerCase();

  return scale === "log" || scale === "linear" ? scale : undefined;
}

function normalizeGraph(
  raw: Record<string, unknown>,
  source: NormalizedGraphConfig["source"],
  index: number,
): NormalizedGraphConfig {
  const xScale = asAxisScale(raw.xScale);
  const yScale = asAxisScale(raw.yScale);

  return {
    title: asString(raw.title) ?? `Graph ${index + 1}`,
    type: asString(raw.type),
    xKey: asString(raw.xKey),
    yKey: asString(raw.yKey),
    xLabel: asString(raw.xLabel) ?? asString(raw.xAxis) ?? "",
    yLabel: asString(raw.yLabel) ?? asString(raw.yAxis) ?? "",
    scale: asString(raw.scale)?.toLowerCase() === "log" ? "log" : "linear",
    // Only present when the definition states them, so graphs that use `scale` alone keep their old shape.
    ...(xScale ? { xScale } : {}),
    ...(yScale ? { yScale } : {}),
    series: asRecords(raw.series).map((item) => {
      const yKey = asString(item.yKey);
      const seriesXKey = asString(item.xKey);

      return {
        label: asString(item.label) ?? "",
        ...(yKey ? { yKey } : {}),
        ...(seriesXKey ? { xKey: seriesXKey } : {}),
      };
    }),
    source,
  };
}

function normalizeGraphs(raw: RawExperimentData): NormalizedGraphConfig[] {
  const graphs = asRecords(raw.graphConfigs).map((item, index) =>
    normalizeGraph(item, "graphConfigs", index),
  );

  // Older documents store a single machine-readable graph under `graph`.
  if (isRecord(raw.graph)) {
    const legacy = normalizeGraph(raw.graph, "graph", graphs.length);

    if (!graphs.some((graph) => graph.title === legacy.title)) {
      graphs.unshift(legacy);
    }
  }

  return graphs;
}

export interface NormalizeExperimentParams {
  id: string;
  subjectId: string;
  data: RawExperimentData;
}

export function normalizeExperiment({
  id,
  subjectId,
  data,
}: NormalizeExperimentParams): NormalizedExperiment {
  const warnings: Warnings = [];

  // Some documents use runInputs, others runFields.
  const runFields = normalizeFields(data.runFields, "runFields", warnings);
  const runSource =
    runFields.length > 0 ? runFields : normalizeFields(data.runInputs, "runInputs", warnings);

  return {
    id,
    subjectId,
    title: asString(data.title) ?? id,
    aim: asStringArray(data.aim),
    theory: typeof data.theory === "string" ? data.theory : "",
    procedure: asStringArray(data.procedure),

    constants: normalizeConstants(data.constants, warnings),
    inputFields: normalizeFields(data.inputFields, "inputFields", warnings),
    runFields: runSource,

    formulas: normalizeFormulas(data.formulas, warnings),
    outputs: normalizeOutputs(data.outputs, warnings),
    graphConfigs: normalizeGraphs(data),

    route: asString(data.route),
    isPublished: data.isPublished === true,
    createdBy: asString(data.createdBy),
    createdAt: isTimestampLike(data.createdAt) ? data.createdAt : null,
    updatedAt: isTimestampLike(data.updatedAt) ? data.updatedAt : null,

    warnings,
  };
}
