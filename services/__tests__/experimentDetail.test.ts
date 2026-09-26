import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { experiments } from "../../constants/experiments";
import type { NormalizedExperiment, RawExperimentData } from "../../types/Experiment";
import { buildExperimentDetail, subjectIdFromName, subjectNameFromId } from "../experimentDetail";
import { normalizeExperiment } from "../normalizeExperiment";

// The Faculty Experiment Detail screen renders buildExperimentDetail(experiment), where `experiment` is
// the normalized Firestore document (the same one the Student screen loads). The noncircular seed entry
// is the definition that is stored in Firestore.

function normalizedSeed(id: string): NormalizedExperiment {
  const entry = experiments.find((item) => item.id === id);

  assert.ok(entry, `${id} must exist in the seed data`);

  return normalizeExperiment({ id, subjectId: "fluid-mechanics", data: entry as unknown as RawExperimentData });
}

function minimal(data: RawExperimentData): NormalizedExperiment {
  return normalizeExperiment({ id: "x", subjectId: "fluid-mechanics", data });
}

describe("faculty experiment detail: Non-Circular shows the whole definition", () => {
  const detail = buildExperimentDetail(normalizedSeed("noncircular"));

  it("shows all 7 setup inputs, in stored order (not just width and breadth)", () => {
    assert.deepEqual(
      detail.inputs.map((field) => field.label),
      [
        "Pipe Type",
        "Pipe Width",
        "Pipe Breadth",
        "Pipe Length",
        "Collecting Tank Area",
        "Fluid Density",
        "Dynamic Viscosity",
      ],
    );
  });

  it("shows each input's type, default value, default unit, units and dropdown options", () => {
    const byLabel = Object.fromEntries(detail.inputs.map((field) => [field.label, field]));

    assert.equal(byLabel["Pipe Type"].kind, "Dropdown");
    assert.deepEqual(byLabel["Pipe Type"].details, ["Options: Square, Rectangular", "Default value: Square"]);

    assert.equal(byLabel["Pipe Width"].kind, "Number");
    assert.deepEqual(byLabel["Pipe Width"].details, ["Default unit: m", "Units: m, cm, mm"]);
    assert.deepEqual(byLabel["Pipe Length"].details, ["Default unit: m", "Units: m, cm"]);
    assert.deepEqual(byLabel["Collecting Tank Area"].details, ["Default unit: m²", "Units: m², cm², mm²"]);
    assert.deepEqual(byLabel["Fluid Density"].details, [
      "Default value: 1000",
      "Default unit: kg/m³",
      "Units: kg/m³, g/cm³",
    ]);
    assert.deepEqual(byLabel["Dynamic Viscosity"].details, [
      "Default value: 0.001",
      "Default unit: Pa·s",
      "Units: Pa·s, cP",
    ]);
  });

  it("shows all 8 formulas, in stored order (not just De)", () => {
    assert.deepEqual(
      detail.formulas.map((formula) => formula.name),
      [
        "Equivalent Diameter",
        "Manometer Reading",
        "Pressure Difference",
        "Discharge",
        "Pipe Cross-Sectional Area",
        "Velocity",
        "Reynolds Number",
        "Friction Factor",
      ],
    );
  });

  it("shows the human-readable formula string, never the machine-readable expression", () => {
    assert.deepEqual(
      detail.formulas.map((formula) => formula.formula),
      [
        "De = 2wb/(w+b)",
        "Rm = LHS − RHS",
        "ΔP = Rm(ρm−ρ)g",
        "Q = Ah/t",
        "A = πDe²/4",
        "V = Q/A",
        "Re = DeVρ/μ",
        "f = ΔPDe/(2ρLV²)",
      ],
    );

    for (const formula of detail.formulas) {
      assert.doesNotMatch(formula.formula, /\*/, `${formula.name} must not show its expression`);
    }
  });

  it("shows both constants with their symbol and unit", () => {
    assert.deepEqual(
      detail.constants.map(({ label, value }) => ({ label, value })),
      [
        { label: "Acceleration due to Gravity (g)", value: "9.81 m/s²" },
        { label: "Manometer Fluid Density (ρm)", value: "13600 kg/m³" },
      ],
    );
  });

  it("shows the per-run inputs as definitions (LHS, RHS, Height, Time), never entered values", () => {
    assert.deepEqual(
      detail.runInputs.map((field) => field.label),
      ["LHS", "RHS", "Height", "Time"],
    );
    assert.deepEqual(detail.runInputs[0].details, [
      "Default unit: mm",
      "Units: mm, cm, m",
      "Converted to m for the calculation",
    ]);
    assert.deepEqual(detail.runInputs[2].details, ["Default unit: m", "Units: m, cm, mm"]);
    assert.deepEqual(detail.runInputs[3].details, ["Default unit: s", "Units: s"]);
  });

  it("shows all 6 results with their decimals", () => {
    assert.deepEqual(
      detail.outputs.map((output) => output.label),
      ["Rm", "ΔP", "Q", "V", "f", "NRe"],
    );
    assert.deepEqual(detail.outputs[0].details, ["Decimals: 4"]);
    assert.deepEqual(detail.outputs[5].details, ["Decimals: 0"]);
  });

  it("shows the complete graph configuration", () => {
    assert.equal(detail.graphs.length, 1);
    assert.deepEqual(
      { ...detail.graphs[0], key: undefined },
      {
        key: undefined,
        title: "Friction Factor vs Reynolds Number",
        type: "Line",
        xLabel: "Reynolds Number (log)",
        yLabel: "Friction Factor (log)",
        scale: "Log",
      },
    );
  });

  it("shows the published status, aim, theory and procedure", () => {
    assert.equal(detail.published, true);
    assert.equal(detail.title, "Flow Through Non-Circular Pipes");
    assert.equal(detail.aim.length, 1);
    assert.match(detail.theory, /non-circular pipe is simply a square or rectangular pipe/i);
    assert.equal(detail.procedure.length, 6);
  });

  it("gives every row a unique key", () => {
    for (const rows of [detail.inputs, detail.runInputs, detail.formulas, detail.constants, detail.outputs, detail.graphs]) {
      const keys = rows.map((row) => row.key);

      assert.equal(new Set(keys).size, keys.length);
    }
  });
});

describe("faculty experiment detail: nothing is dropped, for any experiment", () => {
  for (const entry of experiments) {
    it(`${entry.id}: every input, run input, constant, formula, output and graph becomes a row`, () => {
      const experiment = normalizedSeed(entry.id);
      const detail = buildExperimentDetail(experiment);

      assert.equal(detail.inputs.length, experiment.inputFields.length);
      assert.equal(detail.runInputs.length, experiment.runFields.length);
      assert.equal(detail.constants.length, experiment.constants.length);
      assert.equal(detail.formulas.length, experiment.formulas.length);
      assert.equal(detail.outputs.length, experiment.outputs.length);
      assert.equal(detail.graphs.length, experiment.graphConfigs.length);

      // Same order as stored.
      assert.deepEqual(detail.inputs.map((row) => row.label), experiment.inputFields.map((field) => field.label));
      assert.deepEqual(detail.formulas.map((row) => row.name), experiment.formulas.map((formula) => formula.name));
      assert.equal(detail.published, experiment.isPublished);
    });

    it(`${entry.id}: every formula shows its human-readable text`, () => {
      const detail = buildExperimentDetail(normalizedSeed(entry.id));

      for (const formula of detail.formulas) {
        assert.ok(formula.formula.length > 0, `${formula.name} has no text to show`);
      }
    });
  }
});

describe("faculty experiment detail: incomplete or older documents", () => {
  it("shows empty sections, not a crash, for a document with nothing in it", () => {
    const detail = buildExperimentDetail(minimal({}));

    assert.deepEqual(
      [detail.inputs, detail.runInputs, detail.constants, detail.formulas, detail.outputs, detail.graphs].map((rows) => rows.length),
      [0, 0, 0, 0, 0, 0],
    );
    assert.equal(detail.published, false);
  });

  it("falls back to the expression for a formula that has no display text, and to nothing if it has neither", () => {
    const detail = buildExperimentDetail(
      minimal({ formulas: [{ name: "Only expression", expression: "a * b" }, { name: "Neither" }] }),
    );

    assert.deepEqual(detail.formulas.map((formula) => formula.formula), ["a * b", ""]);
  });

  it("only claims a graph scale the document actually states", () => {
    const detail = buildExperimentDetail(
      minimal({
        graphConfigs: [
          { title: "Labels only", xAxis: "X", yAxis: "Y", type: "line" },
          { title: "Linear and mapped", xKey: "a", yKey: "b", scale: "linear" },
          { title: "Log", xKey: "a", yKey: "b", scale: "log" },
        ],
      }),
    );

    assert.deepEqual(detail.graphs.map((graph) => graph.scale), [undefined, "Linear", "Log"]);
  });

  it("describes a dropdown with no default and a constant with no symbol or key", () => {
    const detail = buildExperimentDetail(
      minimal({
        inputFields: [{ key: "mode", label: "Mode", type: "dropdown", options: ["A", "B"] }],
        constants: [{ name: "Pi", value: 3.14 }],
      }),
    );

    assert.deepEqual(detail.inputs[0].details, ["Options: A, B"]);
    assert.deepEqual(detail.constants.map(({ label, value }) => ({ label, value })), [{ label: "Pi", value: "3.14" }]);
  });

  it("keeps rows distinct when labels repeat", () => {
    const detail = buildExperimentDetail(
      minimal({ inputFields: [{ key: "a", label: "Same" }, { key: "b", label: "Same" }] }),
    );

    assert.equal(new Set(detail.inputs.map((row) => row.key)).size, 2);
  });
});

describe("faculty experiment detail: subject ids", () => {
  it("turns a subject name into its Firestore id and back", () => {
    for (const [name, id] of [
      ["Fluid Mechanics", "fluid-mechanics"],
      ["Heat Transfer", "heat-transfer"],
      ["Reaction Engineering", "reaction-engineering"],
    ]) {
      assert.equal(subjectIdFromName(name), id);
      assert.equal(subjectNameFromId(id), name);
    }

    assert.equal(subjectIdFromName("  Mass   Transfer! "), "mass-transfer");
  });
});

describe("faculty experiment detail: the screen reads real data (guard against going back to a mock)", () => {
  const screen = readFileSync(join(process.cwd(), "app", "(faculty)", "experiment", "[id].tsx"), "utf8");

  it("loads the experiment through the shared service, like the Student screen", () => {
    assert.match(screen, /getExperiment\(/);
    assert.match(screen, /buildExperimentDetail\(/);
  });

  it("does not import mock experiment data", () => {
    assert.doesNotMatch(screen, /@\/mocks/);
    assert.doesNotMatch(screen, /MOCK_EXPERIMENTS/);
  });

  it("does not offer the Student run experience", () => {
    assert.doesNotMatch(screen, /Start Experiment/);
    assert.doesNotMatch(screen, /pathname: '\/run\//);
  });

  it("keeps Edit Experiment and Publish / Unpublish", () => {
    assert.match(screen, /Edit Experiment/);
    assert.match(screen, /'Unpublish' : 'Publish'/);
  });
});
