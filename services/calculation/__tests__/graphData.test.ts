import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NormalizedGraphConfig } from "../../../types/Experiment";
import { generateGraphData } from "../graphData";
import { normalizedPipeflow, normalizedVenturi } from "./fixtures";

const linear = (extra: Partial<NormalizedGraphConfig> = {}): NormalizedGraphConfig => ({
  title: "C vs B",
  xKey: "b",
  yKey: "c",
  xLabel: "B",
  yLabel: "C",
  scale: "linear",
  series: [],
  source: "graphConfigs",
  ...extra,
});

describe("generateGraphData: several runs", () => {
  it("makes one point per run from the stored xKey and yKey", () => {
    const generation = generateGraphData({
      graphConfig: linear(),
      results: [
        { id: "r1", values: { b: 1, c: 10 } },
        { id: "r2", values: { b: 2, c: 20 } },
        { id: "r3", values: { b: 3, c: 30 } },
      ],
    });

    assert.equal(generation.status, "ready");
    assert.deepEqual(generation.graph?.points, [
      { x: 1, y: 10, runId: "r1" },
      { x: 2, y: 20, runId: "r2" },
      { x: 3, y: 30, runId: "r3" },
    ]);
    assert.deepEqual(generation.issues, []);
  });

  it("carries the labels, title and scale from the configuration", () => {
    const generation = generateGraphData({
      graphConfig: linear({ title: "T", xLabel: "X!", yLabel: "Y!", scale: "log" }),
      configIndex: 4,
      results: [{ values: { b: 1, c: 1 } }],
    });

    assert.equal(generation.graph?.title, "T");
    assert.equal(generation.graph?.xLabel, "X!");
    assert.equal(generation.graph?.yLabel, "Y!");
    assert.equal(generation.graph?.scale, "log");
    assert.equal(generation.graph?.configIndex, 4);
  });

  it("omits runId for points when the caller supplies no run ids", () => {
    const generation = generateGraphData({
      graphConfig: linear(),
      results: [{ values: { b: 1, c: 2 } }],
    });

    assert.deepEqual(generation.graph?.points, [{ x: 1, y: 2 }]);
  });

  it("gives no graph and status empty when there are no results yet", () => {
    const generation = generateGraphData({ graphConfig: linear(), results: [] });

    assert.equal(generation.status, "empty");
    assert.equal(generation.graph, null);
  });

  it("leaves out only the runs that cannot be plotted, and says which", () => {
    const generation = generateGraphData({
      graphConfig: linear({ scale: "log" }),
      results: [
        { id: "r1", label: "Run 1", values: { b: 10, c: 100 } },
        { id: "r2", label: "Run 2", values: { b: 20, c: 0 } },
        { id: "r3", label: "Run 3", values: { b: 30, c: 300 } },
      ],
    });

    assert.equal(generation.status, "ready");
    assert.deepEqual(generation.graph?.points.map((point) => point.runId), ["r1", "r3"]);
    assert.equal(generation.issues.length, 1);
    assert.equal(generation.issues[0].code, "GRAPH_LOG_SCALE_INVALID");
    assert.equal(generation.issues[0].userMessage, "Run 2 is not plotted: its values must be positive on a log scale.");
  });

  it("skips a run that lacks a graph variable without hiding the rest", () => {
    const generation = generateGraphData({
      graphConfig: linear(),
      results: [
        { id: "r1", values: { b: 1, c: 1 } },
        { id: "r2", values: { b: 2 } },
      ],
    });

    assert.equal(generation.graph?.points.length, 1);
    assert.equal(generation.issues[0].code, "GRAPH_VARIABLE_UNAVAILABLE");
  });
});

describe("generateGraphData: configuration", () => {
  it("recognises the real pipeflow graph (xKey NRe, yKey f, log scale)", () => {
    const [graphConfig] = normalizedPipeflow().graphConfigs;

    assert.equal(graphConfig.xKey, "NRe");
    assert.equal(graphConfig.yKey, "f");
    assert.equal(graphConfig.scale, "log");

    const generation = generateGraphData({
      graphConfig,
      results: [{ values: { NRe: 125, f: 0.04 } }],
    });

    assert.equal(generation.status, "ready", "a valid configuration must never be reported as incomplete");
    assert.deepEqual(generation.graph?.points, [{ x: 125, y: 0.04 }]);
  });

  it("reports display-only graphs as incomplete instead of guessing a mapping", () => {
    const [graphConfig] = normalizedVenturi().graphConfigs;

    const generation = generateGraphData({
      graphConfig,
      results: [{ values: { lhs: 1, height: 2 } }],
    });

    assert.equal(generation.status, "incomplete");
    assert.equal(generation.graph, null);
    assert.equal(generation.issues[0].code, "GRAPH_CONFIG_INCOMPLETE");
    assert.equal(generation.issues[0].userMessage, "This graph is not configured yet.");
  });

  it("reports a config with only one of xKey / yKey as incomplete", () => {
    const generation = generateGraphData({
      graphConfig: linear({ yKey: undefined }),
      results: [{ values: { b: 1, c: 1 } }],
    });

    assert.equal(generation.status, "incomplete");
  });
});
