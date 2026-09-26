import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "../firebase/config";
import type { GraphData, QuantityInputs } from "../types/Calculation";
import type {
  ExperimentRun,
  ExperimentRunQuery,
  SaveExperimentRunParams,
} from "../types/ExperimentRun";
import { runIfOwnedBy } from "./reportService";
import { ServiceError } from "./serviceError";

// Runs live in a top-level collection so student and faculty reports can query across experiments.
const RUNS_COLLECTION = "experimentRuns";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Firestore rejects `undefined`, so optional units are only written when present. */
function toStoredQuantities(quantities: QuantityInputs): QuantityInputs {
  const stored: QuantityInputs = {};

  for (const [key, quantity] of Object.entries(quantities)) {
    stored[key] = quantity.unit
      ? { value: quantity.value, unit: quantity.unit }
      : { value: quantity.value };
  }

  return stored;
}

function toQuantities(value: unknown): QuantityInputs {
  const quantities: QuantityInputs = {};

  if (!isRecord(value)) return quantities;

  for (const [key, entry] of Object.entries(value)) {
    if (!isRecord(entry)) continue;

    const amount = entry.value;

    if (typeof amount !== "string" && typeof amount !== "number") continue;

    quantities[key] =
      typeof entry.unit === "string" ? { value: amount, unit: entry.unit } : { value: amount };
  }

  return quantities;
}

function toNumbers(value: unknown): Record<string, number> {
  const numbers: Record<string, number> = {};

  if (!isRecord(value)) return numbers;

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "number") numbers[key] = entry;
  }

  return numbers;
}

function toGraphData(value: unknown): GraphData[] {
  return Array.isArray(value) ? (value.filter(isRecord) as unknown as GraphData[]) : [];
}

function toRun(id: string, data: Record<string, unknown>): ExperimentRun {
  return {
    id,
    studentId: typeof data.studentId === "string" ? data.studentId : "",
    subjectId: typeof data.subjectId === "string" ? data.subjectId : "",
    experimentId: typeof data.experimentId === "string" ? data.experimentId : "",
    inputs: toQuantities(data.inputs),
    runValues: toQuantities(data.runValues),
    results: toNumbers(data.results),
    graphData: toGraphData(data.graphData),
    status: "completed",
    startedAt: data.startedAt instanceof Timestamp ? data.startedAt : null,
    completedAt: data.completedAt instanceof Timestamp ? data.completedAt : null,
  };
}

function newestFirst(runs: ExperimentRun[]): ExperimentRun[] {
  return [...runs].sort(
    (a, b) => (b.completedAt?.toMillis() ?? 0) - (a.completedAt?.toMillis() ?? 0),
  );
}

/**
 * Saves a completed run and returns its document id.
 * @throws ServiceError when Firestore rejects the write.
 */
export async function saveExperimentRun(params: SaveExperimentRunParams): Promise<string> {
  try {
    const reference = await addDoc(collection(db, RUNS_COLLECTION), {
      studentId: params.studentId,
      subjectId: params.subjectId,
      experimentId: params.experimentId,
      inputs: toStoredQuantities(params.inputs),
      runValues: toStoredQuantities(params.runValues),
      results: params.results,
      graphData: params.graphData,
      status: "completed",
      startedAt: Timestamp.fromDate(params.startedAt),
      completedAt: serverTimestamp(),
    });

    return reference.id;
  } catch (error) {
    throw new ServiceError("save experiment run", error);
  }
}

/**
 * All runs by one student, newest first.
 * Sorted on the client so no composite Firestore index is required.
 * @throws ServiceError when Firestore rejects the read.
 */
export async function getStudentExperimentRuns(studentId: string): Promise<ExperimentRun[]> {
  try {
    const snapshot = await getDocs(
      query(collection(db, RUNS_COLLECTION), where("studentId", "==", studentId)),
    );

    return newestFirst(snapshot.docs.map((document) => toRun(document.id, document.data())));
  } catch (error) {
    throw new ServiceError(`load runs for student "${studentId}"`, error);
  }
}

/**
 * One student's saved runs of one experiment, newest first.
 * Both fields are filtered in the query itself (not client-side), so this stays compatible with the
 * experimentRuns read rule the same way getStudentExperimentRuns is: the query is provably limited to
 * documents the caller owns.
 * @throws ServiceError when Firestore rejects the read.
 */
export async function getStudentExperimentRunsForExperiment(
  studentId: string,
  experimentId: string,
): Promise<ExperimentRun[]> {
  try {
    const snapshot = await getDocs(
      query(
        collection(db, RUNS_COLLECTION),
        where("studentId", "==", studentId),
        where("experimentId", "==", experimentId),
      ),
    );

    return newestFirst(snapshot.docs.map((document) => toRun(document.id, document.data())));
  } catch (error) {
    throw new ServiceError(
      `load runs for student "${studentId}" and experiment "${experimentId}"`,
      error,
    );
  }
}

/**
 * One saved run by its document id, or null when it does not exist OR does not belong to `studentId`.
 * The two cases are deliberately indistinguishable to the caller (see runIfOwnedBy): whether a run is
 * missing or simply not the student's own, nothing about another student's data is revealed.
 * @throws ServiceError when Firestore rejects the read (for example a genuine cross-student attempt,
 * which the experimentRuns rule itself denies before this function's own check ever runs).
 */
export async function getStudentExperimentRunById(
  studentId: string,
  runId: string,
): Promise<ExperimentRun | null> {
  try {
    const snapshot = await getDoc(doc(db, RUNS_COLLECTION, runId));

    if (!snapshot.exists()) return null;

    return runIfOwnedBy(toRun(snapshot.id, snapshot.data()), studentId);
  } catch (error) {
    throw new ServiceError(`load run "${runId}" for student "${studentId}"`, error);
  }
}

/**
 * Runs across students, newest first, optionally narrowed to a subject and/or experiment. Faculty-only
 * in practice: it has no studentId filter, and the experimentRuns read rule only allows an unconstrained
 * read when the caller is faculty (a student's own read still requires resource.data.studentId ==
 * request.auth.uid, which a query can only satisfy with a matching studentId `where` clause) — so a
 * student calling this gets permission-denied. Used by the Faculty Dashboard/Reports for lab-run counts
 * and recent activity. For a student's own data use getStudentExperimentRuns /
 * getStudentExperimentRunsForExperiment / getStudentExperimentRunById instead.
 * @throws ServiceError when Firestore rejects the read.
 */
export async function getExperimentRuns(
  filters: ExperimentRunQuery = {},
): Promise<ExperimentRun[]> {
  const constraints: QueryConstraint[] = [];

  if (filters.subjectId) constraints.push(where("subjectId", "==", filters.subjectId));
  if (filters.experimentId) constraints.push(where("experimentId", "==", filters.experimentId));

  try {
    const snapshot = await getDocs(query(collection(db, RUNS_COLLECTION), ...constraints));

    return newestFirst(snapshot.docs.map((document) => toRun(document.id, document.data())));
  } catch (error) {
    throw new ServiceError("load experiment runs", error);
  }
}
