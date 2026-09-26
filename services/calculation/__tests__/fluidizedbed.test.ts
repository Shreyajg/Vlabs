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

// Experiment No. 7, "Flow through fluidised beds", from the lab manual (pages 21-25).
// The definition under test is the fluidizedbed entry of the seed data, i.e. what Firestore is to hold.
// Expected values are derived by hand with plain arithmetic from the manual's equations, never from the
// engine. FIXED data is the manual's DATA table. The manual's observation table is blank, so the LHS / RHS /
// bed height / rotameter observations are SYNTHETIC TEST INPUTS, not manual-provided measurements.

const seed = experiments.find((entry) => entry.id === "fluidizedbed");

assert.ok(seed, "the fluidizedbed entry must exist in the seed data");

function fluidizedbed(): NormalizedExperiment {
  return normalizeExperiment({
    id: "fluidizedbed",
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

// ---- the manual's DATA table ------------------------------------------------------------------
const G = 9.81;
const RHO_M = 1600; // density of manometer fluid (CCl4)
const RHO_F = 1000; // water
const MU = 1e-3;
const D_COL = 0.057;
const L0 = 1.27;
const D_P = 6e-3;
const CF = 0.66; // rotameter reading x 0.66
const V_VOID = 125e-6; // approximately 125 ml

function setup(overrides: QuantityInputs = {}): QuantityInputs {
  return {
    columnDiameter: { value: "0.057", unit: "m" },
    initialBedHeight: { value: "1.27", unit: "m" },
    particleDiameter: { value: "6", unit: "mm" },
    fluidDensity: { value: "1000", unit: "kg/m³" },
    dynamicViscosity: { value: "0.001", unit: "Pa·s" },
    ...overrides,
  };
}

/** SYNTHETIC observation: LHS / RHS in cm, bed height in m, rotameter in LPM. */
function observation(lhsCm: number, rhsCm: number, bedHeightM: number, rotameterLpm: number): QuantityInputs {
  return {
    lhs: { value: String(lhsCm), unit: "cm" },
    rhs: { value: String(rhsCm), unit: "cm" },
    bedHeight: { value: String(bedHeightM), unit: "m" },
    flow: { value: String(rotameterLpm), unit: "LPM" },
  };
}

/** The manual's equations in plain arithmetic, in SI. */
function manual(lhsCm: number, rhsCm: number, bedHeight: number, rotameterLpm: number) {
  const A = (Math.PI * D_COL * D_COL) / 4;
  const epsilon0 = V_VOID / (A * L0);
  const Rm = (lhsCm - rhsCm) * 1e-2;
  const Qact = (rotameterLpm * CF * 1e-3) / 60;
  const Vo = Qact / A;
  const epsilon = 1 - (L0 / bedHeight) * (1 - epsilon0);
  const deltaPPerLength = G * (RHO_M - RHO_F) * (1 - epsilon);
  const NRe = (D_P * Vo * RHO_F) / MU;
  const f = (deltaPPerLength / RHO_F) * (epsilon ** 3 / (1 - epsilon) ** 2) * (D_P / Vo ** 2);
  const Vmf = (D_P ** 2 * G * (RHO_M - RHO_F) * epsilon ** 3) / (150 * (1 - epsilon) * MU);

  return { A, epsilon0, Rm, Qact, Vo, epsilon, deltaPPerLength, NRe, f, Vmf };
}

function near(actual: number, expected: number, name: string): void {
  assert.ok(closeTo(actual, expected), `${name}: got ${actual}, expected ${expected}`);
}

// Frozen copies of what the Firestore document held before this work.
const ORIGINAL_INPUT_FIELDS = [
  { key: "columnDiameter", label: "Column Diameter", type: "number", defaultUnit: "m", units: ["m", "cm", "mm"] },
  { key: "initialBedHeight", label: "Initial Bed Height", type: "number", defaultUnit: "m", units: ["m", "cm", "mm"] },
  { key: "particleDiameter", label: "Particle Diameter", type: "number", defaultValue: 0.006, defaultUnit: "m", units: ["m", "cm", "mm"] },
  { key: "fluidDensity", label: "Fluid Density", type: "number", defaultValue: 1000, defaultUnit: "kg/m³", units: ["kg/m³", "g/cm³"] },
  { key: "dynamicViscosity", label: "Dynamic Viscosity", type: "number", defaultValue: 0.001, defaultUnit: "Pa·s", units: ["Pa·s", "cP"] },
];

// ---------------------------------------------------------------------------------------------
describe("fluidizedbed: the stored definition", () => {
  const experiment = fluidizedbed();

  it("[#1] normalizes with no data-quality warnings", () => {
    assert.deepEqual(experiment.warnings, []);
  });

  it("keeps the five setup inputs exactly as they were", () => {
    assert.deepEqual(seed.inputFields, ORIGINAL_INPUT_FIELDS);
  });

  it("keeps the original aim, theory and procedure", () => {
    assert.equal(experiment.aim.length, 2);
    assert.match(experiment.aim[1], /theoretical and actual minimum fluidization velocities/);
    assert.equal(experiment.procedure.length, 9);
    assert.match(experiment.theory, /solid particles are suspended in an upward flowing fluid/i);
    assert.equal(experiment.title, "Flow Through Fluidized Bed");
  });

  it("[#2] every variable key is valid and used exactly once across constants, inputs, run fields and formulas", () => {
    const keys = [
      ...experiment.constants.map((constant) => constant.key),
      ...experiment.inputFields.map((field) => field.key),
      ...experiment.runFields.map((field) => field.key),
      ...experiment.formulas.map((formula) => formula.key),
    ];

    for (const key of keys) {
      assert.ok(key, "every constant, field and formula has a key");
      assert.ok(isValidVariableKey(key as string), `"${key}" is not a valid variable key`);
    }

    assert.equal(new Set(keys).size, keys.length, "a key is used twice");
  });

  it("[#3] gives every formula a machine-readable expression that parses", () => {
    for (const formula of experiment.formulas) {
      assert.ok(formula.expression, `${formula.name} has no expression`);
      assert.doesNotThrow(() => parseFormulaExpression(formula.expression as string), formula.name);
    }
  });

  it("[#4] stores formulas in dependency order: A, ε0, Rm, Qact, Vo, ε, ΔP/L, NRe, f, Vmf", () => {
    assert.deepEqual(
      experiment.formulas.map((formula) => formula.key),
      ["A", "epsilon0", "Rm", "Qact", "Vo", "epsilon", "deltaPPerLength", "NRe", "f", "Vmf"],
    );
  });

  it("[#4] every formula only reads variables that already exist when it runs", () => {
    const available = new Set<string>(["pi"]);

    for (const constant of experiment.constants) if (constant.key) available.add(constant.key);
    for (const field of [...experiment.inputFields, ...experiment.runFields]) if (field.kind === "number") available.add(field.key);

    for (const formula of experiment.formulas) {
      const { variables } = parseFormulaExpression(formula.expression as string);
      const missing = variables.filter((variable) => !available.has(variable));

      assert.deepEqual(missing, [], `${formula.key} reads ${missing.join(", ")} before it exists`);
      available.add(formula.key as string);
    }
  });

  it("[#4] really needs that order: the engine does not sort formulas for you", () => {
    const reordered: NormalizedExperiment = {
      ...experiment,
      formulas: [...experiment.formulas].sort((a, b) => (a.key === "f" ? -1 : b.key === "f" ? 1 : 0)),
    };
    const errors = failed(calculateExperiment({ experiment: reordered, inputs: setup(), runValues: observation(12, 8, 1.27, 1) }));

    assert.ok(errors.some((error) => error.code === "UNKNOWN_FORMULA_VARIABLE" && error.formulaKey === "f"));
  });

  it("invents no dependency: Rm feeds only the results table, and nothing reads a value it does not need", () => {
    const readers = (key: string) =>
      experiment.formulas.filter((formula) => parseFormulaExpression(formula.expression as string).variables.includes(key)).map((formula) => formula.key);

    assert.deepEqual(readers("Rm"), [], "the manual's formulas never use Rm; it is reported, not fed into anything");
    assert.deepEqual(readers("Qact"), ["Vo"]);
    assert.deepEqual(readers("epsilon0"), ["epsilon"]);
  });

  it("corrects the misleading 'Particle Density' constant: the 1600 kg/m³ is the manometer fluid (CCl4)", () => {
    assert.equal(experiment.constants.some((constant) => /particle/i.test(constant.name)), false);
    assert.equal(experiment.constants.some((constant) => constant.symbol === "ρp"), false);

    const manometer = experiment.constants.find((constant) => constant.key === "manometerDensity");

    assert.deepEqual(
      { name: manometer?.name, symbol: manometer?.symbol, value: manometer?.value, unit: manometer?.unit },
      { name: "Manometer Fluid Density", symbol: "ρm", value: 1600, unit: "kg/m³" },
    );
  });

  it("[#6][#8] has all four constants with valid keys and the manual's values", () => {
    assert.deepEqual(
      experiment.constants.map(({ key, value, unit, symbol }) => ({ key, value, unit, symbol })),
      [
        { key: "gravity", value: 9.81, unit: "m/s²", symbol: "g" },
        { key: "manometerDensity", value: 1600, unit: "kg/m³", symbol: "ρm" },
        { key: "rotameterCorrection", value: 0.66, unit: "-", symbol: "Cf" },
        { key: "initialVoidVolume", value: 125e-6, unit: "m³", symbol: "Vvoid" },
      ],
    );
  });

  it("has the four per-run inputs, with units normalised once", () => {
    assert.deepEqual(experiment.runFields.map((field) => field.key), ["lhs", "rhs", "bedHeight", "flow"]);

    const byKey = Object.fromEntries(experiment.runFields.map((field) => [field.key, field]));

    assert.equal(byKey.lhs.calculationUnit, "m");
    assert.equal(byKey.rhs.calculationUnit, "m");
    assert.equal(byKey.flow.calculationUnit, "m³/s");
    assert.equal(byKey.bedHeight.defaultUnit, "m");
    for (const field of experiment.runFields) {
      assert.equal(field.optional, undefined, `${field.key} is required`);
      assert.equal(field.units[0], field.defaultUnit, `${field.key}: the unit selector shows units[0]`);
    }
  });

  it("[#14] defines the manual's result table plus the theoretical Vmf, and every output key resolves", () => {
    assert.deepEqual(
      experiment.outputs.map(({ key, label }) => ({ key, label })),
      [
        { key: "Rm", label: "Rm" },
        { key: "deltaPPerLength", label: "ΔP/L" },
        { key: "Qact", label: "QAct" },
        { key: "Vo", label: "Vo" },
        { key: "epsilon", label: "ε" },
        { key: "NRe", label: "NRe" },
        { key: "f", label: "f" },
        { key: "Vmf", label: "Vmf" },
      ],
    );

    const formulaKeys = new Set(experiment.formulas.map((formula) => formula.key));

    for (const output of experiment.outputs) assert.ok(formulaKeys.has(output.key), `output "${output.key}" is not a formula`);
    for (const output of experiment.outputs) assert.notEqual(output.decimals, undefined, `${output.key} has no decimals`);
  });

  it("does not show intermediate variables (A, ε0) as results", () => {
    const keys = experiment.outputs.map((output) => output.key);

    assert.equal(keys.includes("A"), false);
    assert.equal(keys.includes("epsilon0"), false);
  });

  it("[#13] defines two ordinary (linear) graphs whose keys resolve to formulas", () => {
    assert.equal(experiment.graphConfigs.length, 2);

    const [pressure, voidage] = experiment.graphConfigs;
    const formulaKeys = new Set(experiment.formulas.map((formula) => formula.key));

    assert.deepEqual(
      { title: pressure.title, type: pressure.type, xKey: pressure.xKey, yKey: pressure.yKey, xLabel: pressure.xLabel, yLabel: pressure.yLabel, scale: pressure.scale },
      {
        title: "Pressure Drop per Unit Length vs Superficial Velocity",
        type: "line",
        xKey: "Vo",
        yKey: "deltaPPerLength",
        xLabel: "Superficial Velocity (Vo)",
        yLabel: "ΔP/L",
        scale: "linear",
      },
    );
    assert.deepEqual(
      { title: voidage.title, type: voidage.type, xKey: voidage.xKey, yKey: voidage.yKey, xLabel: voidage.xLabel, yLabel: voidage.yLabel, scale: voidage.scale },
      {
        title: "Void Fraction vs Superficial Velocity",
        type: "line",
        xKey: "Vo",
        yKey: "epsilon",
        xLabel: "Superficial Velocity (Vo)",
        yLabel: "Void Fraction (ε)",
        scale: "linear",
      },
    );

    for (const graph of experiment.graphConfigs) {
      assert.ok(formulaKeys.has(graph.xKey as string), `x key "${graph.xKey}" is not a formula`);
      assert.ok(formulaKeys.has(graph.yKey as string), `y key "${graph.yKey}" is not a formula`);
    }
  });

  it("keeps the human-readable formulas, and shows the manual's text for ΔP/L (it said ρp−ρ)", () => {
    const text = Object.fromEntries(experiment.formulas.map((formula) => [formula.key, formula.formula]));

    assert.equal(text.Vo, "Vo = Q/A");
    assert.equal(text.epsilon, "ε = 1 − (L₀/L)(1−ε₀)");
    assert.equal(text.NRe, "Re = DpVoρ/μ");
    assert.equal(text.f, "f = (ΔP/Lρ)(ε³/(1−ε)²)(Dp/Vo²)");
    assert.equal(text.deltaPPerLength, "ΔP/L = g(ρm−ρf)(1−ε)");
    assert.equal(text.A, "A = πD²/4");
    assert.equal(text.epsilon0, "ε₀ = Vvoid/(A·L₀)");
    assert.equal(text.Rm, "Rm = LHS − RHS");
    assert.equal(text.Qact, "Qact = Cf × rotameter reading");
    assert.equal(text.Vmf, "Vmf = Dp²g(ρm−ρf)εmf³/[150(1−εmf)μf]");
  });

  it("the Run screen's starting values hold the manual's densities and viscosity, and 6 mm particles", () => {
    const start = initialQuantities(experiment.inputFields);

    assert.equal(start.fluidDensity.value, "1000");
    assert.equal(start.dynamicViscosity.value, "0.001");
    assert.equal(start.particleDiameter.value, "0.006");
    assert.equal(start.columnDiameter.value, "", "the apparatus dimensions are entered by the student");
  });
});

// ---------------------------------------------------------------------------------------------
describe("fluidizedbed: calculation chain (synthetic run A: packed bed, LHS 12 cm, RHS 8 cm, 1.27 m, 1 LPM)", () => {
  const experiment = fluidizedbed();
  const result = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(12, 8, 1.27, 1) }));

  it("[#7] A = πD²/4", () => {
    near(result.calculated.A, 0.00255175863287831, "A");
  });

  it("[#8] the initial voidage is calculated, 125e-6 / (A × L0), not hard-coded", () => {
    near(result.calculated.epsilon0, 0.03857151518259896, "ε0");
  });

  it("[#5] Rm = LHS − RHS, in metres", () => {
    near(result.scope.lhs, 0.12, "lhs (12 cm)");
    near(result.scope.rhs, 0.08, "rhs (8 cm)");
    near(result.calculated.Rm, 0.04, "Rm");
  });

  it("[#6] the actual flow is the rotameter reading × 0.66, in m³/s", () => {
    near(result.scope.flow, 1 / 60000, "the reading, converted to m³/s");
    near(result.calculated.Qact, 0.000011, "Qact"); // 1 LPM x 0.66 = 0.66 LPM = 1.1e-5 m3/s
  });

  it("Vo = Qact / A", () => {
    near(result.calculated.Vo, 0.004310752536807259, "Vo");
  });

  it("[#9] ε = 1 − (L0/L)(1 − ε0), and equals ε0 while the bed has not expanded", () => {
    near(result.calculated.epsilon, 0.03857151518259894, "ε");
    near(result.calculated.epsilon, result.calculated.epsilon0, "ε = ε0 at L = L0");
  });

  it("[#10] ΔP/L = g(ρm − ρf)(1 − ε)", () => {
    near(result.calculated.deltaPPerLength, 5658.9680616352225, "ΔP/L");
  });

  it("[#11] NRe = Dp Vo ρf / μ", () => {
    near(result.calculated.NRe, 25.864515220843558, "NRe");
  });

  it("[#12] f = (ΔP/L)(1/ρf)[ε³/(1−ε)²](Dp/Vo²)", () => {
    near(result.calculated.f, 0.11343535543496774, "f");
  });

  it("Vmf = Dp² g (ρm − ρf) εmf³ / [150 (1 − εmf) μf]", () => {
    near(result.calculated.Vmf, 8.431689641722688e-5, "Vmf");
  });

  it("matches the manual's equations, computed independently", () => {
    const expected = manual(12, 8, 1.27, 1);

    for (const [key, value] of Object.entries(expected)) near(result.scope[key] ?? result.calculated[key], value, key);
  });

  it("[#14] returns exactly the manual's result table plus Vmf, in order, formatted per the outputs", () => {
    assert.deepEqual(Object.keys(result.results), ["Rm", "deltaPPerLength", "Qact", "Vo", "epsilon", "NRe", "f", "Vmf"]);
    assert.deepEqual(result.outputs.map((output) => output.label), ["Rm", "ΔP/L", "QAct", "Vo", "ε", "NRe", "f", "Vmf"]);

    const shown = Object.fromEntries(result.outputs.map((output) => [output.key, output.displayValue]));

    assert.equal(shown.Rm, "0.0400");
    assert.equal(shown.deltaPPerLength, "5658.97");
    assert.equal(shown.Qact, "0.0000110");
    assert.equal(shown.Vo, "0.00431");
    assert.equal(shown.epsilon, "0.0386");
    assert.equal(shown.NRe, "25.86");
    assert.equal(shown.f, "0.1134");
    assert.equal(shown.Vmf, "0.0000843");
    assert.deepEqual(result.warnings, []);
  });

  it("[#13] the single-run graphs plot ΔP/L and ε against Vo, on linear scales", () => {
    assert.equal(result.graphData.length, 2);

    const [pressure, voidage] = result.graphData;

    assert.deepEqual([pressure.xKey, pressure.yKey, pressure.scale], ["Vo", "deltaPPerLength", "linear"]);
    assert.deepEqual([voidage.xKey, voidage.yKey, voidage.scale], ["Vo", "epsilon", "linear"]);
    near(pressure.points[0].x, 0.004310752536807259, "graph 1 x (Vo)");
    near(pressure.points[0].y, 5658.9680616352225, "graph 1 y (ΔP/L)");
    near(voidage.points[0].x, 0.004310752536807259, "graph 2 x (Vo)");
    near(voidage.points[0].y, 0.03857151518259894, "graph 2 y (ε)");
  });
});

// ---------------------------------------------------------------------------------------------
describe("fluidizedbed: nothing is hard-coded", () => {
  const experiment = fluidizedbed();
  const baseline = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(12, 8, 1.27, 1) }));
  const withConstant = (key: string, value: number): NormalizedExperiment => ({
    ...experiment,
    constants: experiment.constants.map((constant) => (constant.key === key ? { ...constant, value } : constant)),
  });
  const run = (changed: NormalizedExperiment, inputs = setup(), runValues = observation(12, 8, 1.27, 1)) =>
    succeeded(calculateExperiment({ experiment: changed, inputs, runValues }));

  it("[#6] the rotameter correction is the constant, not a literal 0.66", () => {
    const uncorrected = run(withConstant("rotameterCorrection", 1));

    near(uncorrected.calculated.Qact, baseline.calculated.Qact / 0.66, "Qact with Cf = 1");
    near(uncorrected.calculated.Vo, baseline.calculated.Vo / 0.66, "Vo with Cf = 1");
  });

  it("[#8] ε0 follows the initial void volume constant, the column area and the initial bed height", () => {
    near(run(withConstant("initialVoidVolume", 250e-6)).calculated.epsilon0, baseline.calculated.epsilon0 * 2, "double the void volume");
    near(run(experiment, setup({ initialBedHeight: { value: "2.54", unit: "m" } }), observation(12, 8, 2.54, 1)).calculated.epsilon0, baseline.calculated.epsilon0 / 2, "double the bed height");
    near(run(experiment, setup({ columnDiameter: { value: "0.114", unit: "m" } })).calculated.epsilon0, baseline.calculated.epsilon0 / 4, "double the column diameter");
    assert.notEqual(baseline.calculated.epsilon0, 0.4, "it is not the usual 0.4");
  });

  it("[#10] ΔP/L uses the manometer-fluid constant", () => {
    const changed = run(withConstant("manometerDensity", 2000));

    near(changed.calculated.deltaPPerLength, G * (2000 - RHO_F) * (1 - baseline.calculated.epsilon), "ΔP/L with ρm = 2000");
  });

  it("gravity is the constant", () => {
    near(run(withConstant("gravity", 20)).calculated.deltaPPerLength, baseline.calculated.deltaPPerLength * (20 / 9.81), "ΔP/L with g = 20");
  });
});

// ---------------------------------------------------------------------------------------------
describe("fluidizedbed: units", () => {
  const experiment = fluidizedbed();
  const baseline = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(12, 8, 1.27, 1) }));

  it("[#5] gives the same Rm whether LHS and RHS are entered in cm, mm or m, or mixed", () => {
    const entries: QuantityInputs[] = [
      { ...observation(12, 8, 1.27, 1), lhs: { value: "120", unit: "mm" }, rhs: { value: "80", unit: "mm" } },
      { ...observation(12, 8, 1.27, 1), lhs: { value: "0.12", unit: "m" }, rhs: { value: "0.08", unit: "m" } },
      { ...observation(12, 8, 1.27, 1), lhs: { value: "12", unit: "cm" }, rhs: { value: "80", unit: "mm" } },
    ];

    for (const runValues of entries) {
      const result = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues }));

      near(result.calculated.Rm, 0.04, "Rm");
    }
  });

  it("[#5] does not double-convert: 12 cm becomes exactly 0.12 m", () => {
    assert.equal(baseline.scope.lhs, 0.12);
    assert.equal(baseline.scope.rhs, 0.08);
  });

  it("[#6] gives the same Qact for the reading in LPM, LPH or m³/s", () => {
    for (const flow of [
      { value: "1", unit: "LPM" },
      { value: "60", unit: "LPH" },
      { value: String(1 / 60000), unit: "m³/s" },
    ]) {
      const result = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: { ...observation(12, 8, 1.27, 1), flow } }));

      near(result.calculated.Qact, 0.000011, `Qact (${flow.value} ${flow.unit})`);
      near(result.calculated.Vo, baseline.calculated.Vo, "Vo");
    }
  });

  it("gives the same result for the bed heights in m, cm or mm", () => {
    const base = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(12, 8, 1.3, 2) }));

    for (const bedHeight of [{ value: "130", unit: "cm" }, { value: "1300", unit: "mm" }]) {
      const result = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: { ...observation(12, 8, 1.3, 2), bedHeight } }));

      near(result.scope.bedHeight, 1.3, "bedHeight");
      near(result.calculated.epsilon, base.calculated.epsilon, "ε");
    }
  });

  it("gives the same result for the column, initial bed and particle in other units, and density and viscosity likewise", () => {
    const result = succeeded(
      calculateExperiment({
        experiment,
        inputs: setup({
          columnDiameter: { value: "5.7", unit: "cm" },
          initialBedHeight: { value: "127", unit: "cm" },
          particleDiameter: { value: "0.6", unit: "cm" },
          fluidDensity: { value: "1", unit: "g/cm³" },
          dynamicViscosity: { value: "1", unit: "cP" },
        }),
        runValues: observation(12, 8, 1.27, 1),
      }),
    );

    for (const key of ["A", "epsilon0", "Vo", "epsilon", "deltaPPerLength", "NRe", "f", "Vmf"]) near(result.calculated[key], baseline.calculated[key], key);
  });

  it("rejects a unit the field does not offer", () => {
    const errors = failed(
      calculateExperiment({ experiment, inputs: setup(), runValues: { ...observation(12, 8, 1.27, 1), flow: { value: "1", unit: "gpm" } } }),
    );

    assert.ok(errors.some((error) => error.code === "UNSUPPORTED_UNIT" && error.fieldKey === "flow"));
  });
});

// ---------------------------------------------------------------------------------------------
describe("fluidizedbed: zero, invalid and missing inputs", () => {
  const experiment = fluidizedbed();
  const run = (inputs: QuantityInputs, runValues: QuantityInputs) => calculateExperiment({ experiment, inputs, runValues });

  it("[#15] reports a zero column diameter as a division by zero (ε0), not a crash", () => {
    const errors = failed(run(setup({ columnDiameter: { value: "0", unit: "m" } }), observation(12, 8, 1.27, 1)));

    assert.ok(errors.some((error) => error.code === "DIVISION_BY_ZERO" && error.formulaKey === "epsilon0"));
    assert.ok(errors.some((error) => error.code === "FORMULA_DEPENDENCY_FAILED"), "what depends on it is reported, not silently skipped");
  });

  it("[#15] reports a zero initial bed height as a division by zero", () => {
    const errors = failed(run(setup({ initialBedHeight: { value: "0", unit: "m" } }), observation(12, 8, 1.27, 1)));

    assert.ok(errors.some((error) => error.code === "DIVISION_BY_ZERO" && error.formulaKey === "epsilon0"));
  });

  it("[#15] reports a zero bed height as a division by zero (ε)", () => {
    const errors = failed(run(setup(), observation(12, 8, 0, 1)));

    assert.ok(errors.some((error) => error.code === "DIVISION_BY_ZERO" && error.formulaKey === "epsilon"));
  });

  it("[#15] reports a zero flow as a division by zero (f needs Vo²)", () => {
    const errors = failed(run(setup(), observation(12, 8, 1.27, 0)));

    assert.ok(errors.some((error) => error.code === "DIVISION_BY_ZERO" && error.formulaKey === "f"));
  });

  it("[#15] reports a zero viscosity as a division by zero", () => {
    const errors = failed(run(setup({ dynamicViscosity: { value: "0", unit: "Pa·s" } }), observation(12, 8, 1.27, 1)));

    assert.ok(errors.some((error) => error.code === "DIVISION_BY_ZERO" && error.formulaKey === "NRe"));
  });

  it("reports non-numeric manometer values against the field", () => {
    for (const key of ["lhs", "rhs"]) {
      const runValues = observation(12, 8, 1.27, 1);

      runValues[key] = { value: "abc", unit: "cm" };

      const errors = failed(run(setup(), runValues));

      assert.ok(errors.some((error) => error.code === "INPUT_INVALID_NUMBER" && error.fieldKey === key), key);
    }
  });

  it("asks for every missing required input, and reports them all at once", () => {
    const errors = failed(run({}, {}));
    const missing = errors.filter((error) => error.code === "INPUT_REQUIRED").map((error) => error.fieldKey);

    for (const key of ["columnDiameter", "initialBedHeight", "particleDiameter", "fluidDensity", "dynamicViscosity", "lhs", "rhs", "bedHeight", "flow"]) {
      assert.ok(missing.includes(key), `${key} should be reported as required`);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("fluidizedbed: several runs, both graphs, and the minimum fluidization velocity", () => {
  const experiment = fluidizedbed();
  const rows: [number, number, number, number][] = [
    [12, 8, 1.27, 1], // packed bed (SYNTHETIC)
    [14, 9, 1.3, 2], // bed beginning to expand (SYNTHETIC)
    [15, 10, 1.45, 4], // fluidized (SYNTHETIC)
  ];
  const draft = (id: string, row: [number, number, number, number]) => ({
    ...createDraftRun(id, experiment.runFields),
    runValues: observation(...row),
  });

  it("[#16] Calculate All calculates every run and both graphs plot them against Vo", () => {
    const outcome = calculateAllDraftRuns({ experiment, setup: setup(), runs: rows.map((row, index) => draft(`r${index + 1}`, row)) });

    assert.deepEqual(outcome.setupIssues, []);
    assert.deepEqual(outcome.definitionIssues, []);
    assert.deepEqual(outcome.runs.map((run) => run.status), ["calculated", "calculated", "calculated"]);

    const [pressure, voidage] = buildRunGraphs(experiment, outcome.runs);

    for (const generation of [pressure, voidage]) {
      assert.equal(generation.status, "ready");
      assert.equal(generation.graph?.scale, "linear");
      assert.equal(generation.graph?.points.length, 3);
      assert.equal(describeGraphState(generation, 3).kind, "chart");
    }

    rows.forEach((row, index) => {
      const expected = manual(...row);

      near(pressure.graph!.points[index].x, expected.Vo, `graph 1 run ${index + 1} x`);
      near(pressure.graph!.points[index].y, expected.deltaPPerLength, `graph 1 run ${index + 1} y`);
      near(voidage.graph!.points[index].x, expected.Vo, `graph 2 run ${index + 1} x`);
      near(voidage.graph!.points[index].y, expected.epsilon, `graph 2 run ${index + 1} y`);
    });
  });

  it("[#16] a run that cannot be calculated does not hide the others", () => {
    const outcome = calculateAllDraftRuns({
      experiment,
      setup: setup(),
      runs: [draft("r1", rows[0]), draft("r2", [14, 9, 1.3, 0]), draft("r3", rows[2])],
    });

    assert.deepEqual(outcome.runs.map((run) => run.status), ["calculated", "error", "calculated"]);
    assert.equal(buildRunGraphs(experiment, outcome.runs)[1].graph?.points.length, 2);
  });

  it("[#16] a single run asks for another run instead of drawing a chart", () => {
    const outcome = calculateAllDraftRuns({ experiment, setup: setup(), runs: [draft("r1", rows[0])] });

    assert.equal(describeGraphState(buildRunGraphs(experiment, outcome.runs)[0], 1).kind, "message");
  });

  it("[#16] the values for the three runs match the manual's equations, computed independently", () => {
    const literals = [
      { Vo: 0.004310752536807259, epsilon: 0.03857151518259894, deltaPPerLength: 5658.9680616352225, NRe: 25.864515220843558, f: 0.11343535543496774, Vmf: 8.431689641722688e-5 },
      { Vo: 0.008621505073614519, epsilon: 0.06075832637069278, deltaPPerLength: 5528.376490982102, NRe: 51.729030441687115, f: 0.11346068088036675, Vmf: 3.3734288363745506e-4 },
      { Vo: 0.017243010147229038, epsilon: 0.15792125812544866, deltaPPerLength: 4956.475474673609, NRe: 103.45806088337423, f: 0.5555388335516264, Vmf: 0.0066069433262258065 },
    ];

    rows.forEach((row, index) => {
      const result = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(...row) }));

      for (const [key, value] of Object.entries(literals[index])) near(result.calculated[key], value, `run ${index + 1} ${key}`);
    });
  });

  it("exposes what is needed to find the ACTUAL minimum fluidization velocity: Vo and ε for every run, and ε rises once the bed expands", () => {
    const results = rows.map((row) => succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(...row) })));

    // While the bed is packed (L = L0) the voidage is the initial voidage; it rises after that. The Vo at the
    // first run where it rises is the actual Vmf, which the ε-versus-Vo graph shows.
    near(results[0].calculated.epsilon, results[0].calculated.epsilon0, "packed run: ε = ε0");
    assert.ok(results[1].calculated.epsilon > results[0].calculated.epsilon);
    assert.ok(results[2].calculated.epsilon > results[1].calculated.epsilon);
    assert.ok(results[2].calculated.Vo > results[1].calculated.Vo && results[1].calculated.Vo > results[0].calculated.Vo);
    assert.deepEqual(results.map((result) => Object.keys(result.results).includes("Vo") && Object.keys(result.results).includes("epsilon")), [true, true, true]);
  });

  it("does not depend on which run comes first: no run position is special", () => {
    const forward = rows.map((row) => succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(...row) })));
    const backward = [...rows].reverse().map((row) => succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(...row) })));

    forward.forEach((result, index) => {
      const mirror = backward[rows.length - 1 - index];

      for (const key of Object.keys(result.results)) near(mirror.results[key], result.results[key], key);
    });
  });
});
