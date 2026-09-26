import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { experiments } from "../../../constants/experiments";
import type { CalculationResult, QuantityInputs } from "../../../types/Calculation";
import type { NormalizedExperiment, RawExperimentData } from "../../../types/Experiment";
import { normalizeExperiment } from "../../normalizeExperiment";
import { calculateExperiment } from "../calculateExperiment";
import { buildRunGraphs, calculateAllDraftRuns, createDraftRun, describeGraphState, initialQuantities } from "../draftRuns";
import { isValidVariableKey, parseFormulaExpression } from "../formulaEvaluator";
import { generateGraphData } from "../graphData";
import { closeTo } from "./fixtures";

// Experiment No. 2, "Orifice meter", from the lab manual (pages 4-6).
// The definition under test is the orificemeter entry of the seed data, i.e. what Firestore is to hold.
// Expected values are derived by hand with plain arithmetic from the manual's equations and are written out as
// numbers, never taken from the engine. FIXED data are the manual's DATA table (25 mm, 12.5 mm, 13600, 1000,
// 0.125 m²) with the project's 0.001 Pa·s viscosity. The manual's observation table is blank, so every LHS / RHS /
// height / time observation below is a SYNTHETIC TEST INPUT, not a manual measurement.

const seed = experiments.find((entry) => entry.id === "orificemeter");

assert.ok(seed, "the orificemeter entry must exist in the seed data");

function orificemeter(): NormalizedExperiment {
  return normalizeExperiment({
    id: "orificemeter",
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

// ---- the specified setup data --------------------------------------------------------------------
function setup(overrides: QuantityInputs = {}): QuantityInputs {
  return {
    pipeDiameter: { value: "25", unit: "mm" },
    orificeDiameter: { value: "12.5", unit: "mm" },
    tankArea: { value: "0.125", unit: "m²" },
    manometerDensity: { value: "13600", unit: "kg/m³" },
    fluidDensity: { value: "1000", unit: "kg/m³" },
    viscosity: { value: "0.001", unit: "Pa·s" },
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

// Hand-calculated (plain arithmetic) from the manual's equations; see orifice-hand-calc.js in the task notes.
const A_ORIFICE = 0.0001227184630308513; // pi (0.0125)^2 / 4
const A_PIPE = 0.0004908738521234052; // pi (0.025)^2 / 4
const BETA = 0.5; // 12.5 / 25, so 1 - beta^4 = 0.9375

const R1 = { Rm: 0.1, H: 1.26, Vorifice: 5.13510272536003, QThe: 0.0006301719139617186, QAct: 0.0003125, VAct: 0.6366197723675813, Cd: 0.4958964261599631, NRe: 15915.494309189533 };
const R2 = { Rm: 0.2, H: 2.52, Vorifice: 7.262131918383196, QThe: 0.0008911976673512736, QAct: 0.00044642857142857147, VAct: 0.9094568176679734, Cd: 0.5009310367198343, NRe: 22736.420441699338 };
const R3 = { Rm: 0.05, H: 0.63, Vorifice: 3.631065959191598, QThe: 0.0004455988336756368, QAct: 0.00020833333333333335, VAct: 0.4244131815783876, Cd: 0.4675356342718453, NRe: 10610.329539459692 };
const R4 = { Rm: 0.18, H: 2.268, Vorifice: 6.889463259209675, QThe: 0.0008454643422777309, QAct: 0.0005555555555555556, VAct: 1.1317684842090334, Cd: 0.6571011073735601, NRe: 28294.212105225837 };
const R1_NRE_WITH_MANUAL_VISCOSITY = 16240.300315499524; // mu = 0.98e-3 kg/(m.s)

const RUN_1: [number, number, number, number] = [250, 150, 0.05, 20];
const RUN_2: [number, number, number, number] = [400, 200, 0.05, 14];
const RUN_3: [number, number, number, number] = [120, 70, 0.05, 30];
const RUN_4: [number, number, number, number] = [320, 140, 0.08, 18];

// Frozen copies of what the Firestore document held before this work.
const ORIGINAL_INPUT_FIELDS = [
  { key: "pipeDiameter", label: "Pipe Diameter", type: "number", defaultUnit: "mm", units: ["m", "cm", "mm"] },
  { key: "orificeDiameter", label: "Orifice Diameter", type: "number", defaultUnit: "mm", units: ["m", "cm", "mm"] },
  { key: "tankArea", label: "Collecting Tank Area", type: "number", defaultUnit: "m²", units: ["m²", "cm²"] },
  { key: "manometerDensity", label: "Manometer Fluid Density", type: "number", defaultUnit: "kg/m³", defaultValue: 13600, units: ["kg/m³", "g/cm³"] },
  { key: "fluidDensity", label: "Flowing Fluid Density", type: "number", defaultValue: 1000, defaultUnit: "kg/m³", units: ["kg/m³", "g/cm³"] },
  { key: "viscosity", label: "Dynamic Viscosity", type: "number", defaultValue: 0.001, defaultUnit: "Pa·s", units: ["Pa·s", "kg/m·s"] },
];

// ---------------------------------------------------------------------------------------------
describe("orificemeter: the stored definition", () => {
  const experiment = orificemeter();

  it("normalizes with no data-quality warnings", () => {
    assert.deepEqual(experiment.warnings, []);
  });

  it("every formula has a key, a name, a machine-readable expression and the manual's notation", () => {
    for (const formula of experiment.formulas) {
      assert.ok(formula.key, "key");
      assert.ok(formula.name, "name");
      assert.ok(formula.expression, `${formula.key} has no expression`);
      assert.ok(formula.formula, `${formula.key} has no display text`);
      assert.doesNotThrow(() => parseFormulaExpression(formula.expression as string), formula.key);
    }
  });

  it("every variable key is valid and used exactly once across constants, inputs, run fields and formulas", () => {
    const keys = [
      ...experiment.constants.map((constant) => constant.key),
      ...experiment.inputFields.map((field) => field.key),
      ...experiment.runFields.map((field) => field.key),
      ...experiment.formulas.map((formula) => formula.key),
    ];

    for (const key of keys) assert.ok(key && isValidVariableKey(key), `"${key}" is not a valid variable key`);
    assert.equal(new Set(keys).size, keys.length, "a key is used twice");
  });

  it("gives exactly the eleven formulas of the specification, in this order, and no others", () => {
    assert.deepEqual(
      experiment.formulas.map((formula) => formula.key),
      ["Rm", "H", "beta", "Aorifice", "QAct", "Vorifice", "QThe", "Cd", "Apipe", "VAct", "NRe"],
    );
    assert.deepEqual(
      experiment.formulas.map((formula) => formula.name),
      [
        "Manometer Reading",
        "Fluid Head Lost",
        "Diameter Ratio",
        "Orifice Area",
        "Actual Discharge",
        "Theoretical Orifice Velocity",
        "Theoretical Discharge",
        "Coefficient of Discharge",
        "Pipe Area",
        "Actual Pipe Velocity",
        "Reynolds Number",
      ],
    );
  });

  it("the machine-readable expressions are exactly the manual's equations", () => {
    assert.deepEqual(
      Object.fromEntries(experiment.formulas.map((formula) => [formula.key, formula.expression])),
      {
        Rm: "lhs - rhs",
        H: "((manometerDensity - fluidDensity) / fluidDensity) * Rm",
        beta: "orificeDiameter / pipeDiameter",
        Aorifice: "pi * orificeDiameter^2 / 4",
        QAct: "tankArea * height / time",
        Vorifice: "sqrt((2 * gravity * H) / (1 - beta^4))",
        QThe: "Vorifice * Aorifice",
        Cd: "QAct / QThe",
        Apipe: "pi * pipeDiameter^2 / 4",
        VAct: "QAct / Apipe",
        NRe: "pipeDiameter * VAct * fluidDensity / viscosity",
      },
    );
  });

  it("the human-readable text keeps the manual's notation, and NRe uses the PIPE diameter and velocity", () => {
    assert.deepEqual(
      experiment.formulas.map((formula) => formula.formula),
      [
        "Rm = LHS - RHS",
        "H = ((ρm - ρf) / ρf) Rm",
        "β = Dorifice / Dpipe",
        "Ao = πDo²/4",
        "QAct = ATank × hTank / t",
        "Vorifice = √(2gH/(1-β⁴))",
        "QThe = Vorifice × Aorifice",
        "Cd = QAct / QThe",
        "Ap = πDpipe²/4",
        "VAct = QAct / Apipe",
        "NRe = Dpipe × VAct × ρf / μ",
      ],
    );
  });

  it("stores formulas in the manual's dependency order, and every formula only reads variables that already exist", () => {
    const available = new Set<string>(["pi"]);

    for (const constant of experiment.constants) available.add(constant.key as string);
    for (const field of [...experiment.inputFields, ...experiment.runFields]) available.add(field.key);

    for (const formula of experiment.formulas) {
      const { variables } = parseFormulaExpression(formula.expression as string);

      for (const variable of variables) assert.ok(available.has(variable), `${formula.key} reads "${variable}" before it exists`);

      for (const check of formula.checks ?? []) {
        for (const variable of parseFormulaExpression(check.expression).variables) {
          assert.ok(available.has(variable), `a check of ${formula.key} reads "${variable}" before it exists`);
        }
      }

      available.add(formula.key as string);
    }
  });

  it("really needs that order: the engine does not sort formulas for you", () => {
    const reordered: NormalizedExperiment = { ...experiment, formulas: [...experiment.formulas].reverse() };
    const errors = failed(calculateExperiment({ experiment: reordered, inputs: setup(), runValues: observation(...RUN_1) }));

    assert.ok(errors.some((error) => error.code === "UNKNOWN_FORMULA_VARIABLE"));
  });

  it("keeps the existing setup inputs (defaults, units, labels, order), adding only calculationUnit m to the two diameters", () => {
    const shape = (field: { key: string; label: string; defaultUnit?: string; defaultValue?: number | string; units: string[] }) => ({
      key: field.key,
      label: field.label,
      defaultUnit: field.defaultUnit,
      defaultValue: field.defaultValue,
      units: field.units,
    });

    assert.deepEqual(experiment.inputFields.map(shape), ORIGINAL_INPUT_FIELDS.map((field) => shape(field as Parameters<typeof shape>[0])));

    const converted = Object.fromEntries(experiment.inputFields.map((field) => [field.key, field.calculationUnit]));

    assert.deepEqual(converted, {
      pipeDiameter: "m",
      orificeDiameter: "m",
      tankArea: undefined,
      manometerDensity: undefined,
      fluidDensity: undefined,
      viscosity: undefined,
    });
  });

  it("keeps the existing defaults: viscosity 0.001 Pa·s (not the manual's 0.98e-3), manometer 13600, fluid 1000", () => {
    const start = initialQuantities(experiment.inputFields);

    assert.deepEqual(start.viscosity, { value: "0.001", unit: "Pa·s" });
    assert.deepEqual(start.manometerDensity, { value: "13600", unit: "kg/m³" });
    assert.deepEqual(start.fluidDensity, { value: "1000", unit: "kg/m³" });
    assert.deepEqual(start.pipeDiameter, { value: "", unit: "mm" });
    assert.deepEqual(start.orificeDiameter, { value: "", unit: "mm" });
  });

  it("has exactly the four run fields, no Rm field, and converts LHS and RHS to metres", () => {
    assert.deepEqual(experiment.runFields.map((field) => field.key), ["lhs", "rhs", "height", "time"]);
    assert.deepEqual(
      Object.fromEntries(experiment.runFields.map((field) => [field.key, [field.defaultUnit, field.units, field.calculationUnit]])),
      {
        lhs: ["mm", ["mm", "cm", "m"], "m"],
        rhs: ["mm", ["mm", "cm", "m"], "m"],
        height: ["m", ["m", "cm", "mm"], undefined],
        time: ["s", ["s"], undefined],
      },
    );
  });

  it("nothing from the manual's reference data is hard-coded in the definition", () => {
    const text = JSON.stringify(experiment.formulas.map((formula) => formula.expression));

    for (const literal of ["25", "12.5", "13600", "1000", "0.125", "0.98"]) assert.equal(text.includes(literal), false, literal);
  });

  it("has the keyed gravity constant with its value unchanged", () => {
    assert.deepEqual(
      experiment.constants.map(({ key, name, symbol, value, unit }) => ({ key, name, symbol, value, unit })),
      [{ key: "gravity", name: "Acceleration due to Gravity", symbol: "g", value: 9.81, unit: "m/s²" }],
    );
  });

  it("keeps the aim, theory and procedure, title, route and publication state", () => {
    assert.equal(experiment.title, "Orifice Meter");
    assert.equal(experiment.route, "/experiment/orifice-run");
    assert.equal(experiment.isPublished, true);
    assert.equal(experiment.aim.length, 3);
    assert.match(experiment.theory, /differential pressure flow measuring device/);
    assert.equal(experiment.procedure.length, 8);
  });

  it("defines the manual's final result table: Rm, H, QAct, QThe, VOrifice, VAct, Cd, NRe, without the intermediates", () => {
    assert.deepEqual(
      experiment.outputs.map(({ key, label, decimals }) => ({ key, label, decimals })),
      [
        { key: "Rm", label: "Rm", decimals: 4 },
        { key: "H", label: "H", decimals: 4 },
        { key: "QAct", label: "QAct", decimals: 6 },
        { key: "QThe", label: "QThe", decimals: 6 },
        { key: "Vorifice", label: "VOrifice", decimals: 4 },
        { key: "VAct", label: "VAct", decimals: 4 },
        { key: "Cd", label: "Cd", decimals: 4 },
        { key: "NRe", label: "NRe", decimals: 0 },
      ],
    );

    const formulaKeys = new Set(experiment.formulas.map((formula) => formula.key));

    for (const output of experiment.outputs) assert.ok(formulaKeys.has(output.key), output.key);
    for (const hidden of ["beta", "Aorifice", "Apipe"]) assert.equal(experiment.outputs.some((output) => output.key === hidden), false, hidden);
  });

  it("[#5][#6] both graphs' keys resolve to formulas, with the original titles", () => {
    const formulaKeys = new Set(experiment.formulas.map((formula) => formula.key));

    assert.equal(experiment.graphConfigs.length, 2);

    for (const graph of experiment.graphConfigs) {
      assert.ok(graph.xKey && formulaKeys.has(graph.xKey), `${graph.title}: xKey`);
      assert.ok(graph.yKey && formulaKeys.has(graph.yKey), `${graph.title}: yKey`);
      assert.equal(graph.type, "line");
    }

    assert.deepEqual(
      experiment.graphConfigs.map(({ title, xKey, yKey, xLabel, yLabel }) => ({ title, xKey, yKey, xLabel, yLabel })),
      [
        { title: "Actual Discharge vs Manometer Reading", xKey: "Rm", yKey: "QAct", xLabel: "Manometer Reading (Rm)", yLabel: "Actual Discharge (QAct)" },
        { title: "Coefficient of Discharge vs Reynolds Number", xKey: "NRe", yKey: "Cd", xLabel: "Reynolds Number (NRe)", yLabel: "Coefficient of Discharge (Cd)" },
      ],
    );
  });

  it("[#7] the calibration graph is ordinary (linear) and Cd vs NRe is semi-log: NRe logarithmic, Cd linear, never log-log", () => {
    const [calibration, discharge] = experiment.graphConfigs;

    assert.equal(calibration.scale, "linear");
    assert.equal(calibration.xScale, undefined);
    assert.equal(calibration.yScale, undefined);
    assert.equal(discharge.xScale, "log");
    assert.equal(discharge.yScale, "linear");
    assert.notEqual(discharge.yScale, "log");
  });

  it("the check messages are stored with the formulas", () => {
    const withChecks = experiment.formulas.filter((formula) => formula.checks && formula.checks.length > 0).map((formula) => formula.key);

    assert.deepEqual(withChecks, ["H", "beta", "QAct", "Vorifice", "Cd", "Apipe", "NRe"]);
    assert.equal(experiment.formulas.find((formula) => formula.key === "Rm")?.checks, undefined);
  });
});

// ---------------------------------------------------------------------------------------------
describe("orificemeter: the calculation (SYNTHETIC run 1: LHS 250 mm, RHS 150 mm, h 0.05 m, t 20 s; 25 mm pipe, 12.5 mm orifice)", () => {
  const experiment = orificemeter();
  const result = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(...RUN_1) }));

  it("converts every mm entry to metres exactly once and keeps the other units", () => {
    assert.equal(result.scope.pipeDiameter, 0.025);
    assert.equal(result.scope.orificeDiameter, 0.0125);
    assert.equal(result.scope.lhs, 0.25);
    assert.equal(result.scope.rhs, 0.15);
    assert.equal(result.scope.tankArea, 0.125);
    assert.equal(result.scope.manometerDensity, 13600);
    assert.equal(result.scope.fluidDensity, 1000);
    assert.equal(result.scope.viscosity, 0.001);
    assert.equal(result.scope.gravity, 9.81);
  });

  it("[chain 1] Rm = LHS - RHS, in metres", () => {
    near(result.calculated.Rm, R1.Rm, "Rm");
  });

  it("[chain 2] H = ((ρm - ρf)/ρf) Rm", () => {
    near(result.calculated.H, R1.H, "H");
  });

  it("[chain 3] β = Dorifice / Dpipe", () => {
    near(result.calculated.beta, BETA, "beta");
  });

  it("[chain 4] Ao = πDo²/4", () => {
    near(result.calculated.Aorifice, A_ORIFICE, "Aorifice");
  });

  it("[chain 5] QAct = ATank × hTank / t", () => {
    near(result.calculated.QAct, R1.QAct, "QAct");
  });

  it("[chain 6] Vorifice = √(2gH/(1-β⁴))", () => {
    near(result.calculated.Vorifice, R1.Vorifice, "Vorifice");
  });

  it("[chain 7] QThe = Vorifice × Ao", () => {
    near(result.calculated.QThe, R1.QThe, "QThe");
  });

  it("[chain 8] Cd = QAct / QThe", () => {
    near(result.calculated.Cd, R1.Cd, "Cd");
  });

  it("[chain 9] Ap = πDpipe²/4", () => {
    near(result.calculated.Apipe, A_PIPE, "Apipe");
  });

  it("[chain 10] VAct = QAct / Ap", () => {
    near(result.calculated.VAct, R1.VAct, "VAct");
  });

  it("[chain 11] NRe = Dpipe × VAct × ρf / μ (pipe diameter and pipe velocity)", () => {
    near(result.calculated.NRe, R1.NRe, "NRe");
    near(result.calculated.NRe, (0.025 * result.calculated.VAct * 1000) / 0.001, "NRe from the calculated VAct");
    assert.ok(Math.abs(result.calculated.NRe - (0.0125 * result.calculated.Vorifice * 1000) / 0.001) > 1, "not the orifice diameter and velocity");
  });

  it("the manual's own viscosity (0.98e-3 kg/m·s) changes only NRe, and the two viscosity units agree", () => {
    for (const unit of ["kg/m·s", "Pa·s"]) {
      const manual = succeeded(calculateExperiment({ experiment, inputs: setup({ viscosity: { value: "0.00098", unit } }), runValues: observation(...RUN_1) }));

      near(manual.calculated.NRe, R1_NRE_WITH_MANUAL_VISCOSITY, `NRe (${unit})`);
      near(manual.calculated.Cd, R1.Cd, "Cd is unaffected by viscosity");
    }
  });

  it("returns exactly the manual's result table in order, formatted per the outputs", () => {
    assert.deepEqual(result.outputs.map((output) => `${output.label}=${output.displayValue}`), [
      "Rm=0.1000",
      "H=1.2600",
      "QAct=0.000313",
      "QThe=0.000630",
      "VOrifice=5.1351",
      "VAct=0.6366",
      "Cd=0.4959",
      "NRe=15915",
    ]);
  });

  it("[chain] the other synthetic runs match their hand calculation too", () => {
    for (const [row, expected] of [[RUN_2, R2], [RUN_3, R3], [RUN_4, R4]] as const) {
      const other = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(...row) }));

      for (const [key, value] of Object.entries(expected)) near(other.calculated[key], value, `${row.join("/")} ${key}`);
    }
  });

  it("[#3] different flow rates (collection times) give different QAct, VAct, NRe and Cd, and the same Rm-based QThe", () => {
    const fast = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(250, 150, 0.05, 10) }));
    const slow = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(250, 150, 0.05, 40) }));

    near(fast.calculated.QAct, 0.000625, "QAct at 10 s");
    near(slow.calculated.QAct, 0.00015625, "QAct at 40 s");
    near(fast.calculated.NRe / slow.calculated.NRe, 4, "NRe scales with the flow");
    near(fast.calculated.Cd / slow.calculated.Cd, 4, "Cd scales with the flow");
    near(fast.calculated.QThe, slow.calculated.QThe, "QThe depends only on the head");
  });
});

// ---------------------------------------------------------------------------------------------
describe("orificemeter: unit handling (the engine's own conversion, applied once)", () => {
  const experiment = orificemeter();
  const baseline = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(...RUN_1) }));

  function sameAsBaseline(inputs: QuantityInputs, runValues: QuantityInputs, name: string) {
    const other = succeeded(calculateExperiment({ experiment, inputs, runValues }));

    for (const [key, value] of Object.entries(R1)) near(other.calculated[key], value, `${name}: ${key}`);
  }

  it("[#1] LHS and RHS supplied in mm, cm or m give the same result", () => {
    for (const [lhs, rhs] of [
      [{ value: "250", unit: "mm" }, { value: "150", unit: "mm" }],
      [{ value: "25", unit: "cm" }, { value: "15", unit: "cm" }],
      [{ value: "0.25", unit: "m" }, { value: "0.15", unit: "m" }],
      [{ value: "25", unit: "cm" }, { value: "150", unit: "mm" }],
    ]) {
      sameAsBaseline(setup(), { ...observation(...RUN_1), lhs, rhs }, `${lhs.unit}/${rhs.unit}`);
    }
  });

  it("does not double-convert: 250 mm becomes exactly 0.25 m", () => {
    near(baseline.scope.lhs, 0.25, "lhs in the scope");
    near(baseline.calculated.Rm, 0.1, "Rm");
  });

  it("[#2] the collected height supplied in m, cm or mm gives the same result", () => {
    for (const height of [{ value: "0.05", unit: "m" }, { value: "5", unit: "cm" }, { value: "50", unit: "mm" }]) {
      sameAsBaseline(setup(), { ...observation(...RUN_1), height }, `height in ${height.unit}`);
    }
  });

  it("the pipe and orifice diameters in m, cm or mm give the same result", () => {
    for (const [pipe, orifice] of [
      [{ value: "25", unit: "mm" }, { value: "12.5", unit: "mm" }],
      [{ value: "2.5", unit: "cm" }, { value: "1.25", unit: "cm" }],
      [{ value: "0.025", unit: "m" }, { value: "0.0125", unit: "m" }],
      [{ value: "2.5", unit: "cm" }, { value: "12.5", unit: "mm" }],
    ]) {
      sameAsBaseline(setup({ pipeDiameter: pipe, orificeDiameter: orifice }), observation(...RUN_1), `${pipe.unit}/${orifice.unit}`);
    }
  });

  it("the tank area in m² or cm², the densities in kg/m³ or g/cm³ and the viscosity in Pa·s or kg/m·s give the same result", () => {
    sameAsBaseline(setup({ tankArea: { value: "1250", unit: "cm²" } }), observation(...RUN_1), "tank area in cm²");
    sameAsBaseline(setup({ manometerDensity: { value: "13.6", unit: "g/cm³" }, fluidDensity: { value: "1", unit: "g/cm³" } }), observation(...RUN_1), "densities in g/cm³");
    sameAsBaseline(setup({ viscosity: { value: "0.001", unit: "kg/m·s" } }), observation(...RUN_1), "viscosity in kg/m·s");
  });

  it("without calculationUnit the diameters and readings would stay in millimetres and Cd would be ~1e7 times too small", () => {
    const unconverted: NormalizedExperiment = {
      ...experiment,
      inputFields: experiment.inputFields.map(({ calculationUnit, ...field }) => (["pipeDiameter", "orificeDiameter"].includes(field.key) ? field : { ...field, calculationUnit })),
      runFields: experiment.runFields.map(({ calculationUnit, ...field }) => ({ ...field, ...(field.key === "lhs" || field.key === "rhs" ? {} : { calculationUnit }) })),
    };
    const wrong = succeeded(calculateExperiment({ experiment: unconverted, inputs: setup(), runValues: observation(...RUN_1) }));

    assert.ok(wrong.calculated.Cd < 1e-6, `Cd = ${wrong.calculated.Cd}`);
    assert.ok(baseline.calculated.Cd > 0.4, "the stored definition gives the right one");
  });
});

// ---------------------------------------------------------------------------------------------
describe("orificemeter: validation (domain checks; the manual's equations are unchanged)", () => {
  const experiment = orificemeter();
  const run = (inputs: QuantityInputs, runValues: QuantityInputs) => calculateExperiment({ experiment, inputs, runValues });
  const valid = observation(...RUN_1);

  /** The single clear reason a run failed. */
  function onlyReason(errors: ReturnType<typeof failed>) {
    assert.equal(errors.length, 1, `expected exactly one clear error, got: ${errors.map((error) => `${error.code}(${error.formulaKey ?? ""}): ${error.userMessage}`).join(" | ")}`);
    assert.equal(errors[0].code, "DOMAIN_CHECK_FAILED");

    return errors[0];
  }

  /** Every error is a clear domain message: no arithmetic noise, no "not configured", no dependency chatter. */
  function allClear(errors: ReturnType<typeof failed>) {
    assert.ok(errors.every((error) => error.code === "DOMAIN_CHECK_FAILED"), errors.map((error) => `${error.code}(${error.formulaKey ?? ""})`).join(", "));
    assert.equal(errors.some((error) => /not configured/i.test(error.userMessage)), false);
  }

  it("[#9] a zero pipe diameter is a clear error on the Pipe Diameter field, with no divide-by-zero noise", () => {
    const errors = failed(run(setup({ pipeDiameter: { value: "0", unit: "mm" } }), valid));

    allClear(errors);
    assert.ok(errors.some((error) => error.fieldKey === "pipeDiameter" && error.fieldKind === "input" && error.userMessage === "Pipe Diameter must be greater than zero."));
    assert.equal(errors.filter((error) => error.fieldKey === "pipeDiameter").length, 1, "said once");
  });

  it("[#9] a negative pipe diameter is caught the same way", () => {
    const errors = failed(run(setup({ pipeDiameter: { value: "-25", unit: "mm" } }), valid));

    allClear(errors);
    assert.equal(errors.filter((error) => error.fieldKey === "pipeDiameter").length, 1);
  });

  it("[#9] a zero or negative orifice diameter is a clear error on the Orifice Diameter field", () => {
    for (const value of ["0", "-5"]) {
      const errors = failed(run(setup({ orificeDiameter: { value, unit: "mm" } }), valid));
      const reasons = errors.filter((error) => error.fieldKey === "orificeDiameter");

      allClear(errors);
      assert.equal(reasons.length, 1, `orifice = ${value}`);
      assert.equal(reasons[0].userMessage, "Orifice Diameter must be greater than zero.");
      assert.equal(reasons[0].formulaKey, "beta");
    }
  });

  it("[#8] an orifice that is not smaller than the pipe is rejected with one clear message", () => {
    for (const orifice of ["25", "30", "250"]) {
      const error = onlyReason(failed(run(setup({ orificeDiameter: { value: orifice, unit: "mm" } }), valid)));

      assert.equal(error.formulaKey, "beta");
      assert.equal(error.fieldKey, "orificeDiameter");
      assert.equal(error.fieldKind, "input");
      assert.equal(error.userMessage, "The orifice diameter must be smaller than the pipe diameter.");
    }
  });

  it("[#8] the comparison is made in metres, so a cm orifice against a mm pipe is judged correctly", () => {
    assert.ok(run(setup({ orificeDiameter: { value: "1.25", unit: "cm" } }), valid).ok, "1.25 cm < 25 mm");
    assert.equal(run(setup({ orificeDiameter: { value: "3", unit: "cm" } }), valid).ok, false, "3 cm > 25 mm");
  });

  it("a zero or negative collecting tank area is a clear error (a zero would otherwise give Cd = 0 silently)", () => {
    for (const value of ["0", "-0.125"]) {
      const error = onlyReason(failed(run(setup({ tankArea: { value, unit: "m²" } }), valid)));

      assert.equal(error.fieldKey, "tankArea");
      assert.equal(error.userMessage, "Collecting Tank Area must be greater than zero.");
    }
  });

  it("[#9] a zero or negative collection time is a clear error on the Collection Time field", () => {
    for (const time of [0, -20]) {
      const error = onlyReason(failed(run(setup(), observation(250, 150, 0.05, time))));

      assert.equal(error.formulaKey, "QAct");
      assert.equal(error.fieldKey, "time");
      assert.equal(error.fieldKind, "run");
      assert.equal(error.userMessage, "Collection Time must be greater than zero.");
    }
  });

  it("a zero or negative collected height is caught too (they would otherwise give a zero or negative flow silently)", () => {
    assert.equal(onlyReason(failed(run(setup(), observation(250, 150, 0, 20)))).fieldKey, "height");
    assert.equal(onlyReason(failed(run(setup(), observation(250, 150, -0.05, 20)))).fieldKey, "height");
  });

  it("a zero or negative flowing-fluid density is a clear error on its field", () => {
    for (const value of ["0", "-1000"]) {
      const errors = failed(run(setup({ fluidDensity: { value, unit: "kg/m³" } }), valid));

      allClear(errors);
      assert.ok(errors.some((error) => error.fieldKey === "fluidDensity" && error.userMessage === "Flowing Fluid Density must be greater than zero."), value);
    }
  });

  it("a zero or negative manometer-fluid density is a clear error on its field", () => {
    for (const value of ["0", "-13600"]) {
      const errors = failed(run(setup({ manometerDensity: { value, unit: "kg/m³" } }), valid));

      allClear(errors);
      assert.ok(errors.some((error) => error.fieldKey === "manometerDensity" && error.userMessage === "Manometer Fluid Density must be greater than zero."), value);
    }
  });

  it("the manometer fluid must be denser than the flowing fluid", () => {
    for (const value of ["900", "1000"]) {
      const error = onlyReason(failed(run(setup({ manometerDensity: { value, unit: "kg/m³" } }), valid)));

      assert.equal(error.fieldKey, "manometerDensity");
      assert.equal(error.userMessage, "The manometer fluid must be denser than the flowing fluid.");
    }
  });

  it("a zero or negative viscosity is a clear error on the Dynamic Viscosity field", () => {
    for (const value of ["0", "-0.001"]) {
      const error = onlyReason(failed(run(setup({ viscosity: { value, unit: "Pa·s" } }), valid)));

      assert.equal(error.formulaKey, "NRe");
      assert.equal(error.fieldKey, "viscosity");
      assert.equal(error.fieldKind, "input");
      assert.equal(error.userMessage, "Dynamic Viscosity must be greater than zero.");
    }
  });

  it("[#10] a negative Rm is a clear error: it is not silently turned into |Rm|", () => {
    const error = onlyReason(failed(run(setup(), observation(150, 250, 0.05, 20))));

    assert.equal(error.formulaKey, "H");
    assert.equal(error.fieldKey, "lhs");
    assert.equal(error.fieldKind, "run");
    assert.match(error.userMessage, /Rm \(LHS - RHS\) is negative/);
    assert.match(error.userMessage, /LHS is not smaller than RHS/);
  });

  it("[#10] the negative head never reaches the square root, and the student sees no 'not configured' noise", () => {
    const errors = failed(run(setup(), observation(150, 250, 0.05, 20)));

    assert.equal(errors.some((entry) => entry.code === "FORMULA_EVALUATION_ERROR"), false);
    assert.equal(errors.some((entry) => entry.code === "FORMULA_DEPENDENCY_FAILED"), false);
    allClear(errors);
  });

  it("[#10] a zero Rm (LHS = RHS) means H = 0: rejected with one clear message, never Infinity or NaN", () => {
    const error = onlyReason(failed(run(setup(), observation(200, 200, 0.05, 20))));

    assert.equal(error.formulaKey, "Vorifice");
    assert.equal(error.fieldKey, "lhs");
    assert.equal(error.fieldKind, "run");
    assert.match(error.userMessage, /head H is zero or negative/);
  });

  it("[#10] the square root's own domain is protected in layers: the head check, then the velocity check, then the evaluator", () => {
    const withoutHeadCheck: NormalizedExperiment = {
      ...experiment,
      formulas: experiment.formulas.map((formula) => (formula.key === "H" ? { ...formula, checks: [] } : formula)),
    };
    const caught = failed(calculateExperiment({ experiment: withoutHeadCheck, inputs: setup(), runValues: observation(150, 250, 0.05, 20) }));

    assert.equal(caught[0].code, "DOMAIN_CHECK_FAILED");
    assert.equal(caught[0].formulaKey, "Vorifice", "the Vorifice check on H catches a negative head before sqrt");
    assert.match(caught[0].userMessage, /head H is zero or negative/);

    const withoutAnyCheck: NormalizedExperiment = { ...experiment, formulas: experiment.formulas.map(({ checks, ...formula }) => formula) };
    const raw = failed(calculateExperiment({ experiment: withoutAnyCheck, inputs: setup(), runValues: observation(150, 250, 0.05, 20) }));

    assert.equal(raw[0].code, "FORMULA_EVALUATION_ERROR", "with no checks at all, the evaluator's own sqrt guard still stops it");
    assert.match(raw[0].message, /sqrt of a negative number/);
  });

  it("[#10] a denominator 1 - β⁴ <= 0 is caught by the velocity check even when the beta check is missing", () => {
    const withoutBetaCheck: NormalizedExperiment = {
      ...experiment,
      formulas: experiment.formulas.map((formula) => (formula.key === "beta" ? { ...formula, checks: [] } : formula)),
    };

    for (const orifice of ["25", "30"]) {
      const errors = failed(calculateExperiment({ experiment: withoutBetaCheck, inputs: setup({ orificeDiameter: { value: orifice, unit: "mm" } }), runValues: valid }));

      assert.equal(errors[0].code, "DOMAIN_CHECK_FAILED", orifice);
      assert.equal(errors[0].formulaKey, "Vorifice", orifice);
      assert.match(errors[0].userMessage, /1 - β⁴ must be greater than zero/);
    }
  });

  it("[#10] QThe <= 0 is rejected before Cd is formed (a vanishing orifice area), never as Infinity", () => {
    const errors = failed(run(setup({ orificeDiameter: { value: "1e-200", unit: "m" } }), valid));
    const error = onlyReason(errors);

    assert.equal(error.formulaKey, "Cd");
    assert.match(error.userMessage, /theoretical discharge is not greater than zero/);

    const withoutCdCheck: NormalizedExperiment = { ...experiment, formulas: experiment.formulas.map((formula) => (formula.key === "Cd" ? { ...formula, checks: [] } : formula)) };
    const raw = failed(calculateExperiment({ experiment: withoutCdCheck, inputs: setup({ orificeDiameter: { value: "1e-200", unit: "m" } }), runValues: valid }));

    assert.equal(raw[0].code, "DIVISION_BY_ZERO", "the evaluator is the last line of defence");
  });

  it("[#11] no NaN or Infinity is ever produced: every failure leaves no calculated values behind", () => {
    const bad: [QuantityInputs, QuantityInputs][] = [
      [setup({ pipeDiameter: { value: "0", unit: "mm" } }), valid],
      [setup({ orificeDiameter: { value: "25", unit: "mm" } }), valid],
      [setup({ viscosity: { value: "0", unit: "Pa·s" } }), valid],
      [setup(), observation(200, 200, 0.05, 20)],
      [setup(), observation(150, 250, 0.05, 20)],
      [setup(), observation(250, 150, 0.05, 0)],
      [setup({ tankArea: { value: "1e308", unit: "m²" } }), observation(250, 150, 1e10, 1e-300)],
    ];

    for (const [inputs, runValues] of bad) {
      const result = run(inputs, runValues);

      assert.equal(result.ok, false);
    }

    for (const row of [RUN_1, RUN_2, RUN_3, RUN_4]) {
      const ok = succeeded(run(setup(), observation(...row)));

      for (const [key, value] of Object.entries(ok.calculated)) assert.ok(Number.isFinite(value), `${key} = ${value}`);
    }
  });

  it("reports several independent problems together, so the student can fix them all at once", () => {
    const errors = failed(run(setup({ viscosity: { value: "0", unit: "Pa·s" }, tankArea: { value: "-1", unit: "m²" } }), observation(150, 250, 0.05, 0)));
    const fields = errors.map((error) => error.fieldKey).sort();

    assert.deepEqual(fields, ["lhs", "tankArea", "time", "viscosity"]);
    allClear(errors);
  });

  it("valid runs are unaffected by the checks", () => {
    for (const row of [RUN_1, RUN_2, RUN_3, RUN_4]) succeeded(run(setup(), observation(...row)));
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
      setup: setup({ orificeDiameter: { value: "30", unit: "mm" } }),
      runs: [{ ...createDraftRun("r1", experiment.runFields), runValues: valid }, { ...createDraftRun("r2", experiment.runFields), runValues: valid }],
    });

    assert.equal(outcome.setupIssues.length, 1, "shared setup problems are shown once, not once per run");
    assert.equal(outcome.setupIssues[0].fieldKey, "orificeDiameter");
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
describe("orificemeter: several runs and both graphs", () => {
  const experiment = orificemeter();
  const draft = (id: string, row: [number, number, number, number]) => ({
    ...createDraftRun(id, experiment.runFields),
    runValues: observation(...row),
  });
  const outcome = calculateAllDraftRuns({ experiment, setup: setup(), runs: [draft("r1", RUN_1), draft("r2", RUN_2), draft("r3", RUN_3), draft("r4", RUN_4)] });
  const [calibration, discharge] = buildRunGraphs(experiment, outcome.runs);
  const runs = [R1, R2, R3, R4];

  it("[#4] Calculate All calculates every run, and the values match the manual's equations", () => {
    assert.deepEqual(outcome.setupIssues, []);
    assert.deepEqual(outcome.definitionIssues, []);
    assert.deepEqual(outcome.runs.map((entry) => entry.status), ["calculated", "calculated", "calculated", "calculated"]);

    runs.forEach((expected, index) => {
      const results = outcome.runs[index].result!.results;

      for (const [key, value] of Object.entries(expected)) near(results[key], value, `run ${index + 1} ${key}`);
    });
  });

  it("[#5] graph 1 has one (Rm, QAct) point per run, and it is an ordinary chart", () => {
    assert.equal(calibration.status, "ready");
    assert.equal(calibration.graph?.points.length, 4);
    assert.deepEqual([calibration.graph?.xKey, calibration.graph?.yKey, calibration.graph?.scale], ["Rm", "QAct", "linear"]);
    assert.equal("xScale" in (calibration.graph ?? {}), false, "an ordinary graph carries no per-axis scales");
    assert.equal(calibration.graph?.title, "Actual Discharge vs Manometer Reading");

    runs.forEach((expected, index) => {
      near(calibration.graph!.points[index].x, expected.Rm, `run ${index + 1} x`);
      near(calibration.graph!.points[index].y, expected.QAct, `run ${index + 1} y`);
    });

    assert.equal(describeGraphState(calibration, 4).kind, "chart");
  });

  it("[#6][#7] graph 2 has one (NRe, Cd) point per run, with NRe on a LOG x axis and Cd on a LINEAR y axis", () => {
    assert.equal(discharge.status, "ready");
    assert.equal(discharge.graph?.points.length, 4);
    assert.deepEqual([discharge.graph?.xKey, discharge.graph?.yKey], ["NRe", "Cd"]);
    assert.deepEqual([discharge.graph?.scale, discharge.graph?.xScale, discharge.graph?.yScale], ["linear", "log", "linear"]);
    assert.equal(discharge.graph?.title, "Coefficient of Discharge vs Reynolds Number");

    runs.forEach((expected, index) => {
      near(discharge.graph!.points[index].x, expected.NRe, `run ${index + 1} x`);
      near(discharge.graph!.points[index].y, expected.Cd, `run ${index + 1} y`);
    });

    assert.equal(describeGraphState(discharge, 4).kind, "chart");
  });

  it("[#4] two runs already give two points on each graph", () => {
    const two = calculateAllDraftRuns({ experiment, setup: setup(), runs: [draft("r1", RUN_1), draft("r2", RUN_2)] });

    for (const generation of buildRunGraphs(experiment, two.runs)) assert.equal(generation.graph?.points.length, 2);
  });

  it("the graph data comes from the calculated runs, not from fixed values", () => {
    const other = calculateAllDraftRuns({ experiment, setup: setup(), runs: [draft("r1", [300, 100, 0.05, 25]), draft("r2", [350, 100, 0.05, 22])] });
    const [graph] = buildRunGraphs(experiment, other.runs);

    near(graph.graph!.points[0].x, 0.2, "Rm from these readings");
    assert.notEqual(graph.graph!.points[0].y, R1.QAct);
  });

  it("a run that cannot be calculated does not hide the others, and its message is clear", () => {
    const mixed = calculateAllDraftRuns({ experiment, setup: setup(), runs: [draft("r1", RUN_1), draft("r2", [150, 250, 0.05, 20]), draft("r3", RUN_3)] });

    assert.deepEqual(mixed.runs.map((entry) => entry.status), ["calculated", "error", "calculated"]);

    for (const generation of buildRunGraphs(experiment, mixed.runs)) assert.equal(generation.graph?.points.length, 2);

    assert.match(mixed.runs[1].errors[0].userMessage, /Rm \(LHS - RHS\) is negative/);
  });

  it("[#11] a failed run contributes no point at all to either graph", () => {
    const zeroTime = calculateAllDraftRuns({ experiment, setup: setup(), runs: [draft("r1", RUN_1), draft("r2", [250, 150, 0.05, 0])] });

    for (const generation of buildRunGraphs(experiment, zeroTime.runs)) {
      assert.equal(generation.graph?.points.length, 1);
      assert.ok(generation.graph!.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
    }
  });

  it("one end-to-end run reads out the whole result table for the student", () => {
    const [only] = outcome.runs;

    assert.deepEqual(only.result?.outputs.map((output) => `${output.label}=${output.displayValue}`), [
      "Rm=0.1000",
      "H=1.2600",
      "QAct=0.000313",
      "QThe=0.000630",
      "VOrifice=5.1351",
      "VAct=0.6366",
      "Cd=0.4959",
      "NRe=15915",
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("orificemeter: graph data never carries invalid points", () => {
  const experiment = orificemeter();
  const [calibration, discharge] = experiment.graphConfigs;

  it("[#11] NaN and Infinity values are left out of a graph, with a clear warning, and the other runs are kept", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      for (const config of [calibration, discharge]) {
        const generation = generateGraphData({
          graphConfig: config,
          results: [
            { id: "ok1", label: "Run 1", values: { Rm: 0.1, QAct: 0.0003, NRe: 15000, Cd: 0.5 } },
            { id: "bad", label: "Run 2", values: { Rm: bad, QAct: bad, NRe: bad, Cd: bad } },
            { id: "ok2", label: "Run 3", values: { Rm: 0.2, QAct: 0.0004, NRe: 22000, Cd: 0.51 } },
          ],
        });

        assert.deepEqual(generation.graph?.points.map((point) => point.runId), ["ok1", "ok2"], `${config.title} with ${bad}`);
        assert.ok(generation.graph!.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
        assert.equal(generation.issues.length, 1);
        assert.equal(generation.issues[0].code, "GRAPH_VARIABLE_UNAVAILABLE");
        assert.match(generation.issues[0].userMessage, /Run 2/);
      }
    }
  });

  it("[#11] it is enough for ONE coordinate to be invalid: the point is dropped whether x or y is not finite", () => {
    for (const config of [calibration, discharge]) {
      const [xKey, yKey] = [config.xKey as string, config.yKey as string];

      for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
        const good = { [xKey]: 1000, [yKey]: 0.5 };
        const generation = generateGraphData({
          graphConfig: config,
          results: [
            { id: "ok", label: "Run 1", values: good },
            { id: "badX", label: "Run 2", values: { ...good, [xKey]: bad } },
            { id: "badY", label: "Run 3", values: { ...good, [yKey]: bad } },
          ],
        });

        assert.deepEqual(generation.graph?.points.map((point) => point.runId), ["ok"], `${config.title} with ${bad}`);
        assert.equal(generation.issues.length, 2);
      }
    }
  });

  it("a graph whose only points are invalid is empty, not a broken chart", () => {
    const generation = generateGraphData({ graphConfig: discharge, results: [{ id: "bad", values: { NRe: Number.NaN, Cd: 0.5 } }] });

    assert.equal(generation.status, "empty");
    assert.equal(generation.graph, null);
  });

  it("[#11] invalid LOG values: a zero or negative NRe is not plotted on the log x axis, but a zero or negative Cd still is (its axis is linear)", () => {
    const generation = generateGraphData({
      graphConfig: discharge,
      results: [
        { id: "zero", label: "Run 1", values: { NRe: 0, Cd: 0.5 } },
        { id: "negative", label: "Run 2", values: { NRe: -5, Cd: 0.5 } },
        { id: "fine", label: "Run 3", values: { NRe: 12000, Cd: 0.5 } },
        { id: "zeroCd", label: "Run 4", values: { NRe: 13000, Cd: 0 } },
      ],
    });

    assert.deepEqual(generation.graph?.points.map((point) => point.runId), ["fine", "zeroCd"]);
    assert.equal(generation.issues.length, 2);
    assert.ok(generation.issues.every((issue) => issue.code === "GRAPH_LOG_SCALE_INVALID"));
    assert.match(generation.issues[0].message, /log scale on the x axis/);
  });

  it("a linear graph is not affected by the finite-value guard for ordinary values, including zero and negatives", () => {
    const generation = generateGraphData({
      graphConfig: calibration,
      results: [{ id: "a", values: { Rm: 0, QAct: 0 } }, { id: "b", values: { Rm: 0.1, QAct: 0.0003 } }],
    });

    assert.equal(generation.graph?.points.length, 2);
    assert.deepEqual(generation.issues, []);
  });
});

// ---------------------------------------------------------------------------------------------
describe("orificemeter: the other experiments are unaffected", () => {
  it("[#12] the Venturimeter still calculates its manual run exactly as before", () => {
    const venturi = experiments.find((entry) => entry.id === "venturimeter");

    assert.ok(venturi);

    const experiment = normalizeExperiment({ id: "venturimeter", subjectId: "fluid-mechanics", data: venturi as unknown as RawExperimentData });
    const result = succeeded(
      calculateExperiment({
        experiment,
        inputs: {
          pipeDiameter: { value: "25.4", unit: "mm" },
          throatDiameter: { value: "12.5", unit: "mm" },
          tankArea: { value: "0.125", unit: "m²" },
          manometerDensity: { value: "13600", unit: "kg/m³" },
          fluidDensity: { value: "1000", unit: "kg/m³" },
          viscosity: { value: "0.00098", unit: "Pa·s" },
        },
        runValues: observation(...RUN_1),
      }),
    );

    near(result.calculated.Cd, 0.49691229866408104, "Venturimeter Cd");
    near(result.calculated.NRe, 15984.54755462552, "Venturimeter NRe");
  });

  it("[#12] the Centrifugal Pump definition shares nothing with the Orifice Meter's (its own formulas, none of the orifice keys)", () => {
    const pump = experiments.find((entry) => entry.id === "centrifugalpump");

    assert.ok(pump);

    const text = JSON.stringify(pump);

    for (const orificeKey of ["orificeDiameter", "Aorifice", "Vorifice", "QThe", "beta"]) assert.equal(text.includes(orificeKey), false, orificeKey);
  });

  it("[#12] every other seed experiment keeps its own key set; the orifice keys are not shared by accident", () => {
    const others = experiments.filter((entry) => entry.id !== "orificemeter");

    assert.equal(others.length, 6);
    assert.deepEqual(
      others.map((entry) => entry.id),
      ["pipeflow", "noncircular", "packedbed", "fluidizedbed", "venturimeter", "centrifugalpump"],
    );
  });
});
