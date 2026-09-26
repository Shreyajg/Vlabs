import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildExperimentDraft,
  EMPTY_EXPERIMENT_FORM,
  experimentToFormValues,
  slugifyExperimentId,
  type ExperimentFormValues,
  type ListItem,
} from "../experimentAuthoring";
import { normalizeExperiment } from "../normalizeExperiment";
import type { RawExperimentData } from "../../types/Experiment";

// Pure module: nothing here touches Firestore.

function row(fields: Record<string, string>): ListItem {
  return { id: `row-${Math.random()}`, ...fields };
}

function values(overrides: Partial<ExperimentFormValues> = {}): ExperimentFormValues {
  return { ...EMPTY_EXPERIMENT_FORM, title: "Test Experiment", subjectId: "fluid-mechanics", ...overrides };
}

describe("slugifyExperimentId", () => {
  it("matches the existing convention: lowercase, no separators", () => {
    assert.equal(slugifyExperimentId("Flow Through Circular Pipes"), "flowthroughcircularpipes");
    assert.equal(slugifyExperimentId("Centrifugal Pump"), "centrifugalpump");
    assert.equal(slugifyExperimentId("  Orifice-Meter!! "), "orificemeter");
  });
});

describe("buildExperimentDraft: basics", () => {
  it("rejects a missing title and subject", () => {
    const { draft, errors } = buildExperimentDraft(values({ title: "", subjectId: "" }));

    assert.equal(draft, null);
    assert.ok(errors.some((message) => message.includes("title")));
    assert.ok(errors.some((message) => message.includes("subject")));
  });

  it("accepts a minimal, calculation-free experiment (descriptive fields only)", () => {
    const { draft, errors } = buildExperimentDraft(
      values({ aim: "Learn something.\nLearn something else.", procedure: ["Step one.", ""] }),
    );

    assert.deepEqual(errors, []);
    assert.ok(draft);
    assert.deepEqual(draft.aim, ["Learn something.", "Learn something else."]);
    assert.deepEqual(draft.procedure, ["Step one."]);
    assert.deepEqual(draft.constants, []);
    assert.deepEqual(draft.formulas, []);
  });

  it("silently drops a blank row instead of erroring", () => {
    const { draft, errors } = buildExperimentDraft(
      values({ constants: [row({ key: "", name: "", value: "", unit: "", symbol: "" })] }),
    );

    assert.deepEqual(errors, []);
    assert.deepEqual(draft?.constants, []);
  });
});

describe("buildExperimentDraft: constants", () => {
  it("requires a variable key and a numeric value", () => {
    const noKey = buildExperimentDraft(
      values({ constants: [row({ key: "", name: "Gravity", value: "9.81", unit: "m/s²", symbol: "" })] }),
    );
    assert.equal(noKey.draft, null);
    assert.ok(noKey.errors[0].includes("variable key"));

    const noValue = buildExperimentDraft(
      values({ constants: [row({ key: "gravity", name: "Gravity", value: "", unit: "", symbol: "" })] }),
    );
    assert.equal(noValue.draft, null);
    assert.ok(noValue.errors[0].includes("numeric"));
  });

  it("builds a well-formed constant that would actually enter the calc scope", () => {
    const { draft, errors } = buildExperimentDraft(
      values({ constants: [row({ key: "gravity", name: "Gravity", value: "9.81", unit: "m/s²", symbol: "g" })] }),
    );

    assert.deepEqual(errors, []);
    assert.deepEqual(draft?.constants, [
      { key: "gravity", name: "Gravity", symbol: "g", value: 9.81, unit: "m/s²" },
    ]);
  });
});

describe("buildExperimentDraft: formulas reuse the real formula parser", () => {
  it("rejects a formula with no key or no expression", () => {
    const noKey = buildExperimentDraft(
      values({ formulas: [row({ key: "", name: "Re", formula: "", expression: "a * b" })] }),
    );
    assert.equal(noKey.draft, null);

    const noExpression = buildExperimentDraft(
      values({ formulas: [row({ key: "Re", name: "Re", formula: "", expression: "" })] }),
    );
    assert.equal(noExpression.draft, null);
  });

  it("rejects a formula whose expression does not parse, using the real evaluator", () => {
    const { draft, errors } = buildExperimentDraft(
      values({ formulas: [row({ key: "x", name: "Bad", formula: "", expression: "a +* b" })] }),
    );

    assert.equal(draft, null);
    assert.ok(errors[0].includes("Formula 1"));
  });

  it("rejects an unsupported function the real evaluator does not allow", () => {
    const { draft } = buildExperimentDraft(
      values({ formulas: [row({ key: "x", name: "Bad", formula: "", expression: "eval(a)" })] }),
    );

    assert.equal(draft, null);
  });

  it("accepts a real formula shape and keeps both the display formula and the expression separate", () => {
    const { draft, errors } = buildExperimentDraft(
      values({
        formulas: [
          row({ key: "NRe", name: "Reynolds Number", formula: "Re = ρVD/μ", expression: "density * V * pipeDiameter / viscosity" }),
        ],
      }),
    );

    assert.deepEqual(errors, []);
    assert.deepEqual(draft?.formulas, [
      {
        key: "NRe",
        name: "Reynolds Number",
        formula: "Re = ρVD/μ",
        expression: "density * V * pipeDiameter / viscosity",
      },
    ]);
  });
});

describe("buildExperimentDraft: duplicate variable keys", () => {
  it("rejects the same key used by a constant and a formula", () => {
    const { draft, errors } = buildExperimentDraft(
      values({
        constants: [row({ key: "Q", name: "Q", value: "1", unit: "", symbol: "" })],
        formulas: [row({ key: "Q", name: "Discharge", formula: "", expression: "area * height / time" })],
      }),
    );

    assert.equal(draft, null);
    assert.ok(errors.some((message) => message.includes("already used")));
  });
});

describe("buildExperimentDraft: graphs must have something to plot", () => {
  it("rejects a graph with a title but no xKey/yKey and no preserved series", () => {
    const { draft, errors } = buildExperimentDraft(
      values({ graphs: [row({ title: "f vs Re", xKey: "", yKey: "", xAxis: "Re", yAxis: "f", scale: "log" })] }),
    );

    assert.equal(draft, null);
    assert.ok(errors[0].includes("X key and a Y key"));
  });

  it("accepts a graph with both xKey and yKey", () => {
    const { draft, errors } = buildExperimentDraft(
      values({
        graphs: [row({ title: "f vs Re", xKey: "NRe", yKey: "f", xAxis: "Re", yAxis: "f", scale: "log" })],
      }),
    );

    assert.deepEqual(errors, []);
    assert.deepEqual(draft?.graphConfigs, [
      { title: "f vs Re", xKey: "NRe", yKey: "f", xAxis: "Re", yAxis: "f", scale: "log" },
    ]);
  });

  it("preserves an existing multi-series graph it cannot re-author, as long as the row is not blanked out", () => {
    const item = row({
      title: "Pump Characteristics",
      xKey: "Q",
      yKey: "",
      xAxis: "Discharge",
      yAxis: "Head",
      scale: "linear",
    });
    item._series = JSON.stringify([{ label: "Efficiency", yKey: "eta" }]);

    const { draft, errors } = buildExperimentDraft(values({ graphs: [item] }));

    assert.deepEqual(errors, []);
    assert.deepEqual(draft?.graphConfigs[0].series, [{ label: "Efficiency", yKey: "eta" }]);
  });
});

describe("experimentToFormValues: real-document round trip", () => {
  const pipeflowData: RawExperimentData = {
    title: "Flow Through Circular Pipes",
    aim: "To plot the friction factor chart.",
    theory: "Some theory.",
    procedure: ["Step 1.", "Step 2."],
    constants: [{ key: "gravity", name: "Gravity", symbol: "g", value: 9.81, unit: "m/s²" }],
    inputFields: [
      { key: "pipeDiameter", label: "Pipe Diameter", type: "number", defaultUnit: "m", units: ["m", "cm", "mm"] },
    ],
    runInputs: [{ key: "lhs", label: "LHS" }],
    formulas: [
      { key: "NRe", name: "Reynolds Number", formula: "Re = ρVD/μ", expression: "density * V * pipeDiameter / viscosity" },
    ],
    outputs: [{ key: "NRe", label: "Re", decimals: 0 }],
    graph: { title: "f vs NRe", xKey: "NRe", yKey: "f", xLabel: "N_Re", yLabel: "f", scale: "log" },
    isPublished: true,
    createdBy: "admin",
  };

  const experiment = normalizeExperiment({ id: "pipeflow", subjectId: "fluid-mechanics", data: pipeflowData });
  const form = experimentToFormValues(experiment);

  it("populates every real field, including the ones the mock form used to lose (keys, run fields, outputs, xKey/yKey)", () => {
    assert.equal(form.title, "Flow Through Circular Pipes");
    assert.equal(form.subjectId, "fluid-mechanics");
    assert.equal(form.constants[0].key, "gravity");
    assert.equal(form.inputs[0].key, "pipeDiameter");
    assert.equal(form.runFields[0].key, "lhs");
    assert.equal(form.formulas[0].key, "NRe");
    assert.equal(form.formulas[0].formula, "Re = ρVD/μ");
    assert.equal(form.formulas[0].expression, "density * V * pipeDiameter / viscosity");
    assert.equal(form.outputs[0].key, "NRe");
    assert.equal(form.graphs[0].xKey, "NRe");
    assert.equal(form.graphs[0].yKey, "f");
  });

  it("round-trips back through buildExperimentDraft into the same calculable structure", () => {
    const { draft, errors } = buildExperimentDraft(form);

    assert.deepEqual(errors, []);
    assert.ok(draft);
    assert.deepEqual(draft.constants, experiment.constants.map((c) => ({
      key: c.key, name: c.name, ...(c.symbol ? { symbol: c.symbol } : {}), value: c.value, ...(c.unit ? { unit: c.unit } : {}),
    })));
    assert.equal(draft.formulas[0].expression, "density * V * pipeDiameter / viscosity");
    assert.equal(draft.graphConfigs[0].xKey, "NRe");
  });
});
