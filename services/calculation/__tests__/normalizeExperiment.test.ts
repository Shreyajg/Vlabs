import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeExperiment } from "../../normalizeExperiment";
import { normalizedPipeflow, normalizedVenturi } from "./fixtures";

describe("normalizeExperiment: pipeflow (machine-readable document)", () => {
  const experiment = normalizedPipeflow();

  it("keeps metadata and turns aim into an array", () => {
    assert.equal(experiment.id, "pipeflow");
    assert.equal(experiment.subjectId, "fluid-mechanics");
    assert.equal(experiment.title, "Flow Through Circular Pipes");
    assert.deepEqual(experiment.aim, [
      "To plot the friction factor chart (Moody's chart) for flow through circular pipes.",
    ]);
    assert.equal(experiment.isPublished, true);
    assert.equal(experiment.route, "/experiment/pipeflow-run");
  });

  it("reads run fields from runInputs", () => {
    assert.deepEqual(
      experiment.runFields.map((field) => field.key),
      ["lhs", "rhs", "height", "time"],
    );
    assert.deepEqual(experiment.runFields[0].units, []);
  });

  it("preserves the difference between expression and formula", () => {
    const discharge = experiment.formulas[0];

    assert.equal(discharge.key, "Q");
    assert.equal(discharge.name, "Discharge");
    assert.equal(discharge.expression, "area * height / time");
    assert.equal(discharge.formula, "Q = V/t");
  });

  it("keeps formulas in their stored order", () => {
    assert.deepEqual(
      experiment.formulas.map((formula) => formula.key),
      ["Q", "V", "NRe", "Rm", "deltaP", "f"],
    );
  });

  it("keeps constants with key, name, symbol, unit and value", () => {
    assert.deepEqual(experiment.constants[0], {
      key: "gravity",
      name: "Acceleration due to Gravity",
      symbol: "g",
      unit: "m/s²",
      value: 9.81,
    });
  });

  it("normalizes the singular legacy graph into graphConfigs", () => {
    assert.equal(experiment.graphConfigs.length, 1);
    assert.deepEqual(experiment.graphConfigs[0], {
      title: "f vs NRe",
      type: undefined,
      xKey: "NRe",
      yKey: "f",
      xLabel: "N_Re",
      yLabel: "f",
      scale: "log",
      series: [],
      source: "graph",
    });
  });

  it("reads outputs with decimals", () => {
    assert.deepEqual(
      experiment.outputs.map((output) => [output.key, output.decimals]),
      [["deltaP", 2], ["Q", 6], ["V", 4], ["NRe", 0], ["f", 4]],
    );
  });

  it("maps defaultValue and defaultUnit on input fields", () => {
    const density = experiment.inputFields.find((field) => field.key === "density");

    assert.equal(density?.defaultValue, 1000);
    assert.equal(density?.defaultUnit, "kg/m³");
    assert.deepEqual(density?.units, ["kg/m³", "g/cm³"]);
    assert.equal(density?.kind, "number");
  });

  it("splits the malformed comma-joined unit list and records a warning", () => {
    const area = experiment.inputFields.find((field) => field.key === "area");

    assert.deepEqual(area?.units, ["m²", "cm²"]);
    assert.ok(experiment.warnings.some((warning) => warning.includes("split")));
  });
});

describe("normalizeExperiment: venturimeter (display-only formulas)", () => {
  const experiment = normalizedVenturi();

  it("does not invent an expression or key for display-only formulas", () => {
    assert.equal(experiment.formulas.length, 4);

    for (const formula of experiment.formulas) {
      assert.equal(formula.expression, undefined);
      assert.equal(formula.key, undefined);
      assert.ok(formula.formula);
    }

    assert.equal(experiment.formulas[1].formula, "Qtheoretical = A₂√(2gh/(1-β⁴))");
  });

  it("reads runFields directly", () => {
    assert.deepEqual(
      experiment.runFields.map((field) => field.key),
      ["lhs", "rhs", "height", "time"],
    );
    assert.equal(experiment.runFields[0].defaultUnit, "mm");
  });

  it("keeps constants that have no key, without giving them one", () => {
    assert.equal(experiment.constants.length, 1);
    assert.equal(experiment.constants[0].key, undefined);
    assert.equal(experiment.constants[0].symbol, "g");
    assert.equal(experiment.constants[0].value, 9.81);
  });

  it("maps display-only graph axes to labels and leaves the keys undefined", () => {
    const graph = experiment.graphConfigs[0];

    assert.equal(graph.xLabel, "Manometer Reading");
    assert.equal(graph.yLabel, "Actual Discharge");
    assert.equal(graph.xKey, undefined);
    assert.equal(graph.yKey, undefined);
    assert.equal(graph.source, "graphConfigs");
  });

  it("has no outputs", () => {
    assert.deepEqual(experiment.outputs, []);
  });
});

describe("normalizeExperiment: robustness", () => {
  const base = { id: "x", subjectId: "s" };

  it("prefers runFields when both runFields and runInputs exist", () => {
    const experiment = normalizeExperiment({
      ...base,
      data: {
        runFields: [{ key: "a", label: "A" }],
        runInputs: [{ key: "b", label: "B" }],
      },
    });

    assert.deepEqual(experiment.runFields.map((field) => field.key), ["a"]);
  });

  it("falls back to runInputs when runFields is empty", () => {
    const experiment = normalizeExperiment({
      ...base,
      data: { runFields: [], runInputs: [{ key: "b", label: "B" }] },
    });

    assert.deepEqual(experiment.runFields.map((field) => field.key), ["b"]);
  });

  it("skips fields without a key and duplicate keys, with warnings", () => {
    const experiment = normalizeExperiment({
      ...base,
      data: {
        inputFields: [
          { label: "No key" },
          { key: "a", label: "A" },
          { key: "a", label: "A again" },
        ],
      },
    });

    assert.deepEqual(experiment.inputFields.map((field) => field.label), ["A"]);
    assert.equal(experiment.warnings.length, 2);
  });

  it("recognises dropdown fields and their options", () => {
    const experiment = normalizeExperiment({
      ...base,
      data: {
        inputFields: [
          { key: "pipeType", label: "Pipe Type", type: "dropdown", options: ["Square", "Rectangular"], defaultValue: "Square" },
        ],
      },
    });

    const field = experiment.inputFields[0];

    assert.equal(field.kind, "choice");
    assert.deepEqual(field.options, ["Square", "Rectangular"]);
    assert.equal(field.defaultValue, "Square");
  });

  it("accepts legacy field names (default, unit)", () => {
    const experiment = normalizeExperiment({
      ...base,
      data: { inputFields: [{ key: "a", label: "A", unit: "m", default: "5" }] },
    });

    assert.equal(experiment.inputFields[0].defaultUnit, "m");
    assert.equal(experiment.inputFields[0].defaultValue, 5);
  });

  it("accepts a string aim and drops constants without a numeric value", () => {
    const experiment = normalizeExperiment({
      ...base,
      data: { aim: "One aim", constants: [{ key: "k", name: "K", value: "not a number" }] },
    });

    assert.deepEqual(experiment.aim, ["One aim"]);
    assert.deepEqual(experiment.constants, []);
    assert.equal(experiment.warnings.length, 1);
  });

  it("keeps Firestore timestamps and ignores anything else", () => {
    const timestamp = { toDate: () => new Date(0), seconds: 0, nanoseconds: 0 };
    const experiment = normalizeExperiment({
      ...base,
      data: { createdAt: timestamp, updatedAt: "yesterday" },
    });

    assert.equal(experiment.createdAt, timestamp as never);
    assert.equal(experiment.updatedAt, null);
  });

  it("never throws on empty or hostile data", () => {
    assert.doesNotThrow(() => normalizeExperiment({ ...base, data: {} }));
    assert.doesNotThrow(() =>
      normalizeExperiment({
        ...base,
        data: { formulas: [null, 5, "x"], constants: "no", inputFields: { key: "a" }, outputs: [[]] },
      }),
    );

    const empty = normalizeExperiment({ ...base, data: {} });

    assert.equal(empty.title, "x");
    assert.deepEqual(empty.formulas, []);
    assert.equal(empty.isPublished, false);
  });
});
