import type { NormalizedExperiment } from "../types/Experiment";
import type { ExperimentRun } from "../types/ExperimentRun";
import { generateGraphData, type GraphGeneration } from "./calculation/graphData";

// Pure module: no Firebase imports, so every function here is unit-testable without touching Firestore.
// It only reshapes data the caller already loaded (via experimentRunService / experimentService).

// ---------------------------------------------------------------------------
// Report overview metrics
// ---------------------------------------------------------------------------

export interface RunSummary {
  totalRuns: number;
  /** Number of distinct experiments the student has at least one saved run for. */
  experimentsCompleted: number;
  /** The most recent saved runs, in the order `runs` was given. */
  recentRuns: readonly ExperimentRun[];
}

const DEFAULT_RECENT_COUNT = 5;

/**
 * Summarizes a student's saved runs for the Reports overview.
 * `runs` is expected newest-first (getStudentExperimentRuns's own order), so `recentRuns` is simply its head.
 */
export function summarizeRuns(
  runs: readonly ExperimentRun[],
  recentCount: number = DEFAULT_RECENT_COUNT,
): RunSummary {
  return {
    totalRuns: runs.length,
    experimentsCompleted: new Set(runs.map((run) => run.experimentId)).size,
    recentRuns: runs.slice(0, recentCount),
  };
}

// ---------------------------------------------------------------------------
// Progress by subject
// ---------------------------------------------------------------------------

/** The minimal subject shape this module needs: whatever getSubjects() resolves, structurally. */
export interface SubjectLike {
  id: string;
  title?: string;
}

/** The minimal experiment shape this module needs: whatever getExperiments() resolves, structurally. */
export interface ExperimentLike {
  id: string;
}

export interface SubjectProgress {
  subjectId: string;
  /** The subject's title, or its id when it has none. */
  title: string;
  /** Distinct PUBLISHED experiments of this subject the student has at least one saved run for. */
  completed: number;
  /** Published experiments of this subject. The denominator a student can actually attempt. */
  total: number;
}

/**
 * One row per subject: how many of its PUBLISHED experiments the student has completed (saved at least
 * one run for), out of how many published experiments that subject has.
 *
 * Deliberately scoped to published experiments on both sides of the fraction: `experimentIdsBySubject`
 * is expected to already be each subject's published list (the same getExperiments() a student's Subject
 * screen uses, which is published-only by Firestore rule), and a saved run for an experiment that is not
 * in that list (for example one later unpublished) is not counted — so the fraction can never read
 * higher than 100%, and always matches what the student can currently see and attempt.
 */
export function summarizeProgressBySubject(
  subjects: readonly SubjectLike[],
  experimentIdsBySubject: ReadonlyMap<string, readonly ExperimentLike[]>,
  runs: readonly ExperimentRun[],
): SubjectProgress[] {
  const completedExperimentIdsBySubject = new Map<string, Set<string>>();

  for (const run of runs) {
    const completed = completedExperimentIdsBySubject.get(run.subjectId) ?? new Set<string>();

    completed.add(run.experimentId);
    completedExperimentIdsBySubject.set(run.subjectId, completed);
  }

  return subjects.map((subject) => {
    const published = experimentIdsBySubject.get(subject.id) ?? [];
    const publishedIds = new Set(published.map((experiment) => experiment.id));
    const completedIds = completedExperimentIdsBySubject.get(subject.id) ?? new Set<string>();

    let completed = 0;

    for (const id of completedIds) {
      if (publishedIds.has(id)) completed += 1;
    }

    return {
      subjectId: subject.id,
      title: subject.title ?? subject.id,
      completed,
      total: published.length,
    };
  });
}

// ---------------------------------------------------------------------------
// Faculty-facing: performance across all students, all subjects
// ---------------------------------------------------------------------------

/** The minimal experiment shape needed to tell a published experiment from a draft one. */
export interface PublishableExperimentLike {
  subjectId: string;
  id: string;
  isPublished: boolean;
}

/**
 * The published experiments among `experiments`, as experimentRefKey()s — the same key
 * summarizeStudentPerformance (and summarizeProgressBySubject) use to decide what counts.
 * `experiments` is expected to already be the TRUE list per subject (getAllExperiments(), which
 * carries isPublished on each row), so this derives the published subset with no extra Firestore read.
 */
export function publishedExperimentRefs(
  experiments: readonly PublishableExperimentLike[],
): Set<string> {
  const refs = new Set<string>();

  for (const experiment of experiments) {
    if (experiment.isPublished) {
      refs.add(experimentRefKey({ subjectId: experiment.subjectId, experimentId: experiment.id }));
    }
  }

  return refs;
}

export interface StudentLike {
  uid: string;
  name: string;
}

export interface StudentPerformance {
  studentId: string;
  name: string;
  /** Distinct PUBLISHED experiments (across every subject) this student has at least one saved run for. */
  completed: number;
  /** Total published experiments across every subject — the same denominator for every student. */
  total: number;
}

/**
 * Per-student performance for the faculty Reports screen: how many distinct PUBLISHED experiments each
 * student has completed (saved at least one run for), out of the total published experiments across
 * every subject. Several runs of the same experiment count once; a run for an experiment outside the
 * published set (for example one since unpublished) is not counted — same semantics, same safety against
 * a fraction exceeding 100%, as summarizeProgressBySubject on the student side. This is that same
 * completion concept aggregated by student instead of scoped to one signed-in student; it is not a
 * second progress system.
 */
export function summarizeStudentPerformance(
  students: readonly StudentLike[],
  publishedRefs: ReadonlySet<string>,
  runs: readonly ExperimentRun[],
): StudentPerformance[] {
  const completedRefsByStudent = new Map<string, Set<string>>();

  for (const run of runs) {
    const refs = completedRefsByStudent.get(run.studentId) ?? new Set<string>();

    refs.add(experimentRefKey({ subjectId: run.subjectId, experimentId: run.experimentId }));
    completedRefsByStudent.set(run.studentId, refs);
  }

  return students.map((student) => {
    const refs = completedRefsByStudent.get(student.uid) ?? new Set<string>();
    let completed = 0;

    for (const ref of refs) {
      if (publishedRefs.has(ref)) completed += 1;
    }

    return { studentId: student.uid, name: student.name, completed, total: publishedRefs.size };
  });
}

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

/**
 * `run` if it belongs to `studentId`, otherwise null. The real security boundary is the Firestore rule
 * (a student can only ever read their own run document), so this can never turn a genuine cross-student
 * leak into a display; it is a second, explicit check so the UI never renders a mismatched run even if a
 * caller passed the wrong studentId by mistake.
 */
export function runIfOwnedBy(run: ExperimentRun, studentId: string): ExperimentRun | null {
  return run.studentId === studentId ? run : null;
}

// ---------------------------------------------------------------------------
// Client-side filtering
// ---------------------------------------------------------------------------

/** Every run when `experimentId` is null/empty, otherwise only that experiment's runs. Order is preserved. */
export function filterRunsByExperiment(
  runs: readonly ExperimentRun[],
  experimentId: string | null,
): readonly ExperimentRun[] {
  if (!experimentId) return runs;

  return runs.filter((run) => run.experimentId === experimentId);
}

// ---------------------------------------------------------------------------
// Experiment title resolution (avoids reading the same experiment doc twice)
// ---------------------------------------------------------------------------

/** One experiment a saved run belongs to, identified by the pair Firestore actually stores on the run. */
export interface ExperimentRef {
  subjectId: string;
  experimentId: string;
}

/**
 * Stable key for caching/deduping an ExperimentRef, e.g. as a Map key or Set entry. JSON-encoded rather
 * than joined with a separator, so a subjectId or experimentId that happens to contain "/" can never
 * collide with a different pair (e.g. {"a/b","c"} vs {"a","b/c"}).
 */
export function experimentRefKey(ref: ExperimentRef): string {
  return JSON.stringify([ref.subjectId, ref.experimentId]);
}

/** The distinct experiments referenced by `runs`, in first-seen order. */
export function distinctExperimentRefs(runs: readonly ExperimentRun[]): ExperimentRef[] {
  const seen = new Set<string>();
  const refs: ExperimentRef[] = [];

  for (const run of runs) {
    const ref: ExperimentRef = { subjectId: run.subjectId, experimentId: run.experimentId };
    const key = experimentRefKey(ref);

    if (seen.has(key)) continue;

    seen.add(key);
    refs.push(ref);
  }

  return refs;
}

/**
 * The distinct experiments referenced by `runs` that are not already in `known` (e.g. the keys of an
 * already-resolved title cache). Lets a screen fetch each experiment's metadata at most once, no matter
 * how many saved runs share it.
 */
export function missingExperimentRefs(
  runs: readonly ExperimentRun[],
  known: ReadonlySet<string>,
): ExperimentRef[] {
  return distinctExperimentRefs(runs).filter((ref) => !known.has(experimentRefKey(ref)));
}

// ---------------------------------------------------------------------------
// Analytics: multi-run graphs regenerated from saved results
// ---------------------------------------------------------------------------

/**
 * Regenerates every graph of `experiment` from saved runs' persisted OUTPUT values (`run.results`).
 *
 * Never uses a saved run's own stored `graphData`: that field holds one single-point rendering built at
 * save time from that run alone (see experimentRunService.saveExperimentRun, which calls
 * calculateExperiment's buildGraphData with a single-run scope), not a trend across runs. This instead
 * feeds every run's `results` through the same generic `generateGraphData` the live Run screen uses, so
 * the result is the same kind of graph (single-series, multi-series, per-series xKey, linear/log axes,
 * all handled by generateGraphData itself), just built from saved runs instead of in-memory draft ones.
 *
 * `runs` order becomes the graphs' point order (and their default "Run 1", "Run 2", ... labels), so pass
 * them oldest-first for a trend that reads left-to-right in the order they were actually run.
 */
export function buildRunHistoryGraphs(
  experiment: NormalizedExperiment,
  runs: readonly ExperimentRun[],
): GraphGeneration[] {
  const results = runs.map((run) => ({ id: run.id, values: run.results }));

  return experiment.graphConfigs.map((graphConfig, configIndex) =>
    generateGraphData({ graphConfig, configIndex, results }),
  );
}

// ---------------------------------------------------------------------------
// Timestamps
// ---------------------------------------------------------------------------

/** Anything with the one Timestamp method this module needs, so a test can pass a plain object. */
export interface TimestampLike {
  toDate(): Date;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * "22 Sep 2026, 3:45 PM" — a fixed format rather than the device's locale, so a saved run reads the same
 * everywhere it is shown.
 */
export function formatRunTimestamp(timestamp: TimestampLike | null, fallback = "Not yet synced"): string {
  if (!timestamp) return fallback;

  const date = timestamp.toDate();
  const hour24 = date.getHours();
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const meridiem = hour24 < 12 ? "AM" : "PM";

  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${hour12}:${pad2(date.getMinutes())} ${meridiem}`;
}
