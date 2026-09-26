import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { NormalizedGraphConfig } from "../../../types/Experiment";
import { normalizeExperiment } from "../../normalizeExperiment";
import { computeChartLayout } from "../chartGeometry";
import { describeGraphState } from "../draftRuns";
import { generateGraphData } from "../graphData";

// A graph may give each axis its own scale (a semi-log graph is x logarithmic, y linear). `scale` keeps its old
// meaning (both axes) and graphs that use it alone must not change at all.

const config = (extra: Partial<NormalizedGraphConfig> = {}): NormalizedGraphConfig => ({
  title: "Cd vs NRe",
  xKey: "x",
  yKey: "y",
  xLabel: "X",
  yLabel: "Y",
  scale: "linear",
  series: [],
  source: "graphConfigs",
  ...extra,
});

const runs = [
  { id: "r1", values: { x: 1000, y: 0.9 } },
  { id: "r2", values: { x: 10000, y: 0.95 } },
  { id: "r3", values: { x: 100000, y: 0.97 } },
];

describe("per-axis scales: normalizing", () => {
  const normalize = (graph: Record<string, unknown>) =>
    normalizeExperiment({ id: "x", subjectId: "s", data: { graphConfigs: [{ title: "G", xKey: "x", yKey: "y", ...graph }] } }).graphConfigs[0];

  it("carries xScale and yScale through, in any letter case", () => {
    const graph = normalize({ xScale: "LOG", yScale: "Linear" });

    assert.deepEqual([graph.scale, graph.xScale, graph.yScale], ["linear", "log", "linear"]);
  });

  it("ignores a value it does not understand", () => {
    const graph = normalize({ xScale: "sqrt", yScale: 3 });

    assert.equal("xScale" in graph, false);
    assert.equal("yScale" in graph, false);
  });

  it("leaves graphs that use `scale` alone exactly as they were (no per-axis keys at all)", () => {
    for (const scale of [undefined, "linear", "log"]) {
      const graph = normalize({ scale });

      assert.equal("xScale" in graph, false);
      assert.equal("yScale" in graph, false);
      assert.equal(graph.scale, scale === "log" ? "log" : "linear");
    }
  });
});

describe("per-axis scales: graph data", () => {
  it("a semi-log graph (x log, y linear) keeps the per-axis scales, and `scale` stays a safe fallback", () => {
    const generation = generateGraphData({ graphConfig: config({ xScale: "log", yScale: "linear" }), results: runs });

    assert.equal(generation.status, "ready");
    assert.deepEqual([generation.graph?.scale, generation.graph?.xScale, generation.graph?.yScale], ["linear", "log", "linear"]);
    assert.equal(generation.graph?.points.length, 3);
  });

  it("only the LOG axis needs positive values: a zero or negative y is kept on a semi-log graph", () => {
    const generation = generateGraphData({
      graphConfig: config({ xScale: "log", yScale: "linear" }),
      results: [{ id: "a", values: { x: 1000, y: 0 } }, { id: "b", values: { x: 2000, y: -0.5 } }, { id: "c", values: { x: 3000, y: 0.9 } }],
    });

    assert.equal(generation.graph?.points.length, 3);
    assert.deepEqual(generation.issues, []);
  });

  it("a non-positive x on the log axis is dropped, with a message that names the axis", () => {
    const generation = generateGraphData({
      graphConfig: config({ xScale: "log", yScale: "linear" }),
      results: [{ id: "a", label: "Run 1", values: { x: 0, y: 0.9 } }, { id: "b", values: { x: 2000, y: 0.9 } }, { id: "c", values: { x: 3000, y: 0.9 } }],
    });

    assert.deepEqual(generation.graph?.points.map((point) => point.runId), ["b", "c"]);
    assert.equal(generation.issues.length, 1);
    assert.equal(generation.issues[0].code, "GRAPH_LOG_SCALE_INVALID");
    assert.match(generation.issues[0].message, /log scale on the x axis but x \(0\) is not positive/);
    assert.match(generation.issues[0].userMessage, /its x value must be positive on a log scale/);
  });

  it("y log and x linear works the other way round", () => {
    const generation = generateGraphData({
      graphConfig: config({ xScale: "linear", yScale: "log" }),
      results: [{ id: "a", values: { x: -5, y: 10 } }, { id: "b", values: { x: 1, y: 0 } }, { id: "c", values: { x: 2, y: 20 } }],
    });

    assert.deepEqual(generation.graph?.points.map((point) => point.runId), ["a", "c"]);
    assert.match(generation.issues[0].message, /on the y axis but y \(0\)/);
  });

  it("a graph that is log on both axes still says exactly what it always said", () => {
    const both = generateGraphData({ graphConfig: config({ scale: "log" }), results: [{ id: "a", values: { x: 1, y: 0 } }, { id: "b", values: { x: 2, y: 3 } }] });
    const explicit = generateGraphData({ graphConfig: config({ xScale: "log", yScale: "log" }), results: [{ id: "a", values: { x: 1, y: 0 } }, { id: "b", values: { x: 2, y: 3 } }] });

    for (const generation of [both, explicit]) {
      assert.equal(generation.issues[0].message, 'Run 1: Graph "Cd vs NRe" uses a log scale but the point (1, 0) is not positive.');
      assert.equal(generation.issues[0].userMessage, "Run 1 is not plotted: its values must be positive on a log scale.");
    }
  });

  it("only one per-axis scale given: the other axis follows `scale`", () => {
    const xOnly = generateGraphData({ graphConfig: config({ scale: "linear", xScale: "log" }), results: runs });

    assert.deepEqual([xOnly.graph?.xScale, xOnly.graph?.yScale], ["log", "linear"]);

    const yFollowsBoth = generateGraphData({ graphConfig: config({ scale: "log", xScale: "linear" }), results: runs });

    assert.deepEqual([yFollowsBoth.graph?.xScale, yFollowsBoth.graph?.yScale], ["linear", "log"]);
  });

  it("a graph without per-axis scales has exactly the shape it always had (no xScale / yScale)", () => {
    for (const scale of ["linear", "log"] as const) {
      const graph = generateGraphData({ graphConfig: config({ scale }), results: runs }).graph;

      assert.equal("xScale" in (graph ?? {}), false);
      assert.equal("yScale" in (graph ?? {}), false);
      assert.equal(graph?.scale, scale);
    }
  });

  it("the graph data is plain JSON (no undefined), so a saved run can store it in Firestore", () => {
    const graph = generateGraphData({ graphConfig: config({ xScale: "log", yScale: "linear" }), results: runs }).graph;

    assert.deepEqual(JSON.parse(JSON.stringify(graph)), graph);
  });

  it("the screen still draws a chart for a semi-log graph with enough points", () => {
    const generation = generateGraphData({ graphConfig: config({ xScale: "log", yScale: "linear" }), results: runs });

    assert.equal(describeGraphState(generation, 3).kind, "chart");
  });

  it("works with several series too", () => {
    const generation = generateGraphData({
      graphConfig: config({ yKey: undefined, xScale: "log", yScale: "linear", series: [{ label: "A", yKey: "y" }, { label: "B", yKey: "y2" }] }),
      results: [{ id: "a", values: { x: 10, y: 1, y2: -1 } }, { id: "b", values: { x: 100, y: 2, y2: -2 } }],
    });

    assert.deepEqual(generation.graph?.series?.map((line) => line.points.length), [2, 2]);
    assert.deepEqual([generation.graph?.xScale, generation.graph?.yScale], ["log", "linear"]);
  });
});

describe("per-axis scales: the chart layout", () => {
  const size = { width: 400, height: 300, padding: { top: 10, right: 10, bottom: 30, left: 40 } };
  const points = [{ x: 1000, y: 0.9 }, { x: 10000, y: 0.95 }, { x: 100000, y: 0.97 }];

  it("x logarithmic: equal ratios in x are equal distances on screen", () => {
    const chart = computeChartLayout({ points, xScale: "log", yScale: "linear", ...size });

    assert.ok(chart);
    const [a, b, c] = chart.points;

    assert.ok(Math.abs(b.x - a.x - (c.x - b.x)) < 1e-6, "each decade is the same width");
  });

  it("y linear: y positions are proportional to the values, not to their logarithms", () => {
    const chart = computeChartLayout({ points, xScale: "log", yScale: "linear", ...size });

    assert.ok(chart);
    const [a, b, c] = chart.points;
    const linearRatio = (a.y - b.y) / (b.y - c.y);

    assert.ok(Math.abs(linearRatio - (0.95 - 0.9) / (0.97 - 0.95)) < 1e-6, "y is linear");
  });

  it("the x ticks are powers of ten and the y ticks are ordinary numbers", () => {
    const chart = computeChartLayout({ points, xScale: "log", yScale: "linear", ...size });

    assert.ok(chart);
    assert.ok(chart.xTicks.every((tick) => /^1e\d+$/.test(tick.label)), chart.xTicks.map((tick) => tick.label).join(","));
    assert.ok(chart.yTicks.every((tick) => !tick.label.startsWith("1e")), chart.yTicks.map((tick) => tick.label).join(","));
  });

  it("differs from log-log, which would bend the y axis", () => {
    const semi = computeChartLayout({ points, xScale: "log", yScale: "linear", ...size });
    const both = computeChartLayout({ points, xScale: "log", yScale: "log", ...size });

    assert.notDeepEqual(semi?.yTicks.map((tick) => tick.label), both?.yTicks.map((tick) => tick.label));
  });
});

describe("per-axis scales: the chart component and the faculty view", () => {
  const chart = readFileSync(join(process.cwd(), "components", "ui", "GraphChart.tsx"), "utf8");
  const runScreen = readFileSync(join(process.cwd(), "app", "(student)", "run", "[id].tsx"), "utf8");

  it("GraphChart takes xScale and yScale and falls back to `scale` for an axis that has none", () => {
    assert.match(chart, /xScale\?: AxisScale/);
    assert.match(chart, /yScale\?: AxisScale/);
    assert.match(chart, /xScale: xScale \?\? scale/);
    assert.match(chart, /yScale: yScale \?\? scale/);
  });

  it("the Run screen passes the graph's per-axis scales to the chart", () => {
    assert.match(runScreen, /xScale=\{view\.graph\.xScale\}/);
    assert.match(runScreen, /yScale=\{view\.graph\.yScale\}/);
  });
});
