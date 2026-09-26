import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { experiments } from "../../../constants/experiments";
import type { CalculationResult, GraphPoint, QuantityInputs } from "../../../types/Calculation";
import type { NormalizedExperiment, RawExperimentData } from "../../../types/Experiment";
import { normalizeExperiment } from "../../normalizeExperiment";
import { calculateExperiment } from "../calculateExperiment";
import {
  buildRunGraphs,
  calculateAllDraftRuns,
  createDraftRun,
  describeGraphState,
  initialQuantities,
} from "../draftRuns";
import { parseFormulaExpression } from "../formulaEvaluator";
import { closeTo } from "./fixtures";

// Experiment No. 6, "Flow through packed bed", from the lab manual (pages 17-20).
// The definition under test is the packedbed entry of the seed data, i.e. what Firestore is to hold.
// Expected values are derived by hand with plain arithmetic from the manual's equations, never from the
// engine. The manual's FIXED data is used as given. Its observation table is blank, so the LHS / RHS /
// flow observations below are SYNTHETIC TEST INPUTS, not manual-provided measurements.

const seed = experiments.find((entry) => entry.id === "packedbed");

assert.ok(seed, "the packedbed entry must exist in the seed data");

function packedbed(): NormalizedExperiment {
  return normalizeExperiment({
    id: "packedbed",
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

// ---- the manual's fixed data ---------------------------------------------------------------
const G = 9.81;
const RHO_M = 13600;
const RHO = 1000;
const MU = 1e-3; // 1 x 10^-3 N.s/m2
const D_COL = 0.073; // m
const LENGTH = 1; // m
const D_P = 12.5e-3; // 12.5 mm
const EPS = 0.4; // Firestore constant
const PHI = 1; // manual: shape factor of Raschig rings

function setup(overrides: QuantityInputs = {}): QuantityInputs {
  return {
    columnDiameter: { value: "0.073", unit: "m" },
    columnLength: { value: "1", unit: "m" },
    particleDiameter: { value: "12.5", unit: "mm" },
    fluidDensity: { value: "1000", unit: "kg/m³" },
    manometerDensity: { value: "13600", unit: "kg/m³" },
    viscosity: { value: "0.001", unit: "Pa·s" },
    ...overrides,
  };
}

/** SYNTHETIC observation: LHS / RHS in cm, flow in LPM, Manometer Difference left blank unless given. */
function observation(lhsCm: number, rhsCm: number, flowLpm: number, rm = ""): QuantityInputs {
  return {
    lhs: { value: String(lhsCm), unit: "cm" },
    rhs: { value: String(rhsCm), unit: "cm" },
    rm: { value: rm, unit: "m" },
    flow: { value: String(flowLpm), unit: "LPM" },
  };
}

/** The manual's equations in plain arithmetic, in SI. */
function manual(rmMetres: number, flowLpm: number) {
  const A = (Math.PI * D_COL * D_COL) / 4;
  const Qv = (flowLpm * 1e-3) / 60;
  const Vo = Qv / A;
  const NRe = (D_P * Vo * RHO) / MU;
  const deltaPPerLength = (rmMetres * G * (RHO_M - RHO)) / LENGTH;
  const fPE = (150 * (1 - EPS)) / NRe + 1.75;
  const fPT = (deltaPPerLength / RHO) * (EPS ** 3 / (1 - EPS) ** 2) * (D_P / Vo ** 2) * PHI;

  return { Rm: rmMetres, A, flow: Qv, Vo, NRe, deltaPPerLength, fPE, fPT };
}

function near(actual: number, expected: number, name: string): void {
  assert.ok(closeTo(actual, expected), `${name}: got ${actual}, expected ${expected}`);
}

// Frozen copy of what the Firestore document held for these fields before this work.
const ORIGINAL_INPUT_FIELDS = [
  { key: "columnDiameter", label: "Column Diameter", type: "number", defaultUnit: "m", units: ["m", "cm", "mm"] },
  { key: "columnLength", label: "Column Length", type: "number", defaultUnit: "m", units: ["m", "cm"] },
  { key: "particleDiameter", label: "Packing Particle Diameter", type: "number", defaultUnit: "m", units: ["m", "cm", "mm"] },
  { key: "fluidDensity", label: "Fluid Density", type: "number", defaultUnit: "kg/m³", defaultValue: 1000, units: ["kg/m³", "g/cm³"] },
  { key: "manometerDensity", label: "Manometer Fluid Density", type: "number", defaultUnit: "kg/m³", defaultValue: 13600, units: ["kg/m³", "g/cm³"] },
  { key: "viscosity", label: "Dynamic Viscosity", type: "number", defaultUnit: "Pa·s", defaultValue: 0.001, units: ["Pa·s", "cP"] },
];

// ---------------------------------------------------------------------------------------------
describe("packedbed: the stored definition", () => {
  const experiment = packedbed();

  it("normalizes with no data-quality warnings", () => {
    assert.deepEqual(experiment.warnings, []);
  });

  it("keeps the six setup inputs exactly as they were", () => {
    assert.deepEqual(seed.inputFields, ORIGINAL_INPUT_FIELDS);
  });

  it("keeps the original aim, theory and procedure", () => {
    assert.equal(experiment.aim.length, 2);
    assert.match(experiment.aim[1], /Ergun's equation/);
    assert.equal(experiment.procedure.length, 8);
    assert.match(experiment.theory, /packed bed is a bed of solid particles/i);
  });

  it("gives every formula a key and a machine-readable expression", () => {
    for (const formula of experiment.formulas) {
      assert.ok(formula.key, `${formula.name} has no key`);
      assert.ok(formula.expression, `${formula.name} has no expression`);
    }
  });

  it("[#9] stores formulas in dependency order: Rm, A, Vo, NRe, fPE, deltaPPerLength, fPT", () => {
    assert.deepEqual(
      experiment.formulas.map((formula) => formula.key),
      ["Rm", "A", "Vo", "NRe", "fPE", "deltaPPerLength", "fPT"],
    );
  });

  it("[#9] every formula only reads variables that already exist when it runs", () => {
    const available = new Set<string>(["pi"]);

    for (const constant of experiment.constants) if (constant.key) available.add(constant.key);
    for (const field of [...experiment.inputFields, ...experiment.runFields]) {
      // An optional field may be undefined, so a formula may only read it inside coalesce().
      if (field.kind === "number" && !field.optional) available.add(field.key);
    }

    for (const formula of experiment.formulas) {
      const { variables, optionalVariables } = parseFormulaExpression(formula.expression as string);
      const missing = variables.filter((variable) => !available.has(variable));

      assert.deepEqual(missing, [], `${formula.key} reads ${missing.join(", ")} before it exists`);

      for (const variable of optionalVariables) {
        const field = experiment.runFields.find((entry) => entry.key === variable);

        assert.ok(field?.optional, `${formula.key} treats "${variable}" as optional but it is a required field`);
      }

      available.add(formula.key as string);
    }
  });

  it("[#9] really needs that order: the engine does not sort formulas for you", () => {
    const reordered: NormalizedExperiment = {
      ...experiment,
      formulas: [...experiment.formulas].sort((a, b) => (a.key === "fPT" ? -1 : b.key === "fPT" ? 1 : 0)),
    };
    const errors = failed(calculateExperiment({ experiment: reordered, inputs: setup(), runValues: observation(30, 20, 10) }));

    assert.ok(errors.some((error) => error.code === "UNKNOWN_FORMULA_VARIABLE" && error.formulaKey === "fPT"));
  });

  it("keeps the unchanged human-readable formulas, and shows the manual's text for the two that differed", () => {
    const text = Object.fromEntries(experiment.formulas.map((formula) => [formula.key, formula.formula]));

    assert.equal(text.Vo, "Vo = Q/A");
    assert.equal(text.NRe, "Re = DpVoρ/μ");
    assert.equal(text.deltaPPerLength, "ΔP/L = Rmg(ρm-ρ)/L");
    assert.equal(text.Rm, "Rm = LHS − RHS");
    assert.equal(text.A, "A = πD²/4");
    // The stored text for these two disagreed with the manual, so it now matches the expression that runs.
    assert.equal(text.fPE, "fPE = 150(1-ε)/Re + 1.75");
    assert.equal(text.fPT, "fPT = (ΔP/L)(1/ρ)[ε³/(1-ε)²][Dp/Vo²]φs");
  });

  it("keys the two constants without changing their values, and adds the manual's shape factor", () => {
    assert.deepEqual(
      experiment.constants.map(({ key, value, unit, symbol }) => ({ key, value, unit, symbol })),
      [
        { key: "gravity", value: 9.81, unit: "m/s²", symbol: "g" },
        { key: "voidFraction", value: 0.4, unit: "-", symbol: "ε" },
        { key: "shapeFactor", value: 1, unit: "-", symbol: "φs" },
      ],
    );
  });

  it("has the four per-run inputs, with units normalised once and rm optional", () => {
    assert.deepEqual(experiment.runFields.map((field) => field.key), ["lhs", "rhs", "rm", "flow"]);

    const byKey = Object.fromEntries(experiment.runFields.map((field) => [field.key, field]));

    for (const key of ["lhs", "rhs"]) {
      assert.equal(byKey[key].defaultUnit, "cm");
      assert.equal(byKey[key].calculationUnit, "m");
      assert.deepEqual(byKey[key].units, ["cm", "mm", "m"]);
      assert.equal(byKey[key].optional, undefined, `${key} is required`);
    }

    assert.equal(byKey.rm.optional, true);
    assert.equal(byKey.rm.defaultUnit, "m");
    assert.equal(byKey.flow.defaultUnit, "LPM");
    assert.equal(byKey.flow.calculationUnit, "m³/s");
    assert.deepEqual(byKey.flow.units, ["LPM", "LPH", "m³/s"]);
    assert.equal(byKey.flow.optional, undefined, "flow is required");
    for (const field of experiment.runFields) {
      assert.equal(field.units[0], field.defaultUnit, `${field.key}: the unit selector shows units[0]`);
    }
  });

  it("[#10] defines exactly the manual's result table: Rm, ΔP/L, QAct, Vo, NRe, fPE, fPT", () => {
    assert.deepEqual(
      experiment.outputs.map(({ key, label }) => ({ key, label })),
      [
        { key: "Rm", label: "Rm" },
        { key: "deltaPPerLength", label: "ΔP/L" },
        { key: "flow", label: "QAct" },
        { key: "Vo", label: "Vo" },
        { key: "NRe", label: "NRe" },
        { key: "fPE", label: "fPE" },
        { key: "fPT", label: "fPT" },
      ],
    );
  });

  it("[#11] defines one ordinary (linear) graph with two series plotted against NRe", () => {
    assert.equal(experiment.graphConfigs.length, 1);

    const [graph] = experiment.graphConfigs;

    assert.equal(graph.title, "Friction Factor vs Reynolds Number");
    assert.equal(graph.type, "line");
    assert.equal(graph.xKey, "NRe");
    assert.equal(graph.scale, "linear", "the manual asks for an ordinary graph, not a log graph");
    assert.equal(graph.xLabel, "Reynolds Number");
    assert.equal(graph.yLabel, "Friction Factor");
    assert.deepEqual(graph.series, [
      { label: "Experimental (fPE)", yKey: "fPE" },
      { label: "Theoretical (fPT)", yKey: "fPT" },
    ]);
  });

  it("the Run screen's starting values already hold the manual's densities and viscosity", () => {
    const start = initialQuantities(experiment.inputFields);

    assert.equal(start.fluidDensity.value, "1000");
    assert.equal(start.manometerDensity.value, "13600");
    assert.equal(start.viscosity.value, "0.001");
    assert.equal(start.columnDiameter.value, "", "the apparatus dimensions are entered by the student");

    const run = createDraftRun("r1", experiment.runFields);

    assert.deepEqual(run.runValues.rm, { value: "", unit: "m" }, "the optional field starts blank");
    assert.equal(run.runValues.flow.unit, "LPM");
  });
});

// ---------------------------------------------------------------------------------------------
describe("packedbed: calculation chain (synthetic run A: LHS 30 cm, RHS 20 cm, 10 LPM)", () => {
  const experiment = packedbed();
  const result = succeeded(
    calculateExperiment({ experiment, inputs: setup(), runValues: observation(30, 20, 10) }),
  );

  it("[#1] converts mm, cm and LPM to metres and m³/s once", () => {
    near(result.scope.particleDiameter, 0.0125, "particleDiameter (12.5 mm)");
    near(result.scope.lhs, 0.3, "lhs (30 cm)");
    near(result.scope.rhs, 0.2, "rhs (20 cm)");
    near(result.scope.flow, 1.6666666666666666e-4, "flow (10 LPM)");
    assert.equal(result.scope.columnDiameter, 0.073);
    assert.equal(result.scope.columnLength, 1);
  });

  it("[#2] Rm is LHS - RHS in metres", () => {
    near(result.calculated.Rm, 0.1, "Rm");
  });

  it("[#3] A = πD²/4", () => {
    near(result.calculated.A, 0.004185386812745001, "A");
  });

  it("[#4] Vo = Qv / A", () => {
    near(result.calculated.Vo, 0.0398210904089311, "Vo");
  });

  it("[#5] NRe = Dp Vo ρ / μ", () => {
    near(result.calculated.NRe, 497.76363011163875, "NRe");
  });

  it("[#6] ΔP/L = Rm g (ρm - ρf) / L", () => {
    near(result.calculated.deltaPPerLength, 12360.6, "ΔP/L"); // 0.1 * 9.81 * 12600 / 1
  });

  it("[#7] fPE = 150(1-ε)/NRe + 1.75", () => {
    near(result.calculated.fPE, 1.930808710310584, "fPE");
  });

  it("[#8] fPT = (ΔP/L)(1/ρf)[ε³/(1-ε)²][Dp/Vo²]φs, exactly as in the manual", () => {
    near(result.calculated.fPT, 17.322108027463077, "fPT");
  });

  it("matches the manual's equations, computed independently", () => {
    const expected = manual(0.1, 10);

    for (const [key, value] of Object.entries(expected)) near(result.scope[key], value, key);
  });

  it("[#10] returns exactly Rm, ΔP/L, QAct, Vo, NRe, fPE, fPT in the manual's order, formatted per the outputs", () => {
    assert.deepEqual(Object.keys(result.results), ["Rm", "deltaPPerLength", "flow", "Vo", "NRe", "fPE", "fPT"]);
    assert.deepEqual(result.outputs.map((output) => output.label), ["Rm", "ΔP/L", "QAct", "Vo", "NRe", "fPE", "fPT"]);

    const shown = Object.fromEntries(result.outputs.map((output) => [output.key, output.displayValue]));

    assert.equal(shown.Rm, "0.1000");
    assert.equal(shown.deltaPPerLength, "12360.60");
    assert.equal(shown.flow, "0.000167");
    assert.equal(shown.Vo, "0.0398");
    assert.equal(shown.NRe, "498");
    assert.equal(shown.fPE, "1.9308");
    assert.equal(shown.fPT, "17.3221");
    assert.deepEqual(result.warnings, []);
  });

  it("uses the value of the shape factor constant, not a hard-coded 1", () => {
    const changed: NormalizedExperiment = {
      ...experiment,
      constants: experiment.constants.map((constant) => (constant.key === "shapeFactor" ? { ...constant, value: 0.5 } : constant)),
    };
    const half = succeeded(calculateExperiment({ experiment: changed, inputs: setup(), runValues: observation(30, 20, 10) }));

    near(half.calculated.fPT, result.calculated.fPT * 0.5, "fPT with φs = 0.5");
    near(half.calculated.fPE, result.calculated.fPE, "fPE does not use φs");
  });
});

// ---------------------------------------------------------------------------------------------
describe("packedbed: units", () => {
  const experiment = packedbed();
  const baseline = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(30, 20, 10) }));

  it("[#1] gives the same result for the column diameter in m, cm or mm", () => {
    for (const columnDiameter of [{ value: "7.3", unit: "cm" }, { value: "73", unit: "mm" }]) {
      const result = succeeded(calculateExperiment({ experiment, inputs: setup({ columnDiameter }), runValues: observation(30, 20, 10) }));

      near(result.scope.columnDiameter, 0.073, "columnDiameter");
      near(result.calculated.fPT, baseline.calculated.fPT, "fPT");
    }
  });

  it("[#1] gives the same result for the particle diameter in m, cm or mm", () => {
    for (const particleDiameter of [{ value: "0.0125", unit: "m" }, { value: "1.25", unit: "cm" }, { value: "12.5", unit: "mm" }]) {
      const result = succeeded(calculateExperiment({ experiment, inputs: setup({ particleDiameter }), runValues: observation(30, 20, 10) }));

      near(result.scope.particleDiameter, 0.0125, "particleDiameter");
      near(result.calculated.NRe, baseline.calculated.NRe, "NRe");
    }
  });

  it("[#1] converts the column length from cm, and the densities and viscosity from their other units", () => {
    const result = succeeded(
      calculateExperiment({
        experiment,
        inputs: setup({
          columnLength: { value: "100", unit: "cm" },
          fluidDensity: { value: "1", unit: "g/cm³" },
          manometerDensity: { value: "13.6", unit: "g/cm³" },
          viscosity: { value: "1", unit: "cP" },
        }),
        runValues: observation(30, 20, 10),
      }),
    );

    near(result.calculated.deltaPPerLength, baseline.calculated.deltaPPerLength, "ΔP/L");
    near(result.calculated.NRe, baseline.calculated.NRe, "NRe");
    near(result.calculated.fPT, baseline.calculated.fPT, "fPT");
  });

  it("[#1] gives the same result for the flow in LPM, LPH or m³/s", () => {
    for (const flow of [
      { value: "10", unit: "LPM" },
      { value: "600", unit: "LPH" },
      { value: "0.00016666666666666666", unit: "m³/s" },
    ]) {
      const result = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: { ...observation(30, 20, 10), flow } }));

      near(result.scope.flow, 1.6666666666666666e-4, `flow (${flow.value} ${flow.unit})`);
      near(result.calculated.Vo, baseline.calculated.Vo, "Vo");
      near(result.calculated.fPT, baseline.calculated.fPT, "fPT");
    }
  });

  it("[#1][#2] gives the same Rm whether LHS and RHS are entered in cm, mm or m, or mixed", () => {
    const entries: QuantityInputs[] = [
      { ...observation(30, 20, 10), lhs: { value: "300", unit: "mm" }, rhs: { value: "200", unit: "mm" } },
      { ...observation(30, 20, 10), lhs: { value: "0.3", unit: "m" }, rhs: { value: "0.2", unit: "m" } },
      { ...observation(30, 20, 10), lhs: { value: "30", unit: "cm" }, rhs: { value: "200", unit: "mm" } },
    ];

    for (const runValues of entries) {
      const result = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues }));

      near(result.calculated.Rm, 0.1, "Rm");
      near(result.calculated.deltaPPerLength, 12360.6, "ΔP/L");
    }
  });

  it("does not double-convert: LHS 30 cm becomes exactly 0.3 m", () => {
    assert.equal(baseline.scope.lhs, 0.3);
    assert.equal(baseline.scope.rhs, 0.2);
  });

  it("rejects a unit the field does not offer", () => {
    const errors = failed(
      calculateExperiment({ experiment, inputs: setup(), runValues: { ...observation(30, 20, 10), flow: { value: "10", unit: "gpm" } } }),
    );

    assert.ok(errors.some((error) => error.code === "UNSUPPORTED_UNIT" && error.fieldKey === "flow"));
  });
});

// ---------------------------------------------------------------------------------------------
describe("packedbed: the optional Manometer Difference (rm)", () => {
  const experiment = packedbed();

  it("[#2] is not required when LHS and RHS are entered (blank or whitespace)", () => {
    for (const rm of ["", "   "]) {
      const result = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(30, 20, 10, rm) }));

      near(result.calculated.Rm, 0.1, "Rm");
      assert.equal("rm" in result.scope, false, "a blank optional field is not in the scope");
    }
  });

  it("[#2] overrides LHS - RHS when it is entered, converted to metres", () => {
    const withM = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(30, 20, 10, "0.15") }));

    near(withM.calculated.Rm, 0.15, "Rm");
    near(withM.calculated.deltaPPerLength, 18540.9, "ΔP/L");
    near(withM.calculated.fPT, 25.983162041194618, "fPT");
    near(withM.calculated.fPE, 1.930808710310584, "fPE does not depend on Rm");

    const withCm = succeeded(
      calculateExperiment({ experiment, inputs: setup(), runValues: { ...observation(30, 20, 10), rm: { value: "15", unit: "cm" } } }),
    );
    const withMm = succeeded(
      calculateExperiment({ experiment, inputs: setup(), runValues: { ...observation(30, 20, 10), rm: { value: "150", unit: "mm" } } }),
    );

    near(withCm.calculated.Rm, 0.15, "Rm from cm");
    near(withMm.calculated.Rm, 0.15, "Rm from mm");
  });

  it("[#2] an entered Rm of zero is used, not mistaken for 'not entered'", () => {
    const result = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(30, 20, 10, "0") }));

    near(result.calculated.Rm, 0, "Rm");
    near(result.calculated.deltaPPerLength, 0, "ΔP/L");
  });

  it("[#10] still rejects an Rm that is entered but is not a number", () => {
    const errors = failed(calculateExperiment({ experiment, inputs: setup(), runValues: observation(30, 20, 10, "abc") }));

    assert.ok(errors.some((error) => error.code === "INPUT_INVALID_NUMBER" && error.fieldKey === "rm"));
  });

  it("[#10] still rejects an Rm in a unit the field does not offer", () => {
    const errors = failed(
      calculateExperiment({ experiment, inputs: setup(), runValues: { ...observation(30, 20, 10), rm: { value: "1", unit: "ft" } } }),
    );

    assert.ok(errors.some((error) => error.code === "UNSUPPORTED_UNIT" && error.fieldKey === "rm"));
  });

  it("does not make LHS or RHS optional: they are still required", () => {
    const runValues = observation(30, 20, 10, "0.15");

    runValues.lhs = { value: "", unit: "cm" };

    const errors = failed(calculateExperiment({ experiment, inputs: setup(), runValues }));

    assert.ok(errors.some((error) => error.code === "INPUT_REQUIRED" && error.fieldKey === "lhs"));
  });
});

// ---------------------------------------------------------------------------------------------
describe("packedbed: zero, invalid and missing inputs", () => {
  const experiment = packedbed();
  const run = (inputs: QuantityInputs, runValues: QuantityInputs) => calculateExperiment({ experiment, inputs, runValues });

  it("[#10] reports a zero column diameter as a division by zero, not a crash", () => {
    const errors = failed(run(setup({ columnDiameter: { value: "0", unit: "m" } }), observation(30, 20, 10)));

    assert.ok(errors.some((error) => error.code === "DIVISION_BY_ZERO" && error.formulaKey === "Vo"));
  });

  it("[#10] reports zero flow as a division by zero (NRe is 0, so fPE cannot be formed)", () => {
    const errors = failed(run(setup(), observation(30, 20, 0)));

    assert.ok(errors.some((error) => error.code === "DIVISION_BY_ZERO" && error.formulaKey === "fPE"));
  });

  it("[#10] reports a zero viscosity as a division by zero", () => {
    const errors = failed(run(setup({ viscosity: { value: "0", unit: "Pa·s" } }), observation(30, 20, 10)));

    assert.ok(errors.some((error) => error.code === "DIVISION_BY_ZERO" && error.formulaKey === "NRe"));
  });

  it("[#10] reports a zero column length as a division by zero", () => {
    const errors = failed(run(setup({ columnLength: { value: "0", unit: "m" } }), observation(30, 20, 10)));

    assert.ok(errors.some((error) => error.code === "DIVISION_BY_ZERO" && error.formulaKey === "deltaPPerLength"));
  });

  it("[#10] reports non-numeric manometer values against the field", () => {
    for (const key of ["lhs", "rhs"]) {
      const runValues = observation(30, 20, 10);

      runValues[key] = { value: "abc", unit: "cm" };

      const errors = failed(run(setup(), runValues));

      assert.ok(errors.some((error) => error.code === "INPUT_INVALID_NUMBER" && error.fieldKey === key), key);
    }
  });

  it("[#10] asks for every missing required input, and reports them all at once", () => {
    const errors = failed(run({}, {}));
    const missing = errors.filter((error) => error.code === "INPUT_REQUIRED").map((error) => error.fieldKey);

    for (const key of ["columnDiameter", "columnLength", "particleDiameter", "fluidDensity", "manometerDensity", "viscosity", "lhs", "rhs", "flow"]) {
      assert.ok(missing.includes(key), `${key} should be reported as required`);
    }

    assert.equal(missing.includes("rm"), false, "the optional field is never reported as required");
  });

  it("[#10] tells apart an input the student left blank from one that is not a number", () => {
    const blank = failed(run(setup({ columnDiameter: { value: "", unit: "m" } }), observation(30, 20, 10)));
    const text = failed(run(setup({ columnDiameter: { value: "wide", unit: "m" } }), observation(30, 20, 10)));

    assert.ok(blank.some((error) => error.code === "INPUT_REQUIRED" && error.fieldKey === "columnDiameter"));
    assert.ok(text.some((error) => error.code === "INPUT_INVALID_NUMBER" && error.fieldKey === "columnDiameter"));
  });
});

// ---------------------------------------------------------------------------------------------
describe("packedbed: the graph (two series, ordinary scale)", () => {
  const experiment = packedbed();

  it("[#11] a single calculated run already carries both series, one point each", () => {
    const result = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(30, 20, 10) }));

    assert.equal(result.graphData.length, 1);

    const [graph] = result.graphData;

    assert.equal(graph.scale, "linear");
    assert.equal(graph.xKey, "NRe");
    assert.equal(graph.series?.length, 2);
    assert.deepEqual(graph.series?.map((line) => ({ label: line.label, yKey: line.yKey })), [
      { label: "Experimental (fPE)", yKey: "fPE" },
      { label: "Theoretical (fPT)", yKey: "fPT" },
    ]);
    near(graph.series?.[0].points[0].x ?? NaN, 497.76363011163875, "fPE series x (NRe)");
    near(graph.series?.[0].points[0].y ?? NaN, 1.930808710310584, "fPE series y");
    near(graph.series?.[1].points[0].x ?? NaN, 497.76363011163875, "fPT series x (NRe)");
    near(graph.series?.[1].points[0].y ?? NaN, 17.322108027463077, "fPT series y");
  });

  it("the graph data is plain JSON (no undefined values), so a saved run can store it in Firestore", () => {
    const result = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(30, 20, 10) }));

    assert.deepEqual(JSON.parse(JSON.stringify(result.graphData)), result.graphData);
  });

  it("[#11] Calculate All plots every calculated run on both series, and a failed run does not hide the others", () => {
    const setupValues = setup();
    const rows: [number, number, number][] = [
      [30, 20, 10],
      [45, 25, 20],
    ];
    const runs = [
      ...rows.map(([lhs, rhs, flow], index) => ({ ...createDraftRun(`r${index + 1}`, experiment.runFields), runValues: observation(lhs, rhs, flow) })),
      { ...createDraftRun("r3", experiment.runFields), runValues: observation(30, 20, 0) }, // zero flow
    ];
    const outcome = calculateAllDraftRuns({ experiment, setup: setupValues, runs });

    assert.deepEqual(outcome.runs.map((run) => run.status), ["calculated", "calculated", "error"]);

    const [generation] = buildRunGraphs(experiment, outcome.runs);

    assert.equal(generation.status, "ready");
    assert.ok(generation.graph?.series);
    assert.equal(generation.graph.series.length, 2);
    assert.equal(generation.graph.scale, "linear");

    const A = manual(0.1, 10);
    const B = manual(0.2, 20);

    for (const [seriesIndex, key] of [[0, "fPE"], [1, "fPT"]] as const) {
      const points: GraphPoint[] = generation.graph.series[seriesIndex].points;

      assert.equal(points.length, 2, `${key} has one point per calculated run`);
      near(points[0].x, A.NRe, `${key} run 1 x`);
      near(points[1].x, B.NRe, `${key} run 2 x`);
      near(points[0].y, A[key], `${key} run 1 y`);
      near(points[1].y, B[key], `${key} run 2 y`);
    }

    assert.equal(describeGraphState(generation, 2).kind, "chart");
  });

  it("[#11] with one calculated run the screen asks for another run instead of drawing a chart", () => {
    const runs = calculateAllDraftRuns({
      experiment,
      setup: setup(),
      runs: [{ ...createDraftRun("r1", experiment.runFields), runValues: observation(30, 20, 10) }],
    }).runs;
    const [generation] = buildRunGraphs(experiment, runs);

    assert.equal(describeGraphState(generation, 1).kind, "message");
  });
});
