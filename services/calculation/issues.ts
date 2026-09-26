import type { CalculationIssue, CalculationIssueCode } from "../../types/Calculation";

/** Shown for any problem in the experiment definition. Students cannot fix these. */
export const NOT_CONFIGURED_MESSAGE = "This calculation is not configured correctly yet.";

/** Shown for arithmetic failures such as division by zero. */
export const CALCULATION_FAILED_MESSAGE =
  "Unable to calculate this result. Please check your entered values.";

/** Only for graphs whose definition really lacks xKey / yKey. */
export const GRAPH_UNAVAILABLE_MESSAGE = "This graph is not configured yet.";

export const GRAPH_DRAW_FAILED_MESSAGE =
  "This graph could not be drawn from the calculated values.";

export const GRAPH_NEEDS_RUNS_MESSAGE = "Calculate at least two runs to generate the graph.";

export const GRAPH_NEEDS_MORE_RUNS_MESSAGE = "Add another calculated run to see the trend.";

export function createIssue(
  code: CalculationIssueCode,
  severity: CalculationIssue["severity"],
  message: string,
  userMessage: string,
  extra: Partial<Omit<CalculationIssue, "code" | "severity" | "message" | "userMessage">> = {},
): CalculationIssue {
  return { code, severity, message, userMessage, ...extra };
}
