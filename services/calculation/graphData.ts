import type { CalculationIssue, GraphData, GraphPoint, GraphSeries } from "../../types/Calculation";
import type { NormalizedGraphConfig } from "../../types/Experiment";
import { createIssue, GRAPH_DRAW_FAILED_MESSAGE, GRAPH_UNAVAILABLE_MESSAGE } from "./issues";

const hasOwn = (target: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(target, key);

/** The calculated values of one run, as produced by calculateExperiment (its `scope`). */
export interface GraphRunValues {
  id?: string;
  /** Used in messages, e.g. "Run 2". */
  label?: string;
  values: Readonly<Record<string, number>>;
}

/**
 * ready      at least one plottable point
 * incomplete the stored definition has no xKey / yKey, so nothing can be mapped
 * empty      the definition is fine but no run supplied a plottable point
 */
export type GraphStatus = "ready" | "incomplete" | "empty";

export interface GraphGeneration {
  status: GraphStatus;
  graph: GraphData | null;
  issues: CalculationIssue[];
}

export interface GenerateGraphDataParams {
  graphConfig: NormalizedGraphConfig;
  /** Index into experiment.graphConfigs. Defaults to 0. */
  configIndex?: number;
  results: readonly GraphRunValues[];
}

/**
 * Builds one graph from any number of calculated runs, using only the keys stored in Firestore.
 *
 * A graph is either single-series (xKey and yKey) or multi-series: when the config lists series that each
 * name a yKey, every one of them is plotted against the same xKey and the graph carries a `series` array.
 * A graph with one series is built exactly as it always was and has no `series` field.
 *
 * Every run with a plottable point contributes one point per series. Definitions that only have display
 * labels (xAxis / yAxis) are never guessed: they yield status "incomplete". Runs that cannot be drawn (a
 * missing variable, or a non-positive value on a log axis) are left out and explained in `issues`, so one
 * bad run never hides the others.
 */
export function generateGraphData({
  graphConfig,
  configIndex = 0,
  results,
}: GenerateGraphDataParams): GraphGeneration {
  const { title, xKey } = graphConfig;
  const issues: CalculationIssue[] = [];

  // Series entries that name their own yKey make this a multi-series graph.
  const keyedSeries = (graphConfig.series ?? []).filter(
    (entry): entry is { label: string; yKey: string; xKey?: string } => entry.yKey !== undefined,
  );
  const multiSeries = keyedSeries.length > 0;
  const lines: { label: string; yKey: string; xKey?: string }[] = multiSeries
    ? keyedSeries
    : graphConfig.yKey
      ? [{ label: "", yKey: graphConfig.yKey }]
      : [];

  // A line is plotted against its own xKey when it has one, else against the graph's xKey.
  const missingX = lines.length === 0 ? !xKey : lines.some((line) => !(line.xKey ?? xKey));

  if (missingX || lines.length === 0) {
    issues.push(
      createIssue(
        "GRAPH_CONFIG_INCOMPLETE",
        "warning",
        `Graph "${title}" has no ${missingX ? "xKey" : "yKey"}; it only has display labels ("${graphConfig.xLabel}" / "${graphConfig.yLabel}") and cannot be mapped to calculated values.`,
        GRAPH_UNAVAILABLE_MESSAGE,
        { graphTitle: title },
      ),
    );

    return { status: "incomplete", graph: null, issues };
  }

  // A definition may give each axis its own scale (a semi-log graph is x log, y linear). Without xScale and yScale
  // both axes use `scale`, exactly as before.
  const hasAxisScales = graphConfig.xScale !== undefined || graphConfig.yScale !== undefined;
  const xScale = graphConfig.xScale ?? graphConfig.scale;
  const yScale = graphConfig.yScale ?? graphConfig.scale;

  const reported = new Set<string>();
  const report = (issue: CalculationIssue) => {
    // Several series share the x variable, so the same problem must not be reported once per series.
    if (reported.has(issue.message)) return;

    reported.add(issue.message);
    issues.push(issue);
  };

  const pointsFor = (line: { yKey: string; xKey?: string }): GraphPoint[] => {
    const { yKey } = line;
    const xKey = (line.xKey ?? graphConfig.xKey) as string;
    const points: GraphPoint[] = [];

    results.forEach((result, index) => {
      const label = result.label ?? `Run ${index + 1}`;
      const named = results.length > 1 ? `${label}: ` : "";
      const missing = [xKey, yKey].filter((key) => !hasOwn(result.values, key));

      if (missing.length > 0) {
        report(
          createIssue(
            "GRAPH_VARIABLE_UNAVAILABLE",
            "warning",
            `${named}Graph "${title}" references ${missing.map((key) => `"${key}"`).join(", ")}, which was not calculated.`,
            GRAPH_DRAW_FAILED_MESSAGE,
            { graphTitle: title, variable: missing[0] },
          ),
        );
        return;
      }

      const x = result.values[xKey];
      const y = result.values[yKey];

      // A calculated value is always finite (the evaluator rejects NaN and Infinity), but a point that is not a
      // finite number must never reach the chart, whatever produced it.
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        report(
          createIssue(
            "GRAPH_VARIABLE_UNAVAILABLE",
            "warning",
            `${named}Graph "${title}" has a value that is not a finite number at the point (${x}, ${y}).`,
            `${label} is not plotted: one of its values is not a finite number.`,
            { graphTitle: title },
          ),
        );
        return;
      }

      const badX = xScale === "log" && x <= 0;
      const badY = yScale === "log" && y <= 0;

      if (badX || badY) {
        const bothLog = xScale === "log" && yScale === "log";
        const axis = badX ? "x" : "y";

        report(
          createIssue(
            "GRAPH_LOG_SCALE_INVALID",
            "warning",
            bothLog
              ? `${named}Graph "${title}" uses a log scale but the point (${x}, ${y}) is not positive.`
              : `${named}Graph "${title}" uses a log scale on the ${axis} axis but ${axis} (${badX ? x : y}) is not positive.`,
            bothLog
              ? `${label} is not plotted: its values must be positive on a log scale.`
              : `${label} is not plotted: its ${axis} value must be positive on a log scale.`,
            { graphTitle: title },
          ),
        );
        return;
      }

      points.push(result.id === undefined ? { x, y } : { x, y, runId: result.id });
    });

    return points;
  };

  const series: GraphSeries[] = lines.map((line) => ({
    label: line.label,
    yKey: line.yKey,
    // Only for a line that has its own x variable, so every other series keeps its exact shape.
    ...(line.xKey ? { xKey: line.xKey } : {}),
    points: pointsFor(line),
  }));

  if (series.every((entry) => entry.points.length === 0)) {
    return { status: "empty", graph: null, issues };
  }

  const first = series[0];

  return {
    status: "ready",
    graph: {
      configIndex,
      title,
      xKey: (first.xKey ?? xKey) as string,
      yKey: first.yKey,
      xLabel: graphConfig.xLabel,
      yLabel: graphConfig.yLabel,
      scale: graphConfig.scale,
      // Only for graphs whose definition gives per-axis scales, so every other graph keeps its exact shape.
      ...(hasAxisScales ? { xScale, yScale } : {}),
      points: first.points,
      ...(multiSeries ? { series } : {}),
    },
    issues,
  };
}

/** The most points any one line of the graph has: what decides whether there is enough to draw a chart. */
export function plottedPointCount(graph: GraphData): number {
  return graph.series && graph.series.length > 0
    ? Math.max(...graph.series.map((entry) => entry.points.length))
    : graph.points.length;
}

/**
 * Single-run form used by calculateExperiment: one point per graph, warnings pushed to `warnings`.
 */
export function buildGraphData(
  configs: NormalizedGraphConfig[],
  scope: Readonly<Record<string, number>>,
  warnings: CalculationIssue[],
): GraphData[] {
  const graphs: GraphData[] = [];

  configs.forEach((graphConfig, configIndex) => {
    const generation = generateGraphData({ graphConfig, configIndex, results: [{ values: scope }] });

    warnings.push(...generation.issues);

    if (generation.graph) graphs.push(generation.graph);
  });

  return graphs;
}
