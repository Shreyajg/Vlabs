import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NormalizedGraphConfig } from "../../../types/Experiment";
import { normalizeExperiment } from "../../normalizeExperiment";
import { computeChartLayout } from "../chartGeometry";
import { describeGraphState } from "../draftRuns";
import { generateGraphData, plottedPointCount } from "../graphData";

// A graph with several series: each names its own yKey and is plotted against the same xKey.
// A graph with one series must keep exactly the shape it always had.

const config = (extra: Partial<NormalizedGraphConfig> = {}): NormalizedGraphConfig => ({
  title: "f vs NRe",
  xKey: "x",
  xLabel: "X",
  yLabel: "Y",
  scale: "linear",
  series: [
    { label: "First", yKey: "a" },
    { label: "Second", yKey: "b" },
  ],
  source: "graphConfigs",
  ...extra,
});

const runs = [
  { id: "r1", values: { x: 1, a: 10, b: 100 } },
  { id: "r2", values: { x: 2, a: 20, b: 200 } },
  { id: "r3", values: { x: 3, a: 30, b: 300 } },
];

describe("normalizing a multi-series graph", () => {
  it("keeps each series' yKey", () => {
    const experiment = normalizeExperiment({
      id: "x",
      subjectId: "s",
      data: { graphConfigs: [{ title: "G", xKey: "x", series: [{ label: "A", yKey: "a" }, { label: "B", yKey: "b" }] }] },
    });

    assert.deepEqual(experiment.graphConfigs[0].series, [{ label: "A", yKey: "a" }, { label: "B", yKey: "b" }]);
  });

  it("leaves label-only series exactly as they were (no yKey key at all)", () => {
    const experiment = normalizeExperiment({
      id: "x",
      subjectId: "s",
      data: { graphConfigs: [{ title: "G", series: [{ label: "A" }, { label: "B", yKey: "  " }] }] },
    });

    assert.deepEqual(experiment.graphConfigs[0].series, [{ label: "A" }, { label: "B" }]);
  });
});

describe("generateGraphData: several series", () => {
  const generation = generateGraphData({ graphConfig: config(), results: runs });

  it("builds one graph with one line per series, from all runs", () => {
    assert.equal(generation.status, "ready");
    assert.ok(generation.graph?.series);
    assert.deepEqual(
      generation.graph.series.map((line) => ({ label: line.label, yKey: line.yKey })),
      [{ label: "First", yKey: "a" }, { label: "Second", yKey: "b" }],
    );
    assert.deepEqual(generation.graph.series[0].points, [
      { x: 1, y: 10, runId: "r1" },
      { x: 2, y: 20, runId: "r2" },
      { x: 3, y: 30, runId: "r3" },
    ]);
    assert.deepEqual(generation.graph.series[1].points.map((point) => point.y), [100, 200, 300]);
  });

  it("keeps points / yKey pointing at the first series, so older readers still work", () => {
    assert.equal(generation.graph?.yKey, "a");
    assert.deepEqual(generation.graph?.points, generation.graph?.series?.[0].points);
  });

  it("shares one x for every series", () => {
    assert.deepEqual(
      generation.graph?.series?.map((line) => line.points.map((point) => point.x)),
      [[1, 2, 3], [1, 2, 3]],
    );
  });

  it("counts the points of the longest series", () => {
    assert.equal(plottedPointCount(generation.graph!), 3);
  });

  it("decides on the longest series, not the first: a short first series must not hide a chart the others can draw", () => {
    const uneven = generateGraphData({
      graphConfig: config(),
      results: [
        { id: "r1", values: { x: 1, a: 10, b: 100 } },
        { id: "r2", label: "Run 2", values: { x: 2, b: 200 } },
        { id: "r3", label: "Run 3", values: { x: 3, b: 300 } },
      ],
    });

    assert.equal(uneven.graph?.series?.[0].points.length, 1, "the first series has one point");
    assert.equal(uneven.graph?.series?.[1].points.length, 3, "the second has three");
    assert.equal(plottedPointCount(uneven.graph!), 3);
    assert.equal(describeGraphState(uneven, 3).kind, "chart");
  });

  it("skips a run for the series it cannot plot, without hiding it from the other series", () => {
    const partial = generateGraphData({
      graphConfig: config(),
      results: [runs[0], { id: "r2", label: "Run 2", values: { x: 2, a: 20 } }, runs[2]],
    });

    assert.deepEqual(partial.graph?.series?.[0].points.map((point) => point.runId), ["r1", "r2", "r3"]);
    assert.deepEqual(partial.graph?.series?.[1].points.map((point) => point.runId), ["r1", "r3"]);
    assert.equal(partial.issues.length, 1);
    assert.equal(partial.issues[0].code, "GRAPH_VARIABLE_UNAVAILABLE");
  });

  it("reports a problem with the shared x variable once, not once per series", () => {
    const noX = generateGraphData({
      graphConfig: config(),
      results: [{ id: "r1", values: { a: 1, b: 2 } }, { id: "r2", values: { x: 2, a: 1, b: 2 } }],
    });

    assert.equal(noX.issues.filter((issue) => issue.code === "GRAPH_VARIABLE_UNAVAILABLE").length, 1);
  });

  it("is empty when no series has a plottable point", () => {
    const none = generateGraphData({ graphConfig: config(), results: [{ values: { x: 1 } }] });

    assert.equal(none.status, "empty");
    assert.equal(none.graph, null);
  });

  it("applies a log scale per series", () => {
    const log = generateGraphData({
      graphConfig: config({ scale: "log" }),
      results: [{ id: "r1", values: { x: 1, a: 0, b: 5 } }, { id: "r2", values: { x: 2, a: 4, b: 6 } }],
    });

    assert.deepEqual(log.graph?.series?.[0].points.map((point) => point.runId), ["r2"]);
    assert.deepEqual(log.graph?.series?.[1].points.map((point) => point.runId), ["r1", "r2"]);
    assert.ok(log.issues.some((issue) => issue.code === "GRAPH_LOG_SCALE_INVALID"));
  });

  it("stays linear: zero and negative values are plotted", () => {
    const linear = generateGraphData({
      graphConfig: config(),
      results: [{ id: "r1", values: { x: 0, a: 0, b: -5 } }, { id: "r2", values: { x: 1, a: 1, b: -6 } }],
    });

    assert.equal(linear.graph?.series?.[0].points.length, 2);
    assert.equal(linear.graph?.series?.[1].points.length, 2);
    assert.equal(linear.issues.length, 0);
  });

  it("is incomplete without an xKey, and when no series names a yKey", () => {
    assert.equal(generateGraphData({ graphConfig: config({ xKey: undefined }), results: runs }).status, "incomplete");
    assert.equal(
      generateGraphData({ graphConfig: config({ series: [{ label: "A" }, { label: "B" }] }), results: runs }).status,
      "incomplete",
    );
  });
});

describe("generateGraphData: one series is exactly as before", () => {
  const single = config({ yKey: "a", yLabel: "Y", series: [] });
  const generation = generateGraphData({ graphConfig: single, results: runs });

  it("has no `series` field at all", () => {
    assert.equal(generation.status, "ready");
    assert.equal("series" in (generation.graph ?? {}), false);
  });

  it("has the same shape and points it always had", () => {
    assert.deepEqual(generation.graph, {
      configIndex: 0,
      title: "f vs NRe",
      xKey: "x",
      yKey: "a",
      xLabel: "X",
      yLabel: "Y",
      scale: "linear",
      points: [
        { x: 1, y: 10, runId: "r1" },
        { x: 2, y: 20, runId: "r2" },
        { x: 3, y: 30, runId: "r3" },
      ],
    });
  });

  it("label-only series entries do not change a single-series graph", () => {
    const labelled = generateGraphData({ graphConfig: config({ yKey: "a", series: [{ label: "Only a label" }] }), results: runs });

    assert.deepEqual(labelled.graph, generation.graph);
  });

  it("counts its points the usual way", () => {
    assert.equal(plottedPointCount(generation.graph!), 3);
  });
});

describe("describeGraphState with several series", () => {
  it("draws a chart when a series has at least two points", () => {
    const generation = generateGraphData({ graphConfig: config(), results: runs });

    assert.equal(describeGraphState(generation, 3).kind, "chart");
  });

  it("asks for another run when only one point can be plotted", () => {
    const generation = generateGraphData({ graphConfig: config(), results: [runs[0]] });

    assert.equal(describeGraphState(generation, 1).kind, "message");
  });
});

// ---------------------------------------------------------------------------------------------
describe("computeChartLayout: several series on shared axes", () => {
  const size = { width: 400, height: 300, padding: { top: 10, right: 10, bottom: 30, left: 40 } };
  const first = [{ x: 0, y: 1 }, { x: 10, y: 2 }, { x: 20, y: 3 }];
  const second = [{ x: 0, y: 100 }, { x: 10, y: 200 }, { x: 20, y: 300 }];
  const chart = computeChartLayout({ points: [], series: [{ points: first }, { points: second }], xScale: "linear", yScale: "linear", ...size });

  it("lays out every series", () => {
    assert.ok(chart);
    assert.equal(chart.series.length, 2);
    assert.deepEqual(chart.series.map((line) => line.points.length), [3, 3]);
  });

  it("fits the axes to all series together, so the smaller one sits at the bottom", () => {
    assert.ok(chart);
    const bottom = chart.plot.top + chart.plot.height;

    assert.ok(chart.series[0].points.every((point) => point.y > bottom - chart.plot.height * 0.2));
    assert.ok(chart.series[1].points[2].y < chart.series[0].points[2].y);
    assert.ok(chart.yTicks[chart.yTicks.length - 1].value >= 300, "the y axis reaches the largest series");
  });

  it("keeps every drawn point inside the plot", () => {
    assert.ok(chart);

    for (const line of chart.series) {
      for (const point of line.points) {
        assert.ok(point.x >= chart.plot.left - 1e-9 && point.x <= chart.plot.left + chart.plot.width + 1e-9);
        assert.ok(point.y >= chart.plot.top - 1e-9 && point.y <= chart.plot.top + chart.plot.height + 1e-9);
      }
    }
  });

  it("orders each series by x, so a line can join its points", () => {
    const shuffled = computeChartLayout({
      points: [],
      series: [{ points: [first[2], first[0], first[1]] }, { points: second }],
      xScale: "linear",
      yScale: "linear",
      ...size,
    });

    assert.ok(shuffled);
    assert.deepEqual(shuffled.series[0].points, chart?.series[0].points);
  });

  it("counts dropped points across all series", () => {
    const withBad = computeChartLayout({
      points: [],
      series: [{ points: [...first, { x: NaN, y: 1 }] }, { points: [...second, { x: 1, y: Infinity }] }],
      xScale: "linear",
      yScale: "linear",
      ...size,
    });

    assert.equal(withBad?.dropped, 2);
    assert.deepEqual(withBad?.series.map((line) => line.points.length), [3, 3]);
  });

  it("exposes the first series as `points`, as before", () => {
    assert.deepEqual(chart?.points, chart?.series[0].points);
  });

  it("a single `points` array lays out exactly as one series does", () => {
    const viaPoints = computeChartLayout({ points: first, xScale: "linear", yScale: "linear", ...size });
    const viaSeries = computeChartLayout({ points: [], series: [{ points: first }], xScale: "linear", yScale: "linear", ...size });

    assert.deepEqual(viaPoints, viaSeries);
    assert.equal(viaPoints?.series.length, 1);
  });

  it("returns nothing when no series has a drawable point", () => {
    assert.equal(computeChartLayout({ points: [], series: [{ points: [] }, { points: [] }], xScale: "linear", yScale: "linear", ...size }), null);
  });
});
