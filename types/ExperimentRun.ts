import type { Timestamp } from "firebase/firestore";
import type { GraphData, QuantityInputs } from "./Calculation";

export type ExperimentRunStatus = "completed";

/** Document in the top-level experimentRuns collection. */
export interface ExperimentRun {
  id: string;
  studentId: string;
  subjectId: string;
  experimentId: string;

  /** Values exactly as entered, with the unit the student selected. */
  inputs: QuantityInputs;
  runValues: QuantityInputs;

  results: Record<string, number>;
  graphData: GraphData[];

  status: ExperimentRunStatus;
  startedAt: Timestamp | null;
  completedAt: Timestamp | null;
}

export interface SaveExperimentRunParams {
  studentId: string;
  subjectId: string;
  experimentId: string;
  inputs: QuantityInputs;
  runValues: QuantityInputs;
  results: Record<string, number>;
  graphData: GraphData[];
  startedAt: Date;
}

export interface ExperimentRunQuery {
  subjectId?: string;
  experimentId?: string;
}
