import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeExperiment } from "../normalizeExperiment";
import type { ExperimentRun } from "../../types/ExperimentRun";
import type { NormalizedExperiment, RawExperimentData } from "../../types/Experiment";
import {
  buildRunHistoryGraphs,
  distinctExperimentRefs,
  experimentRefKey,
  filterRunsByExperiment,
  formatRunTimestamp,
  missingExperimentRefs,
  publishedExperimentRefs,
  runIfOwnedBy,
  summarizeProgressBySubject,
  summarizeRuns,
  summarizeStudentPerformance,
  type TimestampLike,
} from "../reportService";

// Pure module: nothing here touches Firestore. `run()` builds a minimal saved-run document by hand,
// exactly the shape experimentRunService.toRun() reconstructs from a real one.

function run(overrides: Partial<ExperimentRun> = {}): ExperimentRun {
  return {
    id: "run-1",
    studentId: "student-a",
    subjectId: "fluid-mechanics",
    experimentId: "venturimeter",
    inputs: {},
    runValues: {},
    results: {},
    graphData: [],
    status: "completed",
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
describe("summarizeRuns", () => {
  it("counts total runs and distinct experiments, and takes the head as 'recent'", () => {
    const runs = [
      run({ id: "1", experimentId: "venturimeter" }),
      run({ id: "2", experimentId: "venturimeter" }),
      run({ id: "3", experimentId: "orificemeter" }),
    ];

    const summary = summarizeRuns(runs);

    assert.equal(summary.totalRuns, 3);
    assert.equal(summary.experimentsCompleted, 2, "venturimeter + orificemeter, not one per run");
    assert.deepEqual(summary.recentRuns, runs, "all 3 fit within the default recent count");
  });

  it("trusts the given order and only slices; it never itself re-sorts", () => {
    const runs = [run({ id: "newest" }), run({ id: "middle" }), run({ id: "oldest" })];

    const summary = summarizeRuns(runs, 2);

    assert.deepEqual(
      summary.recentRuns.map((r) => r.id),
      ["newest", "middle"],
    );
  });

  it("an empty saved-run list summarizes to zeros and an empty recent list", () => {
    const summary = summarizeRuns([]);

    assert.deepEqual(summary, { totalRuns: 0, experimentsCompleted: 0, recentRuns: [] });
  });

  it("a custom recentCount is honoured, including 0", () => {
    const runs = [run({ id: "1" }), run({ id: "2" }), run({ id: "3" })];

    assert.equal(summarizeRuns(runs, 1).recentRuns.length, 1);
    assert.equal(summarizeRuns(runs, 0).recentRuns.length, 0);
    assert.equal(summarizeRuns(runs, 10).recentRuns.length, 3, "asking for more than exist is not an error");
  });
});

// ---------------------------------------------------------------------------
describe("summarizeProgressBySubject", () => {
  const subjects = [
    { id: "fluid-mechanics", title: "Fluid Mechanics" },
    { id: "heat-transfer", title: "Heat Transfer" },
    { id: "reaction-engineering" }, // no title on record: falls back to the id
  ];

  const published = new Map([
    ["fluid-mechanics", [{ id: "pipeflow" }, { id: "venturimeter" }, { id: "orificemeter" }]],
    ["heat-transfer", [{ id: "conduction" }]],
    ["reaction-engineering", []],
  ]);

  it("counts distinct completed experiments per subject against that subject's published total", () => {
    const runs = [
      run({ subjectId: "fluid-mechanics", experimentId: "pipeflow" }),
      run({ subjectId: "fluid-mechanics", experimentId: "venturimeter" }),
      run({ subjectId: "heat-transfer", experimentId: "conduction" }),
    ];

    assert.deepEqual(summarizeProgressBySubject(subjects, published, runs), [
      { subjectId: "fluid-mechanics", title: "Fluid Mechanics", completed: 2, total: 3 },
      { subjectId: "heat-transfer", title: "Heat Transfer", completed: 1, total: 1 },
      { subjectId: "reaction-engineering", title: "reaction-engineering", completed: 0, total: 0 },
    ]);
  });

  it("several runs of the SAME experiment count once, not once per run", () => {
    const runs = [
      run({ id: "r1", subjectId: "fluid-mechanics", experimentId: "pipeflow" }),
      run({ id: "r2", subjectId: "fluid-mechanics", experimentId: "pipeflow" }),
      run({ id: "r3", subjectId: "fluid-mechanics", experimentId: "pipeflow" }),
    ];

    assert.equal(summarizeProgressBySubject(subjects, published, runs)[0].completed, 1);
  });

  it("a run for an experiment NOT in the subject's published list is not counted (never exceeds total)", () => {
    const runs = [
      run({ subjectId: "fluid-mechanics", experimentId: "pipeflow" }),
      run({ subjectId: "fluid-mechanics", experimentId: "an-unpublished-or-removed-experiment" }),
    ];
    const [fluidMechanics] = summarizeProgressBySubject(subjects, published, runs);

    assert.equal(fluidMechanics.completed, 1, "only the published run counts");
    assert.ok(fluidMechanics.completed <= fluidMechanics.total, "completed never exceeds total");
  });

  it("a run for a DIFFERENT subject never counts toward this one (no cross-subject leakage)", () => {
    const runs = [run({ subjectId: "heat-transfer", experimentId: "conduction" })];
    const [fluidMechanics] = summarizeProgressBySubject(subjects, published, runs);

    assert.equal(fluidMechanics.completed, 0);
  });

  it("no saved runs at all: every subject shows 0 completed, not an error", () => {
    const result = summarizeProgressBySubject(subjects, published, []);

    assert.ok(result.every((row) => row.completed === 0));
    assert.deepEqual(result.map((row) => row.total), [3, 1, 0]);
  });

  it("a subject with zero published experiments is 0 of 0, not a crash or divide-by-zero artifact", () => {
    const [, , reactionEngineering] = summarizeProgressBySubject(subjects, published, []);

    assert.deepEqual(reactionEngineering, {
      subjectId: "reaction-engineering",
      title: "reaction-engineering",
      completed: 0,
      total: 0,
    });
  });

  it("a subject missing from the experimentIdsBySubject map is treated as zero published, not an error", () => {
    const result = summarizeProgressBySubject(subjects, new Map(), []);

    assert.ok(result.every((row) => row.total === 0 && row.completed === 0));
  });

  it("no subjects at all: an empty list, not an error", () => {
    assert.deepEqual(summarizeProgressBySubject([], published, []), []);
  });

  it("preserves the given subject order", () => {
    const result = summarizeProgressBySubject([...subjects].reverse(), published, []);

    assert.deepEqual(
      result.map((row) => row.subjectId),
      ["reaction-engineering", "heat-transfer", "fluid-mechanics"],
    );
  });
});

// ---------------------------------------------------------------------------
describe("publishedExperimentRefs", () => {
  it("keeps only published experiments, keyed the same way experimentRefKey does", () => {
    const experiments = [
      { subjectId: "fluid-mechanics", id: "pipeflow", isPublished: true },
      { subjectId: "fluid-mechanics", id: "orificemeter", isPublished: false },
      { subjectId: "heat-transfer", id: "conduction", isPublished: true },
    ];

    assert.deepEqual(
      publishedExperimentRefs(experiments),
      new Set([
        experimentRefKey({ subjectId: "fluid-mechanics", experimentId: "pipeflow" }),
        experimentRefKey({ subjectId: "heat-transfer", experimentId: "conduction" }),
      ]),
    );
  });

  it("no experiments at all: an empty set, not an error", () => {
    assert.deepEqual(publishedExperimentRefs([]), new Set());
  });

  it("nothing published: an empty set", () => {
    assert.deepEqual(
      publishedExperimentRefs([{ subjectId: "fluid-mechanics", id: "pipeflow", isPublished: false }]),
      new Set(),
    );
  });
});

// ---------------------------------------------------------------------------
describe("summarizeStudentPerformance", () => {
  const students = [
    { uid: "student-a", name: "Ada" },
    { uid: "student-b", name: "Bo" },
  ];
  const published = new Set([
    experimentRefKey({ subjectId: "fluid-mechanics", experimentId: "pipeflow" }),
    experimentRefKey({ subjectId: "fluid-mechanics", experimentId: "venturimeter" }),
    experimentRefKey({ subjectId: "heat-transfer", experimentId: "conduction" }),
  ]);

  it("counts distinct published experiments per student, against the SAME total for every student", () => {
    const runs = [
      run({ studentId: "student-a", subjectId: "fluid-mechanics", experimentId: "pipeflow" }),
      run({ studentId: "student-a", subjectId: "fluid-mechanics", experimentId: "venturimeter" }),
      run({ studentId: "student-b", subjectId: "heat-transfer", experimentId: "conduction" }),
    ];

    assert.deepEqual(summarizeStudentPerformance(students, published, runs), [
      { studentId: "student-a", name: "Ada", completed: 2, total: 3 },
      { studentId: "student-b", name: "Bo", completed: 1, total: 3 },
    ]);
  });

  it("several runs of the SAME experiment count once, not once per run (never counts run attempts as completions)", () => {
    const runs = [
      run({ id: "r1", studentId: "student-a", subjectId: "fluid-mechanics", experimentId: "pipeflow" }),
      run({ id: "r2", studentId: "student-a", subjectId: "fluid-mechanics", experimentId: "pipeflow" }),
      run({ id: "r3", studentId: "student-a", subjectId: "fluid-mechanics", experimentId: "pipeflow" }),
    ];

    assert.equal(summarizeStudentPerformance(students, published, runs)[0].completed, 1);
  });

  it("a run for an unpublished/unknown experiment is not counted (completed never exceeds total)", () => {
    const runs = [
      run({ studentId: "student-a", subjectId: "fluid-mechanics", experimentId: "pipeflow" }),
      run({ studentId: "student-a", subjectId: "fluid-mechanics", experimentId: "not-a-real-experiment" }),
    ];
    const [ada] = summarizeStudentPerformance(students, published, runs);

    assert.equal(ada.completed, 1);
    assert.ok(ada.completed <= ada.total);
  });

  it("a run belonging to one student never counts toward another (no cross-student leakage)", () => {
    const runs = [run({ studentId: "student-b", subjectId: "fluid-mechanics", experimentId: "pipeflow" })];
    const [ada] = summarizeStudentPerformance(students, published, runs);

    assert.equal(ada.completed, 0);
  });

  it("no runs at all: every student shows 0 completed, not an error", () => {
    const result = summarizeStudentPerformance(students, published, []);

    assert.ok(result.every((row) => row.completed === 0));
    assert.ok(result.every((row) => row.total === 3));
  });

  it("no published experiments: 0 of 0 for everyone, not a crash", () => {
    const result = summarizeStudentPerformance(students, new Set(), []);

    assert.deepEqual(result, [
      { studentId: "student-a", name: "Ada", completed: 0, total: 0 },
      { studentId: "student-b", name: "Bo", completed: 0, total: 0 },
    ]);
  });

  it("no students at all: an empty list, not an error", () => {
    assert.deepEqual(summarizeStudentPerformance([], published, []), []);
  });

  it("preserves the given student order", () => {
    const result = summarizeStudentPerformance([...students].reverse(), published, []);

    assert.deepEqual(result.map((row) => row.studentId), ["student-b", "student-a"]);
  });
});

// ---------------------------------------------------------------------------
describe("runIfOwnedBy: student-scoped run lookup", () => {
  it("returns the run when the studentId matches", () => {
    const mine = run({ studentId: "student-a" });

    assert.equal(runIfOwnedBy(mine, "student-a"), mine);
  });

  it("returns null, never the run, when the studentId does not match (another student's run)", () => {
    const theirs = run({ studentId: "student-b", results: { Cd: 0.49, NRe: 15984 } });

    assert.equal(runIfOwnedBy(theirs, "student-a"), null);
  });

  it("is case-sensitive and exact: no partial or prefix match grants ownership", () => {
    const theirs = run({ studentId: "student-ab" });

    assert.equal(runIfOwnedBy(theirs, "student-a"), null);
    assert.equal(runIfOwnedBy(run({ studentId: "" }), "student-a"), null);
    assert.equal(runIfOwnedBy(run({ studentId: "student-a" }), ""), null);
  });
});

// ---------------------------------------------------------------------------
describe("filterRunsByExperiment", () => {
  const runs = [
    run({ id: "1", experimentId: "venturimeter" }),
    run({ id: "2", experimentId: "orificemeter" }),
    run({ id: "3", experimentId: "venturimeter" }),
  ];

  it("keeps only the matching experiment's runs, in their original order", () => {
    assert.deepEqual(
      filterRunsByExperiment(runs, "venturimeter").map((r) => r.id),
      ["1", "3"],
    );
  });

  it("null or empty string means 'every experiment': the array is returned as-is", () => {
    assert.deepEqual(filterRunsByExperiment(runs, null), runs);
    assert.deepEqual(filterRunsByExperiment(runs, ""), runs);
  });

  it("an experimentId with no matching runs gives an empty list, not an error", () => {
    assert.deepEqual(filterRunsByExperiment(runs, "centrifugalpump"), []);
  });
});

// ---------------------------------------------------------------------------
describe("experiment title resolution: distinctExperimentRefs / missingExperimentRefs", () => {
  const runs = [
    run({ id: "1", subjectId: "fluid-mechanics", experimentId: "venturimeter" }),
    run({ id: "2", subjectId: "fluid-mechanics", experimentId: "venturimeter" }),
    run({ id: "3", subjectId: "fluid-mechanics", experimentId: "orificemeter" }),
    run({ id: "4", subjectId: "fluid-mechanics", experimentId: "venturimeter" }),
  ];

  it("experimentRefKey combines subjectId and experimentId so two experiments never collide", () => {
    assert.equal(
      experimentRefKey({ subjectId: "a", experimentId: "b" }),
      experimentRefKey({ subjectId: "a", experimentId: "b" }),
      "same pair -> same key",
    );
    // A naive "subjectId/experimentId" join would collide here; the key must not.
    assert.notEqual(
      experimentRefKey({ subjectId: "a/b", experimentId: "c" }),
      experimentRefKey({ subjectId: "a", experimentId: "b/c" }),
    );
  });

  it("distinctExperimentRefs de-duplicates, in first-seen order, regardless of how many runs share it", () => {
    assert.deepEqual(distinctExperimentRefs(runs), [
      { subjectId: "fluid-mechanics", experimentId: "venturimeter" },
      { subjectId: "fluid-mechanics", experimentId: "orificemeter" },
    ]);
  });

  it("missingExperimentRefs drops refs already present in the cache, so each is fetched at most once", () => {
    const known = new Set([experimentRefKey({ subjectId: "fluid-mechanics", experimentId: "venturimeter" })]);

    assert.deepEqual(missingExperimentRefs(runs, known), [
      { subjectId: "fluid-mechanics", experimentId: "orificemeter" },
    ]);
  });

  it("an empty known set means everything is missing; a fully-known set means nothing is", () => {
    assert.equal(missingExperimentRefs(runs, new Set()).length, 2);
    assert.deepEqual(
      missingExperimentRefs(
        runs,
        new Set([
          experimentRefKey({ subjectId: "fluid-mechanics", experimentId: "venturimeter" }),
          experimentRefKey({ subjectId: "fluid-mechanics", experimentId: "orificemeter" }),
        ]),
      ),
      [],
    );
  });

  it("no saved runs means no experiments to resolve", () => {
    assert.deepEqual(distinctExperimentRefs([]), []);
    assert.deepEqual(missingExperimentRefs([], new Set()), []);
  });
});

// ---------------------------------------------------------------------------
describe("buildRunHistoryGraphs: analytics graph regeneration from results (never from stored graphData)", () => {
  function experiment(graphConfigs: unknown): NormalizedExperiment {
    return normalizeExperiment({
      id: "x",
      subjectId: "fluid-mechanics",
      data: { title: "X", graphConfigs } as unknown as RawExperimentData,
    });
  }

  it("single-series graph: one point per run, taken from run.results, in the given run order", () => {
    const ex = experiment([{ title: "Cd vs NRe", type: "line", xKey: "NRe", yKey: "Cd" }]);
    const runs = [
      run({ id: "r1", results: { NRe: 15984, Cd: 0.4969 } }),
      run({ id: "r2", results: { NRe: 22835, Cd: 0.5019 } }),
    ];

    const [generation] = buildRunHistoryGraphs(ex, runs);

    assert.equal(generation.status, "ready");
    assert.deepEqual(
      generation.graph!.points.map((p) => [p.x, p.y, p.runId]),
      [[15984, 0.4969, "r1"], [22835, 0.5019, "r2"]],
    );
  });

  it("multi-series graph: every series gets one point per run", () => {
    const ex = experiment([
      {
        title: "Pump Characteristics",
        type: "multi-line",
        xKey: "Q",
        series: [{ label: "Efficiency", yKey: "eta" }, { label: "Head", yKey: "HT" }],
      },
    ]);
    const runs = [
      run({ id: "r1", results: { Q: 0.0002, eta: 1.9, HT: 6.7 } }),
      run({ id: "r2", results: { Q: 0.0003, eta: 3.0, HT: 8.4 } }),
    ];

    const [generation] = buildRunHistoryGraphs(ex, runs);

    assert.equal(generation.status, "ready");
    assert.equal(generation.graph!.series!.length, 2);
    assert.deepEqual(generation.graph!.series![0].points.map((p) => [p.x, p.y]), [[0.0002, 1.9], [0.0003, 3.0]]);
    assert.deepEqual(generation.graph!.series![1].points.map((p) => [p.x, p.y]), [[0.0002, 6.7], [0.0003, 8.4]]);
  });

  it("per-series xKey graph: each line is plotted against its own results key, not the graph's", () => {
    const ex = experiment([
      {
        title: "Efficiency vs Head",
        type: "multi-line",
        series: [
          { label: "Suction Head", xKey: "hsWaterHead", yKey: "eta" },
          { label: "Delivery Head", xKey: "hdWaterHead", yKey: "eta" },
        ],
      },
    ]);
    const runs = [
      run({ id: "r1", results: { hsWaterHead: 2.7158, hdWaterHead: 4, eta: 1.93 } }),
      run({ id: "r2", results: { hsWaterHead: 3.3947, hdWaterHead: 5, eta: 3.04 } }),
    ];

    const [generation] = buildRunHistoryGraphs(ex, runs);
    const [suction, delivery] = generation.graph!.series!;

    assert.deepEqual(suction.points.map((p) => p.x), [2.7158, 3.3947]);
    assert.deepEqual(delivery.points.map((p) => p.x), [4, 5]);
    assert.deepEqual(suction.points.map((p) => p.y), delivery.points.map((p) => p.y), "same eta on both lines");
  });

  it("linear/log per-axis scales from the definition pass through untouched", () => {
    const ex = experiment([
      { title: "Cd vs NRe", type: "line", xKey: "NRe", yKey: "Cd", xScale: "log", yScale: "linear" },
    ]);
    const [generation] = buildRunHistoryGraphs(ex, [run({ results: { NRe: 15984, Cd: 0.4969 } })]);

    assert.equal(generation.graph!.xScale, "log");
    assert.equal(generation.graph!.yScale, "linear");
  });

  it("single saved run: the graph is generated (one point), not treated as an error", () => {
    const ex = experiment([{ title: "Cd vs NRe", type: "line", xKey: "NRe", yKey: "Cd" }]);
    const [generation] = buildRunHistoryGraphs(ex, [run({ results: { NRe: 15984, Cd: 0.4969 } })]);

    assert.equal(generation.status, "ready");
    assert.equal(generation.graph!.points.length, 1);
  });

  it("no saved runs: the graph config is still 'ready' (well-formed) but has no plottable point (status is 'empty')", () => {
    const ex = experiment([{ title: "Cd vs NRe", type: "line", xKey: "NRe", yKey: "Cd" }]);
    const [generation] = buildRunHistoryGraphs(ex, []);

    assert.equal(generation.status, "empty");
    assert.equal(generation.graph, null);
  });

  it("one GraphGeneration per graphConfig, in the experiment's stored order", () => {
    const ex = experiment([
      { title: "A", type: "line", xKey: "x", yKey: "y" },
      { title: "B", type: "line", xKey: "x", yKey: "z" },
    ]);

    const generations = buildRunHistoryGraphs(ex, [run({ results: { x: 1, y: 2, z: 3 } })]);

    assert.equal(generations.length, 2);
    assert.deepEqual(generations.map((g) => g.graph?.title), ["A", "B"]);
  });

  it("a run missing one graph's keys does not break the OTHER graph", () => {
    const ex = experiment([
      { title: "A", type: "line", xKey: "x", yKey: "y" },
      { title: "B", type: "line", xKey: "onlyOnRun2", yKey: "y" },
    ]);
    const runs = [run({ id: "r1", results: { x: 1, y: 2 } }), run({ id: "r2", results: { x: 3, y: 4, onlyOnRun2: 9 } })];

    const [a, b] = buildRunHistoryGraphs(ex, runs);

    assert.equal(a.graph!.points.length, 2);
    assert.deepEqual(b.graph!.points.map((p) => p.runId), ["r2"], "only the run that has the key is plotted");
  });
});

// ---------------------------------------------------------------------------
describe("formatRunTimestamp", () => {
  const at = (year: number, month: number, day: number, hour: number, minute: number): TimestampLike => ({
    toDate: () => new Date(year, month - 1, day, hour, minute),
  });

  it("formats a fixed date and time, independent of device locale", () => {
    assert.equal(formatRunTimestamp(at(2026, 9, 22, 15, 45)), "22 Sep 2026, 3:45 PM");
  });

  it("midnight and noon use 12, not 0", () => {
    assert.equal(formatRunTimestamp(at(2026, 1, 1, 0, 5)), "1 Jan 2026, 12:05 AM");
    assert.equal(formatRunTimestamp(at(2026, 1, 1, 12, 0)), "1 Jan 2026, 12:00 PM");
  });

  it("minutes are zero-padded, hours are not", () => {
    assert.equal(formatRunTimestamp(at(2026, 3, 5, 9, 5)), "5 Mar 2026, 9:05 AM");
  });

  it("null (a run whose completedAt has not synced yet) uses the fallback text", () => {
    assert.equal(formatRunTimestamp(null), "Not yet synced");
    assert.equal(formatRunTimestamp(null, "Saving..."), "Saving...");
  });

  it("accepts anything with a toDate() method, not only a real Firestore Timestamp", () => {
    const custom: TimestampLike = { toDate: () => new Date(2026, 0, 1) };

    assert.doesNotThrow(() => formatRunTimestamp(custom));
  });
});
