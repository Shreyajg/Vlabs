import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { experiments } from "../../../constants/experiments";
import type { CalculationResult, QuantityInputs } from "../../../types/Calculation";
import type { NormalizedExperiment, RawExperimentData } from "../../../types/Experiment";
import { normalizeExperiment } from "../../normalizeExperiment";
import { calculateExperiment } from "../calculateExperiment";
import { buildRunGraphs, calculateAllDraftRuns, createDraftRun, describeGraphState, initialQuantities } from "../draftRuns";
import { isValidVariableKey, parseFormulaExpression } from "../formulaEvaluator";
import { closeTo } from "./fixtures";

// Experiment No. 1, "Venturi meter", from the lab manual (pages 1-3 of the experiment).
// The definition under test is the venturimeter entry of the seed data, i.e. what Firestore is to hold.
// Expected values are derived by hand with plain arithmetic from the manual's equations and are written out as
// numbers, never taken from the engine. FIXED data is the manual's DATA table. The manual's observation table is
// blank, so every LHS / RHS / height / time observation below is a SYNTHETIC TEST INPUT, not a manual measurement.

const seed = experiments.find((entry) => entry.id === "venturimeter");

assert.ok(seed, "the venturimeter entry must exist in the seed data");

function venturimeter(): NormalizedExperiment {
  return normalizeExperiment({
    id: "venturimeter",
    subjectId: "fluid-mechanics",
    data: seed as unknown as RawExperimentData,
  });
}

function succeeded(result: CalculationResult) {
  if (!result.ok) {
    assert.fail(`expected success but got: ${result.errors.map((error) => `${error.code}(${error.fieldKey ?? error.formulaKey ?? ""})`).join(", ")}`);
  }

  return result;
}

function failed(result: CalculationResult) {
  assert.equal(result.ok, false, "expected the calculation to fail");

  if (result.ok) throw new Error("unreachable");

  return result.errors;
}

function near(actual: number, expected: number, name: string): void {
  assert.ok(closeTo(actual, expected), `${name}: got ${actual}, expected ${expected}`);
}

// ---- the manual's reference data (DATA table) ---------------------------------------------------
function setup(overrides: QuantityInputs = {}): QuantityInputs {
  return {
    pipeDiameter: { value: "25.4", unit: "mm" },
    throatDiameter: { value: "12.5", unit: "mm" },
    tankArea: { value: "0.125", unit: "m²" },
    manometerDensity: { value: "13600", unit: "kg/m³" },
    fluidDensity: { value: "1000", unit: "kg/m³" },
    viscosity: { value: "0.00098", unit: "Pa·s" }, // 0.98 x 10^-3 kg/(m.s)
    ...overrides,
  };
}

/** SYNTHETIC observation: LHS and RHS in mm, collected height in m, collection time in s. */
function observation(lhsMm: number, rhsMm: number, heightM: number, timeS: number): QuantityInputs {
  return {
    lhs: { value: String(lhsMm), unit: "mm" },
    rhs: { value: String(rhsMm), unit: "mm" },
    height: { value: String(heightM), unit: "m" },
    time: { value: String(timeS), unit: "s" },
  };
}

// Hand-calculated (plain arithmetic) from the manual's equations. See the derivation in the task notes.
const A_PIPE = 0.0005067074790974977; // pi (0.0254)^2 / 4
const A_THROAT = 0.0001227184630308513; // pi (0.0125)^2 / 4
const BETA = 0.4921259842519686; // 12.5 / 25.4

const R1 = { Rm: 0.1, H: 1.26, Vthroat: 5.124604676351102, Qth: 0.0006288836095225205, Qact: 0.0003125, Vact: 0.6167266379343704, Cd: 0.49691229866408104, NRe: 15984.54755462552 };
const R2 = { Rm: 0.2, H: 2.52, Vthroat: 7.247285435096314, Qth: 0.0008893757297408942, Qact: 0.00044642857142857147, Vact: 0.8810380541919578, Cd: 0.5019572229148096, NRe: 22835.067935179315 };
const R3 = { Rm: 0.05, H: 0.63, Vthroat: 3.623642717548157, Qth: 0.0004446878648704471, Qact: 0.00020833333333333335, Vact: 0.41115109195624694, Cd: 0.4684934080538223, NRe: 10656.365036417013 };

const RUN_1: [number, number, number, number] = [250, 150, 0.05, 20];
const RUN_2: [number, number, number, number] = [400, 200, 0.05, 14];
const RUN_3: [number, number, number, number] = [120, 70, 0.05, 30];

// Frozen copies of what the Firestore document held before this work.
const ORIGINAL_INPUT_FIELDS = [
  { key: "pipeDiameter", label: "Pipe Diameter", type: "number", defaultUnit: "mm", units: ["m", "cm", "mm"] },
  { key: "throatDiameter", label: "Throat Diameter", type: "number", defaultUnit: "mm", units: ["m", "cm", "mm"] },
  { key: "tankArea", label: "Collecting Tank Area", type: "number", defaultUnit: "m²", units: ["m²", "cm²"] },
  { key: "manometerDensity", label: "Manometer Fluid Density", type: "number", defaultUnit: "kg/m³", units: ["kg/m³", "g/cm³"] },
  { key: "fluidDensity", label: "Flowing Fluid Density", type: "number", defaultValue: 1000, defaultUnit: "kg/m³", units: ["kg/m³", "g/cm³"] },
  { key: "viscosity", label: "Dynamic Viscosity", type: "number", defaultValue: 0.001, defaultUnit: "Pa·s", units: ["Pa·s", "kg/m·s"] },
];

// ---------------------------------------------------------------------------------------------
describe("venturimeter: the stored definition", () => {
  const experiment = venturimeter();

  it("[#1] normalizes with no data-quality warnings", () => {
    assert.deepEqual(experiment.warnings, []);
  });

  it("[#1] every formula has a key, a name, a machine-readable expression and the manual's notation", () => {
    for (const formula of experiment.formulas) {
      assert.ok(formula.key, "key");
      assert.ok(formula.name, "name");
      assert.ok(formula.expression, `${formula.key} has no expression`);
      assert.ok(formula.formula, `${formula.key} has no display text`);
      assert.doesNotThrow(() => parseFormulaExpression(formula.expression as string), formula.key);
    }
  });

  it("[#1] every variable key is valid and used exactly once across constants, inputs, run fields and formulas", () => {
    const keys = [
      ...experiment.constants.map((constant) => constant.key),
      ...experiment.inputFields.map((field) => field.key),
      ...experiment.runFields.map((field) => field.key),
      ...experiment.formulas.map((formula) => formula.key),
    ];

    for (const key of keys) assert.ok(key && isValidVariableKey(key), `"${key}" is not a valid variable key`);
    assert.equal(new Set(keys).size, keys.length, "a key is used twice");
  });

  it("[#1] gives exactly the eleven formulas of the manual and no others", () => {
    assert.deepEqual(
      experiment.formulas.map((formula) => formula.key),
      ["A_pipe", "A_throat", "beta", "Rm", "H", "Vthroat", "Qth", "Qact", "Vact", "Cd", "NRe"],
    );
  });

  it("[#1] the machine-readable expressions are exactly the manual's equations", () => {
    assert.deepEqual(
      Object.fromEntries(experiment.formulas.map((formula) => [formula.key, formula.expression])),
      {
        A_pipe: "pi * pipeDiameter^2 / 4",
        A_throat: "pi * throatDiameter^2 / 4",
        beta: "throatDiameter / pipeDiameter",
        Rm: "lhs - rhs",
        H: "((manometerDensity - fluidDensity) / fluidDensity) * Rm",
        Vthroat: "sqrt(2 * gravity * H / (1 - beta^4))",
        Qth: "Vthroat * A_throat",
        Qact: "tankArea * height / time",
        Vact: "Qact / A_pipe",
        Cd: "Qact / Qth",
        NRe: "pipeDiameter * Vact * fluidDensity / viscosity",
      },
    );
  });

  it("[#1] the human-readable text keeps the manual's notation, and NRe uses the PIPE diameter and velocity", () => {
    const text = Object.fromEntries(experiment.formulas.map((formula) => [formula.key, formula.formula]));

    assert.equal(text.Rm, "Rm = LHS − RHS");
    assert.equal(text.H, "H = [(ρm − ρf)/ρf] Rm");
    assert.equal(text.Vthroat, "V_throat = √(2gH/(1 − β⁴))");
    assert.equal(text.Cd, "Cd = Q_act/Q_th");
    assert.equal(text.NRe, "N_Re = D_pipe V_act ρf/μ");
    assert.match(experiment.formulas.find((formula) => formula.key === "NRe")?.expression ?? "", /pipeDiameter \* Vact/);
    assert.doesNotMatch(experiment.formulas.find((formula) => formula.key === "NRe")?.expression ?? "", /throat|Vthroat/i);
  });

  it("[#2] stores formulas in the manual's dependency order, and every formula only reads variables that already exist", () => {
    const available = new Set<string>(["pi"]);

    for (const constant of experiment.constants) if (constant.key) available.add(constant.key);
    for (const field of [...experiment.inputFields, ...experiment.runFields]) available.add(field.key);

    for (const formula of experiment.formulas) {
      const { variables } = parseFormulaExpression(formula.expression as string);
      const missing = variables.filter((variable) => !available.has(variable));

      assert.deepEqual(missing, [], `${formula.key} reads ${missing.join(", ")} before it exists`);

      for (const check of formula.checks ?? []) {
        const checkMissing = parseFormulaExpression(check.expression).variables.filter((variable) => !available.has(variable));

        assert.deepEqual(checkMissing, [], `a check on ${formula.key} reads ${checkMissing.join(", ")} before it exists`);
      }

      available.add(formula.key as string);
    }
  });

  it("[#2] really needs that order: the engine does not sort formulas for you", () => {
    const reordered: NormalizedExperiment = {
      ...experiment,
      formulas: [...experiment.formulas].sort((a, b) => (a.key === "NRe" ? -1 : b.key === "NRe" ? 1 : 0)),
    };
    const errors = failed(calculateExperiment({ experiment: reordered, inputs: setup(), runValues: observation(...RUN_1) }));

    assert.ok(errors.some((error) => error.code === "UNKNOWN_FORMULA_VARIABLE" && error.formulaKey === "NRe"));
  });

  it("keeps the configurable setup inputs, adding only calculationUnit m to the two diameters", () => {
    assert.deepEqual(
      (seed.inputFields as Record<string, unknown>[]).map((field) => Object.fromEntries(Object.entries(field).filter(([key]) => key !== "calculationUnit"))),
      ORIGINAL_INPUT_FIELDS,
      "labels, defaults, units and default units are unchanged",
    );

    const byKey = Object.fromEntries(experiment.inputFields.map((field) => [field.key, field]));

    assert.equal(byKey.pipeDiameter.calculationUnit, "m");
    assert.equal(byKey.throatDiameter.calculationUnit, "m");
    for (const key of ["tankArea", "manometerDensity", "fluidDensity", "viscosity"]) {
      assert.equal(byKey[key].calculationUnit, undefined, `${key} already defaults to its SI unit`);
    }
  });

  it("has exactly the four run fields, no Rm field, and converts LHS and RHS to metres", () => {
    assert.deepEqual(experiment.runFields.map((field) => field.key), ["lhs", "rhs", "height", "time"]);
    assert.equal(experiment.runFields.some((field) => field.key === "Rm" || field.key === "rm"), false);

    const byKey = Object.fromEntries(experiment.runFields.map((field) => [field.key, field]));

    assert.equal(byKey.lhs.calculationUnit, "m");
    assert.equal(byKey.rhs.calculationUnit, "m");
    assert.equal(byKey.height.defaultUnit, "m");
    assert.equal(byKey.time.defaultUnit, "s");
    for (const field of experiment.runFields) assert.equal(field.units[0], field.defaultUnit);
  });

  it("keeps the manual's reference values configurable: nothing is hard-coded in the definition", () => {
    const start = initialQuantities(experiment.inputFields);

    assert.equal(start.pipeDiameter.value, "", "the student enters the diameters");
    assert.equal(start.fluidDensity.value, "1000");
    assert.equal(start.viscosity.value, "0.001");

    for (const formula of experiment.formulas) {
      assert.doesNotMatch(formula.expression as string, /25\.4|12\.5|13600|0\.125|0\.98|0\.00098/, `${formula.key} hard-codes a manual value`);
    }
  });

  it("has the keyed gravity constant with its value unchanged", () => {
    assert.deepEqual(
      experiment.constants.map(({ key, name, symbol, value, unit }) => ({ key, name, symbol, value, unit })),
      [{ key: "gravity", name: "Acceleration due to Gravity", symbol: "g", value: 9.81, unit: "m/s²" }],
    );
  });

  it("keeps the aim, theory and procedure", () => {
    assert.equal(experiment.aim.length, 3);
    assert.match(experiment.aim[1], /coefficient of discharge/);
    assert.equal(experiment.procedure.length, 8);
    assert.equal(experiment.title, "Venturi Meter");
  });

  it("defines the manual's final result table: Rm, H, QAct, QThe, VThe, VAct, Cd, NRe, without the intermediates", () => {
    assert.deepEqual(
      experiment.outputs.map(({ key, label, decimals }) => ({ key, label, decimals })),
      [
        { key: "Rm", label: "Rm", decimals: 4 },
        { key: "H", label: "H", decimals: 4 },
        { key: "Qact", label: "QAct", decimals: 6 },
        { key: "Qth", label: "QThe", decimals: 6 },
        { key: "Vthroat", label: "VThe", decimals: 4 },
        { key: "Vact", label: "VAct", decimals: 4 },
        { key: "Cd", label: "Cd", decimals: 4 },
        { key: "NRe", label: "NRe", decimals: 0 },
      ],
    );

    const keys = experiment.outputs.map((output) => output.key);

    for (const intermediate of ["A_pipe", "A_throat", "beta"]) assert.equal(keys.includes(intermediate), false, `${intermediate} is not a result`);

    const formulaKeys = new Set(experiment.formulas.map((formula) => formula.key));

    for (const key of keys) assert.ok(formulaKeys.has(key), `output "${key}" is not a formula`);
  });

  it("[#15][#16] both graphs' keys resolve to formulas, with the manual's labels", () => {
    const formulaKeys = new Set(experiment.formulas.map((formula) => formula.key));
    const [calibration, discharge] = experiment.graphConfigs;

    assert.equal(experiment.graphConfigs.length, 2);
    for (const graph of experiment.graphConfigs) {
      assert.ok(formulaKeys.has(graph.xKey as string), `x key "${graph.xKey}" is not a formula`);
      assert.ok(formulaKeys.has(graph.yKey as string), `y key "${graph.yKey}" is not a formula`);
      assert.equal(graph.type, "line");
    }

    assert.deepEqual([calibration.xKey, calibration.yKey, calibration.xLabel, calibration.yLabel], ["Rm", "Qact", "Manometer Reading (Rm)", "Actual Discharge (Qact)"]);
    assert.deepEqual([discharge.xKey, discharge.yKey, discharge.xLabel, discharge.yLabel], ["NRe", "Cd", "Reynolds Number (NRe)", "Coefficient of Discharge (Cd)"]);
  });

  it("[#17] the calibration graph is ordinary (linear) and Cd vs NRe is semi-log: NRe logarithmic, Cd linear", () => {
    const [calibration, discharge] = experiment.graphConfigs;

    assert.equal(calibration.scale, "linear");
    assert.equal(calibration.xScale, undefined);
    assert.equal(calibration.yScale, undefined);
    assert.equal(discharge.xScale, "log");
    assert.equal(discharge.yScale, "linear");
    assert.equal(discharge.scale, "linear", "a reader that ignores per-axis scales draws an ordinary graph, never log-log");
  });

  it("the check messages are stored with the formulas", () => {
    const rules = Object.fromEntries(experiment.formulas.map((formula) => [formula.key, (formula.checks ?? []).length]));

    assert.deepEqual(rules, { A_pipe: 1, A_throat: 1, beta: 1, Rm: 0, H: 3, Vthroat: 2, Qth: 0, Qact: 3, Vact: 0, Cd: 1, NRe: 1 });
  });
});

// ---------------------------------------------------------------------------------------------
describe("venturimeter: the calculation (SYNTHETIC run 1: LHS 250 mm, RHS 150 mm, h 0.05 m, t 20 s; manual reference data)", () => {
  const experiment = venturimeter();
  const result = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(...RUN_1) }));

  it("[#3] converts every mm, cm², g/cm³ and kg/m·s entry to SI exactly once", () => {
    assert.equal(result.scope.pipeDiameter, 0.0254);
    assert.equal(result.scope.throatDiameter, 0.0125);
    assert.equal(result.scope.lhs, 0.25);
    assert.equal(result.scope.rhs, 0.15);
    assert.equal(result.scope.tankArea, 0.125);
    assert.equal(result.scope.viscosity, 0.00098);
    assert.equal(result.scope.gravity, 9.81);
  });

  it("[#4] A_pipe = πD²/4", () => {
    near(result.calculated.A_pipe, A_PIPE, "A_pipe");
  });

  it("[#5] A_throat = πD²/4", () => {
    near(result.calculated.A_throat, A_THROAT, "A_throat");
  });

  it("[#6] β = D_throat / D_pipe", () => {
    near(result.calculated.beta, BETA, "beta");
  });

  it("[#7] Rm = LHS − RHS, in metres", () => {
    near(result.calculated.Rm, R1.Rm, "Rm");
  });

  it("[#8] H = [(ρm − ρf)/ρf] Rm", () => {
    near(result.calculated.H, R1.H, "H"); // 12.6 x 0.1
  });

  it("[#9] V_throat = √(2gH/(1 − β⁴))", () => {
    near(result.calculated.Vthroat, R1.Vthroat, "Vthroat");
  });

  it("[#10] Q_th = V_throat × A_throat", () => {
    near(result.calculated.Qth, R1.Qth, "Qth");
  });

  it("[#11] Q_act = (A_tank × h_tank)/time", () => {
    near(result.calculated.Qact, R1.Qact, "Qact"); // 0.125 x 0.05 / 20
  });

  it("[#12] V_act = Q_act / A_pipe", () => {
    near(result.calculated.Vact, R1.Vact, "Vact");
  });

  it("[#13] Cd = Q_act / Q_th", () => {
    near(result.calculated.Cd, R1.Cd, "Cd");
  });

  it("[#14] NRe = D_pipe V_act ρf / μ (pipe diameter and pipe velocity)", () => {
    near(result.calculated.NRe, R1.NRe, "NRe");

    // A throat-based Reynolds number would be very different, so this proves which one is used.
    const throatBased = (0.0125 * R1.Vthroat * 1000) / 0.00098;

    assert.ok(Math.abs(result.calculated.NRe - throatBased) > 1000, "not the throat Reynolds number");
  });

  it("[#24] returns exactly the manual's result table in order, formatted per the outputs", () => {
    assert.deepEqual(Object.keys(result.results), ["Rm", "H", "Qact", "Qth", "Vthroat", "Vact", "Cd", "NRe"]);
    assert.deepEqual(result.outputs.map((output) => output.label), ["Rm", "H", "QAct", "QThe", "VThe", "VAct", "Cd", "NRe"]);

    const shown = Object.fromEntries(result.outputs.map((output) => [output.key, output.displayValue]));

    assert.equal(shown.Rm, "0.1000");
    assert.equal(shown.H, "1.2600");
    assert.equal(shown.Qth, "0.000629");
    assert.equal(shown.Vthroat, "5.1246");
    assert.equal(shown.Vact, "0.6167");
    assert.equal(shown.Cd, "0.4969");
    assert.equal(shown.NRe, "15985");
    assert.deepEqual(result.warnings, []);
  });

  it("the calculated values do not depend on how the student typed the units", () => {
    const converted = succeeded(
      calculateExperiment({
        experiment,
        inputs: setup({
          pipeDiameter: { value: "2.54", unit: "cm" },
          throatDiameter: { value: "0.0125", unit: "m" },
          tankArea: { value: "1250", unit: "cm²" },
          manometerDensity: { value: "13.6", unit: "g/cm³" },
          fluidDensity: { value: "1", unit: "g/cm³" },
          viscosity: { value: "0.00098", unit: "kg/m·s" },
        }),
        runValues: { ...observation(...RUN_1), lhs: { value: "25", unit: "cm" }, rhs: { value: "0.15", unit: "m" }, height: { value: "5", unit: "cm" } },
      }),
    );

    for (const key of ["A_pipe", "A_throat", "beta", "Rm", "H", "Vthroat", "Qth", "Qact", "Vact", "Cd", "NRe"]) {
      near(converted.calculated[key], result.calculated[key], key);
    }
  });

  it("does not double-convert: 250 mm becomes exactly 0.25 m, and the same reading in cm or m agrees", () => {
    for (const runValues of [
      { ...observation(...RUN_1), lhs: { value: "25", unit: "cm" }, rhs: { value: "15", unit: "cm" } },
      { ...observation(...RUN_1), lhs: { value: "0.25", unit: "m" }, rhs: { value: "0.15", unit: "m" } },
    ]) {
      near(succeeded(calculateExperiment({ experiment, inputs: setup(), runValues })).calculated.Rm, 0.1, "Rm");
    }
  });

  it("without calculationUnit the diameters and readings would stay in millimetres and Cd would be ~1e7 times too small", () => {
    const unconverted: NormalizedExperiment = {
      ...experiment,
      inputFields: experiment.inputFields.map(({ calculationUnit, ...field }) => (["pipeDiameter", "throatDiameter"].includes(field.key) ? field : { ...field, calculationUnit })),
      runFields: experiment.runFields.map(({ calculationUnit, ...field }) => ({ ...field, ...(field.key === "lhs" || field.key === "rhs" ? {} : { calculationUnit }) })),
    };
    const wrong = succeeded(calculateExperiment({ experiment: unconverted, inputs: setup(), runValues: observation(...RUN_1) }));

    assert.ok(wrong.calculated.Cd < 1e-6, `Cd = ${wrong.calculated.Cd}`);
    assert.ok(result.calculated.Cd > 0.4, "the stored definition gives the right one");
  });
});

// ---------------------------------------------------------------------------------------------
describe("venturimeter: validation (domain checks; the manual's equations are unchanged)", () => {
  const experiment = venturimeter();
  const run = (inputs: QuantityInputs, runValues: QuantityInputs) => calculateExperiment({ experiment, inputs, runValues });
  const valid = observation(...RUN_1);

  /** The single clear reason a run failed. */
  function onlyReason(errors: ReturnType<typeof failed>) {
    assert.equal(errors.length, 1, `expected exactly one clear error, got: ${errors.map((error) => `${error.code}(${error.formulaKey ?? ""})`).join(", ")}`);
    assert.equal(errors[0].code, "DOMAIN_CHECK_FAILED");

    return errors[0];
  }

  it("[#19] a negative Rm is a clear error: it is not silently turned into |Rm|", () => {
    const error = onlyReason(failed(run(setup(), observation(150, 250, 0.05, 20))));

    assert.equal(error.formulaKey, "H");
    assert.equal(error.fieldKey, "lhs");
    assert.equal(error.fieldKind, "run");
    assert.match(error.userMessage, /Rm \(LHS − RHS\) is negative/);
    assert.match(error.userMessage, /LHS is not smaller than RHS/);
  });

  it("[#19] the negative head never reaches the square root, and the student sees no 'not configured' noise", () => {
    const errors = failed(run(setup(), observation(150, 250, 0.05, 20)));

    assert.equal(errors.some((entry) => entry.code === "FORMULA_EVALUATION_ERROR"), false);
    assert.equal(errors.some((entry) => entry.code === "FORMULA_DEPENDENCY_FAILED"), false);
    assert.equal(errors.some((entry) => /not configured/i.test(entry.userMessage)), false);
  });

  it("a zero Rm (LHS = RHS) is allowed for the head, but Cd cannot be formed, and the message says so", () => {
    const error = onlyReason(failed(run(setup(), observation(200, 200, 0.05, 20))));

    assert.equal(error.formulaKey, "Cd");
    assert.match(error.userMessage, /theoretical discharge is zero/);
  });

  it("[#20] a zero collection time is a clear error on the Collection Time field", () => {
    const error = onlyReason(failed(run(setup(), observation(250, 150, 0.05, 0))));

    assert.equal(error.formulaKey, "Qact");
    assert.equal(error.fieldKey, "time");
    assert.equal(error.fieldKind, "run");
    assert.equal(error.userMessage, "Collection Time must be greater than zero.");
  });

  it("a negative time or collected height is caught too (they would otherwise give a negative flow silently)", () => {
    assert.equal(onlyReason(failed(run(setup(), observation(250, 150, 0.05, -20)))).fieldKey, "time");
    assert.equal(onlyReason(failed(run(setup(), observation(250, 150, -0.05, 20)))).fieldKey, "height");
    assert.equal(onlyReason(failed(run(setup(), observation(250, 150, 0, 20)))).fieldKey, "height");
  });

  it("[#21] a zero or negative viscosity is a clear error on the Dynamic Viscosity field", () => {
    for (const value of ["0", "-0.00098"]) {
      const error = onlyReason(failed(run(setup({ viscosity: { value, unit: "Pa·s" } }), valid)));

      assert.equal(error.formulaKey, "NRe");
      assert.equal(error.fieldKey, "viscosity");
      assert.equal(error.fieldKind, "input");
      assert.equal(error.userMessage, "Dynamic Viscosity must be greater than zero.");
    }
  });

  it("[#22] a throat that is not smaller than the pipe is a clear error", () => {
    for (const throat of ["25.4", "30"]) {
      const error = onlyReason(failed(run(setup({ throatDiameter: { value: throat, unit: "mm" } }), valid)));

      assert.equal(error.formulaKey, "beta");
      assert.equal(error.fieldKey, "throatDiameter");
      assert.equal(error.fieldKind, "input");
      assert.equal(error.userMessage, "The throat diameter must be smaller than the pipe diameter.");
    }
  });

  it("zero and negative diameters are clear errors on their own fields", () => {
    for (const [key, message] of [["pipeDiameter", "Pipe Diameter must be greater than zero."], ["throatDiameter", "Throat Diameter must be greater than zero."]] as const) {
      for (const value of ["0", "-5"]) {
        const errors = failed(run(setup({ [key]: { value, unit: "mm" } }), valid));
        const reasons = errors.filter((error) => error.fieldKey === key);

        assert.equal(reasons.length, 1, `${key} = ${value}`);
        assert.equal(reasons[0].userMessage, message);
        assert.equal(errors.every((error) => error.code === "DOMAIN_CHECK_FAILED"), true, `${key} = ${value}: ${errors.map((entry) => entry.code).join(", ")}`);
      }
    }
  });

  it("a zero or negative collecting tank area is a clear error (a zero would otherwise give Cd = 0 silently)", () => {
    for (const value of ["0", "-0.125"]) {
      const error = onlyReason(failed(run(setup({ tankArea: { value, unit: "m²" } }), valid)));

      assert.equal(error.fieldKey, "tankArea");
      assert.equal(error.userMessage, "Collecting Tank Area must be greater than zero.");
    }
  });

  it("the manometer fluid must be denser than the flowing fluid, and the flowing fluid needs a positive density", () => {
    for (const value of ["900", "1000"]) {
      const error = onlyReason(failed(run(setup({ manometerDensity: { value, unit: "kg/m³" } }), valid)));

      assert.equal(error.fieldKey, "manometerDensity");
      assert.equal(error.userMessage, "The manometer fluid must be denser than the flowing fluid.");
    }

    for (const value of ["0", "-1000"]) {
      const errors = failed(run(setup({ fluidDensity: { value, unit: "kg/m³" } }), valid));

      assert.ok(errors.some((error) => error.fieldKey === "fluidDensity" && error.userMessage === "Flowing Fluid Density must be greater than zero."));
      assert.equal(errors.every((error) => error.code === "DOMAIN_CHECK_FAILED"), true);
    }
  });

  it("[#23] the square root's own domain is protected: H < 0 is caught before sqrt, and the engine's guard is the last line", () => {
    const withoutHeadCheck: NormalizedExperiment = {
      ...experiment,
      formulas: experiment.formulas.map((formula) => (formula.key === "H" ? { ...formula, checks: [] } : formula)),
    };
    const caught = failed(calculateExperiment({ experiment: withoutHeadCheck, inputs: setup(), runValues: observation(150, 250, 0.05, 20) }));

    assert.equal(caught[0].code, "DOMAIN_CHECK_FAILED");
    assert.equal(caught[0].formulaKey, "Vthroat", "the Vthroat check on H catches it before sqrt");
    assert.match(caught[0].userMessage, /head H is negative/);

    const withoutAnyCheck: NormalizedExperiment = { ...experiment, formulas: experiment.formulas.map(({ checks, ...formula }) => formula) };
    const raw = failed(calculateExperiment({ experiment: withoutAnyCheck, inputs: setup(), runValues: observation(150, 250, 0.05, 20) }));

    assert.equal(raw[0].code, "FORMULA_EVALUATION_ERROR", "with no checks, the evaluator's own sqrt guard still stops it");
    assert.match(raw[0].message, /sqrt of a negative number/);
  });

  it("[#22][#23] 1 − β⁴ ≤ 0 is caught, whichever way it arises", () => {
    const withoutBetaCheck: NormalizedExperiment = {
      ...experiment,
      formulas: experiment.formulas.map((formula) => (formula.key === "beta" ? { ...formula, checks: [] } : formula)),
    };
    const errors = failed(calculateExperiment({ experiment: withoutBetaCheck, inputs: setup({ throatDiameter: { value: "30", unit: "mm" } }), runValues: valid }));

    assert.equal(errors[0].code, "DOMAIN_CHECK_FAILED");
    assert.equal(errors[0].formulaKey, "Vthroat");
    assert.match(errors[0].userMessage, /1 − β⁴ must be greater than zero/);
  });

  it("reports several independent problems together, so the student can fix them all at once", () => {
    const errors = failed(run(setup({ viscosity: { value: "0", unit: "Pa·s" }, tankArea: { value: "-1", unit: "m²" } }), observation(150, 250, 0.05, 0)));
    const fields = errors.map((error) => error.fieldKey).sort();

    assert.deepEqual(fields, ["lhs", "tankArea", "time", "viscosity"]);
    assert.equal(errors.every((error) => error.code === "DOMAIN_CHECK_FAILED"), true);
  });

  it("valid runs are unaffected by the checks", () => {
    for (const row of [RUN_1, RUN_2, RUN_3]) succeeded(run(setup(), observation(...row)));
  });

  it("missing and non-numeric inputs are still reported as before, not as domain problems", () => {
    const errors = failed(run({}, {}));

    assert.ok(errors.every((error) => error.code === "INPUT_REQUIRED"));

    const text = failed(run(setup(), { ...valid, lhs: { value: "abc", unit: "mm" } }));

    assert.ok(text.some((error) => error.code === "INPUT_INVALID_NUMBER" && error.fieldKey === "lhs"));
  });

  it("a setup problem is reported once for the experiment, and a run problem stays with its run", () => {
    const outcome = calculateAllDraftRuns({
      experiment,
      setup: setup({ viscosity: { value: "0", unit: "Pa·s" } }),
      runs: [{ ...createDraftRun("r1", experiment.runFields), runValues: valid }, { ...createDraftRun("r2", experiment.runFields), runValues: valid }],
    });

    assert.equal(outcome.setupIssues.length, 1, "shared setup problems are shown once, not once per run");
    assert.equal(outcome.setupIssues[0].fieldKey, "viscosity");
    assert.deepEqual(outcome.definitionIssues, []);

    const perRun = calculateAllDraftRuns({
      experiment,
      setup: setup(),
      runs: [{ ...createDraftRun("r1", experiment.runFields), runValues: observation(150, 250, 0.05, 20) }, { ...createDraftRun("r2", experiment.runFields), runValues: valid }],
    });

    assert.deepEqual(perRun.runs.map((entry) => entry.status), ["error", "calculated"]);
    assert.equal(perRun.runs[0].errors[0].fieldKey, "lhs");
    assert.deepEqual(perRun.setupIssues, []);
  });
});

// ---------------------------------------------------------------------------------------------
describe("venturimeter: several runs and both graphs", () => {
  const experiment = venturimeter();
  const draft = (id: string, row: [number, number, number, number]) => ({
    ...createDraftRun(id, experiment.runFields),
    runValues: observation(...row),
  });
  const outcome = calculateAllDraftRuns({ experiment, setup: setup(), runs: [draft("r1", RUN_1), draft("r2", RUN_2), draft("r3", RUN_3)] });
  const [calibration, discharge] = buildRunGraphs(experiment, outcome.runs);

  it("[#18] Calculate All calculates every run, and the values match the manual's equations", () => {
    assert.deepEqual(outcome.setupIssues, []);
    assert.deepEqual(outcome.definitionIssues, []);
    assert.deepEqual(outcome.runs.map((entry) => entry.status), ["calculated", "calculated", "calculated"]);

    [R1, R2, R3].forEach((expected, index) => {
      const results = outcome.runs[index].result!.results;

      for (const [key, value] of Object.entries(expected)) near(results[key], value, `run ${index + 1} ${key}`);
    });
  });

  it("[#18] graph 1 has one (Rm, Qact) point per run, and it is an ordinary chart", () => {
    assert.equal(calibration.status, "ready");
    assert.equal(calibration.graph?.points.length, 3);
    assert.deepEqual([calibration.graph?.xKey, calibration.graph?.yKey, calibration.graph?.scale], ["Rm", "Qact", "linear"]);
    assert.equal("xScale" in (calibration.graph ?? {}), false, "an ordinary graph carries no per-axis scales");

    [R1, R2, R3].forEach((expected, index) => {
      near(calibration.graph!.points[index].x, expected.Rm, `run ${index + 1} x`);
      near(calibration.graph!.points[index].y, expected.Qact, `run ${index + 1} y`);
    });

    assert.equal(describeGraphState(calibration, 3).kind, "chart");
  });

  it("[#18][#17] graph 2 has one (NRe, Cd) point per run, with NRe on a log axis and Cd linear", () => {
    assert.equal(discharge.status, "ready");
    assert.equal(discharge.graph?.points.length, 3);
    assert.deepEqual([discharge.graph?.xKey, discharge.graph?.yKey], ["NRe", "Cd"]);
    assert.deepEqual([discharge.graph?.scale, discharge.graph?.xScale, discharge.graph?.yScale], ["linear", "log", "linear"]);

    [R1, R2, R3].forEach((expected, index) => {
      near(discharge.graph!.points[index].x, expected.NRe, `run ${index + 1} x`);
      near(discharge.graph!.points[index].y, expected.Cd, `run ${index + 1} y`);
    });

    assert.equal(describeGraphState(discharge, 3).kind, "chart");
  });

  it("the graph data comes from the calculated runs, not from fixed values", () => {
    const other = calculateAllDraftRuns({ experiment, setup: setup(), runs: [draft("r1", [300, 100, 0.05, 25]), draft("r2", [350, 100, 0.05, 22])] });
    const [graph] = buildRunGraphs(experiment, other.runs);

    near(graph.graph!.points[0].x, 0.2, "Rm from these readings");
    assert.notEqual(graph.graph!.points[0].y, R1.Qact);
  });

  it("a run that cannot be calculated does not hide the others, and its message is clear", () => {
    const mixed = calculateAllDraftRuns({ experiment, setup: setup(), runs: [draft("r1", RUN_1), draft("r2", [150, 250, 0.05, 20]), draft("r3", RUN_3)] });

    assert.deepEqual(mixed.runs.map((entry) => entry.status), ["calculated", "error", "calculated"]);
    assert.equal(buildRunGraphs(experiment, mixed.runs)[0].graph?.points.length, 2);
    assert.match(mixed.runs[1].errors[0].userMessage, /Rm \(LHS − RHS\) is negative/);
  });

  it("[#24] end to end: one run reads out the whole result table for the student", () => {
    const [only] = outcome.runs;

    assert.deepEqual(only.result?.outputs.map((output) => `${output.label}=${output.displayValue}`), [
      "Rm=0.1000",
      "H=1.2600",
      "QAct=0.000313",
      "QThe=0.000629",
      "VThe=5.1246",
      "VAct=0.6167",
      "Cd=0.4969",
      "NRe=15985",
    ]);
  });
});
