import type {
  CalculateExperimentParams,
  CalculationIssue,
  CalculationResult,
  OutputValue,
  QuantityInput,
  QuantityInputs,
} from "../../types/Calculation";
import type { NormalizedExperiment, NormalizedField } from "../../types/Experiment";
import {
  evaluateFormula,
  findUnknownVariables,
  FormulaEvaluationError,
  FormulaSyntaxError,
  isValidVariableKey,
  parseFormulaExpression,
  type ParsedFormula,
} from "./formulaEvaluator";
import { buildGraphData } from "./graphData";
import {
  CALCULATION_FAILED_MESSAGE,
  createIssue,
  NOT_CONFIGURED_MESSAGE,
} from "./issues";
import { areSameUnit, convertUnit, UnitConversionError } from "./units";

// Pure module: no Firebase, React or UI imports.

const NUMERIC_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

const hasOwn = (target: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(target, key);

/** Strict number parsing: rejects "", "abc", "1,5", "0x10", "Infinity". */
export function parseNumericInput(value: string | number): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;

  const trimmed = value.trim();

  if (!NUMERIC_PATTERN.test(trimmed)) return undefined;

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : undefined;
}

export function formatOutputValue(value: number, decimals?: number): string {
  if (decimals === undefined) return String(Number(value.toPrecision(10)));

  return value.toFixed(Math.min(Math.max(Math.trunc(decimals), 0), 20));
}

type FieldKind = "input" | "run";

interface ScopeBuilder {
  scope: Record<string, number>;
  owners: Map<string, string>;
  errors: CalculationIssue[];
}

function registerVariable(
  builder: ScopeBuilder,
  key: string,
  value: number,
  source: string,
  extra: Partial<CalculationIssue> = {},
): void {
  if (!isValidVariableKey(key)) {
    builder.errors.push(
      createIssue(
        "INVALID_VARIABLE_KEY",
        "error",
        `${source} has an invalid variable key "${key}".`,
        NOT_CONFIGURED_MESSAGE,
        { variable: key, ...extra },
      ),
    );
    return;
  }

  const owner = builder.owners.get(key);

  if (owner !== undefined) {
    builder.errors.push(
      createIssue(
        "DUPLICATE_VARIABLE_KEY",
        "error",
        `Variable key "${key}" is used by both ${owner} and ${source}.`,
        NOT_CONFIGURED_MESSAGE,
        { variable: key, ...extra },
      ),
    );
    return;
  }

  builder.owners.set(key, source);
  builder.scope[key] = value;
}

const isBlank = (value: string | number | null | undefined): boolean =>
  value === undefined || value === null || String(value).trim() === "";

/** Converts one student-entered numeric field into the unit the formulas expect. */
function resolveNumberField(
  field: NormalizedField,
  raw: QuantityInput | undefined,
  kind: FieldKind,
  errors: CalculationIssue[],
): number | undefined {
  const base = { fieldKey: field.key, fieldKind: kind } as const;
  const rawValue = raw?.value;

  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
    errors.push(
      createIssue(
        "INPUT_REQUIRED",
        "error",
        `Field "${field.label}" (${field.key}) is required.`,
        `${field.label} is required.`,
        base,
      ),
    );
    return undefined;
  }

  const value = parseNumericInput(rawValue);

  if (value === undefined) {
    errors.push(
      createIssue(
        "INPUT_INVALID_NUMBER",
        "error",
        `Field "${field.label}" (${field.key}) has a non-numeric value: ${JSON.stringify(rawValue)}.`,
        `${field.label} must be a valid number.`,
        base,
      ),
    );
    return undefined;
  }

  const selectedUnit = raw?.unit?.trim() || field.defaultUnit || field.units[0];
  const targetUnit = field.calculationUnit ?? field.defaultUnit ?? field.units[0];

  if (
    selectedUnit &&
    field.units.length > 0 &&
    !field.units.some((unit) => areSameUnit(unit, selectedUnit))
  ) {
    errors.push(
      createIssue(
        "UNSUPPORTED_UNIT",
        "error",
        `Field "${field.label}" (${field.key}) does not accept unit "${selectedUnit}"; allowed: ${field.units.join(", ")}.`,
        `${field.label} does not accept the unit "${selectedUnit}".`,
        { ...base, unit: selectedUnit },
      ),
    );
    return undefined;
  }

  if (!selectedUnit || !targetUnit || areSameUnit(selectedUnit, targetUnit)) return value;

  try {
    return convertUnit(value, selectedUnit, targetUnit);
  } catch (error) {
    if (!(error instanceof UnitConversionError)) throw error;

    errors.push(
      createIssue(
        "UNSUPPORTED_UNIT",
        "error",
        `Field "${field.label}" (${field.key}): ${error.message}`,
        `Unsupported unit conversion: ${selectedUnit} to ${targetUnit}.`,
        { ...base, unit: selectedUnit },
      ),
    );
    return undefined;
  }
}

function collectFieldValues(
  fields: NormalizedField[],
  provided: QuantityInputs,
  kind: FieldKind,
  builder: ScopeBuilder,
): void {
  const source = kind === "input" ? "an input field" : "a run field";

  for (const field of fields) {
    const raw = hasOwn(provided, field.key) ? provided[field.key] : undefined;

    if (field.kind === "choice") {
      const selection = raw?.value === undefined ? "" : String(raw.value).trim();

      if (selection === "") {
        builder.errors.push(
          createIssue(
            "INPUT_REQUIRED",
            "error",
            `Field "${field.label}" (${field.key}) is required.`,
            `${field.label} is required.`,
            { fieldKey: field.key, fieldKind: kind },
          ),
        );
      } else if (field.options.length > 0 && !field.options.includes(selection)) {
        builder.errors.push(
          createIssue(
            "INVALID_CHOICE",
            "error",
            `Field "${field.label}" (${field.key}) has value "${selection}", which is not one of: ${field.options.join(", ")}.`,
            `${field.label} has an invalid selection.`,
            { fieldKey: field.key, fieldKind: kind },
          ),
        );
      }

      // Choices are not numeric, so they never enter the formula scope.
      continue;
    }

    // An optional field left blank is not an error: it is just not in the scope, so a formula can
    // fall back with coalesce(). One that is filled in is checked and converted like any other.
    if (field.optional && isBlank(raw?.value)) continue;

    const value = resolveNumberField(field, raw, kind, builder.errors);

    if (value !== undefined) {
      registerVariable(builder, field.key, value, `${source} "${field.key}"`);
    }
  }
}

function describeFormula(formula: NormalizedExperiment["formulas"][number]) {
  return { formulaKey: formula.key, formulaName: formula.name };
}

/** Which kind of field (if any) a check names, so its message can be shown next to that field. */
function fieldKindOf(experiment: NormalizedExperiment, key: string): "input" | "run" | undefined {
  if (experiment.inputFields.some((field) => field.key === key)) return "input";
  if (experiment.runFields.some((field) => field.key === key)) return "run";

  return undefined;
}

/**
 * Runs a formula's domain checks before the formula itself. Returns false when any check fails or cannot
 * be evaluated, after recording why. A failed check gives the student the check's own message.
 *
 * Variables a check needs that belong to a formula which already failed a check are not reported again:
 * the student has been told the cause, and "not configured" would be misleading.
 */
function runFormulaChecks(
  experiment: NormalizedExperiment,
  formula: NormalizedExperiment["formulas"][number],
  key: string,
  scope: Record<string, number>,
  failed: ReadonlySet<string>,
  failedByCheck: ReadonlySet<string>,
  errors: CalculationIssue[],
): boolean {
  const who = describeFormula(formula);
  let passed = true;

  for (const check of formula.checks ?? []) {
    let parsed: ParsedFormula;

    try {
      parsed = parseFormulaExpression(check.expression);
    } catch (error) {
      if (!(error instanceof FormulaSyntaxError)) throw error;

      errors.push(
        createIssue(error.code, "error", `Formula ${key}: check "${check.expression}": ${error.message}`, NOT_CONFIGURED_MESSAGE, who),
      );
      passed = false;
      continue;
    }

    const unavailable = findUnknownVariables(parsed, scope);

    if (unavailable.length > 0) {
      passed = false;

      for (const variable of unavailable) {
        if (failedByCheck.has(variable)) continue;

        errors.push(
          failed.has(variable)
            ? createIssue(
                "FORMULA_DEPENDENCY_FAILED",
                "error",
                `Formula ${key}: its check "${check.expression}" depends on "${variable}", which could not be calculated.`,
                NOT_CONFIGURED_MESSAGE,
                { ...who, variable },
              )
            : createIssue(
                "UNKNOWN_FORMULA_VARIABLE",
                "error",
                `Formula ${key}: its check "${check.expression}" references unknown variable "${variable}".`,
                NOT_CONFIGURED_MESSAGE,
                { ...who, variable },
              ),
        );
      }

      continue;
    }

    let value: number;

    try {
      value = evaluateFormula(parsed, scope);
    } catch (error) {
      if (!(error instanceof FormulaEvaluationError)) throw error;

      errors.push(
        createIssue(error.code, "error", `Formula ${key}: check "${check.expression}": ${error.message}`, CALCULATION_FAILED_MESSAGE, who),
      );
      passed = false;
      continue;
    }

    const satisfied = check.rule === "positive" ? value > 0 : value >= 0;

    if (satisfied) continue;

    const kind = check.field === undefined ? undefined : fieldKindOf(experiment, check.field);

    errors.push(
      createIssue(
        "DOMAIN_CHECK_FAILED",
        "error",
        `Formula ${key}: the check "${check.expression}" must be ${check.rule === "positive" ? "greater than 0" : "at least 0"} but is ${value}.`,
        check.message ?? CALCULATION_FAILED_MESSAGE,
        { ...who, ...(kind ? { fieldKey: check.field, fieldKind: kind } : {}) },
      ),
    );
    passed = false;
  }

  return passed;
}

function evaluateFormulas(
  experiment: NormalizedExperiment,
  scope: Record<string, number>,
  calculated: Record<string, number>,
  errors: CalculationIssue[],
): void {
  const failed = new Set<string>();
  // Formulas that failed a domain check, or that only depend on one that did. Their dependants are skipped
  // quietly: the check's message already tells the student what to fix.
  const failedByCheck = new Set<string>();
  const laterKeys = new Set<string>();

  experiment.formulas.forEach((formula) => {
    if (formula.key) laterKeys.add(formula.key);
  });

  for (const formula of experiment.formulas) {
    const label = formula.key ?? formula.name;
    const who = describeFormula(formula);

    if (formula.key) laterKeys.delete(formula.key);

    if (!formula.expression) {
      errors.push(
        createIssue(
          "FORMULA_EXPRESSION_MISSING",
          "error",
          `Formula ${label} has a display formula but no machine-readable expression.`,
          NOT_CONFIGURED_MESSAGE,
          who,
        ),
      );

      if (formula.key) failed.add(formula.key);
      continue;
    }

    if (!formula.key) {
      errors.push(
        createIssue(
          "FORMULA_KEY_MISSING",
          "error",
          `Formula "${formula.name}" has an expression but no key, so its result cannot be stored.`,
          NOT_CONFIGURED_MESSAGE,
          who,
        ),
      );
      continue;
    }

    const key = formula.key;

    if (!isValidVariableKey(key)) {
      errors.push(
        createIssue(
          "INVALID_VARIABLE_KEY",
          "error",
          `Formula "${formula.name}" has an invalid variable key "${key}".`,
          NOT_CONFIGURED_MESSAGE,
          { ...who, variable: key },
        ),
      );
      failed.add(key);
      continue;
    }

    if (hasOwn(scope, key)) {
      errors.push(
        createIssue(
          "DUPLICATE_VARIABLE_KEY",
          "error",
          `Formula "${formula.name}" reuses the variable key "${key}".`,
          NOT_CONFIGURED_MESSAGE,
          { ...who, variable: key },
        ),
      );
      failed.add(key);
      continue;
    }

    let parsed: ParsedFormula;

    try {
      parsed = parseFormulaExpression(formula.expression);
    } catch (error) {
      if (!(error instanceof FormulaSyntaxError)) throw error;

      errors.push(createIssue(error.code, "error", `Formula ${key}: ${error.message}`, NOT_CONFIGURED_MESSAGE, who));
      failed.add(key);
      continue;
    }

    const unavailable = findUnknownVariables(parsed, scope);

    if (unavailable.length > 0) {
      if (unavailable.every((variable) => failedByCheck.has(variable))) {
        // The formula cannot run because a check upstream already failed. Its own checks may still be
        // evaluable (for example one that only reads an input), and they are reported now, so the student
        // sees every problem at once instead of one per attempt. Checks that need the missing values are
        // skipped quietly.
        runFormulaChecks(experiment, formula, key, scope, failed, failedByCheck, errors);
        failed.add(key);
        failedByCheck.add(key);
        continue;
      }

      for (const variable of unavailable) {
        if (failedByCheck.has(variable)) continue;

        if (failed.has(variable)) {
          errors.push(
            createIssue(
              "FORMULA_DEPENDENCY_FAILED",
              "error",
              `Formula ${key} depends on "${variable}", which could not be calculated.`,
              NOT_CONFIGURED_MESSAGE,
              { ...who, variable },
            ),
          );
        } else {
          const order = laterKeys.has(variable)
            ? ` "${variable}" is defined later in the formula list; formulas are evaluated in order.`
            : "";

          errors.push(
            createIssue(
              "UNKNOWN_FORMULA_VARIABLE",
              "error",
              `Formula ${key} references unknown variable "${variable}".${order}`,
              NOT_CONFIGURED_MESSAGE,
              { ...who, variable },
            ),
          );
        }
      }

      failed.add(key);
      continue;
    }

    if (!runFormulaChecks(experiment, formula, key, scope, failed, failedByCheck, errors)) {
      failed.add(key);
      failedByCheck.add(key);
      continue;
    }

    try {
      const value = evaluateFormula(parsed, scope);

      scope[key] = value;
      calculated[key] = value;
    } catch (error) {
      if (!(error instanceof FormulaEvaluationError)) throw error;

      errors.push(
        createIssue(
          error.code,
          "error",
          `Formula ${key} ("${formula.expression}"): ${error.message}`,
          CALCULATION_FAILED_MESSAGE,
          who,
        ),
      );
      failed.add(key);
    }
  }
}

function collectOutputs(
  experiment: NormalizedExperiment,
  scope: Readonly<Record<string, number>>,
  warnings: CalculationIssue[],
): { outputs: OutputValue[]; results: Record<string, number> } {
  let definitions = experiment.outputs.map((output) => ({
    key: output.key,
    label: output.label,
    decimals: output.decimals,
  }));

  if (definitions.length === 0) {
    warnings.push(
      createIssue(
        "NO_OUTPUTS_DEFINED",
        "warning",
        "The experiment defines no outputs; every calculated formula is returned instead.",
        NOT_CONFIGURED_MESSAGE,
      ),
    );

    definitions = experiment.formulas
      .filter((formula) => formula.key !== undefined)
      .map((formula) => ({ key: formula.key as string, label: formula.name, decimals: undefined }));
  }

  const outputs: OutputValue[] = [];
  const results: Record<string, number> = {};

  for (const definition of definitions) {
    if (!hasOwn(scope, definition.key)) {
      warnings.push(
        createIssue(
          "OUTPUT_VARIABLE_UNAVAILABLE",
          "warning",
          `Output "${definition.key}" is not a calculated or entered variable.`,
          NOT_CONFIGURED_MESSAGE,
          { variable: definition.key },
        ),
      );
      continue;
    }

    const value = scope[definition.key];

    results[definition.key] = value;
    outputs.push({
      key: definition.key,
      label: definition.label,
      value,
      decimals: definition.decimals,
      displayValue: formatOutputValue(value, definition.decimals),
    });
  }

  return { outputs, results };
}

/**
 * Runs one experiment run through the experiment's own definition.
 *
 * Nothing is specific to any experiment: constants, inputs and run values form the scope, and the
 * formulas are then evaluated in the stored order, each result joining the scope for the next.
 *
 * Constants are used as stored (never converted). Inputs and run values are converted from the unit
 * the student selected into the field's calculation unit (calculationUnit, else defaultUnit, else the
 * first listed unit) before any formula runs. Fields with no unit metadata are used as entered.
 */
export function calculateExperiment({
  experiment,
  inputs,
  runValues,
}: CalculateExperimentParams): CalculationResult {
  const builder: ScopeBuilder = {
    scope: Object.create(null) as Record<string, number>,
    owners: new Map(),
    errors: [],
  };
  const warnings: CalculationIssue[] = [];

  for (const constant of experiment.constants) {
    if (constant.key === undefined) continue;

    registerVariable(builder, constant.key, constant.value, `constant "${constant.key}"`);
  }

  collectFieldValues(experiment.inputFields, inputs, "input", builder);
  collectFieldValues(experiment.runFields, runValues, "run", builder);

  if (experiment.formulas.length === 0) {
    builder.errors.push(
      createIssue(
        "NO_FORMULAS_DEFINED",
        "error",
        "The experiment defines no formulas.",
        NOT_CONFIGURED_MESSAGE,
      ),
    );
  }

  // Student mistakes are reported before any formula runs, so the student can fix them all at once.
  const hasStudentErrors = builder.errors.some((issue) => issue.fieldKey !== undefined);

  if (hasStudentErrors) {
    return { ok: false, errors: builder.errors, warnings };
  }

  const calculated = Object.create(null) as Record<string, number>;

  evaluateFormulas(experiment, builder.scope, calculated, builder.errors);

  if (builder.errors.length > 0) {
    return { ok: false, errors: builder.errors, warnings };
  }

  const { outputs, results } = collectOutputs(experiment, builder.scope, warnings);
  const graphData = buildGraphData(experiment.graphConfigs, builder.scope, warnings);

  return {
    ok: true,
    scope: { ...builder.scope },
    calculated: { ...calculated },
    results,
    outputs,
    graphData,
    warnings,
  };
}
