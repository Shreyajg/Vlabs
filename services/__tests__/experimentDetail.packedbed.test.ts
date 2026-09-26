import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { experiments } from "../../constants/experiments";
import type { NormalizedExperiment, RawExperimentData } from "../../types/Experiment";
import { buildExperimentDetail } from "../experimentDetail";
import { normalizeExperiment } from "../normalizeExperiment";

// The Faculty Experiment Detail screen shows the real Packed Bed definition, including the run input that
// is optional, the units that are converted, and the two series of its graph.

function detailOf(id: string) {
  const entry = experiments.find((item) => item.id === id);

  assert.ok(entry, `${id} must exist in the seed data`);

  const experiment: NormalizedExperiment = normalizeExperiment({
    id,
    subjectId: "fluid-mechanics",
    data: entry as unknown as RawExperimentData,
  });

  return buildExperimentDetail(experiment);
}

describe("faculty experiment detail: Packed Bed", () => {
  const detail = detailOf("packedbed");

  it("shows all six setup inputs and all four run inputs", () => {
    assert.deepEqual(
      detail.inputs.map((field) => field.label),
      ["Column Diameter", "Column Length", "Packing Particle Diameter", "Fluid Density", "Manometer Fluid Density", "Dynamic Viscosity"],
    );
    assert.deepEqual(
      detail.runInputs.map((field) => field.label),
      ["LHS Manometer Reading", "RHS Manometer Reading", "Manometer Difference (Optional)", "Flow Rate"],
    );
  });

  it("marks the Manometer Difference as optional, and nothing else", () => {
    const optional = [...detail.inputs, ...detail.runInputs].filter((field) => field.details.includes("Optional"));

    assert.deepEqual(optional.map((field) => field.label), ["Manometer Difference (Optional)"]);
  });

  it("shows which units are converted for the calculation", () => {
    const byLabel = Object.fromEntries(detail.runInputs.map((field) => [field.label, field]));

    assert.deepEqual(byLabel["LHS Manometer Reading"].details, [
      "Default unit: cm",
      "Units: cm, mm, m",
      "Converted to m for the calculation",
    ]);
    assert.deepEqual(byLabel["Flow Rate"].details, [
      "Default unit: LPM",
      "Units: LPM, LPH, m³/s",
      "Converted to m³/s for the calculation",
    ]);
    assert.deepEqual(byLabel["Manometer Difference (Optional)"].details, [
      "Optional",
      "Default unit: m",
      "Units: m, cm, mm",
    ]);
  });

  it("shows all seven formulas in stored order with their human-readable text", () => {
    assert.deepEqual(
      detail.formulas.map((formula) => formula.formula),
      [
        "Rm = LHS − RHS",
        "A = πD²/4",
        "Vo = Q/A",
        "Re = DpVoρ/μ",
        "fPE = 150(1-ε)/Re + 1.75",
        "ΔP/L = Rmg(ρm-ρ)/L",
        "fPT = (ΔP/L)(1/ρ)[ε³/(1-ε)²][Dp/Vo²]φs",
      ],
    );
  });

  it("shows the three constants, including the shape factor", () => {
    assert.deepEqual(
      detail.constants.map(({ label, value }) => ({ label, value })),
      [
        { label: "Acceleration due to Gravity (g)", value: "9.81 m/s²" },
        { label: "Void Fraction (ε)", value: "0.4 -" },
        { label: "Shape Factor (Raschig rings) (φs)", value: "1 -" },
      ],
    );
  });

  it("shows the seven results", () => {
    assert.deepEqual(detail.outputs.map((output) => output.label), ["Rm", "ΔP/L", "QAct", "Vo", "NRe", "fPE", "fPT"]);
  });

  it("shows the graph with both series on a linear scale", () => {
    assert.equal(detail.graphs.length, 1);
    assert.deepEqual(
      { ...detail.graphs[0], key: undefined },
      {
        key: undefined,
        title: "Friction Factor vs Reynolds Number",
        type: "Line",
        xLabel: "Reynolds Number",
        yLabel: "Friction Factor",
        scale: "Linear",
        series: ["Experimental (fPE)", "Theoretical (fPT)"],
      },
    );
  });
});

describe("faculty experiment detail: other experiments are unaffected", () => {
  it("Non-Circular still shows its single log graph, with no series line", () => {
    const [graph] = detailOf("noncircular").graphs;

    assert.equal(graph.scale, "Log");
    assert.equal("series" in graph, false);
  });

  it("Non-Circular's run inputs show no 'Optional' line", () => {
    for (const field of detailOf("noncircular").runInputs) assert.equal(field.details.includes("Optional"), false);
  });

  it("an experiment whose graph has only label-only series shows no series line", () => {
    const [graph] = detailOf("venturimeter").graphs;

    assert.equal("series" in graph, false);
  });
});
