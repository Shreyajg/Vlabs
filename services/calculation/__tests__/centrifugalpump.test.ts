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

// Experiment No. 3, "Centrifugal pump", from the lab manual (pages 7-10).
// The definition under test is the centrifugalpump entry of the seed data, i.e. what Firestore is to hold.
// Expected values are derived by hand with plain arithmetic from the manual's equations and are written out as
// numbers, never taken from the engine. FIXED data are the manual's DATA table (tank area 0.125 m², EMC 750 rev/kWh),
// k = 5 revolutions, and the manual's own conversions (760 mm Hg = 10.32 m of water, 1 kg/cm² = 10 m of water).
// The manual's observation table is blank, so every observation below is a SYNTHETIC TEST INPUT.

const seed = experiments.find((entry) => entry.id === "centrifugalpump");

assert.ok(seed, "the centrifugalpump entry must exist in the seed data");

function pump(): NormalizedExperiment {
  return normalizeExperiment({
    id: "centrifugalpump",
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

// ---- the manual's DATA table ---------------------------------------------------------------------
function setup(overrides: QuantityInputs = {}): QuantityInputs {
  return {
    tankArea: { value: "0.125", unit: "m²" },
    energyMeterConstant: { value: "750", unit: "rev/kWh" },
    ...overrides,
  };
}

/** SYNTHETIC observation in the manual's units: rpm, HS in mm Hg, HD in kg/cm², energy-meter time in s, height in cm, time in s. */
function observation(rpm: number, hsMmHg: number, hdKgCm2: number, energyTimeS: number, heightCm: number, flowTimeS: number): QuantityInputs {
  return {
    rpm: { value: String(rpm), unit: "rpm" },
    hs: { value: String(hsMmHg), unit: "mm Hg" },
    hd: { value: String(hdKgCm2), unit: "kg/cm²" },
    energyTime: { value: String(energyTimeS), unit: "s" },
    tankHeight: { value: String(heightCm), unit: "cm" },
    flowTime: { value: String(flowTimeS), unit: "s" },
  };
}

type Row = [number, number, number, number, number, number];
const RUN_1: Row = [1500, 200, 0.4, 20, 5, 30];
const RUN_2: Row = [1500, 250, 0.5, 18, 7, 30];
const RUN_3: Row = [1500, 300, 0.6, 16, 9, 30];

// Hand-calculated (plain arithmetic); see pump-hand-calc.js in the task notes.
const R1 = { hsWaterHead: 2.7157894736842105, hdWaterHead: 4, HT: 6.715789473684211, Q: 0.00020833333333333335, IHPTheoretical: 1.6085790884718498, IHPActual: 0.9651474530831099, Ohp: 0.01865497076023392, eta: 1.932862248213126 };
const R2 = { hsWaterHead: 3.3947368421052633, hdWaterHead: 5, HT: 8.394736842105264, Q: 0.0002916666666666667, IHPTheoretical: 1.7873100983020553, IHPActual: 1.072386058981233, Ohp: 0.03264619883040936, eta: 3.044258040935673 };
const R3 = { hsWaterHead: 4.073684210526316, hdWaterHead: 6, HT: 10.073684210526316, Q: 0.000375, IHPTheoretical: 2.0107238605898123, IHPActual: 1.2064343163538873, Ohp: 0.05036842105263158, eta: 4.174982456140351 };

// Frozen copies of what the Firestore document held before this work.
const ORIGINAL_INPUT_FIELDS = [
  { key: "tankArea", label: "Collecting Tank Area", type: "number", defaultUnit: "m²", units: ["m²", "cm²"] },
  { key: "energyMeterConstant", label: "Energy Meter Constant", type: "number", defaultUnit: "rev/kWh", units: ["rev/kWh", "kWh"] },
];
const ORIGINAL_RUN_FIELDS = [
  { key: "rpm", label: "Pump Speed", defaultUnit: "rpm", units: ["rpm"] },
  { key: "hs", label: "Suction Head", defaultUnit: "mm Hg", units: ["mm Hg", "cm Hg"] },
  { key: "hd", label: "Delivery Head", defaultUnit: "kg/cm²", units: ["kg/cm²", "bar"] },
  { key: "energyTime", label: "Time for 5 Energy Meter Revolutions", defaultUnit: "s", units: ["s"] },
  { key: "tankHeight", label: "Collection Tank Water Height", defaultUnit: "cm", units: ["cm", "m", "mm"] },
  { key: "flowTime", label: "Collection Time", defaultUnit: "s", units: ["s"] },
];

// ---------------------------------------------------------------------------------------------
describe("centrifugalpump: the stored definition", () => {
  const experiment = pump();

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

  it("every variable key that is used is valid and used exactly once across constants, inputs, run fields and formulas", () => {
    const keys = [
      ...experiment.constants.map((constant) => constant.key).filter((key): key is string => key !== undefined),
      ...experiment.inputFields.map((field) => field.key),
      ...experiment.runFields.map((field) => field.key),
      ...experiment.formulas.map((formula) => formula.key),
    ];

    for (const key of keys) assert.ok(key && isValidVariableKey(key), `"${key}" is not a valid variable key`);
    assert.equal(new Set(keys).size, keys.length, "a key is used twice");
  });

  it("gives exactly the eight formulas of the specification, in this order, and no others", () => {
    assert.deepEqual(
      experiment.formulas.map((formula) => formula.key),
      ["hsWaterHead", "hdWaterHead", "HT", "Q", "IHPTheoretical", "IHPActual", "Ohp", "eta"],
    );
  });

  it("the machine-readable expressions are the manual's equations (the 5 is the named constant k, not a hidden number)", () => {
    assert.deepEqual(
      Object.fromEntries(experiment.formulas.map((formula) => [formula.key, formula.expression])),
      {
        hsWaterHead: "hs * 10.32 / 760",
        hdWaterHead: "hd * 10",
        HT: "hsWaterHead + hdWaterHead",
        Q: "tankArea * tankHeight / flowTime",
        IHPTheoretical: "energyMeterRevolutions * 60 * 60 * 1000 / (energyMeterConstant * 746 * energyTime)",
        IHPActual: "IHPTheoretical * 0.6",
        Ohp: "1000 * Q * HT / 75",
        eta: "Ohp / IHPActual * 100",
      },
    );
  });

  it("does not keep the old conflicting formulas (no V²/2g in the head, no WHP = ρgQHT, no 3600/1000 power formula)", () => {
    const text = JSON.stringify(experiment.formulas.map((formula) => [formula.name, formula.formula, formula.expression]));

    for (const forbidden of ["V²", "2g", "WHP", "Water Horse Power", "ρgQ", "Ah/t", "* 3600", "Revolutions) * 3600"]) {
      assert.equal(text.includes(forbidden), false, forbidden);
    }
  });

  it("the human-readable text keeps the manual's notation", () => {
    assert.deepEqual(
      experiment.formulas.map((formula) => formula.formula),
      [
        "HS (m of water) = HS (mm Hg) × 10.32 / 760",
        "HD (m of water) = HD (kg/cm²) × 10",
        "HT = HS + HD",
        "Q = ATank × HTank / t",
        "Ihp-theoretical = k × 60 × 60 × 1000 / (EMC × 746 × t)",
        "Ihp-actual = Ihp-theoretical × 0.6",
        "Ohp = 1000 × Q × HT / 75",
        "η (%) = (Ohp / Ihp-actual) × 100",
      ],
    );
  });

  it("stores formulas in the manual's dependency order, and every formula only reads variables that already exist", () => {
    const available = new Set<string>(["pi"]);

    for (const constant of experiment.constants) if (constant.key) available.add(constant.key);
    for (const field of [...experiment.inputFields, ...experiment.runFields]) available.add(field.key);

    for (const formula of experiment.formulas) {
      for (const variable of parseFormulaExpression(formula.expression as string).variables) {
        assert.ok(available.has(variable), `${formula.key} reads "${variable}" before it exists`);
      }

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

  it("keeps the two setup inputs and their labels, adding the manual's defaults, and drops only the unusable kWh unit", () => {
    assert.deepEqual(
      experiment.inputFields.map((field) => ({ key: field.key, label: field.label, defaultUnit: field.defaultUnit, defaultValue: field.defaultValue, units: field.units })),
      [
        { key: "tankArea", label: "Collecting Tank Area", defaultUnit: "m²", defaultValue: 0.125, units: ["m²", "cm²"] },
        { key: "energyMeterConstant", label: "Energy Meter Constant", defaultUnit: "rev/kWh", defaultValue: 750, units: ["rev/kWh"] },
      ],
    );
    assert.deepEqual(
      ORIGINAL_INPUT_FIELDS.map((field) => field.key),
      experiment.inputFields.map((field) => field.key),
    );
  });

  it("the tested defaults are the manual's data: 0.125 m² and 750 rev/kWh, prefilled for the student", () => {
    const start = initialQuantities(experiment.inputFields);

    assert.deepEqual(start.tankArea, { value: "0.125", unit: "m²" });
    assert.deepEqual(start.energyMeterConstant, { value: "750", unit: "rev/kWh" });
  });

  it("keeps the six run fields, their labels, default units and unit lists, in order", () => {
    assert.deepEqual(
      experiment.runFields.map((field) => ({ key: field.key, label: field.label, defaultUnit: field.defaultUnit, units: field.units })),
      ORIGINAL_RUN_FIELDS,
    );
  });

  it("states the calculation unit of the three fields the formulas depend on: mm Hg, kg/cm² and metres", () => {
    assert.deepEqual(
      Object.fromEntries(experiment.runFields.map((field) => [field.key, field.calculationUnit])),
      { rpm: undefined, hs: "mm Hg", hd: "kg/cm²", energyTime: undefined, tankHeight: "m", flowTime: undefined },
    );
  });

  it("does not ask the student for the number of revolutions: it is the constant k = 5", () => {
    assert.equal(experiment.runFields.some((field) => /revolution/i.test(field.key) && field.key !== "energyTime"), false);
    assert.equal(experiment.inputFields.some((field) => /revolution/i.test(field.key)), false);
    assert.deepEqual(
      experiment.constants.filter((constant) => constant.key === "energyMeterRevolutions").map(({ key, name, symbol, value, unit }) => ({ key, name, symbol, value, unit })),
      [{ key: "energyMeterRevolutions", name: "Energy Meter Revolutions", symbol: "k", value: 5, unit: "revolutions" }],
    );
  });

  it("keeps the existing gravity and water density constants exactly as stored", () => {
    assert.deepEqual(
      experiment.constants.filter((constant) => constant.key === undefined).map(({ name, symbol, value, unit }) => ({ name, symbol, value, unit })),
      [
        { name: "Acceleration due to Gravity", symbol: "g", value: 9.81, unit: "m/s²" },
        { name: "Density of Water", symbol: "ρ", value: 1000, unit: "kg/m³" },
      ],
    );
  });

  it("keeps the aim, theory and procedure, title, route and publication state", () => {
    assert.equal(experiment.title, "Centrifugal Pump");
    assert.equal(experiment.route, "/experiment/centrifugalpump-run");
    assert.equal(experiment.isPublished, true);
    assert.match(experiment.aim.join(" "), /centrifugal pump/i);
    assert.equal(experiment.procedure.length, 8);
  });

  it("defines the manual's result table (HT, Q, Ihp-Actual, Ohp, efficiency) first, then the two heads the second graph needs", () => {
    assert.deepEqual(
      experiment.outputs.map(({ key, label, unit, decimals }) => ({ key, label, unit, decimals })),
      [
        { key: "HT", label: "Total Head", unit: "m", decimals: 4 },
        { key: "Q", label: "Discharge", unit: "m³/s", decimals: 6 },
        { key: "IHPActual", label: "Input Horse Power", unit: "hp", decimals: 4 },
        { key: "Ohp", label: "Output Horse Power", unit: "hp", decimals: 4 },
        { key: "eta", label: "Pump Efficiency", unit: "%", decimals: 2 },
        { key: "hsWaterHead", label: "Suction Head (m of water)", unit: "m", decimals: 4 },
        { key: "hdWaterHead", label: "Delivery Head (m of water)", unit: "m", decimals: 4 },
      ],
    );

    const formulaKeys = new Set(experiment.formulas.map((formula) => formula.key));

    for (const output of experiment.outputs) assert.ok(formulaKeys.has(output.key), output.key);
    assert.equal(experiment.outputs.some((output) => output.key === "IHPTheoretical"), false, "the theoretical power is an intermediate");
  });

  it("Pump Characteristics: three series (efficiency, actual input power, total head) against Q, on linear axes", () => {
    const [characteristics] = experiment.graphConfigs;

    assert.equal(characteristics.title, "Pump Characteristics");
    assert.equal(characteristics.type, "multi-line");
    assert.equal(characteristics.xKey, "Q");
    assert.deepEqual([characteristics.xLabel, characteristics.yLabel], ["Discharge (Q)", "Head / Power / Efficiency"]);
    assert.deepEqual(characteristics.series, [
      { label: "Efficiency (%)", yKey: "eta" },
      { label: "Input Power (IHP)", yKey: "IHPActual" },
      { label: "Total Head (HT)", yKey: "HT" },
    ]);
    assert.equal(characteristics.scale, "linear");
    assert.equal(characteristics.xScale, undefined);
  });

  it("Efficiency vs Head: the efficiency against the suction head AND against the delivery head, each with its own x", () => {
    const efficiency = experiment.graphConfigs[1];

    assert.equal(efficiency.title, "Efficiency vs Head");
    assert.equal(efficiency.type, "multi-line");
    assert.equal(efficiency.xKey, undefined, "no single x: every series names its own");
    assert.deepEqual([efficiency.xLabel, efficiency.yLabel], ["Head (m of water)", "Efficiency (%)"]);
    assert.deepEqual(efficiency.series, [
      { label: "Suction Head", xKey: "hsWaterHead", yKey: "eta" },
      { label: "Delivery Head", xKey: "hdWaterHead", yKey: "eta" },
    ]);
  });

  it("every graph key resolves to an OUTPUT, because a graph can only plot output values", () => {
    const outputKeys = new Set(experiment.outputs.map((output) => output.key));

    for (const graph of experiment.graphConfigs) {
      for (const line of graph.series) {
        assert.ok(line.yKey && outputKeys.has(line.yKey), `${graph.title}: ${line.label} yKey`);
        assert.ok(outputKeys.has(line.xKey ?? (graph.xKey as string)), `${graph.title}: ${line.label} xKey`);
      }
    }
  });

  it("the check messages are stored with the formulas", () => {
    assert.deepEqual(
      experiment.formulas.filter((formula) => formula.checks && formula.checks.length > 0).map((formula) => formula.key),
      ["hsWaterHead", "hdWaterHead", "Q", "IHPTheoretical", "eta"],
    );
  });
});

// ---------------------------------------------------------------------------------------------
describe("centrifugalpump: the calculation (SYNTHETIC run 1: 200 mm Hg, 0.40 kg/cm², 20 s, 5 cm, 30 s; manual data)", () => {
  const experiment = pump();
  const result = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(...RUN_1) }));

  it("[HS] the suction head becomes metres of water: HS = 200 × 10.32 / 760", () => {
    near(result.calculated.hsWaterHead, R1.hsWaterHead, "hsWaterHead");
  });

  it("[HD] the delivery head becomes metres of water: HD = 0.40 × 10 = 4", () => {
    near(result.calculated.hdWaterHead, 4, "hdWaterHead");
  });

  it("[HT] HT = HS + HD", () => {
    near(result.calculated.HT, R1.HT, "HT");
    near(result.calculated.HT, result.calculated.hsWaterHead + result.calculated.hdWaterHead, "HT from its parts");
  });

  it("[Q] Q = Atank × Htank / time, with the height in metres", () => {
    near(result.calculated.Q, R1.Q, "Q");
  });

  it("[Ihp-theoretical] = k × 60 × 60 × 1000 / (EMC × 746 × t) with k = 5", () => {
    near(result.calculated.IHPTheoretical, R1.IHPTheoretical, "IHPTheoretical");
    near(result.calculated.IHPTheoretical, (5 * 60 * 60 * 1000) / (750 * 746 * 20), "IHPTheoretical written out");
  });

  it("[Ihp-actual] = Ihp-theoretical × 0.6", () => {
    near(result.calculated.IHPActual, R1.IHPActual, "IHPActual");
  });

  it("[Ohp] = 1000 × Q × HT / 75", () => {
    near(result.calculated.Ohp, R1.Ohp, "Ohp");
  });

  it("[eta] = (Ohp / Ihp-actual) × 100", () => {
    near(result.calculated.eta, R1.eta, "eta");
  });

  it("the pump speed is recorded but does not enter any of the manual's equations", () => {
    const other = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(3000, 200, 0.4, 20, 5, 30) }));

    near(other.calculated.eta, R1.eta, "eta at another speed");
    assert.equal(experiment.formulas.some((formula) => /\brpm\b/.test(formula.expression as string)), false);
  });

  it("returns the manual's result table in order, formatted per the outputs, then the two heads", () => {
    assert.deepEqual(result.outputs.map((output) => `${output.label}=${output.displayValue}`), [
      "Total Head=6.7158",
      "Discharge=0.000208",
      "Input Horse Power=0.9651",
      "Output Horse Power=0.0187",
      "Pump Efficiency=1.93",
      "Suction Head (m of water)=2.7158",
      "Delivery Head (m of water)=4.0000",
    ]);
  });

  it("the other two synthetic runs match their hand calculation too", () => {
    for (const [row, expected] of [[RUN_2, R2], [RUN_3, R3]] as const) {
      const other = succeeded(calculateExperiment({ experiment, inputs: setup(), runValues: observation(...row) }));

      for (const [key, value] of Object.entries(expected)) near(other.calculated[key], value, `${row.join("/")} ${key}`);
    }
  });

  it("uses the entered values, not fixed ones: a different tank area and EMC change Q and the input power", () => {
    const other = succeeded(calculateExperiment({ experiment, inputs: setup({ tankArea: { value: "0.25", unit: "m²" }, energyMeterConstant: { value: "1500", unit: "rev/kWh" } }), runValues: observation(...RUN_1) }));

    near(other.calculated.Q, 2 * R1.Q, "Q doubles with the tank area");
    near(other.calculated.IHPActual, R1.IHPActual / 2, "the input power halves with twice the meter constant");
  });
});

// ---------------------------------------------------------------------------------------------
describe("centrifugalpump: unit handling (converted once, and the manual's own factors)", () => {
  const experiment = pump();
  const run = (inputs: QuantityInputs, runValues: QuantityInputs) => succeeded(calculateExperiment({ experiment, inputs, runValues }));
  const baseline = run(setup(), observation(...RUN_1));

  it("760 mm Hg is 10.32 m of water", () => {
    const result = run(setup(), observation(1500, 760, 0.4, 20, 5, 30));

    near(result.calculated.hsWaterHead, 10.32, "760 mm Hg");
    assert.equal(result.scope.hs, 760, "the entered mm Hg value itself is not altered");
  });

  it("1 kg/cm² is 10 m of water", () => {
    const result = run(setup(), observation(1500, 200, 1, 20, 5, 30));

    near(result.calculated.hdWaterHead, 10, "1 kg/cm²");
    assert.equal(result.scope.hd, 1);
  });

  it("a tank height of 10 cm is 0.10 m", () => {
    const result = run(setup(), observation(1500, 200, 0.4, 20, 10, 30));

    assert.equal(result.scope.tankHeight, 0.1);
    near(result.calculated.Q, (0.125 * 0.1) / 30, "Q");
  });

  it("the tank area of 0.125 m² is preserved, and 1250 cm² is the same area", () => {
    assert.equal(baseline.scope.tankArea, 0.125);
    assert.equal(run(setup({ tankArea: { value: "1250", unit: "cm²" } }), observation(...RUN_1)).scope.tankArea, 0.125);
  });

  it("the energy meter constant and the times are used as entered (rev/kWh and seconds)", () => {
    assert.equal(baseline.scope.energyMeterConstant, 750);
    assert.equal(baseline.scope.energyTime, 20);
    assert.equal(baseline.scope.flowTime, 30);
    assert.equal(baseline.scope.energyMeterRevolutions, 5);
  });

  it("the suction head in cm Hg gives the same result as in mm Hg (76 cm Hg = 760 mm Hg = 10.32 m)", () => {
    const result = run(setup(), { ...observation(1500, 200, 0.4, 20, 5, 30), hs: { value: "76", unit: "cm Hg" } });

    near(result.calculated.hsWaterHead, 10.32, "76 cm Hg");
    near(result.scope.hs, 760, "hs in mm Hg");
  });

  it("the delivery head in bar gives the same result as in kg/cm² (0.980665 bar = 1 kg/cm² = 10 m)", () => {
    const result = run(setup(), { ...observation(1500, 200, 0.4, 20, 5, 30), hd: { value: "0.980665", unit: "bar" } });

    near(result.calculated.hdWaterHead, 10, "0.980665 bar");
    near(result.scope.hd, 1, "hd in kg/cm²");
  });

  it("the tank height in m, cm or mm gives the same result", () => {
    for (const height of [{ value: "0.05", unit: "m" }, { value: "5", unit: "cm" }, { value: "50", unit: "mm" }]) {
      const result = run(setup(), { ...observation(...RUN_1), tankHeight: height });

      near(result.calculated.Q, R1.Q, `height in ${height.unit}`);
    }
  });

  it("does not double-convert: the same physical values in other units give identical results", () => {
    const other = run(
      setup({ tankArea: { value: "1250", unit: "cm²" } }),
      { ...observation(...RUN_1), hs: { value: "20", unit: "cm Hg" }, hd: { value: "0.392266", unit: "bar" }, tankHeight: { value: "0.05", unit: "m" } },
    );

    for (const key of ["HT", "Q", "IHPActual", "Ohp", "eta"]) near(other.calculated[key], (R1 as Record<string, number>)[key], key);
  });

  it("without calculationUnit the tank height would stay in cm and Q would be 100 times too big", () => {
    const unconverted: NormalizedExperiment = {
      ...experiment,
      runFields: experiment.runFields.map(({ calculationUnit, ...field }) => (field.key === "tankHeight" ? field : { ...field, calculationUnit })),
    };
    const wrong = succeeded(calculateExperiment({ experiment: unconverted, inputs: setup(), runValues: observation(...RUN_1) }));

    near(wrong.calculated.Q, 100 * R1.Q, "Q with the height taken as 5 m");
    near(baseline.calculated.Q, R1.Q, "the stored definition gives the right one");
  });

  it("the energy meter constant only accepts rev/kWh: a unit that cannot be converted is no longer offered", () => {
    const errors = failed(calculateExperiment({ experiment, inputs: setup({ energyMeterConstant: { value: "750", unit: "kWh" } }), runValues: observation(...RUN_1) }));

    assert.ok(errors.some((error) => error.fieldKey === "energyMeterConstant" && /does not accept the unit "kWh"/.test(error.userMessage)));
  });
});

// ---------------------------------------------------------------------------------------------
describe("centrifugalpump: validation (domain checks; the manual's equations are unchanged)", () => {
  const experiment = pump();
  const run = (inputs: QuantityInputs, runValues: QuantityInputs) => calculateExperiment({ experiment, inputs, runValues });
  const valid = observation(...RUN_1);

  function onlyReason(errors: ReturnType<typeof failed>) {
    assert.equal(errors.length, 1, `expected exactly one clear error, got: ${errors.map((error) => `${error.code}(${error.formulaKey ?? ""}): ${error.userMessage}`).join(" | ")}`);
    assert.equal(errors[0].code, "DOMAIN_CHECK_FAILED");

    return errors[0];
  }

  function allClear(errors: ReturnType<typeof failed>) {
    assert.ok(errors.every((error) => error.code === "DOMAIN_CHECK_FAILED"), errors.map((error) => `${error.code}(${error.formulaKey ?? ""})`).join(", "));
    assert.equal(errors.some((error) => /not configured/i.test(error.userMessage)), false);
  }

  it("a zero or negative tank area is a clear error on the tank area field", () => {
    for (const value of ["0", "-0.125"]) {
      const error = onlyReason(failed(run(setup({ tankArea: { value, unit: "m²" } }), valid)));

      assert.equal(error.formulaKey, "Q");
      assert.equal(error.fieldKey, "tankArea");
      assert.equal(error.fieldKind, "input");
      assert.equal(error.userMessage, "Collecting Tank Area must be greater than zero.");
    }
  });

  it("a zero or negative energy meter constant is a clear error on its field, with no divide-by-zero noise", () => {
    for (const value of ["0", "-750"]) {
      const errors = failed(run(setup({ energyMeterConstant: { value, unit: "rev/kWh" } }), valid));

      allClear(errors);
      assert.equal(onlyReason(errors).fieldKey, "energyMeterConstant");
      assert.equal(errors[0].userMessage, "Energy Meter Constant must be greater than zero.");
    }
  });

  it("a zero or negative energy-meter time is a clear error on its field", () => {
    for (const time of [0, -20]) {
      const error = onlyReason(failed(run(setup(), observation(1500, 200, 0.4, time, 5, 30))));

      assert.equal(error.formulaKey, "IHPTheoretical");
      assert.equal(error.fieldKey, "energyTime");
      assert.equal(error.fieldKind, "run");
      assert.equal(error.userMessage, "Time for 5 Energy Meter Revolutions must be greater than zero.");
    }
  });

  it("a zero or negative collection time is a clear error on its field", () => {
    for (const time of [0, -30]) {
      const error = onlyReason(failed(run(setup(), observation(1500, 200, 0.4, 20, 5, time))));

      assert.equal(error.formulaKey, "Q");
      assert.equal(error.fieldKey, "flowTime");
      assert.equal(error.fieldKind, "run");
      assert.equal(error.userMessage, "Collection Time must be greater than zero.");
    }
  });

  it("a negative tank height is a clear error, but a height of zero is allowed (no flow, so Q = 0 and the efficiency is 0)", () => {
    const error = onlyReason(failed(run(setup(), observation(1500, 200, 0.4, 20, -5, 30))));

    assert.equal(error.fieldKey, "tankHeight");
    assert.equal(error.userMessage, "Collection Tank Water Height must not be negative.");

    const noFlow = succeeded(run(setup(), observation(1500, 200, 0.4, 20, 0, 30)));

    assert.equal(noFlow.calculated.Q, 0);
    assert.equal(noFlow.calculated.Ohp, 0);
    assert.equal(noFlow.calculated.eta, 0);
    assert.ok(Object.values(noFlow.calculated).every(Number.isFinite));
  });

  it("a negative suction head is a clear error, but zero is allowed", () => {
    const error = onlyReason(failed(run(setup(), observation(1500, -10, 0.4, 20, 5, 30))));

    assert.equal(error.formulaKey, "hsWaterHead");
    assert.equal(error.fieldKey, "hs");
    assert.equal(error.userMessage, "Suction Head must not be negative.");
    near(succeeded(run(setup(), observation(1500, 0, 0.4, 20, 5, 30))).calculated.HT, 4, "HT with no suction head");
  });

  it("a negative delivery head is a clear error, but zero is allowed", () => {
    const error = onlyReason(failed(run(setup(), observation(1500, 200, -0.1, 20, 5, 30))));

    assert.equal(error.formulaKey, "hdWaterHead");
    assert.equal(error.fieldKey, "hd");
    assert.equal(error.userMessage, "Delivery Head must not be negative.");
    near(succeeded(run(setup(), observation(1500, 200, 0, 20, 5, 30))).calculated.HT, R1.hsWaterHead, "HT with no delivery head");
  });

  it("the sign is judged AFTER the conversion: a negative value in cm Hg or bar is still rejected", () => {
    assert.equal(failed(run(setup(), { ...valid, hs: { value: "-1", unit: "cm Hg" } })).some((error) => error.fieldKey === "hs"), true);
    assert.equal(failed(run(setup(), { ...valid, hd: { value: "-0.1", unit: "bar" } })).some((error) => error.fieldKey === "hd"), true);
  });

  it("the efficiency needs a positive input power: a zero one is caught before the division, with a clear message", () => {
    const noRevolutions: NormalizedExperiment = {
      ...experiment,
      constants: experiment.constants.map((constant) => (constant.key === "energyMeterRevolutions" ? { ...constant, value: 0 } : constant)),
    };
    const error = onlyReason(failed(calculateExperiment({ experiment: noRevolutions, inputs: setup(), runValues: valid })));

    assert.equal(error.formulaKey, "eta");
    assert.match(error.userMessage, /actual input horse power is not greater than zero/);

    const withoutCheck: NormalizedExperiment = {
      ...noRevolutions,
      formulas: noRevolutions.formulas.map((formula) => (formula.key === "eta" ? { ...formula, checks: [] } : formula)),
    };
    const raw = failed(calculateExperiment({ experiment: withoutCheck, inputs: setup(), runValues: valid }));

    assert.equal(raw[0].code, "DIVISION_BY_ZERO", "the evaluator is the last line of defence");
  });

  it("no NaN or Infinity is ever produced: an overflowing value is an error, never a result", () => {
    const overflow = failed(run(setup(), observation(1500, 200, 0.4, 1e-320, 5, 30)));

    assert.ok(overflow.length > 0);
    assert.equal(overflow.some((error) => error.code === "DOMAIN_CHECK_FAILED"), false, "this is an arithmetic overflow, not a domain rule");

    for (const row of [RUN_1, RUN_2, RUN_3]) {
      const ok = succeeded(run(setup(), observation(...row)));

      for (const [key, value] of Object.entries(ok.calculated)) assert.ok(Number.isFinite(value), `${key} = ${value}`);
    }
  });

  it("reports several independent problems together, so the student can fix them all at once", () => {
    const errors = failed(run(setup({ tankArea: { value: "-1", unit: "m²" } }), observation(1500, -5, -1, 0, 5, 0)));
    const fields = errors.map((error) => error.fieldKey).sort();

    assert.deepEqual(fields, ["energyTime", "flowTime", "hd", "hs", "tankArea"]);
    allClear(errors);
  });

  it("valid runs are unaffected by the checks", () => {
    for (const row of [RUN_1, RUN_2, RUN_3]) succeeded(run(setup(), observation(...row)));
  });

  it("missing and non-numeric inputs are still reported as before, not as domain problems", () => {
    const errors = failed(run({}, {}));

    assert.ok(errors.every((error) => error.code === "INPUT_REQUIRED"));

    const text = failed(run(setup(), { ...valid, hs: { value: "abc", unit: "mm Hg" } }));

    assert.ok(text.some((error) => error.code === "INPUT_INVALID_NUMBER" && error.fieldKey === "hs"));
  });

  it("a setup problem is reported once for the experiment, and a run problem stays with its run", () => {
    const outcome = calculateAllDraftRuns({
      experiment,
      setup: setup({ tankArea: { value: "0", unit: "m²" } }),
      runs: [{ ...createDraftRun("r1", experiment.runFields), runValues: valid }, { ...createDraftRun("r2", experiment.runFields), runValues: valid }],
    });

    assert.equal(outcome.setupIssues.length, 1, "shared setup problems are shown once, not once per run");
    assert.equal(outcome.setupIssues[0].fieldKey, "tankArea");
    assert.deepEqual(outcome.definitionIssues, []);

    const perRun = calculateAllDraftRuns({
      experiment,
      setup: setup(),
      runs: [{ ...createDraftRun("r1", experiment.runFields), runValues: observation(1500, 200, 0.4, 20, 5, 0) }, { ...createDraftRun("r2", experiment.runFields), runValues: valid }],
    });

    assert.deepEqual(perRun.runs.map((entry) => entry.status), ["error", "calculated"]);
    assert.equal(perRun.runs[0].errors[0].fieldKey, "flowTime");
    assert.deepEqual(perRun.setupIssues, []);
  });
});

// ---------------------------------------------------------------------------------------------
describe("centrifugalpump: several runs and both graphs", () => {
  const experiment = pump();
  const draft = (id: string, row: Row) => ({ ...createDraftRun(id, experiment.runFields), runValues: observation(...row) });
  const outcome = calculateAllDraftRuns({ experiment, setup: setup(), runs: [draft("r1", RUN_1), draft("r2", RUN_2), draft("r3", RUN_3)] });
  const [characteristics, efficiency] = buildRunGraphs(experiment, outcome.runs);
  const runs = [R1, R2, R3];

  it("Calculate All calculates all three runs, and the values match the manual's equations", () => {
    assert.deepEqual(outcome.setupIssues, []);
    assert.deepEqual(outcome.definitionIssues, []);
    assert.deepEqual(outcome.runs.map((entry) => entry.status), ["calculated", "calculated", "calculated"]);

    runs.forEach((expected, index) => {
      const results = outcome.runs[index].result!.results;

      for (const key of ["HT", "Q", "IHPActual", "Ohp", "eta", "hsWaterHead", "hdWaterHead"]) near(results[key], (expected as Record<string, number>)[key], `run ${index + 1} ${key}`);
    });
  });

  it("Pump Characteristics: three series, each with one point per run, all against Q", () => {
    assert.equal(characteristics.status, "ready");
    assert.deepEqual(characteristics.issues, []);
    assert.equal(characteristics.graph?.title, "Pump Characteristics");
    assert.equal(characteristics.graph?.xKey, "Q");
    assert.deepEqual(characteristics.graph?.series?.map((line) => [line.label, line.yKey]), [
      ["Efficiency (%)", "eta"],
      ["Input Power (IHP)", "IHPActual"],
      ["Total Head (HT)", "HT"],
    ]);

    for (const line of characteristics.graph!.series!) {
      assert.equal(line.points.length, 3, line.label);
      assert.equal("xKey" in line, false, "these lines use the graph's x");

      line.points.forEach((point, index) => {
        near(point.x, runs[index].Q, `${line.label} run ${index + 1} x`);
        near(point.y, (runs[index] as Record<string, number>)[line.yKey], `${line.label} run ${index + 1} y`);
      });
    }

    assert.equal(describeGraphState(characteristics, 3).kind, "chart");
  });

  it("Efficiency vs Head: two series, each with one point per run; x is that series' head and y is the efficiency", () => {
    assert.equal(efficiency.status, "ready");
    assert.deepEqual(efficiency.issues, []);
    assert.equal(efficiency.graph?.title, "Efficiency vs Head");

    const [suction, delivery] = efficiency.graph!.series!;

    assert.deepEqual([suction.label, suction.xKey, suction.yKey], ["Suction Head", "hsWaterHead", "eta"]);
    assert.deepEqual([delivery.label, delivery.xKey, delivery.yKey], ["Delivery Head", "hdWaterHead", "eta"]);
    assert.equal(suction.points.length, 3);
    assert.equal(delivery.points.length, 3);

    runs.forEach((expected, index) => {
      near(suction.points[index].x, expected.hsWaterHead, `suction run ${index + 1} x (HS)`);
      near(suction.points[index].y, expected.eta, `suction run ${index + 1} y (efficiency)`);
      near(delivery.points[index].x, expected.hdWaterHead, `delivery run ${index + 1} x (HD)`);
      near(delivery.points[index].y, expected.eta, `delivery run ${index + 1} y (efficiency)`);
    });

    assert.equal(describeGraphState(efficiency, 3).kind, "chart");
  });

  it("the two series of Efficiency vs Head use different x values (the suction and the delivery head), not one shared x", () => {
    const [suction, delivery] = efficiency.graph!.series!;

    assert.notDeepEqual(suction.points.map((point) => point.x), delivery.points.map((point) => point.x));
    assert.deepEqual(suction.points.map((point) => point.y), delivery.points.map((point) => point.y), "but the same efficiency");
  });

  it("no invalid point is emitted: every plotted x and y is a finite number", () => {
    for (const generation of [characteristics, efficiency]) {
      for (const line of generation.graph!.series!) {
        for (const point of line.points) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), `${line.label}: (${point.x}, ${point.y})`);
      }
    }
  });

  it("a run that cannot be calculated contributes no point, and does not hide the others", () => {
    const mixed = calculateAllDraftRuns({ experiment, setup: setup(), runs: [draft("r1", RUN_1), draft("r2", [1500, 250, 0.5, 18, 7, 0]), draft("r3", RUN_3)] });

    assert.deepEqual(mixed.runs.map((entry) => entry.status), ["calculated", "error", "calculated"]);
    assert.match(mixed.runs[1].errors[0].userMessage, /Collection Time must be greater than zero/);

    for (const generation of buildRunGraphs(experiment, mixed.runs)) {
      for (const line of generation.graph!.series!) assert.equal(line.points.length, 2, `${generation.graph!.title}: ${line.label}`);
    }
  });

  it("two runs already give a drawable chart on both graphs", () => {
    const two = calculateAllDraftRuns({ experiment, setup: setup(), runs: [draft("r1", RUN_1), draft("r2", RUN_2)] });

    for (const generation of buildRunGraphs(experiment, two.runs)) assert.equal(describeGraphState(generation, 2).kind, "chart");
  });

  it("the graph data comes from the calculated runs, not from fixed values", () => {
    const other = calculateAllDraftRuns({ experiment, setup: setup(), runs: [draft("r1", [1500, 100, 0.2, 25, 4, 30]), draft("r2", [1500, 120, 0.3, 22, 6, 30])] });
    const [graph] = buildRunGraphs(experiment, other.runs);

    near(graph.graph!.series![0].points[0].x, (0.125 * 0.04) / 30, "Q from these readings");
    assert.notEqual(graph.graph!.series![0].points[0].y, R1.eta);
  });

  it("a run with zero flow (height 0) is plotted with Q = 0 and efficiency 0, and every value stays finite", () => {
    const withZero = calculateAllDraftRuns({ experiment, setup: setup(), runs: [draft("r1", RUN_1), draft("r2", [1500, 250, 0.5, 18, 0, 30])] });
    const [graph] = buildRunGraphs(experiment, withZero.runs);
    const efficiencyLine = graph.graph!.series![0];

    assert.deepEqual(withZero.runs.map((entry) => entry.status), ["calculated", "calculated"]);
    assert.deepEqual([efficiencyLine.points[1].x, efficiencyLine.points[1].y], [0, 0]);
  });

  it("the whole result table for one run reads out for the student", () => {
    const [only] = outcome.runs;

    assert.deepEqual(only.result?.outputs.map((output) => `${output.label}=${output.displayValue}`), [
      "Total Head=6.7158",
      "Discharge=0.000208",
      "Input Horse Power=0.9651",
      "Output Horse Power=0.0187",
      "Pump Efficiency=1.93",
      "Suction Head (m of water)=2.7158",
      "Delivery Head (m of water)=4.0000",
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("centrifugalpump: the other experiments are unaffected", () => {
  const seedOf = (id: string) => normalizeExperiment({ id, subjectId: "fluid-mechanics", data: experiments.find((entry) => entry.id === id) as unknown as RawExperimentData });

  it("the Orifice Meter still calculates its run exactly as before", () => {
    const result = succeeded(
      calculateExperiment({
        experiment: seedOf("orificemeter"),
        inputs: {
          pipeDiameter: { value: "25", unit: "mm" },
          orificeDiameter: { value: "12.5", unit: "mm" },
          tankArea: { value: "0.125", unit: "m²" },
          manometerDensity: { value: "13600", unit: "kg/m³" },
          fluidDensity: { value: "1000", unit: "kg/m³" },
          viscosity: { value: "0.001", unit: "Pa·s" },
        },
        runValues: { lhs: { value: "250", unit: "mm" }, rhs: { value: "150", unit: "mm" }, height: { value: "0.05", unit: "m" }, time: { value: "20", unit: "s" } },
      }),
    );

    near(result.calculated.Cd, 0.4958964261599631, "Orifice Cd");
    near(result.calculated.NRe, 15915.494309189533, "Orifice NRe");
  });

  it("the Venturimeter still calculates its manual run exactly as before", () => {
    const result = succeeded(
      calculateExperiment({
        experiment: seedOf("venturimeter"),
        inputs: {
          pipeDiameter: { value: "25.4", unit: "mm" },
          throatDiameter: { value: "12.5", unit: "mm" },
          tankArea: { value: "0.125", unit: "m²" },
          manometerDensity: { value: "13600", unit: "kg/m³" },
          fluidDensity: { value: "1000", unit: "kg/m³" },
          viscosity: { value: "0.00098", unit: "Pa·s" },
        },
        runValues: { lhs: { value: "250", unit: "mm" }, rhs: { value: "150", unit: "mm" }, height: { value: "0.05", unit: "m" }, time: { value: "20", unit: "s" } },
      }),
    );

    near(result.calculated.Cd, 0.49691229866408104, "Venturimeter Cd");
  });

  it("every other seed experiment keeps its own id, and none of them was given the pump's new keys", () => {
    const others = experiments.filter((entry) => entry.id !== "centrifugalpump");

    assert.deepEqual(others.map((entry) => entry.id), ["pipeflow", "noncircular", "packedbed", "fluidizedbed", "venturimeter", "orificemeter"]);

    for (const entry of others) {
      const text = JSON.stringify(entry);

      assert.equal(text.includes("energyMeterRevolutions"), false, entry.id);
      assert.equal(text.includes("hsWaterHead"), false, entry.id);
    }
  });
});
