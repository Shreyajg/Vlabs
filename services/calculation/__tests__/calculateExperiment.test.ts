import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalculationResult } from "../../../types/Calculation";
import type { NormalizedExperiment } from "../../../types/Experiment";
import {
  calculateExperiment,
  formatOutputValue,
  parseNumericInput,
} from "../calculateExperiment";
import { CALCULATION_FAILED_MESSAGE, NOT_CONFIGURED_MESSAGE } from "../issues";
import {
  closeTo,
  normalizedPipeflow,
  normalizedVenturi,
  pipeflowEntries,
} from "./fixtures";

function failed(result: CalculationResult) {
  assert.equal(result.ok, false, "expected the calculation to fail");

  if (result.ok) throw new Error("unreachable");

  return result.errors;
}

function succeeded(result: CalculationResult) {
  if (!result.ok) {
    assert.fail(`expected success but got: ${result.errors.map((error) => error.code).join(", ")}`);
  }

  return result;
}

function withFormulas(
  experiment: NormalizedExperiment,
  formulas: NormalizedExperiment["formulas"],
): NormalizedExperiment {
  return { ...experiment, formulas };
}

// Values below are derived by hand from the Firestore expressions, using plain arithmetic:
//   inputs:  pipeDiameter 25 mm -> 0.025 m, viscosity 1 cP -> 0.001 Pa·s, area 0.04, density 1000, pipeLength 2
//   run:     lhs 30, rhs 10, height 0.1, time 20
//   consts:  gravity 9.81, manometerDensity 13600
const area = 0.04;
const height = 0.1;
const time = 20;
const pipeDiameter = 25 / 1000;
const pipeLength = 2;
const density = 1000;
const viscosity = 1 / 1000;
const gravity = 9.81;
const manometerDensity = 13600;

const expectedQ = (area * height) / time; // "area * height / time"
const expectedV = expectedQ / area; // "Q / area"
const expectedNRe = (density * expectedV * pipeDiameter) / viscosity; // "density * V * pipeDiameter / viscosity"
const expectedRm = (30 - 10) / 100; // "(lhs - rhs) / 100"
const expectedDeltaP = expectedRm * (manometerDensity - density) * gravity; // "Rm * (manometerDensity - density) * gravity"
const expectedF =
  (2 * expectedDeltaP * pipeDiameter) / (density * pipeLength * expectedV ** 2); // "(2 * deltaP * pipeDiameter)/(density * pipeLength * V^2)"

describe("calculateExperiment: pipeflow", () => {
  const result = succeeded(
    calculateExperiment({ experiment: normalizedPipeflow(), ...pipeflowEntries() }),
  );

  it("calculates Q, V, NRe, Rm, deltaP and f from the Firestore expressions", () => {
    assert.ok(closeTo(result.calculated.Q, expectedQ), `Q ${result.calculated.Q} vs ${expectedQ}`);
    assert.ok(closeTo(result.calculated.V, expectedV), `V ${result.calculated.V} vs ${expectedV}`);
    assert.ok(closeTo(result.calculated.NRe, expectedNRe), `NRe ${result.calculated.NRe} vs ${expectedNRe}`);
    assert.ok(closeTo(result.calculated.Rm, expectedRm), `Rm ${result.calculated.Rm} vs ${expectedRm}`);
    assert.ok(closeTo(result.calculated.deltaP, expectedDeltaP), `deltaP ${result.calculated.deltaP} vs ${expectedDeltaP}`);
    assert.ok(closeTo(result.calculated.f, expectedF), `f ${result.calculated.f} vs ${expectedF}`);
  });

  it("calculates exactly the formulas defined, in order, with nothing extra", () => {
    assert.deepEqual(Object.keys(result.calculated), ["Q", "V", "NRe", "Rm", "deltaP", "f"]);
  });

  it("converts inputs to the calculation unit but leaves constants and unitless run values alone", () => {
    assert.ok(closeTo(result.scope.pipeDiameter, 0.025), "25 mm becomes 0.025 m");
    assert.ok(closeTo(result.scope.viscosity, 0.001), "1 cP becomes 0.001 Pa·s");
    assert.equal(result.scope.gravity, 9.81);
    assert.equal(result.scope.manometerDensity, 13600);
    assert.equal(result.scope.lhs, 30);
    assert.equal(result.scope.time, 20);
  });

  it("gives the same answer whichever allowed unit the student picks", () => {
    const entries = pipeflowEntries();
    const inMetres = calculateExperiment({
      experiment: normalizedPipeflow(),
      inputs: { ...entries.inputs, pipeDiameter: { value: "0.025", unit: "m" } },
      runValues: entries.runValues,
    });

    assert.ok(closeTo(succeeded(inMetres).calculated.f, result.calculated.f));
  });

  it("maps outputs entirely from the Firestore outputs array", () => {
    assert.deepEqual(
      result.outputs.map((output) => output.key),
      ["deltaP", "Q", "V", "NRe", "f"],
    );
    assert.deepEqual(
      result.outputs.map((output) => output.label),
      ["ΔP", "Q", "V", "Re", "f"],
    );
    assert.deepEqual(Object.keys(result.results).sort(), ["NRe", "Q", "V", "deltaP", "f"]);
    assert.equal("Rm" in result.results, false, "Rm is calculated but is not a declared output");
  });

  it("formats each output with its declared decimals", () => {
    const display = Object.fromEntries(result.outputs.map((output) => [output.key, output.displayValue]));

    assert.equal(display.Q, "0.000200");
    assert.equal(display.V, "0.0050");
    assert.equal(display.NRe, "125");
    assert.equal(display.deltaP, "24721.20");
    assert.equal(display.f, expectedF.toFixed(4));
  });

  it("generates one graph point from the stored xKey and yKey", () => {
    assert.equal(result.graphData.length, 1);

    const graph = result.graphData[0];

    assert.equal(graph.title, "f vs NRe");
    assert.equal(graph.xKey, "NRe");
    assert.equal(graph.yKey, "f");
    assert.equal(graph.xLabel, "N_Re");
    assert.equal(graph.yLabel, "f");
    assert.equal(graph.scale, "log");
    assert.equal(graph.points.length, 1, "a single run must produce a single point");
    assert.ok(closeTo(graph.points[0].x, expectedNRe));
    assert.ok(closeTo(graph.points[0].y, expectedF));
  });

  it("does not mutate the experiment or the entries", () => {
    const experiment = Object.freeze(normalizedPipeflow());
    const { inputs, runValues } = pipeflowEntries();

    assert.doesNotThrow(() =>
      calculateExperiment({
        experiment,
        inputs: Object.freeze(inputs),
        runValues: Object.freeze(runValues),
      }),
    );
  });
});

describe("calculateExperiment: missing and invalid input", () => {
  it("reports a missing input with a student-friendly message", () => {
    const { inputs, runValues } = pipeflowEntries();

    delete inputs.pipeDiameter;

    const errors = failed(calculateExperiment({ experiment: normalizedPipeflow(), inputs, runValues }));

    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, "INPUT_REQUIRED");
    assert.equal(errors[0].fieldKey, "pipeDiameter");
    assert.equal(errors[0].fieldKind, "input");
    assert.equal(errors[0].userMessage, "Pipe Diameter is required.");
  });

  it("reports every problem at once, including run values", () => {
    const errors = failed(
      calculateExperiment({ experiment: normalizedPipeflow(), inputs: {}, runValues: {} }),
    );

    assert.equal(errors.length, 9, "5 inputs + 4 run fields");
    assert.ok(errors.every((error) => error.code === "INPUT_REQUIRED"));
    assert.equal(errors.filter((error) => error.fieldKind === "run").length, 4);
  });

  it("treats a blank or whitespace value as missing", () => {
    const { inputs, runValues } = pipeflowEntries();

    inputs.pipeLength = { value: "   " };

    const errors = failed(calculateExperiment({ experiment: normalizedPipeflow(), inputs, runValues }));

    assert.equal(errors[0].code, "INPUT_REQUIRED");
    assert.equal(errors[0].fieldKey, "pipeLength");
  });

  for (const bad of ["abc", "1e", "0x10", "1,5", "Infinity", "NaN", "--1", "1 2"]) {
    it(`rejects the invalid number ${JSON.stringify(bad)}`, () => {
      const { inputs, runValues } = pipeflowEntries();

      inputs.pipeDiameter = { value: bad, unit: "m" };

      const errors = failed(calculateExperiment({ experiment: normalizedPipeflow(), inputs, runValues }));

      assert.equal(errors[0].code, "INPUT_INVALID_NUMBER");
      assert.equal(errors[0].userMessage, "Pipe Diameter must be a valid number.");
    });
  }

  it("rejects non-finite numeric values", () => {
    const { inputs, runValues } = pipeflowEntries();

    inputs.pipeDiameter = { value: Number.NaN };

    assert.equal(
      failed(calculateExperiment({ experiment: normalizedPipeflow(), inputs, runValues }))[0].code,
      "INPUT_INVALID_NUMBER",
    );
  });

  it("accepts scientific notation and signed decimals", () => {
    assert.equal(parseNumericInput("1e-3"), 0.001);
    assert.equal(parseNumericInput("-2.5"), -2.5);
    assert.equal(parseNumericInput(".5"), 0.5);
    assert.equal(parseNumericInput(" 7 "), 7);
  });
});

describe("calculateExperiment: units", () => {
  it("rejects a unit the field does not list", () => {
    const { inputs, runValues } = pipeflowEntries();

    inputs.pipeDiameter = { value: "25", unit: "furlong" };

    const errors = failed(calculateExperiment({ experiment: normalizedPipeflow(), inputs, runValues }));

    assert.equal(errors[0].code, "UNSUPPORTED_UNIT");
    assert.equal(errors[0].fieldKey, "pipeDiameter");
    assert.equal(errors[0].unit, "furlong");
  });

  it("reports an unsupported conversion between two listed units", () => {
    const experiment: NormalizedExperiment = {
      ...normalizedPipeflow(),
      inputFields: [
        {
          key: "energyMeterConstant",
          label: "Energy Meter Constant",
          kind: "number",
          units: ["rev/kWh", "kWh"],
          defaultUnit: "rev/kWh",
          options: [],
        },
      ],
      runFields: [],
      formulas: [{ key: "y", name: "Y", expression: "energyMeterConstant * 2" }],
      outputs: [],
      graphConfigs: [],
    };

    const errors = failed(
      calculateExperiment({
        experiment,
        inputs: { energyMeterConstant: { value: "10", unit: "kWh" } },
        runValues: {},
      }),
    );

    assert.equal(errors[0].code, "UNSUPPORTED_UNIT");
    assert.equal(errors[0].userMessage, "Unsupported unit conversion: kWh to rev/kWh.");
  });

  it("converts to an explicit calculationUnit when the document defines one", () => {
    const experiment: NormalizedExperiment = {
      ...normalizedPipeflow(),
      inputFields: [
        { key: "d", label: "D", kind: "number", units: ["m", "mm"], defaultUnit: "m", calculationUnit: "mm", options: [] },
      ],
      runFields: [],
      formulas: [{ key: "y", name: "Y", expression: "d" }],
      outputs: [],
      graphConfigs: [],
    };

    const result = succeeded(
      calculateExperiment({ experiment, inputs: { d: { value: "2", unit: "m" } }, runValues: {} }),
    );

    assert.equal(result.calculated.y, 2000);
  });
});

describe("calculateExperiment: formula evaluation problems", () => {
  it("reports division by zero for the formula that caused it, then its dependants", () => {
    const { inputs, runValues } = pipeflowEntries();

    runValues.time = { value: "0" };

    const errors = failed(calculateExperiment({ experiment: normalizedPipeflow(), inputs, runValues }));

    assert.equal(errors[0].code, "DIVISION_BY_ZERO");
    assert.equal(errors[0].formulaKey, "Q");
    assert.equal(errors[0].userMessage, CALCULATION_FAILED_MESSAGE);

    const dependants = errors.filter((error) => error.code === "FORMULA_DEPENDENCY_FAILED");

    assert.ok(dependants.some((error) => error.formulaKey === "V" && error.variable === "Q"));
    assert.ok(errors.every((error) => error.code !== "UNKNOWN_FORMULA_VARIABLE"), "no misleading cascade");
    assert.equal(errors.filter((error) => error.code === "DIVISION_BY_ZERO").length, 1);
  });

  it("detects division by zero in a denominator expression such as viscosity", () => {
    const { inputs, runValues } = pipeflowEntries();

    inputs.viscosity = { value: "0", unit: "Pa·s" };

    const errors = failed(calculateExperiment({ experiment: normalizedPipeflow(), inputs, runValues }));

    assert.equal(errors[0].code, "DIVISION_BY_ZERO");
    assert.equal(errors[0].formulaKey, "NRe");
  });

  it("reports an unknown formula variable", () => {
    const experiment = withFormulas(normalizedPipeflow(), [
      { key: "z", name: "Z", expression: "foo * 2" },
    ]);

    const errors = failed(calculateExperiment({ experiment, ...pipeflowEntries() }));

    assert.equal(errors[0].code, "UNKNOWN_FORMULA_VARIABLE");
    assert.equal(errors[0].formulaKey, "z");
    assert.equal(errors[0].variable, "foo");
    assert.equal(errors[0].userMessage, NOT_CONFIGURED_MESSAGE);
  });

  it("evaluates strictly in stored order: a variable defined later is unknown", () => {
    const experiment = normalizedPipeflow();
    const [discharge, velocity, ...rest] = experiment.formulas;
    const reordered = withFormulas(experiment, [velocity, discharge, ...rest]);

    const errors = failed(calculateExperiment({ experiment: reordered, ...pipeflowEntries() }));

    assert.equal(errors[0].code, "UNKNOWN_FORMULA_VARIABLE");
    assert.equal(errors[0].formulaKey, "V");
    assert.equal(errors[0].variable, "Q");
    assert.match(errors[0].message, /defined later/);
  });

  it("rejects unsafe or unsupported expressions instead of running them", () => {
    for (const expression of ["x = 5", "constructor(1)", "a[1]", "'text'"]) {
      const experiment = withFormulas(normalizedPipeflow(), [
        { key: "z", name: "Z", expression },
      ]);

      const errors = failed(calculateExperiment({ experiment, ...pipeflowEntries() }));

      assert.equal(errors[0].code, "UNSUPPORTED_FORMULA_SYNTAX", expression);
    }
  });

  it("reports a formula expression that cannot be parsed", () => {
    const experiment = withFormulas(normalizedPipeflow(), [
      { key: "z", name: "Z", expression: "2 +" },
    ]);

    assert.equal(
      failed(calculateExperiment({ experiment, ...pipeflowEntries() }))[0].code,
      "FORMULA_PARSE_ERROR",
    );
  });

  it("rejects a formula that reuses an existing variable key", () => {
    const experiment = withFormulas(normalizedPipeflow(), [
      { key: "density", name: "Clash", expression: "1 + 1" },
    ]);

    assert.equal(
      failed(calculateExperiment({ experiment, ...pipeflowEntries() }))[0].code,
      "DUPLICATE_VARIABLE_KEY",
    );
  });

  it("rejects a formula with an expression but no key", () => {
    const experiment = withFormulas(normalizedPipeflow(), [{ name: "No key", expression: "1 + 1" }]);

    assert.equal(
      failed(calculateExperiment({ experiment, ...pipeflowEntries() }))[0].code,
      "FORMULA_KEY_MISSING",
    );
  });

  it("rejects an experiment with no formulas", () => {
    const experiment = withFormulas(normalizedPipeflow(), []);

    assert.ok(
      failed(calculateExperiment({ experiment, ...pipeflowEntries() })).some(
        (error) => error.code === "NO_FORMULAS_DEFINED",
      ),
    );
  });

  it("rejects duplicate keys across constants and inputs", () => {
    const experiment: NormalizedExperiment = {
      ...normalizedPipeflow(),
      constants: [{ key: "density", name: "Clash", value: 1 }],
    };

    assert.ok(
      failed(calculateExperiment({ experiment, ...pipeflowEntries() })).some(
        (error) => error.code === "DUPLICATE_VARIABLE_KEY",
      ),
    );
  });
});

describe("calculateExperiment: display-only formulas (venturimeter)", () => {
  const venturiEntries = {
    inputs: {
      pipeDiameter: { value: "50", unit: "mm" },
      throatDiameter: { value: "25", unit: "mm" },
      tankArea: { value: "0.1", unit: "m²" },
      manometerDensity: { value: "13600", unit: "kg/m³" },
      fluidDensity: { value: "1000", unit: "kg/m³" },
      viscosity: { value: "0.001", unit: "Pa·s" },
    },
    runValues: {
      lhs: { value: "100", unit: "mm" },
      rhs: { value: "50", unit: "mm" },
      height: { value: "0.1", unit: "m" },
      time: { value: "10", unit: "s" },
    },
  };

  const errors = failed(calculateExperiment({ experiment: normalizedVenturi(), ...venturiEntries }));

  it("returns FORMULA_EXPRESSION_MISSING for every display-only formula and does not guess", () => {
    const missing = errors.filter((error) => error.code === "FORMULA_EXPRESSION_MISSING");

    assert.equal(missing.length, 4);
    assert.deepEqual(
      missing.map((error) => error.formulaName),
      ["Actual Discharge", "Theoretical Discharge", "Coefficient of Discharge", "Reynolds Number"],
    );
    assert.match(
      missing[1].message,
      /Theoretical Discharge has a display formula but no machine-readable expression/,
    );
    assert.equal(missing[1].userMessage, NOT_CONFIGURED_MESSAGE);
  });

  it("returns only definition errors, not student-input errors, when the entries are valid", () => {
    assert.ok(errors.every((error) => error.fieldKey === undefined));
  });

  it("keeps the calculation failed rather than producing partial results", () => {
    assert.equal(
      calculateExperiment({ experiment: normalizedVenturi(), ...venturiEntries }).ok,
      false,
    );
  });

  it("reports a keyed formula that lacks an expression, and its dependants, by key", () => {
    const experiment = withFormulas(normalizedPipeflow(), [
      { key: "Qtheoretical", name: "Theoretical Discharge", formula: "Qtheoretical = A₂√(2gh/(1-β⁴))" },
      { key: "Cd", name: "Coefficient of Discharge", expression: "Q_actual / Qtheoretical" },
    ]);

    const result = failed(calculateExperiment({ experiment, ...pipeflowEntries() }));

    assert.equal(result[0].code, "FORMULA_EXPRESSION_MISSING");
    assert.equal(result[0].formulaKey, "Qtheoretical");
    assert.ok(result.some((error) => error.code === "UNKNOWN_FORMULA_VARIABLE" && error.variable === "Q_actual"));
    assert.ok(result.some((error) => error.code === "FORMULA_DEPENDENCY_FAILED" && error.variable === "Qtheoretical"));
    assert.ok(!result.some((error) => error.variable === "A₂" || error.variable === "beta"));
  });
});

describe("calculateExperiment: choice fields", () => {
  const experiment: NormalizedExperiment = {
    ...normalizedPipeflow(),
    inputFields: [
      { key: "pipeType", label: "Pipe Type", kind: "choice", units: [], options: ["Square", "Rectangular"] },
      { key: "w", label: "Width", kind: "number", units: [], options: [] },
    ],
    runFields: [],
    formulas: [{ key: "y", name: "Y", expression: "w * 2" }],
    outputs: [],
    graphConfigs: [],
  };

  it("requires a valid selection and keeps choices out of the formula scope", () => {
    const result = succeeded(
      calculateExperiment({
        experiment,
        inputs: { pipeType: { value: "Square" }, w: { value: "3" } },
        runValues: {},
      }),
    );

    assert.equal("pipeType" in result.scope, false);
    assert.equal(result.calculated.y, 6);
  });

  it("rejects a missing or unknown selection", () => {
    const missing = failed(calculateExperiment({ experiment, inputs: { w: { value: "3" } }, runValues: {} }));
    const invalid = failed(
      calculateExperiment({
        experiment,
        inputs: { pipeType: { value: "Triangle" }, w: { value: "3" } },
        runValues: {},
      }),
    );

    assert.equal(missing[0].code, "INPUT_REQUIRED");
    assert.equal(invalid[0].code, "INVALID_CHOICE");
  });
});

describe("calculateExperiment: outputs and graphs when the definition is incomplete", () => {
  const simple: NormalizedExperiment = {
    ...normalizedPipeflow(),
    inputFields: [{ key: "a", label: "A", kind: "number", units: [], options: [] }],
    runFields: [],
    constants: [],
    formulas: [
      { key: "b", name: "Double A", expression: "a * 2" },
      { key: "c", name: "Triple A", expression: "a * 3" },
    ],
    outputs: [],
    graphConfigs: [],
  };
  const entries = { inputs: { a: { value: "4" } }, runValues: {} };

  it("falls back to every calculated formula when no outputs are defined, with a warning", () => {
    const result = succeeded(calculateExperiment({ experiment: simple, ...entries }));

    assert.deepEqual(result.results, { b: 8, c: 12 });
    assert.deepEqual(result.outputs.map((output) => output.label), ["Double A", "Triple A"]);
    assert.ok(result.warnings.some((warning) => warning.code === "NO_OUTPUTS_DEFINED"));
  });

  it("warns about outputs that reference an unknown variable", () => {
    const result = succeeded(
      calculateExperiment({
        experiment: { ...simple, outputs: [{ key: "b", label: "B" }, { key: "nope", label: "Nope" }] },
        ...entries,
      }),
    );

    assert.deepEqual(result.results, { b: 8 });
    assert.ok(result.warnings.some((warning) => warning.code === "OUTPUT_VARIABLE_UNAVAILABLE" && warning.variable === "nope"));
  });

  it("does not guess a graph mapping from display-only axes", () => {
    const result = succeeded(
      calculateExperiment({
        experiment: {
          ...simple,
          graphConfigs: [
            { title: "B vs C", xLabel: "Bee", yLabel: "Sea", scale: "linear", series: [], source: "graphConfigs" },
          ],
        },
        ...entries,
      }),
    );

    assert.deepEqual(result.graphData, []);

    const warning = result.warnings.find((item) => item.code === "GRAPH_CONFIG_INCOMPLETE");

    assert.ok(warning);
    assert.equal(warning.graphTitle, "B vs C");
    assert.equal(warning.severity, "warning");
  });

  it("builds a linear graph from any calculated variables", () => {
    const result = succeeded(
      calculateExperiment({
        experiment: {
          ...simple,
          graphConfigs: [
            { title: "C vs B", xKey: "b", yKey: "c", xLabel: "B", yLabel: "C", scale: "linear", series: [], source: "graphConfigs" },
          ],
        },
        ...entries,
      }),
    );

    assert.deepEqual(result.graphData[0].points, [{ x: 8, y: 12 }]);
  });

  it("warns when a graph references a variable that was never calculated", () => {
    const result = succeeded(
      calculateExperiment({
        experiment: {
          ...simple,
          graphConfigs: [
            { title: "Bad", xKey: "b", yKey: "missing", xLabel: "", yLabel: "", scale: "linear", series: [], source: "graphConfigs" },
          ],
        },
        ...entries,
      }),
    );

    assert.deepEqual(result.graphData, []);
    assert.ok(result.warnings.some((warning) => warning.code === "GRAPH_VARIABLE_UNAVAILABLE"));
  });

  it("does not plot a non-positive point on a log scale", () => {
    const result = succeeded(
      calculateExperiment({
        experiment: {
          ...simple,
          graphConfigs: [
            { title: "Log", xKey: "b", yKey: "c", xLabel: "", yLabel: "", scale: "log", series: [], source: "graph" },
          ],
        },
        inputs: { a: { value: "0" } },
        runValues: {},
      }),
    );

    assert.deepEqual(result.graphData, []);
    assert.ok(result.warnings.some((warning) => warning.code === "GRAPH_LOG_SCALE_INVALID"));
  });
});

describe("formatOutputValue", () => {
  it("uses the declared decimals, clamped to a sane range", () => {
    assert.equal(formatOutputValue(1.23456, 2), "1.23");
    assert.equal(formatOutputValue(125.4, 0), "125");
    assert.equal(formatOutputValue(1, -3), "1");
    assert.equal(formatOutputValue(2, 99).length, 22);
  });

  it("removes floating-point noise when no decimals are declared", () => {
    assert.equal(formatOutputValue(0.1 + 0.2), "0.3");
  });
});
