import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { experiments } from "../../../constants/experiments";
import type { CalculationResult, QuantityInputs } from "../../../types/Calculation";
import type { NormalizedExperiment, RawExperimentData } from "../../../types/Experiment";
import { normalizeExperiment } from "../../normalizeExperiment";
import { calculateExperiment } from "../calculateExperiment";
import {
  buildRunGraphs,
  calculateAllDraftRuns,
  createDraftRun,
  describeGraphState,
  initialQuantities,
  setQuantityUnit,
  setQuantityValue,
} from "../draftRuns";
import { parseFormulaExpression } from "../formulaEvaluator";
import { generateGraphData } from "../graphData";
import { closeTo } from "./fixtures";

// Experiment No. 4, "Flow through non-circular pipes", from the lab manual (pages 11-12).
// The definition under test is the noncircular entry of the seed data, i.e. exactly what is stored in
// Firestore at subjects/fluid-mechanics/experiments/noncircular. Expected values are derived by hand
// with plain arithmetic from the manual's equations, never from the engine.

const seed = experiments.find((entry) => entry.id === "noncircular");

assert.ok(seed, "the noncircular entry must exist in the seed data");

const raw = seed as unknown as RawExperimentData;

function noncircular(): NormalizedExperiment {
  return normalizeExperiment({ id: "noncircular", subjectId: "fluid-mechanics", data: raw });
}

function succeeded(result: CalculationResult) {
  if (!result.ok) {
    assert.fail(`expected success but got: ${result.errors.map((error) => error.code).join(", ")}`);
  }

  return result;
}

function failed(result: CalculationResult) {
  assert.equal(result.ok, false, "expected the calculation to fail");

  if (result.ok) throw new Error("unreachable");

  return result.errors;
}

// ---- the manual's data ----------------------------------------------------------------------
const INCH_MM = 25.4; // 1 inch
const GRAVITY = 9.81;
const MANOMETER_DENSITY = 13600;
const DENSITY = 1000; // water
const VISCOSITY = 0.98e-3; // manual: 0.98 x 10^-3 kg/(m.s)
const PIPE_LENGTH = 1.5; // manual
const TANK_AREA = 0.125; // manual

/** Setup the way a student would enter it: lengths in mm, as the manual gives inches (1 in = 25.4 mm). */
function setup(widthMm: number, breadthMm: number, pipeType = "Square"): QuantityInputs {
  return {
    pipeType: { value: pipeType },
    width: { value: String(widthMm), unit: "mm" },
    breadth: { value: String(breadthMm), unit: "mm" },
    pipeLength: { value: String(PIPE_LENGTH), unit: "m" },
    tankArea: { value: String(TANK_AREA), unit: "m²" },
    density: { value: String(DENSITY), unit: "kg/m³" },
    viscosity: { value: String(VISCOSITY), unit: "Pa·s" },
  };
}

/** One observation-table row: LHS and RHS in mm, height in m, time in s. */
function observation(lhsMm: number, rhsMm: number, heightM: number, timeS: number): QuantityInputs {
  return {
    lhs: { value: String(lhsMm), unit: "mm" },
    rhs: { value: String(rhsMm), unit: "mm" },
    height: { value: String(heightM), unit: "m" },
    time: { value: String(timeS), unit: "s" },
  };
}

/** The manual's equations, in plain arithmetic, in SI. */
function manual(widthMm: number, breadthMm: number, lhsMm: number, rhsMm: number, heightM: number, timeS: number) {
  const w = widthMm / 1000;
  const b = breadthMm / 1000;
  const De = (2 * w * b) / (w + b);
  const Rm = (lhsMm - rhsMm) * 1e-3;
  const deltaP = Rm * (MANOMETER_DENSITY - DENSITY) * GRAVITY;
  const Q = (TANK_AREA * heightM) / timeS;
  const pipeArea = (Math.PI * De * De) / 4;
  const V = Q / pipeArea;
  const NRe = (De * V * DENSITY) / VISCOSITY;
  const f = (deltaP * De) / (2 * DENSITY * V * V * PIPE_LENGTH);

  return { De, Rm, deltaP, Q, pipeArea, V, NRe, f };
}

function near(actual: number, expected: number, name: string): void {
  assert.ok(closeTo(actual, expected), `${name}: got ${actual}, expected ${expected}`);
}

// Frozen copy of what the Firestore document held before this work, to prove nothing was rewritten.
const ORIGINAL_FORMULAS = [
  { name: "Equivalent Diameter", formula: "De = 2wb/(w+b)" },
  { name: "Pressure Difference", formula: "ΔP = Rm(ρm−ρ)g" },
  { name: "Discharge", formula: "Q = Ah/t" },
  { name: "Velocity", formula: "V = Q/A" },
  { name: "Reynolds Number", formula: "Re = DeVρ/μ" },
  { name: "Friction Factor", formula: "f = ΔPDe/(2ρLV²)" },
];

const ORIGINAL_INPUT_FIELDS = [
  { key: "pipeType", label: "Pipe Type", type: "dropdown", options: ["Square", "Rectangular"], defaultValue: "Square" },
  { key: "width", label: "Pipe Width", type: "number", defaultUnit: "m", units: ["m", "cm", "mm"] },
  { key: "breadth", label: "Pipe Breadth", type: "number", defaultUnit: "m", units: ["m", "cm", "mm"] },
  { key: "pipeLength", label: "Pipe Length", type: "number", defaultUnit: "m", units: ["m", "cm"] },
  { key: "tankArea", label: "Collecting Tank Area", type: "number", defaultUnit: "m²", units: ["m²", "cm²", "mm²"] },
  { key: "density", label: "Fluid Density", type: "number", defaultValue: 1000, defaultUnit: "kg/m³", units: ["kg/m³", "g/cm³"] },
  { key: "viscosity", label: "Dynamic Viscosity", type: "number", defaultValue: 0.001, defaultUnit: "Pa·s", units: ["Pa·s", "cP"] },
];

// ---------------------------------------------------------------------------------------------
describe("noncircular: the stored definition", () => {
  const experiment = noncircular();

  it("normalizes with no data-quality warnings", () => {
    assert.deepEqual(experiment.warnings, []);
  });

  it("keeps the six human-readable formulas exactly as they were", () => {
    for (const original of ORIGINAL_FORMULAS) {
      const stored = experiment.formulas.find((formula) => formula.name === original.name);

      assert.ok(stored, `formula "${original.name}" is missing`);
      assert.equal(stored.formula, original.formula);
    }
  });

  it("keeps the setup inputFields exactly as they were", () => {
    assert.deepEqual(seed.inputFields, ORIGINAL_INPUT_FIELDS);
  });

  it("gives every formula a key and a machine-readable expression", () => {
    for (const formula of experiment.formulas) {
      assert.ok(formula.key, `${formula.name} has no key`);
      assert.ok(formula.expression, `${formula.name} has no expression`);
    }
  });

  it("stores formulas in dependency order: De, Rm, deltaP, Q, pipeArea, V, NRe, f", () => {
    assert.deepEqual(
      experiment.formulas.map((formula) => formula.key),
      ["De", "Rm", "deltaP", "Q", "pipeArea", "V", "NRe", "f"],
    );
  });

  it("only reads variables that already exist when the formula runs", () => {
    const available = new Set<string>(["pi"]);

    for (const constant of experiment.constants) if (constant.key) available.add(constant.key);
    for (const field of [...experiment.inputFields, ...experiment.runFields]) {
      if (field.kind === "number") available.add(field.key);
    }

    for (const formula of experiment.formulas) {
      const { variables } = parseFormulaExpression(formula.expression as string);
      const missing = variables.filter((variable) => !available.has(variable));

      assert.deepEqual(missing, [], `${formula.key} reads ${missing.join(", ")} before it exists`);
      available.add(formula.key as string);
    }
  });

  it("really needs that order: the engine does not sort formulas for you", () => {
    const reordered: NormalizedExperiment = {
      ...experiment,
      formulas: [...experiment.formulas].sort((a, b) => (a.key === "pipeArea" ? 1 : b.key === "pipeArea" ? -1 : 0)),
    };
    const errors = failed(
      calculateExperiment({ experiment: reordered, inputs: setup(INCH_MM, INCH_MM), runValues: observation(250, 150, 0.05, 20) }),
    );

    assert.ok(errors.some((error) => error.code === "UNKNOWN_FORMULA_VARIABLE" && error.variable === "pipeArea"));
  });

  it("keys both constants without changing their values", () => {
    assert.deepEqual(
      experiment.constants.map(({ key, value, unit }) => ({ key, value, unit })),
      [
        { key: "gravity", value: 9.81, unit: "m/s²" },
        { key: "manometerDensity", value: 13600, unit: "kg/m³" },
      ],
    );
  });

  it("has exactly the four per-run inputs from the observation table", () => {
    assert.deepEqual(
      experiment.runFields.map((field) => field.key),
      ["lhs", "rhs", "height", "time"],
    );
  });

  it("reads lhs and rhs in mm and converts them to m once (calculationUnit)", () => {
    for (const key of ["lhs", "rhs"]) {
      const field = experiment.runFields.find((entry) => entry.key === key);

      assert.ok(field);
      assert.equal(field.defaultUnit, "mm");
      assert.equal(field.calculationUnit, "m");
      assert.equal(field.units[0], "mm", "the unit selector shows units[0], so it must be the default unit");
    }

    const height = experiment.runFields.find((field) => field.key === "height");
    const time = experiment.runFields.find((field) => field.key === "time");

    assert.equal(height?.defaultUnit, "m");
    assert.equal(height?.calculationUnit, undefined);
    assert.equal(time?.defaultUnit, "s");
  });

  it("[#10] defines exactly the manual's result table: Rm, deltaP, Q, V, f, NRe", () => {
    assert.deepEqual(
      experiment.outputs.map(({ key, label }) => ({ key, label })),
      [
        { key: "Rm", label: "Rm" },
        { key: "deltaP", label: "ΔP" },
        { key: "Q", label: "Q" },
        { key: "V", label: "V" },
        { key: "f", label: "f" },
        { key: "NRe", label: "NRe" },
      ],
    );
  });

  it("[#11] defines the graph as f vs NRe on log scale, keeping the original labels", () => {
    assert.equal(experiment.graphConfigs.length, 1);

    const [graph] = experiment.graphConfigs;

    assert.equal(graph.xKey, "NRe");
    assert.equal(graph.yKey, "f");
    assert.equal(graph.scale, "log");
    assert.equal(graph.title, "Friction Factor vs Reynolds Number");
    assert.equal(graph.xLabel, "Reynolds Number (log)");
    assert.equal(graph.yLabel, "Friction Factor (log)");
  });
});

// ---------------------------------------------------------------------------------------------
describe("noncircular: square pipe (1 in x 1 in)", () => {
  const experiment = noncircular();
  const result = succeeded(
    calculateExperiment({
      experiment,
      inputs: setup(INCH_MM, INCH_MM),
      runValues: observation(250, 150, 0.05, 20),
    }),
  );

  it("[#1] De equals the width when width = breadth", () => {
    near(result.calculated.De, 0.0254, "De");
    near(result.calculated.De, result.scope.width, "De vs width");
    assert.equal(result.scope.width, result.scope.breadth);
  });

  it("[#3] Rm is (LHS - RHS) in metres, converted once (no double conversion)", () => {
    assert.equal(result.scope.lhs, 0.25, "lhs must be 250 mm = 0.25 m, converted exactly once");
    assert.equal(result.scope.rhs, 0.15, "rhs must be 150 mm = 0.15 m, converted exactly once");
    near(result.calculated.Rm, 0.1, "Rm");
  });

  it("[#4] deltaP = Rm(rho_m - rho)g", () => {
    near(result.calculated.deltaP, 12360.6, "deltaP"); // 0.1 * (13600 - 1000) * 9.81
  });

  it("[#5] Q = tank area x height / time", () => {
    near(result.calculated.Q, 3.125e-4, "Q"); // 0.125 * 0.05 / 20
  });

  it("[#6] the pipe area is pi De^2 / 4", () => {
    near(result.calculated.pipeArea, 5.067074790974977e-4, "pipeArea"); // pi * 0.0254^2 / 4
  });

  it("[#7] V = Q / A", () => {
    near(result.calculated.V, 0.6167266379343704, "V");
  });

  it("[#8] NRe = De V rho / mu", () => {
    near(result.calculated.NRe, 15984.54755462552, "NRe");
  });

  it("[#9] f = deltaP De / (2 rho V^2 L)", () => {
    near(result.calculated.f, 0.2751481519874643, "f");
  });

  it("[#12] matches the manual's equations, computed independently", () => {
    const expected = manual(INCH_MM, INCH_MM, 250, 150, 0.05, 20);

    for (const [key, value] of Object.entries(expected)) {
      near(result.calculated[key], value, key);
    }
  });

  it("[#10] returns exactly Rm, deltaP, Q, V, f, NRe, in that order, formatted per the outputs", () => {
    assert.deepEqual(Object.keys(result.results), ["Rm", "deltaP", "Q", "V", "f", "NRe"]);
    assert.deepEqual(
      result.outputs.map((output) => output.label),
      ["Rm", "ΔP", "Q", "V", "f", "NRe"],
    );

    const shown = Object.fromEntries(result.outputs.map((output) => [output.key, output.displayValue]));

    assert.equal(shown.Rm, "0.1000");
    assert.equal(shown.deltaP, "12360.60");
    assert.equal(shown.V, "0.6167");
    assert.equal(shown.f, "0.2751");
    assert.equal(shown.NRe, "15985");
    assert.deepEqual(result.warnings, []);
  });

  it("[#11] the single-run graph plots f against NRe on a log scale", () => {
    assert.equal(result.graphData.length, 1);

    const [graph] = result.graphData;

    assert.equal(graph.xKey, "NRe");
    assert.equal(graph.yKey, "f");
    assert.equal(graph.scale, "log");
    assert.equal(graph.points.length, 1);
    near(graph.points[0].x, 15984.54755462552, "graph x (NRe)");
    near(graph.points[0].y, 0.2751481519874643, "graph y (f)");
  });

  it("does not depend on the pipeType dropdown (it never enters the formulas)", () => {
    const rectangularLabel = succeeded(
      calculateExperiment({
        experiment,
        inputs: setup(INCH_MM, INCH_MM, "Rectangular"),
        runValues: observation(250, 150, 0.05, 20),
      }),
    );

    near(rectangularLabel.calculated.f, result.calculated.f, "f");
  });
});

// ---------------------------------------------------------------------------------------------
describe("noncircular: rectangular pipe (1 in x 1/4 in)", () => {
  const experiment = noncircular();
  const result = succeeded(
    calculateExperiment({
      experiment,
      inputs: setup(INCH_MM, INCH_MM / 4, "Rectangular"),
      runValues: observation(250, 150, 0.05, 20),
    }),
  );

  it("[#2] De follows 2wb/(w+b)", () => {
    // 2 * 25.4 * 6.35 / (25.4 + 6.35) = 10.16 mm
    near(result.calculated.De, 0.01016, "De");
    assert.ok(result.calculated.De < result.scope.width && result.calculated.De > result.scope.breadth);
  });

  it("[#12] matches hand-calculated values", () => {
    near(result.calculated.Rm, 0.1, "Rm");
    near(result.calculated.deltaP, 12360.6, "deltaP");
    near(result.calculated.Q, 3.125e-4, "Q");
    near(result.calculated.pipeArea, 8.107319665559962e-5, "pipeArea");
    near(result.calculated.V, 3.854541487089816, "V");
    near(result.calculated.NRe, 39961.368886563796, "NRe");
    near(result.calculated.f, 0.0028175170763516328, "f");
  });

  it("[#12] matches the manual's equations, computed independently", () => {
    const expected = manual(INCH_MM, INCH_MM / 4, 250, 150, 0.05, 20);

    for (const [key, value] of Object.entries(expected)) {
      near(result.calculated[key], value, key);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("noncircular: unit handling (existing unit system, no double conversion)", () => {
  const experiment = noncircular();
  const baseline = succeeded(
    calculateExperiment({ experiment, inputs: setup(INCH_MM, INCH_MM), runValues: observation(250, 150, 0.05, 20) }),
  );

  it("[#3] gives the same Rm whether LHS/RHS are entered in mm, cm or m, or mixed", () => {
    const entries: QuantityInputs[] = [
      { ...observation(250, 150, 0.05, 20) },
      { ...observation(250, 150, 0.05, 20), lhs: { value: "25", unit: "cm" }, rhs: { value: "15", unit: "cm" } },
      { ...observation(250, 150, 0.05, 20), lhs: { value: "0.25", unit: "m" }, rhs: { value: "0.15", unit: "m" } },
      { ...observation(250, 150, 0.05, 20), lhs: { value: "25", unit: "cm" }, rhs: { value: "150", unit: "mm" } },
    ];

    for (const runValues of entries) {
      const result = succeeded(calculateExperiment({ experiment, inputs: setup(INCH_MM, INCH_MM), runValues }));

      near(result.calculated.Rm, 0.1, "Rm");
      near(result.calculated.deltaP, baseline.calculated.deltaP, "deltaP");
    }
  });

  it("converts width, breadth, tank area and height from any allowed unit", () => {
    const inputs: QuantityInputs = {
      ...setup(INCH_MM, INCH_MM),
      width: { value: "0.0254", unit: "m" },
      breadth: { value: "2.54", unit: "cm" },
      tankArea: { value: "1250", unit: "cm²" },
    };
    const runValues: QuantityInputs = { ...observation(250, 150, 0.05, 20), height: { value: "5", unit: "cm" } };
    const result = succeeded(calculateExperiment({ experiment, inputs, runValues }));

    near(result.calculated.De, baseline.calculated.De, "De");
    near(result.calculated.Q, baseline.calculated.Q, "Q");
    near(result.calculated.f, baseline.calculated.f, "f");
  });

  it("converts viscosity from cP", () => {
    const inputs: QuantityInputs = { ...setup(INCH_MM, INCH_MM), viscosity: { value: "0.98", unit: "cP" } };
    const result = succeeded(calculateExperiment({ experiment, inputs, runValues: observation(250, 150, 0.05, 20) }));

    near(result.calculated.NRe, baseline.calculated.NRe, "NRe");
  });

  it("rejects a unit the field does not offer", () => {
    const errors = failed(
      calculateExperiment({
        experiment,
        inputs: setup(INCH_MM, INCH_MM),
        runValues: { ...observation(250, 150, 0.05, 20), time: { value: "20", unit: "min" } },
      }),
    );

    assert.ok(errors.some((error) => error.code === "UNSUPPORTED_UNIT" && error.fieldKey === "time"));
  });
});

// ---------------------------------------------------------------------------------------------
describe("noncircular: student mistakes and edge cases", () => {
  const experiment = noncircular();

  it("asks for a missing observation instead of guessing", () => {
    const runValues = observation(250, 150, 0.05, 20);

    runValues.height = { value: "", unit: "m" };

    const errors = failed(calculateExperiment({ experiment, inputs: setup(INCH_MM, INCH_MM), runValues }));

    assert.ok(errors.some((error) => error.code === "INPUT_REQUIRED" && error.fieldKey === "height" && error.fieldKind === "run"));
  });

  it("reports a zero-sized pipe as a division by zero, not a crash", () => {
    const errors = failed(calculateExperiment({ experiment, inputs: setup(0, 0), runValues: observation(250, 150, 0.05, 20) }));

    assert.ok(errors.some((error) => error.code === "DIVISION_BY_ZERO" && error.formulaKey === "De"));
  });

  it("calculates a run whose manometer levels are equal (f = 0) but leaves it off the log graph", () => {
    const result = succeeded(
      calculateExperiment({ experiment, inputs: setup(INCH_MM, INCH_MM), runValues: observation(200, 200, 0.05, 20) }),
    );

    near(result.calculated.Rm, 0, "Rm");
    near(result.calculated.f, 0, "f");
    assert.equal(result.graphData.length, 0);
    assert.ok(result.warnings.some((warning) => warning.code === "GRAPH_LOG_SCALE_INVALID"));
  });
});

// ---------------------------------------------------------------------------------------------
describe("noncircular: the multi-run workflow the Run screen uses", () => {
  const experiment = noncircular();

  it("[#11] Calculate All builds one f vs NRe log graph from every calculated run", () => {
    let setupValues = initialQuantities(experiment.inputFields);

    assert.equal(setupValues.pipeType.value, "Square", "the dropdown starts on its default");
    assert.equal(setupValues.density.value, "1000");

    setupValues = setQuantityValue(setupValues, "width", String(INCH_MM));
    setupValues = setQuantityUnit(setupValues, "width", "mm");
    setupValues = setQuantityValue(setupValues, "breadth", String(INCH_MM));
    setupValues = setQuantityUnit(setupValues, "breadth", "mm");
    setupValues = setQuantityValue(setupValues, "pipeLength", String(PIPE_LENGTH));
    setupValues = setQuantityValue(setupValues, "tankArea", String(TANK_AREA));
    setupValues = setQuantityValue(setupValues, "viscosity", String(VISCOSITY));

    const rows: [number, number, number, number][] = [
      [250, 150, 0.05, 20],
      [300, 100, 0.05, 10],
      [400, 100, 0.05, 6],
    ];

    let runs = rows.map(([lhs, rhs, height, time], index) => {
      let run = createDraftRun(`r${index + 1}`, experiment.runFields);

      run = { ...run, runValues: { ...run.runValues, ...observation(lhs, rhs, height, time) } };

      return run;
    });

    const outcome = calculateAllDraftRuns({ experiment, setup: setupValues, runs });

    assert.deepEqual(outcome.setupIssues, []);
    assert.deepEqual(outcome.definitionIssues, []);
    assert.deepEqual(outcome.runs.map((run) => run.status), ["calculated", "calculated", "calculated"]);

    runs = outcome.runs;

    const [generation] = buildRunGraphs(experiment, runs);

    assert.equal(generation.status, "ready");
    assert.ok(generation.graph);
    assert.equal(generation.graph.scale, "log");
    assert.equal(generation.graph.xKey, "NRe");
    assert.equal(generation.graph.yKey, "f");
    assert.equal(generation.graph.points.length, 3);

    rows.forEach(([lhs, rhs, height, time], index) => {
      const expected = manual(INCH_MM, INCH_MM, lhs, rhs, height, time);

      near(generation.graph!.points[index].x, expected.NRe, `run ${index + 1} x`);
      near(generation.graph!.points[index].y, expected.f, `run ${index + 1} y`);
    });

    assert.equal(describeGraphState(generation, 3).kind, "chart");
  });

  it("[#11] generateGraphData accepts the calculated values of several runs", () => {
    const first = manual(INCH_MM, INCH_MM, 250, 150, 0.05, 20);
    const second = manual(INCH_MM, INCH_MM, 300, 100, 0.05, 10);
    const generation = generateGraphData({
      graphConfig: experiment.graphConfigs[0],
      results: [
        { id: "a", values: { NRe: first.NRe, f: first.f } },
        { id: "b", values: { NRe: second.NRe, f: second.f } },
      ],
    });

    assert.equal(generation.status, "ready");
    assert.equal(generation.graph?.points.length, 2);
    assert.ok(generation.graph && generation.graph.points[1].x > generation.graph.points[0].x);
  });
});
