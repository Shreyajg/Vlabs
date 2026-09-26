import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { QuantityInputs } from "../../../types/Calculation";
import type { NormalizedExperiment, RawExperimentData } from "../../../types/Experiment";
import { normalizeExperiment } from "../../normalizeExperiment";
import { calculateExperiment } from "../calculateExperiment";
import { calculateAllDraftRuns, createDraftRun } from "../draftRuns";
import { CALCULATION_FAILED_MESSAGE, NOT_CONFIGURED_MESSAGE } from "../issues";

// The generic mechanism behind domain checks: a formula may carry `checks`, each an expression that must be
// positive (> 0) or non-negative (>= 0) before the formula runs. Nothing here is specific to any experiment.

const fields = [
  { key: "x", label: "X value", type: "number", defaultUnit: "m", units: ["m"] },
  { key: "y", label: "Y value", type: "number", defaultUnit: "m", units: ["m"] },
];
const runFields = [{ key: "t", label: "Time", type: "number", defaultUnit: "s", units: ["s"] }];

function experimentWith(formulas: RawExperimentData[]): NormalizedExperiment {
  return normalizeExperiment({
    id: "x",
    subjectId: "s",
    data: { title: "X", isPublished: true, inputFields: fields, runFields, formulas, outputs: [{ key: "z", label: "Z" }] },
  });
}

const inputs = (x: string, y = "1"): QuantityInputs => ({ x: { value: x, unit: "m" }, y: { value: y, unit: "m" } });
const runValues = (t = "1"): QuantityInputs => ({ t: { value: t, unit: "s" } });

describe("domain checks: rules", () => {
  const positive = experimentWith([
    { key: "z", name: "Z", formula: "z = 1/x", expression: "1 / x", checks: [{ expression: "x", rule: "positive", message: "X must be greater than zero.", field: "x" }] },
  ]);
  const nonNegative = experimentWith([
    { key: "z", name: "Z", formula: "z = sqrt(x)", expression: "sqrt(x)", checks: [{ expression: "x", rule: "nonNegative", message: "X cannot be negative.", field: "x" }] },
  ]);

  it('"positive" needs a value above zero: zero and negatives fail, a tiny positive passes', () => {
    for (const value of ["0", "-1", "-0.0001"]) {
      const result = calculateExperiment({ experiment: positive, inputs: inputs(value), runValues: runValues() });

      assert.equal(result.ok, false, value);
    }

    for (const value of ["1", "0.0000001"]) {
      assert.equal(calculateExperiment({ experiment: positive, inputs: inputs(value), runValues: runValues() }).ok, true, value);
    }
  });

  it('"nonNegative" allows zero but not a negative', () => {
    assert.equal(calculateExperiment({ experiment: nonNegative, inputs: inputs("0"), runValues: runValues() }).ok, true);
    assert.equal(calculateExperiment({ experiment: nonNegative, inputs: inputs("4"), runValues: runValues() }).ok, true);
    assert.equal(calculateExperiment({ experiment: nonNegative, inputs: inputs("-4"), runValues: runValues() }).ok, false);
  });

  it("a failed check gives the check's own message, code and formula", () => {
    const result = calculateExperiment({ experiment: positive, inputs: inputs("0"), runValues: runValues() });

    assert.equal(result.ok, false);
    if (result.ok) return;

    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].code, "DOMAIN_CHECK_FAILED");
    assert.equal(result.errors[0].userMessage, "X must be greater than zero.");
    assert.equal(result.errors[0].formulaKey, "z");
    assert.match(result.errors[0].message, /must be greater than 0 but is 0/);
  });

  it("the check runs BEFORE the formula, so it wins over a bare arithmetic error", () => {
    const result = calculateExperiment({ experiment: positive, inputs: inputs("0"), runValues: runValues() });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.errors.some((error) => error.code === "DIVISION_BY_ZERO"), false);
  });

  it("without the check the same input fails with the generic arithmetic message", () => {
    const bare = experimentWith([{ key: "z", name: "Z", expression: "1 / x" }]);
    const result = calculateExperiment({ experiment: bare, inputs: inputs("0"), runValues: runValues() });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errors[0].code, "DIVISION_BY_ZERO");
      assert.equal(result.errors[0].userMessage, CALCULATION_FAILED_MESSAGE);
    }
  });

  it("a check without a message falls back to the generic message", () => {
    const experiment = experimentWith([{ key: "z", name: "Z", expression: "x", checks: [{ expression: "x", rule: "positive" }] }]);
    const result = calculateExperiment({ experiment, inputs: inputs("-1"), runValues: runValues() });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.errors[0].userMessage, CALCULATION_FAILED_MESSAGE);
  });

  it("a check can be any expression over the values available so far", () => {
    const experiment = experimentWith([
      { key: "d", name: "D", expression: "x - y", checks: [{ expression: "x - y", rule: "positive", message: "X must exceed Y." }] },
      { key: "z", name: "Z", expression: "d * 2" },
    ]);

    assert.equal(calculateExperiment({ experiment, inputs: inputs("3", "1"), runValues: runValues() }).ok, true);
    assert.equal(calculateExperiment({ experiment, inputs: inputs("1", "3"), runValues: runValues() }).ok, false);
    assert.equal(calculateExperiment({ experiment, inputs: inputs("1", "1"), runValues: runValues() }).ok, false, "equal fails 'positive'");
  });

  it("a formula's checks can read an earlier formula", () => {
    const experiment = experimentWith([
      { key: "d", name: "D", expression: "x - y" },
      { key: "z", name: "Z", expression: "sqrt(d)", checks: [{ expression: "d", rule: "nonNegative", message: "D is negative." }] },
    ]);
    const result = calculateExperiment({ experiment, inputs: inputs("1", "3"), runValues: runValues() });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errors[0].code, "DOMAIN_CHECK_FAILED");
      assert.equal(result.errors[0].formulaKey, "z");
    }
  });
});

describe("domain checks: which field the message belongs to", () => {
  const experiment = experimentWith([
    {
      key: "z",
      name: "Z",
      expression: "x * t",
      checks: [
        { expression: "x", rule: "positive", field: "x", message: "X problem." },
        { expression: "t", rule: "positive", field: "t", message: "T problem." },
        { expression: "y", rule: "positive", field: "notAField", message: "Y problem." },
        { expression: "y", rule: "positive", message: "Y again." },
      ],
    },
  ]);
  const result = calculateExperiment({ experiment, inputs: inputs("-1", "-1"), runValues: runValues("-1") });
  const errors = result.ok ? [] : result.errors;

  it("a setup input is attached as an input field, a run field as a run field", () => {
    const byMessage = Object.fromEntries(errors.map((error) => [error.userMessage, error]));

    assert.deepEqual([byMessage["X problem."].fieldKey, byMessage["X problem."].fieldKind], ["x", "input"]);
    assert.deepEqual([byMessage["T problem."].fieldKey, byMessage["T problem."].fieldKind], ["t", "run"]);
  });

  it("a name that is not a field, or no name, leaves the message unattached", () => {
    const byMessage = Object.fromEntries(errors.map((error) => [error.userMessage, error]));

    assert.equal(byMessage["Y problem."].fieldKey, undefined);
    assert.equal(byMessage["Y again."].fieldKey, undefined);
  });

  it("every failing check of a formula is reported, not just the first", () => {
    assert.equal(errors.length, 4);
    assert.ok(errors.every((error) => error.code === "DOMAIN_CHECK_FAILED"));
  });
});

describe("domain checks: what depends on a failed check", () => {
  const experiment = experimentWith([
    { key: "a", name: "A", expression: "x", checks: [{ expression: "x", rule: "positive", message: "X must be positive.", field: "x" }] },
    { key: "b", name: "B", expression: "a * 2" },
    { key: "z", name: "Z", expression: "b + 1" },
  ]);

  it("its dependants are skipped quietly: no 'not configured', no dependency noise", () => {
    const result = calculateExperiment({ experiment, inputs: inputs("-1"), runValues: runValues() });

    assert.equal(result.ok, false);
    if (result.ok) return;

    assert.deepEqual(result.errors.map((error) => error.code), ["DOMAIN_CHECK_FAILED"]);
    assert.equal(result.errors.some((error) => error.userMessage === NOT_CONFIGURED_MESSAGE), false);
  });

  it("an unrelated formula still calculates first, and a later independent problem is still found", () => {
    const withIndependent = experimentWith([
      { key: "a", name: "A", expression: "x", checks: [{ expression: "x", rule: "positive", message: "X must be positive.", field: "x" }] },
      { key: "b", name: "B", expression: "a * 2" },
      { key: "c", name: "C", expression: "y", checks: [{ expression: "y", rule: "positive", message: "Y must be positive.", field: "y" }] },
      { key: "z", name: "Z", expression: "b + c" },
    ]);
    const result = calculateExperiment({ experiment: withIndependent, inputs: inputs("-1", "-1"), runValues: runValues() });

    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.errors.map((error) => error.userMessage), ["X must be positive.", "Y must be positive."]);
  });

  it("a blocked formula still reports its OWN checks that can be evaluated, so all problems appear together", () => {
    const blocked = experimentWith([
      { key: "a", name: "A", expression: "x", checks: [{ expression: "x", rule: "positive", message: "X must be positive.", field: "x" }] },
      { key: "z", name: "Z", expression: "a + y", checks: [{ expression: "y", rule: "positive", message: "Y must be positive.", field: "y" }, { expression: "a", rule: "positive", message: "A must be positive." }] },
    ]);
    const result = calculateExperiment({ experiment: blocked, inputs: inputs("-1", "-1"), runValues: runValues() });

    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.errors.map((error) => error.userMessage), ["X must be positive.", "Y must be positive."], "the check that needs the failed value is skipped quietly");
  });

  it("a formula that needs one check-failed value and one value that failed for another reason names only the second", () => {
    const mixed = experimentWith([
      { key: "a", name: "A", expression: "x", checks: [{ expression: "x", rule: "positive", message: "X must be positive.", field: "x" }] },
      { key: "b", name: "B", expression: "1 / (y - y)" },
      { key: "z", name: "Z", expression: "a + b" },
    ]);
    const result = calculateExperiment({ experiment: mixed, inputs: inputs("-1", "5"), runValues: runValues() });

    assert.equal(result.ok, false);
    if (result.ok) return;

    assert.deepEqual(result.errors.map((error) => error.code), ["DOMAIN_CHECK_FAILED", "DIVISION_BY_ZERO", "FORMULA_DEPENDENCY_FAILED"]);
    assert.equal(result.errors[2].variable, "b", "the check-failed value is not blamed a second time");
  });

  it("existing behaviour is unchanged for failures that are not checks: dependants are still reported", () => {
    const bare = experimentWith([
      { key: "a", name: "A", expression: "1 / x" },
      { key: "z", name: "Z", expression: "a + 1" },
    ]);
    const result = calculateExperiment({ experiment: bare, inputs: inputs("0"), runValues: runValues() });

    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.errors.map((error) => error.code), ["DIVISION_BY_ZERO", "FORMULA_DEPENDENCY_FAILED"]);
  });
});

describe("domain checks: a badly written check is a definition problem, not a silent pass", () => {
  it("a check that reads an unknown variable", () => {
    const experiment = experimentWith([{ key: "z", name: "Z", expression: "x", checks: [{ expression: "missing", rule: "positive", message: "M" }] }]);
    const result = calculateExperiment({ experiment, inputs: inputs("1"), runValues: runValues() });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errors[0].code, "UNKNOWN_FORMULA_VARIABLE");
      assert.equal(result.errors[0].variable, "missing");
      assert.equal(result.errors[0].userMessage, NOT_CONFIGURED_MESSAGE);
    }
  });

  it("a check with unsupported syntax", () => {
    const experiment = experimentWith([{ key: "z", name: "Z", expression: "x", checks: [{ expression: "evil(x)", rule: "positive", message: "M" }] }]);
    const result = calculateExperiment({ experiment, inputs: inputs("1"), runValues: runValues() });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.errors[0].code, "UNSUPPORTED_FORMULA_SYNTAX");
  });

  it("a check whose own arithmetic fails is an error, not a pass", () => {
    const experiment = experimentWith([{ key: "z", name: "Z", expression: "x", checks: [{ expression: "1 / (x - 1)", rule: "positive", message: "M" }] }]);
    const result = calculateExperiment({ experiment, inputs: inputs("1"), runValues: runValues() });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.errors[0].code, "DIVISION_BY_ZERO");
  });

  it("checks use the safe evaluator: no code execution, and inherited names are not variables", () => {
    for (const expression of ["constructor", "toString", "__proto__"]) {
      const experiment = experimentWith([{ key: "z", name: "Z", expression: "x", checks: [{ expression, rule: "positive", message: "M" }] }]);
      const result = calculateExperiment({ experiment, inputs: inputs("1"), runValues: runValues() });

      assert.equal(result.ok, false, expression);
    }
  });
});

describe("domain checks: normalizing", () => {
  const normalize = (checks: unknown) =>
    normalizeExperiment({ id: "x", subjectId: "s", data: { formulas: [{ key: "z", name: "Z", expression: "x", checks }] } });

  it("carries valid checks through, with only the fields that were given", () => {
    const [formula] = normalize([
      { expression: "x", rule: "positive", message: "M", field: "x" },
      { expression: "y", rule: "nonNegative" },
    ]).formulas;

    assert.deepEqual(formula.checks, [
      { expression: "x", rule: "positive", message: "M", field: "x" },
      { expression: "y", rule: "nonNegative" },
    ]);
  });

  it("skips a check it cannot read, and says so", () => {
    const experiment = normalize([{ expression: "x", rule: "sometimes" }, { rule: "positive" }, { expression: "x" }, { expression: "x", rule: "positive", message: "ok" }]);

    assert.equal(experiment.formulas[0].checks?.length, 1);
    assert.equal(experiment.warnings.length, 3);
    assert.match(experiment.warnings[0], /formulas\[0\]\.checks\[0\]/);
  });

  it("leaves a formula without checks exactly as it was (no `checks` key at all)", () => {
    for (const checks of [undefined, [], "positive", 5, [{ nonsense: true }]]) {
      assert.equal("checks" in normalize(checks).formulas[0], false);
    }
  });
});

describe("domain checks: the Run screen's workflow", () => {
  const experiment = experimentWith([
    { key: "a", name: "A", expression: "x", checks: [{ expression: "x", rule: "positive", message: "X must be positive.", field: "x" }] },
    { key: "z", name: "Z", expression: "a * t", checks: [{ expression: "t", rule: "positive", message: "Time must be positive.", field: "t" }] },
  ]);
  const draft = (id: string, t: string) => ({ ...createDraftRun(id, experiment.runFields), runValues: runValues(t) });

  it("a bad SETUP value is reported once for the experiment, next to its field, and the runs stay drafts", () => {
    const outcome = calculateAllDraftRuns({ experiment, setup: inputs("-1"), runs: [draft("r1", "1"), draft("r2", "2")] });

    assert.equal(outcome.setupIssues.length, 1);
    assert.deepEqual([outcome.setupIssues[0].fieldKey, outcome.setupIssues[0].userMessage], ["x", "X must be positive."]);
    assert.deepEqual(outcome.runs.map((run) => run.status), ["draft", "draft"]);
    assert.deepEqual(outcome.definitionIssues, []);
  });

  it("a bad RUN value fails only that run, with its message on its field", () => {
    const outcome = calculateAllDraftRuns({ experiment, setup: inputs("2"), runs: [draft("r1", "1"), draft("r2", "0")] });

    assert.deepEqual(outcome.runs.map((run) => run.status), ["calculated", "error"]);
    assert.deepEqual([outcome.runs[1].errors[0].fieldKey, outcome.runs[1].errors[0].userMessage], ["t", "Time must be positive."]);
    assert.deepEqual(outcome.setupIssues, []);
  });
});
