import type { NormalizedExperiment, NormalizedField, NormalizedGraphConfig } from "../types/Experiment";

// Pure module: turns a normalized experiment into the rows the Faculty Experiment Detail screen shows.
//
// Nothing here is specific to one experiment. Every list in the stored definition becomes a list of
// rows, in stored order, so a screen built from this can never show a subset of the document.
// Student-entered run values are not part of an experiment definition and never appear here.

export interface DetailField {
  key: string;
  label: string;
  kind: "Number" | "Dropdown";
  /** Useful metadata: options, default value, default unit, available units, calculation unit. */
  details: string[];
}

export interface DetailConstant {
  key: string;
  label: string;
  /** The value with its unit, e.g. "9.81 m/s²". */
  value: string;
}

export interface DetailFormula {
  key: string;
  name: string;
  /** The human-readable formula, e.g. "De = 2wb/(w+b)". Never the machine-readable expression. */
  formula: string;
  /** What the student is told when a value is out of range for this formula. Present only when it has checks. */
  rules?: string[];
}

export interface DetailOutput {
  key: string;
  label: string;
  details: string[];
}

export interface DetailGraph {
  key: string;
  title: string;
  type?: string;
  xLabel: string;
  yLabel: string;
  /** Only present when the definition says so (a log scale, per-axis scales, or a machine-readable graph). */
  scale?: "Log" | "Linear" | "Semi-log (x log, y linear)" | "Semi-log (x linear, y log)";
  /** The labels of the lines plotted together. Present only for a graph that has several series. */
  series?: string[];
}

export interface ExperimentDetail {
  title: string;
  published: boolean;
  aim: string[];
  theory: string;
  procedure: string[];
  constants: DetailConstant[];
  /** The experiment's setup inputs (inputFields). */
  inputs: DetailField[];
  /** The per-run measurements the student will enter (runInputs / runFields), as definitions only. */
  runInputs: DetailField[];
  formulas: DetailFormula[];
  outputs: DetailOutput[];
  graphs: DetailGraph[];
}

function describeField(field: NormalizedField, index: number): DetailField {
  const details: string[] = [];

  if (field.optional) details.push("Optional");

  if (field.kind === "choice") {
    if (field.options.length > 0) details.push(`Options: ${field.options.join(", ")}`);
    if (field.defaultValue !== undefined) details.push(`Default value: ${field.defaultValue}`);
  } else {
    if (field.defaultValue !== undefined) details.push(`Default value: ${field.defaultValue}`);
    if (field.defaultUnit) details.push(`Default unit: ${field.defaultUnit}`);
    if (field.units.length > 0) details.push(`Units: ${field.units.join(", ")}`);
    if (field.calculationUnit && field.calculationUnit !== field.defaultUnit) {
      details.push(`Converted to ${field.calculationUnit} for the calculation`);
    }
  }

  return {
    key: `${index}-${field.key}`,
    label: field.label,
    kind: field.kind === "choice" ? "Dropdown" : "Number",
    details,
  };
}

function describeGraph(graph: NormalizedGraphConfig, index: number): DetailGraph {
  const type = graph.type ? graph.type.charAt(0).toUpperCase() + graph.type.slice(1) : undefined;

  // Only series that are actually plotted (they name a yKey) count; label-only entries plot nothing.
  const plotted = graph.series.filter((entry) => entry.yKey !== undefined).map((entry) => entry.label);

  // The normalizer reports "linear" for a missing scale too, so only claim a scale the document states.
  // A graph is mapped to calculated values when it has an xKey and either one yKey or keyed series.
  // A graph is mapped when every plotted line has an x variable: the graph's own xKey or the line's.
  const everyLineHasX = graph.series
    .filter((entry) => entry.yKey !== undefined)
    .every((entry) => Boolean(entry.xKey) || Boolean(graph.xKey));
  const mapped = (Boolean(graph.xKey) || (plotted.length > 0 && everyLineHasX)) && (Boolean(graph.yKey) || plotted.length > 0);
  const xScale = graph.xScale ?? graph.scale;
  const yScale = graph.yScale ?? graph.scale;
  const scale: DetailGraph["scale"] =
    xScale === "log" && yScale === "log"
      ? "Log"
      : xScale === "log"
        ? "Semi-log (x log, y linear)"
        : yScale === "log"
          ? "Semi-log (x linear, y log)"
          : mapped
            ? "Linear"
            : undefined;

  return {
    key: `${index}-${graph.title}`,
    title: graph.title,
    type,
    xLabel: graph.xLabel,
    yLabel: graph.yLabel,
    scale,
    ...(plotted.length > 0 ? { series: plotted } : {}),
  };
}

export function buildExperimentDetail(experiment: NormalizedExperiment): ExperimentDetail {
  return {
    title: experiment.title,
    published: experiment.isPublished,
    aim: experiment.aim,
    theory: experiment.theory,
    procedure: experiment.procedure,

    constants: experiment.constants.map((constant, index) => {
      const label = constant.symbol ? `${constant.name} (${constant.symbol})` : constant.name;

      return {
        key: `${index}-${constant.key ?? constant.name}`,
        label: label || constant.key || "Constant",
        value: [String(constant.value), constant.unit].filter(Boolean).join(" "),
      };
    }),

    inputs: experiment.inputFields.map(describeField),
    runInputs: experiment.runFields.map(describeField),

    formulas: experiment.formulas.map((formula, index) => {
      const rules = (formula.checks ?? []).flatMap((check) => (check.message ? [check.message] : []));

      return {
        key: `${index}-${formula.key ?? formula.name}`,
        name: formula.name,
        // A display-only formula has no expression, and some have no display text: show what exists.
        formula: formula.formula ?? formula.expression ?? "",
        ...(rules.length > 0 ? { rules } : {}),
      };
    }),

    outputs: experiment.outputs.map((output, index) => ({
      key: `${index}-${output.key}`,
      label: output.label,
      details: output.decimals === undefined ? [] : [`Decimals: ${output.decimals}`],
    })),

    graphs: experiment.graphConfigs.map(describeGraph),
  };
}

/** "Fluid Mechanics" -> "fluid-mechanics": the id Firestore uses for the subject. */
export function subjectIdFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "fluid-mechanics" -> "Fluid Mechanics". */
export function subjectNameFromId(subjectId: string): string {
  return subjectId
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
