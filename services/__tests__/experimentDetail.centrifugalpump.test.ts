import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { experiments } from "../../constants/experiments";
import type { NormalizedExperiment, RawExperimentData } from "../../types/Experiment";
import { buildExperimentDetail } from "../experimentDetail";
import { normalizeExperiment } from "../normalizeExperiment";

// The Faculty Experiment Detail screen shows the real Centrifugal Pump definition: the eight formulas in the manual's
// notation, the rules that guard them, the seven results and the two multi-series graphs.

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

describe("faculty experiment detail: Centrifugal Pump", () => {
  const detail = detailOf("centrifugalpump");

  it("shows the two setup inputs and the six run inputs, with the manual's defaults and the conversions", () => {
    assert.deepEqual(detail.inputs.map((field) => field.label), ["Collecting Tank Area", "Energy Meter Constant"]);
    assert.deepEqual(
      detail.runInputs.map((field) => field.label),
      ["Pump Speed", "Suction Head", "Delivery Head", "Time for 5 Energy Meter Revolutions", "Collection Tank Water Height", "Collection Time"],
    );

    const byLabel = Object.fromEntries([...detail.inputs, ...detail.runInputs].map((field) => [field.label, field]));

    assert.deepEqual(byLabel["Collecting Tank Area"].details, ["Default value: 0.125", "Default unit: m²", "Units: m², cm²"]);
    assert.deepEqual(byLabel["Energy Meter Constant"].details, ["Default value: 750", "Default unit: rev/kWh", "Units: rev/kWh"]);
    assert.deepEqual(byLabel["Collection Tank Water Height"].details, ["Default unit: cm", "Units: cm, m, mm", "Converted to m for the calculation"]);
    assert.deepEqual(byLabel["Suction Head"].details, ["Default unit: mm Hg", "Units: mm Hg, cm Hg"]);
  });

  it("shows the eight formulas in stored order, in the manual's notation", () => {
    assert.deepEqual(
      detail.formulas.map((formula) => formula.formula),
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

  it("never shows the machine-readable expression", () => {
    for (const formula of detail.formulas) {
      assert.equal(formula.formula.includes("*"), false, formula.formula);
      assert.equal(formula.formula.includes("sqrt"), false, formula.formula);
      assert.equal(formula.formula.includes("^"), false, formula.formula);
    }
  });

  it("shows the rules that guard the formulas, and only for formulas that have them", () => {
    const rules = Object.fromEntries(detail.formulas.map((formula) => [formula.name, formula.rules]));

    assert.deepEqual(rules["Discharge"], [
      "Collecting Tank Area must be greater than zero.",
      "Collection Tank Water Height must not be negative.",
      "Collection Time must be greater than zero.",
    ]);
    assert.deepEqual(rules["Suction Head (m of water)"], ["Suction Head must not be negative."]);
    assert.equal(rules["Total Head"], undefined);
    assert.equal(rules["Output Horse Power"], undefined);
  });

  it("shows the three constants and the seven results", () => {
    assert.deepEqual(
      detail.constants.map(({ label, value }) => ({ label, value })),
      [
        { label: "Acceleration due to Gravity (g)", value: "9.81 m/s²" },
        { label: "Density of Water (ρ)", value: "1000 kg/m³" },
        { label: "Energy Meter Revolutions (k)", value: "5 revolutions" },
      ],
    );
    assert.deepEqual(
      detail.outputs.map((output) => output.label),
      ["Total Head", "Discharge", "Input Horse Power", "Output Horse Power", "Pump Efficiency", "Suction Head (m of water)", "Delivery Head (m of water)"],
    );
  });

  it("shows both multi-series graphs with the lines they plot", () => {
    assert.deepEqual(
      detail.graphs.map(({ title, type, xLabel, yLabel, scale, series }) => ({ title, type, xLabel, yLabel, scale, series })),
      [
        {
          title: "Pump Characteristics",
          type: "Multi-line",
          xLabel: "Discharge (Q)",
          yLabel: "Head / Power / Efficiency",
          scale: "Linear",
          series: ["Efficiency (%)", "Input Power (IHP)", "Total Head (HT)"],
        },
        {
          title: "Efficiency vs Head",
          type: "Multi-line",
          xLabel: "Head (m of water)",
          yLabel: "Efficiency (%)",
          scale: "Linear",
          series: ["Suction Head", "Delivery Head"],
        },
      ],
    );
  });
});
