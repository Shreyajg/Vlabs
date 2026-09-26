import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { experiments } from "../../constants/experiments";
import type { NormalizedExperiment, RawExperimentData } from "../../types/Experiment";
import { buildExperimentDetail } from "../experimentDetail";
import { normalizeExperiment } from "../normalizeExperiment";

// The Faculty Experiment Detail screen shows the real Orifice Meter definition: the eleven formulas in the
// specification's notation, the rules that guard them, the eight results and the semi-log graph.

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

describe("faculty experiment detail: Orifice Meter", () => {
  const detail = detailOf("orificemeter");

  it("shows the six setup inputs and the four run inputs, with their defaults and conversions", () => {
    assert.deepEqual(
      detail.inputs.map((field) => field.label),
      ["Pipe Diameter", "Orifice Diameter", "Collecting Tank Area", "Manometer Fluid Density", "Flowing Fluid Density", "Dynamic Viscosity"],
    );
    assert.deepEqual(
      detail.runInputs.map((field) => field.label),
      ["LHS Manometer Reading", "RHS Manometer Reading", "Water Collected Height", "Collection Time"],
    );

    const byLabel = Object.fromEntries([...detail.inputs, ...detail.runInputs].map((field) => [field.label, field]));

    assert.deepEqual(byLabel["Pipe Diameter"].details, ["Default unit: mm", "Units: m, cm, mm", "Converted to m for the calculation"]);
    assert.deepEqual(byLabel["Manometer Fluid Density"].details, ["Default value: 13600", "Default unit: kg/m³", "Units: kg/m³, g/cm³"]);
    assert.deepEqual(byLabel["Dynamic Viscosity"].details, ["Default value: 0.001", "Default unit: Pa·s", "Units: Pa·s, kg/m·s"]);
    assert.deepEqual(byLabel["LHS Manometer Reading"].details, ["Default unit: mm", "Units: mm, cm, m", "Converted to m for the calculation"]);
  });

  it("shows the eleven formulas in stored order, in the specification's notation", () => {
    assert.deepEqual(
      detail.formulas.map((formula) => formula.formula),
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

  it("never shows the machine-readable expression", () => {
    for (const formula of detail.formulas) {
      assert.equal(formula.formula.includes("*"), false, formula.formula);
      assert.equal(formula.formula.includes("sqrt"), false, formula.formula);
      assert.equal(formula.formula.includes("^"), false, formula.formula);
    }
  });

  it("shows the rules that guard the formulas, and only for formulas that have them", () => {
    const rules = Object.fromEntries(detail.formulas.map((formula) => [formula.name, formula.rules]));

    assert.deepEqual(rules["Diameter Ratio"], [
      "Orifice Diameter must be greater than zero.",
      "The orifice diameter must be smaller than the pipe diameter.",
    ]);
    assert.deepEqual(rules["Pipe Area"], ["Pipe Diameter must be greater than zero."]);
    assert.equal(rules["Manometer Reading"], undefined);
    assert.equal(rules["Theoretical Discharge"], undefined);
    assert.equal(rules["Orifice Area"], undefined);
    assert.equal("rules" in detail.formulas[0], false, "no empty rules list");
  });

  it("shows the gravity constant and the eight results", () => {
    assert.deepEqual(detail.constants.map(({ label, value }) => ({ label, value })), [{ label: "Acceleration due to Gravity (g)", value: "9.81 m/s²" }]);
    assert.deepEqual(detail.outputs.map((output) => output.label), ["Rm", "H", "QAct", "QThe", "VOrifice", "VAct", "Cd", "NRe"]);
  });

  it("shows an ordinary graph and a semi-log graph", () => {
    assert.deepEqual(
      detail.graphs.map(({ title, type, xLabel, yLabel, scale }) => ({ title, type, xLabel, yLabel, scale })),
      [
        { title: "Actual Discharge vs Manometer Reading", type: "Line", xLabel: "Manometer Reading (Rm)", yLabel: "Actual Discharge (QAct)", scale: "Linear" },
        { title: "Coefficient of Discharge vs Reynolds Number", type: "Line", xLabel: "Reynolds Number (NRe)", yLabel: "Coefficient of Discharge (Cd)", scale: "Semi-log (x log, y linear)" },
      ],
    );
  });
});
