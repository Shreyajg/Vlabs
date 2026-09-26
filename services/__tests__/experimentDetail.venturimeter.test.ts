import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { experiments } from "../../constants/experiments";
import type { NormalizedExperiment, RawExperimentData } from "../../types/Experiment";
import { buildExperimentDetail } from "../experimentDetail";
import { normalizeExperiment } from "../normalizeExperiment";

// The Faculty Experiment Detail screen shows the real Venturimeter definition: the eleven formulas with their
// human-readable text, the rules that guard them, the eight results and the semi-log graph.

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

describe("faculty experiment detail: Venturimeter", () => {
  const detail = detailOf("venturimeter");

  it("shows the six setup inputs and the four run inputs", () => {
    assert.deepEqual(
      detail.inputs.map((field) => field.label),
      ["Pipe Diameter", "Throat Diameter", "Collecting Tank Area", "Manometer Fluid Density", "Flowing Fluid Density", "Dynamic Viscosity"],
    );
    assert.deepEqual(
      detail.runInputs.map((field) => field.label),
      ["LHS Manometer Reading", "RHS Manometer Reading", "Water Collected Height", "Collection Time"],
    );
  });

  it("shows which units are converted for the calculation", () => {
    const byLabel = Object.fromEntries([...detail.inputs, ...detail.runInputs].map((field) => [field.label, field]));

    assert.deepEqual(byLabel["Pipe Diameter"].details, ["Default unit: mm", "Units: m, cm, mm", "Converted to m for the calculation"]);
    assert.deepEqual(byLabel["LHS Manometer Reading"].details, ["Default unit: mm", "Units: mm, cm, m", "Converted to m for the calculation"]);
    assert.equal(byLabel["Water Collected Height"].details.some((line) => line.startsWith("Converted")), false);
  });

  it("shows the eleven formulas in stored order, in the manual's notation", () => {
    assert.deepEqual(
      detail.formulas.map((formula) => formula.formula),
      [
        "A_pipe = πD_pipe²/4",
        "A_throat = πD_throat²/4",
        "β = D_throat/D_pipe",
        "Rm = LHS − RHS",
        "H = [(ρm − ρf)/ρf] Rm",
        "V_throat = √(2gH/(1 − β⁴))",
        "Q_th = V_throat × A_throat",
        "Q_act = (A_tank × h_tank)/time",
        "V_act = Q_act/A_pipe",
        "Cd = Q_act/Q_th",
        "N_Re = D_pipe V_act ρf/μ",
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

    assert.deepEqual(rules["Fluid Head"], [
      "Flowing Fluid Density must be greater than zero.",
      "The manometer fluid must be denser than the flowing fluid.",
      "The manometer reading Rm (LHS − RHS) is negative, so the head is invalid. Enter the readings so that LHS is not smaller than RHS.",
    ]);
    assert.equal(rules["Manometer Reading"], undefined);
    assert.equal(rules["Theoretical Discharge"], undefined);
    assert.equal("rules" in detail.formulas[3], false, "no empty rules list");
  });

  it("shows the gravity constant and the eight results", () => {
    assert.deepEqual(detail.constants.map(({ label, value }) => ({ label, value })), [{ label: "Acceleration due to Gravity (g)", value: "9.81 m/s²" }]);
    assert.deepEqual(detail.outputs.map((output) => output.label), ["Rm", "H", "QAct", "QThe", "VThe", "VAct", "Cd", "NRe"]);
  });

  it("shows an ordinary graph and a semi-log graph", () => {
    assert.deepEqual(
      detail.graphs.map(({ title, type, xLabel, yLabel, scale }) => ({ title, type, xLabel, yLabel, scale })),
      [
        { title: "Actual Discharge vs Manometer Reading", type: "Line", xLabel: "Manometer Reading (Rm)", yLabel: "Actual Discharge (Qact)", scale: "Linear" },
        { title: "Coefficient of Discharge vs Reynolds Number", type: "Line", xLabel: "Reynolds Number (NRe)", yLabel: "Coefficient of Discharge (Cd)", scale: "Semi-log (x log, y linear)" },
      ],
    );
  });
});

describe("faculty experiment detail: the other experiments are unaffected by rules and per-axis scales", () => {
  it("no other seed experiment shows a Rule line or a semi-log scale (only the ones migrated to formula checks do)", () => {
    // The experiments whose definitions use formula checks: Venturimeter, then Orifice Meter, then Centrifugal Pump.
    const usesChecks = ["venturimeter", "orificemeter", "centrifugalpump"];

    for (const entry of experiments) {
      if (usesChecks.includes(entry.id)) continue;

      const detail = detailOf(entry.id);

      assert.equal(detail.formulas.some((formula) => "rules" in formula), false, entry.id);
      assert.equal(detail.graphs.some((graph) => graph.scale?.startsWith("Semi-log")), false, entry.id);
    }
  });

  it("Non-Circular still shows its single log graph", () => {
    assert.equal(detailOf("noncircular").graphs[0].scale, "Log");
  });
});

describe("faculty experiment detail screen: renders the rules", () => {
  const screen = readFileSync(join(process.cwd(), "app", "(faculty)", "experiment", "[id].tsx"), "utf8");

  it("draws every formula.rules entry as a 'Rule:' line", () => {
    assert.match(screen, /formula\.rules/);
    assert.match(screen, /Rule: /);
  });
});
