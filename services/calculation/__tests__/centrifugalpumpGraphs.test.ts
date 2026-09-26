import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { experiments } from "../../../constants/experiments";
import type { QuantityInputs } from "../../../types/Calculation";
import type { RawExperimentData } from "../../../types/Experiment";
import { normalizeExperiment } from "../../normalizeExperiment";
import { buildRunGraphs, calculateAllDraftRuns, createDraftRun, describeGraphState } from "../draftRuns";
import { GRAPH_UNAVAILABLE_MESSAGE } from "../issues";

// Regression: on the Run screen the second Centrifugal Pump graph, "Efficiency vs Head", showed
// "This graph is not configured yet." while "Pump Characteristics" drew correctly.
//
// Root cause: that graph deliberately has NO top-level xKey; each of its two series names its own (hsWaterHead and
// hdWaterHead). Code from before per-series xKey support drops series[].xKey when it normalizes a document and requires a
// top-level xKey, so it classifies this graph as "incomplete", which is exactly what "not configured yet" means.
//
// Here the graph configs are written out exactly as Firestore holds them (this is the live document's shape and key order),
// and are taken through the same path the Run screen uses: normalizeExperiment -> Calculate All -> buildRunGraphs ->
// describeGraphState.

const seed = experiments.find((entry) => entry.id === "centrifugalpump") as unknown as RawExperimentData;

/** The graphConfigs of the live centrifugalpump document, verbatim (Firestore returns map keys in this order). */
const LIVE_GRAPH_CONFIGS = [
  {
    title: "Pump Characteristics",
    type: "multi-line",
    xAxis: "Discharge (Q)",
    yAxis: "Head / Power / Efficiency",
    xKey: "Q",
    scale: "linear",
    series: [
      { label: "Efficiency (%)", yKey: "eta" },
      { label: "Input Power (IHP)", yKey: "IHPActual" },
      { label: "Total Head (HT)", yKey: "HT" },
    ],
  },
  {
    xAxis: "Head (m of water)",
    scale: "linear",
    series: [
      { label: "Suction Head", yKey: "eta", xKey: "hsWaterHead" },
      { label: "Delivery Head", xKey: "hdWaterHead", yKey: "eta" },
    ],
    yAxis: "Efficiency (%)",
    title: "Efficiency vs Head",
    type: "multi-line",
  },
];

function pumpFromDocument(graphConfigs: unknown = LIVE_GRAPH_CONFIGS) {
  return normalizeExperiment({
    id: "centrifugalpump",
    subjectId: "fluid-mechanics",
    data: { ...seed, graphConfigs } as RawExperimentData,
  });
}

const setup: QuantityInputs = { tankArea: { value: "0.125", unit: "m²" }, energyMeterConstant: { value: "750", unit: "rev/kWh" } };

function observation(hs: number, hd: number, energyTime: number, heightCm: number, flowTime: number): QuantityInputs {
  return {
    rpm: { value: "1500", unit: "rpm" },
    hs: { value: String(hs), unit: "mm Hg" },
    hd: { value: String(hd), unit: "kg/cm²" },
    energyTime: { value: String(energyTime), unit: "s" },
    tankHeight: { value: String(heightCm), unit: "cm" },
    flowTime: { value: String(flowTime), unit: "s" },
  };
}

// The three manually verified runs.
const ROWS: [number, number, number, number, number][] = [
  [200, 0.4, 20, 5, 30],
  [250, 0.5, 18, 7, 30],
  [300, 0.6, 16, 9, 30],
];

function screenFor(experiment: ReturnType<typeof pumpFromDocument>, rows = ROWS) {
  const outcome = calculateAllDraftRuns({
    experiment,
    setup,
    runs: rows.map((row, index) => ({ ...createDraftRun(`r${index + 1}`, experiment.runFields), runValues: observation(...row) })),
  });
  const generations = buildRunGraphs(experiment, outcome.runs);
  const calculated = outcome.runs.filter((run) => run.status === "calculated").length;

  return { outcome, generations, views: generations.map((generation) => describeGraphState(generation, calculated)) };
}

const closeTo = (actual: number, expected: number, tolerance: number) => Math.abs(actual - expected) <= tolerance;

describe("centrifugal pump graphs: the Run screen shows both graphs", () => {
  const experiment = pumpFromDocument();
  const { outcome, generations, views } = screenFor(experiment);

  it("all three runs calculate, with no setup or definition problems", () => {
    assert.deepEqual(outcome.runs.map((run) => run.status), ["calculated", "calculated", "calculated"]);
    assert.deepEqual(outcome.setupIssues, []);
    assert.deepEqual(outcome.definitionIssues, []);
  });

  it("the document normalizes with no data-quality notes", () => {
    assert.deepEqual(experiment.warnings, []);
  });

  it("the two graphs keep their titles and both are configured (there are exactly two)", () => {
    assert.deepEqual(experiment.graphConfigs.map((graph) => graph.title), ["Pump Characteristics", "Efficiency vs Head"]);
    assert.deepEqual(generations.map((generation) => generation.status), ["ready", "ready"]);
  });

  it("neither graph shows 'This graph is not configured yet.': both are drawn as charts", () => {
    for (const view of views) {
      const shown = view.kind === "message" ? view.message : "(a chart)";

      assert.notEqual(shown, GRAPH_UNAVAILABLE_MESSAGE);
      assert.equal(view.kind, "chart");
    }

    for (const generation of generations) assert.deepEqual(generation.issues, []);
  });
});

describe("centrifugal pump graphs: Efficiency vs Head", () => {
  const experiment = pumpFromDocument();
  const [, graphTwo] = experiment.graphConfigs;
  const { generations } = screenFor(experiment);
  const graph = generations[1].graph!;

  it("normalization keeps BOTH series, each with its own xKey and the same yKey (eta)", () => {
    assert.equal(graphTwo.series.length, 2);
    assert.deepEqual(graphTwo.series, [
      { label: "Suction Head", yKey: "eta", xKey: "hsWaterHead" },
      { label: "Delivery Head", yKey: "eta", xKey: "hdWaterHead" },
    ]);
    assert.equal(graphTwo.xKey, undefined, "there is deliberately no top-level xKey");
  });

  it("the graph has two series, keeping their separate xKeys, plotting eta", () => {
    assert.equal(graph.series?.length, 2);
    assert.deepEqual(graph.series?.map((line) => [line.label, line.xKey, line.yKey]), [
      ["Suction Head", "hsWaterHead", "eta"],
      ["Delivery Head", "hdWaterHead", "eta"],
    ]);
  });

  it("the suction-head series has 3 points: x = [2.7158, 3.3947, 4.0737]", () => {
    const [suction] = graph.series!;

    assert.equal(suction.points.length, 3);
    [2.7158, 3.3947, 4.0737].forEach((expected, index) => assert.ok(closeTo(suction.points[index].x, expected, 5e-5), `x[${index}] = ${suction.points[index].x}`));
  });

  it("the delivery-head series has 3 points: x = [4, 5, 6]", () => {
    const [, delivery] = graph.series!;

    assert.equal(delivery.points.length, 3);
    [4, 5, 6].forEach((expected, index) => assert.ok(closeTo(delivery.points[index].x, expected, 1e-9), `x[${index}] = ${delivery.points[index].x}`));
  });

  it("both series plot the same efficiency: y = [1.93, 3.04, 4.17]", () => {
    for (const line of graph.series!) {
      [1.93, 3.04, 4.17].forEach((expected, index) => assert.ok(closeTo(line.points[index].y, expected, 5e-3), `${line.label} y[${index}] = ${line.points[index].y}`));
    }

    assert.deepEqual(graph.series![0].points.map((point) => point.y), graph.series![1].points.map((point) => point.y));
  });

  it("every point is a finite number, and each carries its run", () => {
    for (const line of graph.series!) {
      assert.deepEqual(line.points.map((point) => point.runId), ["r1", "r2", "r3"]);
      for (const point of line.points) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    }
  });
});

describe("centrifugal pump graphs: Pump Characteristics is unchanged", () => {
  const { generations } = screenFor(pumpFromDocument());
  const graph = generations[0].graph!;

  it("still has its three series against the top-level x = Q, with 3 points each", () => {
    assert.equal(graph.xKey, "Q");
    assert.deepEqual(graph.series?.map((line) => [line.label, line.yKey]), [
      ["Efficiency (%)", "eta"],
      ["Input Power (IHP)", "IHPActual"],
      ["Total Head (HT)", "HT"],
    ]);

    for (const line of graph.series!) {
      assert.equal(line.points.length, 3, line.label);
      assert.equal("xKey" in line, false, "these series use the graph's x");
    }
  });

  it("its points are the verified results (Q, eta, IHP, HT)", () => {
    const [eta, ihp, head] = graph.series!;
    const qs = [0.000208, 0.000292, 0.000375];

    qs.forEach((q, index) => assert.ok(closeTo(eta.points[index].x, q, 5e-7), `Q[${index}]`));
    [1.93, 3.04, 4.17].forEach((value, index) => assert.ok(closeTo(eta.points[index].y, value, 5e-3), `eta[${index}]`));
    [0.9651, 1.0724, 1.2064].forEach((value, index) => assert.ok(closeTo(ihp.points[index].y, value, 5e-5), `IHP[${index}]`));
    [6.7158, 8.3947, 10.0737].forEach((value, index) => assert.ok(closeTo(head.points[index].y, value, 5e-5), `HT[${index}]`));
  });
});

describe("centrifugal pump graphs: what the bug looked like, and what keeps other graphs working", () => {
  it("a graph with per-series x and no top-level x is 'not configured' ONLY when the series xKeys are lost (the old-client symptom)", () => {
    const withoutSeriesX = pumpFromDocument([
      LIVE_GRAPH_CONFIGS[0],
      { ...LIVE_GRAPH_CONFIGS[1], series: [{ label: "Suction Head", yKey: "eta" }, { label: "Delivery Head", yKey: "eta" }] },
    ]);
    const { views, generations } = screenFor(withoutSeriesX);

    assert.equal(generations[1].status, "incomplete");
    assert.deepEqual(views[1], { kind: "message", message: GRAPH_UNAVAILABLE_MESSAGE, notes: [] });
    assert.equal(views[0].kind, "chart", "the first graph is unaffected, exactly as reported");
  });

  it("a top-level xKey still works, and a series without its own xKey falls back to it", () => {
    const shared = pumpFromDocument([
      {
        title: "Mixed",
        type: "multi-line",
        xAxis: "x",
        yAxis: "y",
        xKey: "Q",
        series: [{ label: "Efficiency vs Q", yKey: "eta" }, { label: "Efficiency vs suction head", xKey: "hsWaterHead", yKey: "eta" }],
      },
    ]);
    const { generations } = screenFor(shared);
    const [byQ, byHead] = generations[0].graph!.series!;

    assert.equal(generations[0].status, "ready");
    assert.ok(closeTo(byQ.points[0].x, 0.000208, 5e-7), "falls back to the graph's Q");
    assert.ok(closeTo(byHead.points[0].x, 2.7158, 5e-5), "uses its own suction head");
  });

  it("the graph configs in the seed (what the live document holds) are exactly the ones this test feeds in", () => {
    const seeded = normalizeExperiment({ id: "centrifugalpump", subjectId: "fluid-mechanics", data: seed }).graphConfigs;
    const fromDocument = pumpFromDocument().graphConfigs;

    assert.deepEqual(fromDocument, seeded);
  });
});
