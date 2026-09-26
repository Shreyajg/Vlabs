import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NormalizedGraphConfig } from "../../../types/Experiment";
import { buildExperimentDetail } from "../../experimentDetail";
import { normalizeExperiment } from "../../normalizeExperiment";
import { computeChartLayout } from "../chartGeometry";
import { describeGraphState } from "../draftRuns";
import { generateGraphData, plottedPointCount } from "../graphData";

// A series of a multi-series graph may name its own x variable (for example the efficiency plotted against the suction
// head AND against the delivery head). A series without one is plotted against the graph's xKey, exactly as before.

const config = (extra: Partial<NormalizedGraphConfig> = {}): NormalizedGraphConfig => ({
  title: "Efficiency vs Head",
  type: "multi-line",
  xLabel: "Head",
  yLabel: "Efficiency (%)",
  scale: "linear",
  series: [],
  source: "graphConfigs",
  ...extra,
});

const runs = [
  { id: "r1", values: { hs: 2.7, hd: 4, eta: 1.9, q: 0.0002 } },
  { id: "r2", values: { hs: 3.4, hd: 5, eta: 3.0, q: 0.0003 } },
  { id: "r3", values: { hs: 4.1, hd: 6, eta: 4.2, q: 0.0004 } },
];

const twoHeads = config({
  series: [
    { label: "Suction Head", xKey: "hs", yKey: "eta" },
    { label: "Delivery Head", xKey: "hd", yKey: "eta" },
  ],
});

describe("per-series x: normalizing", () => {
  const normalize = (series: unknown) =>
    normalizeExperiment({ id: "x", subjectId: "s", data: { graphConfigs: [{ title: "G", type: "multi-line", series }] } }).graphConfigs[0].series;

  it("carries a series' own xKey through, with its label and yKey", () => {
    assert.deepEqual(normalize([{ label: "A", xKey: "hs", yKey: "eta" }]), [{ label: "A", yKey: "eta", xKey: "hs" }]);
  });

  it("leaves a series without an xKey exactly as it was (no xKey property at all)", () => {
    const [entry] = normalize([{ label: "A", yKey: "eta" }, { label: "display only" }]);

    assert.equal("xKey" in entry, false);
    assert.deepEqual(normalize([{ label: "display only" }]), [{ label: "display only" }]);
  });

  it("ignores an xKey that is not text", () => {
    assert.equal("xKey" in normalize([{ label: "A", yKey: "eta", xKey: 5 }])[0], false);
    assert.equal("xKey" in normalize([{ label: "A", yKey: "eta", xKey: "" }])[0], false);
  });
});

describe("per-series x: graph data", () => {
  it("each series is plotted against its OWN x variable, with the same y", () => {
    const generation = generateGraphData({ graphConfig: twoHeads, results: runs });

    assert.equal(generation.status, "ready");
    assert.deepEqual(generation.issues, []);

    const [suction, delivery] = generation.graph!.series!;

    assert.deepEqual(suction.points.map((point) => [point.x, point.y]), [[2.7, 1.9], [3.4, 3.0], [4.1, 4.2]]);
    assert.deepEqual(delivery.points.map((point) => [point.x, point.y]), [[4, 1.9], [5, 3.0], [6, 4.2]]);
    assert.deepEqual([suction.xKey, suction.yKey], ["hs", "eta"]);
    assert.deepEqual([delivery.xKey, delivery.yKey], ["hd", "eta"]);
    assert.deepEqual(generation.graph!.series!.map((entry) => entry.label), ["Suction Head", "Delivery Head"]);
  });

  it("works without any graph-level xKey (every line names its own)", () => {
    assert.equal(twoHeads.xKey, undefined);
    assert.equal(generateGraphData({ graphConfig: twoHeads, results: runs }).status, "ready");
  });

  it("the graph's own xKey is the first line's x, so the graph is still described consistently", () => {
    assert.equal(generateGraphData({ graphConfig: twoHeads, results: runs }).graph!.xKey, "hs");
  });

  it("a series without its own xKey falls back to the graph's xKey, and lines can be mixed", () => {
    const mixed = config({
      xKey: "q",
      series: [
        { label: "Efficiency", yKey: "eta" },
        { label: "Efficiency vs suction head", xKey: "hs", yKey: "eta" },
      ],
    });
    const generation = generateGraphData({ graphConfig: mixed, results: runs });
    const [byQ, byHs] = generation.graph!.series!;

    assert.deepEqual(byQ.points.map((point) => point.x), [0.0002, 0.0003, 0.0004]);
    assert.deepEqual(byHs.points.map((point) => point.x), [2.7, 3.4, 4.1]);
    assert.equal("xKey" in byQ, false, "a line that uses the graph's x carries no xKey of its own");
    assert.equal(byHs.xKey, "hs");
    assert.equal(generation.graph!.xKey, "q");
  });

  it("a graph whose series all share the graph's xKey has exactly the shape it always had", () => {
    const shared = config({ xKey: "q", series: [{ label: "A", yKey: "eta" }, { label: "B", yKey: "hs" }] });
    const graph = generateGraphData({ graphConfig: shared, results: runs }).graph!;

    assert.equal(graph.xKey, "q");
    assert.deepEqual(graph.series!.map((entry) => Object.keys(entry).sort()), [["label", "points", "yKey"], ["label", "points", "yKey"]]);
  });

  it("a single-series graph is untouched by the change", () => {
    const single = config({ xKey: "q", yKey: "eta", type: "line" });
    const graph = generateGraphData({ graphConfig: single, results: runs }).graph!;

    assert.equal("series" in graph, false);
    assert.deepEqual([graph.xKey, graph.yKey], ["q", "eta"]);
    assert.deepEqual(graph.points.map((point) => point.x), [0.0002, 0.0003, 0.0004]);
  });

  it("a line with no x variable at all makes the graph incomplete, and says the x key is missing", () => {
    const generation = generateGraphData({
      graphConfig: config({ series: [{ label: "Has x", xKey: "hs", yKey: "eta" }, { label: "No x", yKey: "eta" }] }),
      results: runs,
    });

    assert.equal(generation.status, "incomplete");
    assert.equal(generation.graph, null);
    assert.match(generation.issues[0].message, /has no xKey/);
  });

  it("a graph with neither an x nor any series still reports the missing xKey first", () => {
    const generation = generateGraphData({ graphConfig: config({ series: [] }), results: runs });

    assert.equal(generation.status, "incomplete");
    assert.match(generation.issues[0].message, /has no xKey/);
  });

  it("a graph with an x but no y still reports the missing yKey", () => {
    const generation = generateGraphData({ graphConfig: config({ xKey: "q", series: [{ label: "display only" }] }), results: runs });

    assert.equal(generation.status, "incomplete");
    assert.match(generation.issues[0].message, /has no yKey/);
  });

  it("a run that lacks one line's x is left out of that line only, and the other line keeps it", () => {
    const generation = generateGraphData({
      graphConfig: twoHeads,
      results: [{ id: "a", label: "Run 1", values: { hd: 4, eta: 1.9 } }, { id: "b", label: "Run 2", values: { hs: 3.4, hd: 5, eta: 3.0 } }],
    });
    const [suction, delivery] = generation.graph!.series!;

    assert.deepEqual(suction.points.map((point) => point.runId), ["b"]);
    assert.deepEqual(delivery.points.map((point) => point.runId), ["a", "b"]);
    assert.equal(generation.issues.length, 1);
    assert.equal(generation.issues[0].code, "GRAPH_VARIABLE_UNAVAILABLE");
    assert.match(generation.issues[0].message, /"hs"/);
  });

  it("non-finite values on either axis of a line are left out of that line", () => {
    const generation = generateGraphData({
      graphConfig: twoHeads,
      results: [
        { id: "ok", label: "Run 1", values: { hs: 2.7, hd: 4, eta: 1.9 } },
        { id: "badHs", label: "Run 2", values: { hs: Number.NaN, hd: 5, eta: 3.0 } },
        { id: "badEta", label: "Run 3", values: { hs: 4.1, hd: 6, eta: Number.POSITIVE_INFINITY } },
      ],
    });
    const [suction, delivery] = generation.graph!.series!;

    assert.deepEqual(suction.points.map((point) => point.runId), ["ok"]);
    assert.deepEqual(delivery.points.map((point) => point.runId), ["ok", "badHs"]);
    assert.ok(generation.graph!.series!.every((line) => line.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))));
  });

  it("the graph data is plain JSON (no undefined), so a saved run can store it in Firestore", () => {
    const graph = generateGraphData({ graphConfig: twoHeads, results: runs }).graph;

    assert.deepEqual(JSON.parse(JSON.stringify(graph)), graph);
  });

  it("the screen still draws a chart for it, counting the points of the longest line", () => {
    const generation = generateGraphData({ graphConfig: twoHeads, results: runs });

    assert.equal(plottedPointCount(generation.graph!), 3);
    assert.equal(describeGraphState(generation, 3).kind, "chart");
  });

  it("the chart is fitted to the x values of ALL lines together", () => {
    const graph = generateGraphData({ graphConfig: twoHeads, results: runs }).graph!;
    const layout = computeChartLayout({
      series: graph.series!.map((line) => ({ points: line.points })),
      points: [],
      xScale: "linear",
      yScale: "linear",
      width: 400,
      height: 300,
      padding: { top: 10, right: 10, bottom: 30, left: 40 },
    });

    assert.ok(layout);

    const xs = layout.series.flatMap((line) => line.points.map((point) => point.x));

    assert.ok(Math.min(...xs) >= 40 && Math.max(...xs) <= 390, "every point lies inside the plot area");
    assert.notDeepEqual(layout.series[0].points.map((point) => point.x), layout.series[1].points.map((point) => point.x), "different x variables give different positions");
  });

  it("works together with per-axis scales (a log x axis applies to every line)", () => {
    const generation = generateGraphData({
      graphConfig: { ...twoHeads, xScale: "log", yScale: "linear" },
      results: [{ id: "a", label: "Run 1", values: { hs: 0, hd: 4, eta: 1.9 } }, { id: "b", label: "Run 2", values: { hs: 3.4, hd: 5, eta: 3.0 } }],
    });
    const [suction, delivery] = generation.graph!.series!;

    assert.deepEqual(suction.points.map((point) => point.runId), ["b"]);
    assert.deepEqual(delivery.points.map((point) => point.runId), ["a", "b"]);
  });
});

describe("per-series x: the faculty detail view", () => {
  const detail = (graph: Record<string, unknown>) =>
    buildExperimentDetail(normalizeExperiment({ id: "x", subjectId: "s", data: { title: "X", graphConfigs: [graph] } })).graphs[0];

  it("states the linear scale for a graph whose lines all have an x variable, whether their own or the graph's", () => {
    assert.equal(detail({ title: "G", type: "multi-line", series: [{ label: "A", xKey: "hs", yKey: "eta" }, { label: "B", xKey: "hd", yKey: "eta" }] }).scale, "Linear");
    assert.equal(detail({ title: "G", type: "multi-line", xKey: "q", series: [{ label: "A", yKey: "eta" }] }).scale, "Linear");
  });

  it("does not claim a scale for a graph that cannot be mapped", () => {
    assert.equal(detail({ title: "G", type: "multi-line", series: [{ label: "A", yKey: "eta" }] }).scale, undefined);
    assert.equal(detail({ title: "G", type: "multi-line", series: [{ label: "display only" }] }).scale, undefined);
  });

  it("lists the plotted lines", () => {
    assert.deepEqual(detail({ title: "G", type: "multi-line", series: [{ label: "A", xKey: "hs", yKey: "eta" }, { label: "B", xKey: "hd", yKey: "eta" }] }).series, ["A", "B"]);
  });
});
