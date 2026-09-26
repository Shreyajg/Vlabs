import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { QuantityInputs } from "../../../types/Calculation";
import type { NormalizedExperiment, RawExperimentData } from "../../../types/Experiment";
import { normalizeExperiment } from "../../normalizeExperiment";
import { calculateExperiment } from "../calculateExperiment";
import {
  ALLOWED_FUNCTION_NAMES,
  FormulaEvaluationError,
  FormulaSyntaxError,
  evaluateFormula,
  findUnknownVariables,
  parseFormulaExpression,
} from "../formulaEvaluator";

// The generic mechanism behind an optional run input: a field flagged `optional` may be left blank, and a
// formula reads it through coalesce(field, fallback). Nothing here is specific to any one experiment.

const evaluate = (expression: string, scope: Record<string, number> = {}) =>
  evaluateFormula(parseFormulaExpression(expression), scope);

describe("coalesce(): parsing", () => {
  it("is an allowed function", () => {
    assert.ok(ALLOWED_FUNCTION_NAMES.includes("coalesce"));
  });

  it("treats the variables of every argument but the last as optional, and the last one's as required", () => {
    const parsed = parseFormulaExpression("coalesce(rm, lhs - rhs)");

    assert.deepEqual(parsed.optionalVariables, ["rm"]);
    assert.deepEqual([...parsed.variables].sort(), ["lhs", "rhs"]);
  });

  it("does not report an optional variable as unknown when it is undefined", () => {
    const parsed = parseFormulaExpression("coalesce(rm, lhs - rhs)");

    assert.deepEqual(findUnknownVariables(parsed, { lhs: 1, rhs: 1 }), []);
    assert.deepEqual(findUnknownVariables(parsed, { rm: 1 }).sort(), ["lhs", "rhs"], "the fallback's variables are required");
  });

  it("a variable that is optional in one place but required in another is required", () => {
    const parsed = parseFormulaExpression("coalesce(a, 1) + a");

    assert.deepEqual(parsed.optionalVariables, []);
    assert.deepEqual(parsed.variables, ["a"]);
  });

  it("needs at least two arguments", () => {
    assert.throws(() => parseFormulaExpression("coalesce(a)"), (error: unknown) => error instanceof FormulaSyntaxError && error.code === "UNSUPPORTED_FORMULA_SYNTAX");
  });

  it("still validates every argument against the allow-list", () => {
    assert.throws(() => parseFormulaExpression("coalesce(a, constructor(1))"), FormulaSyntaxError);
    assert.throws(() => parseFormulaExpression("coalesce(evil(a), 1)"), FormulaSyntaxError);
    assert.throws(() => parseFormulaExpression("coalesce(a, 'text')"), FormulaSyntaxError);
  });

  it("other functions are still not treated as lazy: their variables are required", () => {
    assert.deepEqual(parseFormulaExpression("max(a, b)").optionalVariables, []);
    assert.deepEqual(parseFormulaExpression("max(a, b)").variables.sort(), ["a", "b"]);
  });
});

describe("coalesce(): evaluation", () => {
  it("uses the first argument when everything it needs is defined", () => {
    assert.equal(evaluate("coalesce(rm, lhs - rhs)", { rm: 0.15, lhs: 0.3, rhs: 0.2 }), 0.15);
  });

  it("falls back when the first argument's variable is not defined", () => {
    assert.equal(evaluate("coalesce(rm, lhs - rhs)", { lhs: 0.3, rhs: 0.2 }), 0.3 - 0.2);
  });

  it("uses a defined value of zero (zero is a value, not 'missing')", () => {
    assert.equal(evaluate("coalesce(rm, 99)", { rm: 0 }), 0);
  });

  it("takes the first computable argument of several", () => {
    assert.equal(evaluate("coalesce(a, b, c, 7)", { c: 3 }), 3);
    assert.equal(evaluate("coalesce(a, b, c, 7)", { b: 2, c: 3 }), 2);
    assert.equal(evaluate("coalesce(a, b, c, 7)", {}), 7);
  });

  it("works on whole expressions, not just names", () => {
    assert.equal(evaluate("coalesce(x * 2, y)", { x: 4, y: 1 }), 8);
    assert.equal(evaluate("coalesce(x * 2, y)", { y: 1 }), 1);
  });

  it("can be part of a larger expression", () => {
    assert.equal(evaluate("10 * coalesce(a, 2) + 1", {}), 21);
    assert.equal(evaluate("10 * coalesce(a, 2) + 1", { a: 3 }), 31);
  });

  it("is an error, not a fallback, when the chosen argument fails (division by zero)", () => {
    assert.throws(
      () => evaluate("coalesce(1 / d, 5)", { d: 0 }),
      (error: unknown) => error instanceof FormulaEvaluationError && error.code === "DIVISION_BY_ZERO",
    );
  });

  it("still fails when the fallback needs something that is not defined", () => {
    assert.throws(() => evaluate("coalesce(a, b)", {}), FormulaEvaluationError);
  });

  it("does not mistake inherited object properties for defined variables", () => {
    assert.equal(evaluate("coalesce(constructor, 5)", {}), 5);
    assert.equal(evaluate("coalesce(toString, 6)", {}), 6);
    assert.equal(evaluate("coalesce(__proto__, 7)", {}), 7);
  });

  it("built-in constants count as defined", () => {
    assert.equal(evaluate("coalesce(pi, 0)", {}), Math.PI);
  });
});

// ---------------------------------------------------------------------------------------------
function experimentWith(fields: RawExperimentData[], formulas: RawExperimentData[], extra: RawExperimentData = {}): NormalizedExperiment {
  return normalizeExperiment({
    id: "x",
    subjectId: "s",
    data: {
      title: "X",
      isPublished: true,
      inputFields: fields,
      formulas,
      outputs: [{ key: "out", label: "Out" }],
      ...extra,
    },
  });
}

const optionalField = { key: "opt", label: "Optional value", type: "number", defaultUnit: "m", units: ["m", "cm"], optional: true };
const requiredField = { key: "req", label: "Required value", type: "number", defaultUnit: "m", units: ["m", "cm"] };

describe("optional fields: normalizing", () => {
  it("carries `optional: true` through", () => {
    assert.equal(experimentWith([optionalField], []).inputFields[0].optional, true);
  });

  it("leaves fields that are not optional exactly as they were (no `optional` key at all)", () => {
    for (const extra of [{}, { optional: false }, { optional: "yes" }, { optional: 1 }]) {
      const field = experimentWith([{ ...requiredField, ...extra }], []).inputFields[0];

      assert.equal("optional" in field, false);
    }
  });
});

describe("optional fields: calculating", () => {
  const formulas = [{ key: "out", name: "Out", expression: "coalesce(opt, req * 2)" }];
  const experiment = experimentWith([optionalField, requiredField], formulas);
  const run = (inputs: QuantityInputs) => calculateExperiment({ experiment, inputs, runValues: {} });

  it("does not require a blank optional field", () => {
    for (const blank of [{ value: "" }, { value: "   " }, { value: "", unit: "m" }]) {
      const result = run({ opt: blank, req: { value: "3", unit: "m" } });

      assert.ok(result.ok);
      if (result.ok) {
        assert.equal(result.results.out, 6);
        assert.equal("opt" in result.scope, false);
      }
    }
  });

  it("does not require an optional field that was never supplied at all", () => {
    const result = run({ req: { value: "3", unit: "m" } });

    assert.ok(result.ok);
  });

  it("uses a filled-in optional field, converted to its calculation unit", () => {
    const result = run({ opt: { value: "50", unit: "cm" }, req: { value: "3", unit: "m" } });

    assert.ok(result.ok);
    if (result.ok) assert.equal(result.results.out, 0.5);
  });

  it("still rejects a filled-in optional field that is not a number", () => {
    const result = run({ opt: { value: "abc", unit: "m" }, req: { value: "3", unit: "m" } });

    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.errors.some((error) => error.code === "INPUT_INVALID_NUMBER" && error.fieldKey === "opt"));
  });

  it("still rejects a filled-in optional field with a unit it does not offer", () => {
    const result = run({ opt: { value: "1", unit: "ft" }, req: { value: "3", unit: "m" } });

    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.errors.some((error) => error.code === "UNSUPPORTED_UNIT" && error.fieldKey === "opt"));
  });

  it("still requires a field that is not optional", () => {
    const result = run({ opt: { value: "1", unit: "m" }, req: { value: "", unit: "m" } });

    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.errors.some((error) => error.code === "INPUT_REQUIRED" && error.fieldKey === "req"));
  });

  it("a formula that reads an optional field OUTSIDE coalesce is a definition error when it is blank", () => {
    const strict = experimentWith([optionalField], [{ key: "out", name: "Out", expression: "opt * 2" }]);
    const result = calculateExperiment({ experiment: strict, inputs: { opt: { value: "" } }, runValues: {} });

    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.errors.some((error) => error.code === "UNKNOWN_FORMULA_VARIABLE" && error.variable === "opt"));
  });

  it("works for run fields as well as setup fields", () => {
    const withRun = experimentWith([requiredField], formulas, { runFields: [optionalField] });
    const result = calculateExperiment({ experiment: withRun, inputs: { req: { value: "3", unit: "m" } }, runValues: { opt: { value: "" } } });

    assert.ok(result.ok);
    if (result.ok) assert.equal(result.results.out, 6);
  });
});
