import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalculateExperimentParams } from "../../../types/Calculation";
import { calculateExperiment } from "../calculateExperiment";
import {
  addDraftRun,
  buildRunGraphs,
  calculateAllDraftRuns,
  createDraftRun,
  createSingleFlight,
  describeGraphState,
  editDraftRunUnit,
  editDraftRunValue,
  hasSavedRuns,
  initialQuantities,
  invalidateCalculatedRuns,
  removeDraftRun,
  saveDraftRuns,
  setQuantityUnit,
  type DraftRun,
} from "../draftRuns";
import {
  closeTo,
  expectedPipeflow,
  normalizedPipeflow,
  normalizedVenturi,
  pipeflowEntries,
  pipeflowRunValues,
} from "./fixtures";

const experiment = normalizedPipeflow();
const setup = pipeflowEntries().inputs;

type RunSpec = [lhs: number | string, rhs: number | string, height: number | string, time: number | string];

/** Three realistic pipeflow runs: the flow doubles each time (time 20 s, 10 s, 5 s). */
const RUN_1: RunSpec = [30, 10, 0.1, 20];
const RUN_2: RunSpec = [40, 10, 0.1, 10];
const RUN_3: RunSpec = [50, 10, 0.1, 5];

function draftRuns(...specs: RunSpec[]): DraftRun[] {
  return specs.map((spec, index) => ({
    ...createDraftRun(`run-${index + 1}`, experiment.runFields),
    runValues: pipeflowRunValues(...spec),
  }));
}

function calculateAll(runs: DraftRun[]) {
  return calculateAllDraftRuns({ experiment, setup, runs });
}

function fakeSaver(failOn: string[] = []) {
  const calls: string[] = [];
  const payloads: DraftRun[] = [];
  let counter = 0;

  return {
    calls,
    payloads,
    save: async (run: DraftRun): Promise<string> => {
      calls.push(run.id);
      payloads.push(run);

      if (failOn.includes(run.id)) throw new Error("permission-denied");

      counter += 1;

      return `saved-${counter}`;
    },
  };
}

describe("draft runs: one run", () => {
  it("starts as a draft with the experiment's run fields and nothing calculated", () => {
    const run = createDraftRun("run-1", experiment.runFields);

    assert.equal(run.status, "draft");
    assert.deepEqual(Object.keys(run.runValues), ["lhs", "rhs", "height", "time"]);
    assert.equal(run.runValues.lhs.value, "");
    assert.equal(run.result, undefined);
    assert.deepEqual(run.errors, []);
    assert.equal(run.savedRunId, undefined);
  });

  it("takes the run fields from the experiment definition, not from pipeflow knowledge", () => {
    const run = createDraftRun("r", normalizedVenturi().runFields);

    assert.deepEqual(Object.keys(run.runValues), ["lhs", "rhs", "height", "time"]);
    assert.equal(run.runValues.lhs.unit, "mm", "default unit comes from Firestore");
    assert.equal(run.runValues.height.unit, "m");
  });

  it("calculates a single run with the existing engine", () => {
    const { runs } = calculateAll(draftRuns(RUN_1));
    const expected = expectedPipeflow(...(RUN_1 as [number, number, number, number]));

    assert.equal(runs[0].status, "calculated");
    assert.ok(closeTo(runs[0].result!.calculated.NRe, expected.NRe));
    assert.ok(closeTo(runs[0].result!.calculated.f, expected.f));
  });

  it("starts the setup from the Firestore defaults", () => {
    const quantities = initialQuantities(experiment.inputFields);

    assert.deepEqual(quantities.density, { value: "1000", unit: "kg/m³" });
    assert.deepEqual(quantities.viscosity, { value: "0.001", unit: "Pa·s" });
    assert.deepEqual(quantities.pipeDiameter, { value: "", unit: "m" });
  });
});

describe("draft runs: several runs", () => {
  it("adds and removes runs without touching the others", () => {
    const original = draftRuns(RUN_1);
    const three = addDraftRun(addDraftRun(original, "run-2", experiment.runFields), "run-3", experiment.runFields);

    assert.deepEqual(three.map((run) => run.id), ["run-1", "run-2", "run-3"]);
    assert.equal(original.length, 1, "the original list is not mutated");
    assert.equal(three[1].status, "draft");

    assert.deepEqual(removeDraftRun(three, "run-2").map((run) => run.id), ["run-1", "run-3"]);
    assert.deepEqual(removeDraftRun(three, "nope").map((run) => run.id), ["run-1", "run-2", "run-3"]);
  });

  it("keeps each run's values separate", () => {
    const runs = draftRuns(RUN_1, RUN_2, RUN_3);

    assert.equal(runs[0].runValues.time.value, "20");
    assert.equal(runs[1].runValues.time.value, "10");
    assert.equal(runs[2].runValues.time.value, "5");
  });
});

describe("Calculate All", () => {
  const specs: RunSpec[] = [RUN_1, RUN_2, RUN_3];
  const outcome = calculateAll(draftRuns(...specs));

  it("calculates every run and gives each its own results", () => {
    assert.deepEqual(outcome.runs.map((run) => run.status), ["calculated", "calculated", "calculated"]);

    outcome.runs.forEach((run, index) => {
      const expected = expectedPipeflow(...(specs[index] as [number, number, number, number]));

      for (const key of ["Q", "V", "NRe", "Rm", "deltaP", "f"] as const) {
        assert.ok(closeTo(run.result!.calculated[key], expected[key]), `run ${index + 1} ${key}`);
      }
    });

    assert.notEqual(outcome.runs[0].result!.calculated.NRe, outcome.runs[1].result!.calculated.NRe);
  });

  it("uses the outputs returned by the engine, with their decimals, for every run", () => {
    for (const run of outcome.runs) {
      assert.deepEqual(run.result!.outputs.map((output) => output.key), ["deltaP", "Q", "V", "NRe", "f"]);
    }

    assert.equal(outcome.runs[0].result!.outputs.find((output) => output.key === "NRe")?.displayValue, "125");
    assert.equal(outcome.runs[1].result!.outputs.find((output) => output.key === "NRe")?.displayValue, "250");
    assert.equal(outcome.runs[2].result!.outputs.find((output) => output.key === "NRe")?.displayValue, "500");
  });

  it("calls the engine once per run, with the shared setup and that run's own values", () => {
    const seen: CalculateExperimentParams[] = [];

    calculateAllDraftRuns({
      experiment,
      setup,
      runs: draftRuns(RUN_1, RUN_2),
      calculate: (params) => {
        seen.push(params);
        return calculateExperiment(params);
      },
    });

    assert.equal(seen.length, 2);
    assert.equal(seen[0].inputs, setup);
    assert.equal(seen[1].inputs, setup, "every run reuses the same setup");
    assert.equal(seen[0].runValues.time.value, "20");
    assert.equal(seen[1].runValues.time.value, "10");
  });

  it("reports no setup or definition problems for a valid experiment", () => {
    assert.deepEqual(outcome.setupIssues, []);
    assert.deepEqual(outcome.definitionIssues, []);
  });

  it("does not mutate the runs it was given", () => {
    const runs = draftRuns(RUN_1);
    const before = JSON.stringify(runs);

    calculateAll(runs);

    assert.equal(JSON.stringify(runs), before);
    assert.equal(runs[0].status, "draft");
  });
});

describe("Calculate All: one failing run", () => {
  const runs = draftRuns(RUN_1, RUN_2, [50, 10, 0.1, 0], [60, 10, 0.1, 4]);
  const outcome = calculateAll(runs);

  it("marks only the failing run as an error and keeps the successful ones", () => {
    assert.deepEqual(outcome.runs.map((run) => run.status), ["calculated", "calculated", "error", "calculated"]);
    assert.ok(outcome.runs[0].result);
    assert.ok(outcome.runs[1].result);
    assert.equal(outcome.runs[2].result, undefined);
    assert.ok(outcome.runs[3].result);
  });

  it("identifies what is wrong with the failing run", () => {
    const [first] = outcome.runs[2].errors;

    assert.equal(first.code, "DIVISION_BY_ZERO");
    assert.equal(first.formulaKey, "Q");
    assert.match(first.userMessage, /Unable to calculate this result/);
  });

  it("attributes missing run values to the run, by field", () => {
    const withBlank = calculateAll(draftRuns(RUN_1, ["", 10, 0.1, 20]));

    assert.equal(withBlank.runs[0].status, "calculated");
    assert.equal(withBlank.runs[1].status, "error");
    assert.equal(withBlank.runs[1].errors[0].code, "INPUT_REQUIRED");
    assert.equal(withBlank.runs[1].errors[0].fieldKey, "lhs");
    assert.equal(withBlank.runs[1].errors[0].fieldKind, "run");
    assert.deepEqual(withBlank.setupIssues, []);
  });

  it("lets the student fix the run and calculate again", () => {
    const fixed = editDraftRunValue(outcome.runs, "run-3", "time", "5");
    const again = calculateAll(fixed);

    assert.deepEqual(again.runs.map((run) => run.status), ["calculated", "calculated", "calculated", "calculated"]);
  });

  it("still graphs the runs that succeeded", () => {
    const [graph] = buildRunGraphs(experiment, outcome.runs);

    assert.equal(graph.graph?.points.length, 3, "runs 1, 2 and 4");
    assert.deepEqual(graph.graph?.points.map((point) => point.runId), ["run-1", "run-2", "run-4"]);
  });
});

describe("Calculate All: setup and definition problems are reported once, not per run", () => {
  it("reports an invalid setup input a single time and leaves the runs as drafts", () => {
    const badSetup = { ...setup, pipeDiameter: { value: "abc", unit: "mm" } };
    const outcome = calculateAllDraftRuns({ experiment, setup: badSetup, runs: draftRuns(RUN_1, RUN_2, RUN_3) });

    assert.equal(outcome.setupIssues.length, 1);
    assert.equal(outcome.setupIssues[0].fieldKey, "pipeDiameter");
    assert.equal(outcome.setupIssues[0].code, "INPUT_INVALID_NUMBER");
    assert.deepEqual(outcome.runs.map((run) => run.status), ["draft", "draft", "draft"]);
    assert.ok(outcome.runs.every((run) => run.result === undefined && run.errors.length === 0));
  });

  it("separates a bad setup from a bad run", () => {
    const badSetup = { ...setup, pipeLength: { value: "", unit: "m" } };
    const outcome = calculateAllDraftRuns({ experiment, setup: badSetup, runs: draftRuns(RUN_1, ["", 10, 0.1, 20]) });

    assert.equal(outcome.setupIssues.length, 1);
    assert.equal(outcome.runs[0].status, "draft");
    assert.equal(outcome.runs[1].status, "error", "its own blank LHS is still the run's problem");
  });

  it("reports an experiment definition problem once, without blaming any run", () => {
    const venturi = normalizedVenturi();
    const runs = [createDraftRun("a", venturi.runFields), createDraftRun("b", venturi.runFields)].map((run) => ({
      ...run,
      runValues: {
        lhs: { value: "100", unit: "mm" },
        rhs: { value: "50", unit: "mm" },
        height: { value: "0.1", unit: "m" },
        time: { value: "10", unit: "s" },
      },
    }));
    const inputs = {
      pipeDiameter: { value: "50", unit: "mm" },
      throatDiameter: { value: "25", unit: "mm" },
      tankArea: { value: "0.1", unit: "m²" },
      manometerDensity: { value: "13600", unit: "kg/m³" },
      fluidDensity: { value: "1000", unit: "kg/m³" },
      viscosity: { value: "0.001", unit: "Pa·s" },
    };

    const outcome = calculateAllDraftRuns({ experiment: venturi, setup: inputs, runs });

    assert.equal(outcome.definitionIssues.length, 4, "four formulas lack an expression, reported once");
    assert.ok(outcome.definitionIssues.every((issue) => issue.code === "FORMULA_EXPRESSION_MISSING"));
    assert.deepEqual(outcome.runs.map((run) => run.status), ["draft", "draft"]);
  });
});

describe("editing invalidates stale results", () => {
  const calculated = calculateAll(draftRuns(RUN_1, RUN_2, RUN_3)).runs;

  it("clears only the edited run's results when a run value changes", () => {
    const edited = editDraftRunValue(calculated, "run-2", "height", "0.2");

    assert.equal(edited[1].status, "draft");
    assert.equal(edited[1].result, undefined);
    assert.deepEqual(edited[1].errors, []);
    assert.equal(edited[1].runValues.height.value, "0.2");
    assert.equal(edited[0], calculated[0], "the other runs are untouched");
    assert.equal(edited[2], calculated[2]);
  });

  it("also clears an error state when a failing run is edited", () => {
    const failing = calculateAll(draftRuns(RUN_1, [50, 10, 0.1, 0])).runs;
    const edited = editDraftRunValue(failing, "run-2", "time", "5");

    assert.equal(edited[1].status, "draft");
    assert.deepEqual(edited[1].errors, []);
  });

  it("clears the results when a run's unit changes", () => {
    const venturiRun = createDraftRun("v", normalizedVenturi().runFields);
    const done: DraftRun = { ...venturiRun, status: "calculated" };
    const edited = editDraftRunUnit([done], "v", "lhs", "cm");

    assert.equal(edited[0].runValues.lhs.unit, "cm");
    assert.equal(edited[0].status, "draft");
  });

  it("sets a unit without disturbing the value", () => {
    assert.deepEqual(setQuantityUnit({ a: { value: "5", unit: "m" } }, "a", "cm"), { a: { value: "5", unit: "cm" } });
  });

  it("invalidates every calculated run when the experiment setup changes", () => {
    const invalidated = invalidateCalculatedRuns(calculated);

    assert.deepEqual(invalidated.map((run) => run.status), ["draft", "draft", "draft"]);
    assert.ok(invalidated.every((run) => run.result === undefined));
    assert.equal(invalidated[1].runValues.time.value, "10", "the student's run values are kept");
  });

  it("leaves the graph with nothing to plot after invalidation", () => {
    const [graph] = buildRunGraphs(experiment, invalidateCalculatedRuns(calculated));

    assert.equal(graph.graph, null);
    assert.equal(describeGraphState(graph, 0).kind, "message");
  });
});

describe("graph from all calculated runs", () => {
  const runs = calculateAll(draftRuns(RUN_1, RUN_2, RUN_3)).runs;
  const [generation] = buildRunGraphs(experiment, runs);

  it("recognises the pipeflow graph as configured", () => {
    assert.equal(generation.status, "ready");
    assert.equal(generation.graph?.title, "f vs NRe");
    assert.equal(generation.graph?.xKey, "NRe");
    assert.equal(generation.graph?.yKey, "f");
    assert.equal(generation.graph?.xLabel, "N_Re");
    assert.equal(generation.graph?.yLabel, "f");
    assert.equal(generation.graph?.scale, "log");
  });

  it("has one point per calculated run, taken from the stored xKey / yKey", () => {
    const points = generation.graph!.points;

    assert.equal(points.length, 3);

    [RUN_1, RUN_2, RUN_3].forEach((spec, index) => {
      const expected = expectedPipeflow(...(spec as [number, number, number, number]));

      assert.ok(closeTo(points[index].x, expected.NRe), `NRe of run ${index + 1}`);
      assert.ok(closeTo(points[index].y, expected.f), `f of run ${index + 1}`);
    });
  });

  it("renders a chart for two or more calculated runs", () => {
    const view = describeGraphState(generation, 3);

    assert.equal(view.kind, "chart");
  });

  it("gains a point for each extra calculated run", () => {
    const four = calculateAll(addDraftRun(runs, "run-4", experiment.runFields).map((run) =>
      run.id === "run-4" ? { ...run, runValues: pipeflowRunValues(60, 10, 0.1, 4) } : run,
    )).runs;
    const [next] = buildRunGraphs(experiment, four);

    assert.equal(next.graph?.points.length, 4);
    assert.ok(closeTo(next.graph!.points[3].x, expectedPipeflow(60, 10, 0.1, 4).NRe));
  });

  it("shows a helpful message, not 'not configured', when nothing is calculated yet", () => {
    const [empty] = buildRunGraphs(experiment, draftRuns(RUN_1, RUN_2));
    const view = describeGraphState(empty, 0);

    assert.equal(view.kind, "message");
    assert.equal(view.kind === "message" && view.message, "Calculate at least two runs to generate the graph.");
  });

  it("asks for another run when only one is calculated, and still has its point", () => {
    const [single] = buildRunGraphs(experiment, calculateAll(draftRuns(RUN_1)).runs);
    const view = describeGraphState(single, 1);

    assert.equal(single.graph?.points.length, 1);
    assert.equal(view.kind, "message");
    assert.equal(view.kind === "message" && view.message, "Add another calculated run to see the trend.");
    assert.equal(view.kind === "message" && view.graph?.points.length, 1);
  });

  it("never reports a valid configuration as 'not configured' (regression)", () => {
    // LHS = RHS gives f = 0, which has no place on a log axis. That is a data problem, not a missing configuration.
    const zero = calculateAll(draftRuns([10, 10, 0.1, 20], [10, 10, 0.1, 10])).runs;
    const [zeroGeneration] = buildRunGraphs(experiment, zero);
    const view = describeGraphState(zeroGeneration, 2);

    assert.equal(zeroGeneration.status, "empty");
    assert.equal(view.kind, "message");
    assert.notEqual(view.kind === "message" && view.message, "This graph is not configured yet.");
    assert.equal(view.kind === "message" && view.message, "None of the calculated runs can be plotted.");
    assert.equal(view.notes.length, 2);
  });

  it("charts the plottable runs and explains the one left out", () => {
    const mixed = calculateAll(draftRuns(RUN_1, [10, 10, 0.1, 10], RUN_3)).runs;
    const [mixedGeneration] = buildRunGraphs(experiment, mixed);
    const view = describeGraphState(mixedGeneration, 3);

    assert.equal(view.kind, "chart");
    assert.equal(view.kind === "chart" && view.graph.points.length, 2);
    assert.deepEqual(view.notes, ["Run 2 is not plotted: its values must be positive on a log scale."]);
  });

  it("says only one run can be plotted when the others are excluded", () => {
    const partial = calculateAll(draftRuns(RUN_1, [10, 10, 0.1, 10])).runs;
    const [partialGeneration] = buildRunGraphs(experiment, partial);
    const view = describeGraphState(partialGeneration, 2);

    assert.equal(view.kind, "message");
    assert.equal(view.kind === "message" && view.message, "Only one run can be plotted so far.");
  });
});

describe("Save All Runs", () => {
  const calculated = calculateAll(draftRuns(RUN_1, RUN_2, RUN_3)).runs;

  it("saves every calculated run and marks each one saved", async () => {
    const saver = fakeSaver();
    const outcome = await saveDraftRuns({ runs: calculated, save: saver.save });

    assert.deepEqual(saver.calls, ["run-1", "run-2", "run-3"]);
    assert.equal(outcome.savedCount, 3);
    assert.deepEqual(outcome.failedRunIds, []);
    assert.deepEqual(outcome.runs.map((run) => run.savedRunId), ["saved-1", "saved-2", "saved-3"]);
    assert.ok(outcome.runs.every((run) => run.status === "calculated" && run.result), "results stay visible");
  });

  it("hands the saver each run's own values and results", async () => {
    const saver = fakeSaver();

    await saveDraftRuns({ runs: calculated, save: saver.save });

    assert.equal(saver.payloads[1].runValues.time.value, "10");
    assert.ok(closeTo(saver.payloads[1].result!.results.NRe, expectedPipeflow(...(RUN_2 as [number, number, number, number])).NRe));
  });

  it("never saves runs that failed or were not calculated", async () => {
    const saver = fakeSaver();
    const mixed = [
      ...calculated.slice(0, 1),
      ...calculateAll(draftRuns([50, 10, 0.1, 0])).runs.map((run) => ({ ...run, id: "bad" })),
      { ...createDraftRun("untouched", experiment.runFields) },
    ];
    const outcome = await saveDraftRuns({ runs: mixed, save: saver.save });

    assert.deepEqual(saver.calls, ["run-1"]);
    assert.equal(outcome.skippedCount, 2);
    assert.equal(outcome.runs[1].savedRunId, undefined);
    assert.equal(outcome.runs[2].savedRunId, undefined);
  });

  it("does nothing when there is nothing calculated to save", async () => {
    const saver = fakeSaver();
    const outcome = await saveDraftRuns({ runs: draftRuns(RUN_1), save: saver.save });

    assert.equal(outcome.savedCount, 0);
    assert.deepEqual(saver.calls, []);
  });

  it("keeps a failed run as an unsaved draft and reports which one failed", async () => {
    const saver = fakeSaver(["run-2"]);
    const errors: string[] = [];
    const outcome = await saveDraftRuns({
      runs: calculated,
      save: saver.save,
      onError: (run) => errors.push(run.id),
    });

    assert.equal(outcome.savedCount, 2);
    assert.deepEqual(outcome.failedRunIds, ["run-2"]);
    assert.deepEqual(errors, ["run-2"]);

    const failed = outcome.runs[1];

    assert.equal(failed.savedRunId, undefined);
    assert.equal(failed.status, "calculated", "the calculation is not thrown away");
    assert.ok(failed.result);
    assert.equal(failed.saveError, "This run could not be saved.");
    assert.doesNotMatch(String(failed.saveError), /permission/i, "no internals reach the student");
    assert.equal(outcome.runs[0].savedRunId, "saved-1");
    assert.equal(outcome.runs[2].savedRunId, "saved-2");
  });

  it("saves only the failed run when the student retries", async () => {
    const first = fakeSaver(["run-2"]);
    const afterFailure = await saveDraftRuns({ runs: calculated, save: first.save });

    const retry = fakeSaver();
    const afterRetry = await saveDraftRuns({ runs: afterFailure.runs, save: retry.save });

    assert.deepEqual(retry.calls, ["run-2"], "runs 1 and 3 are not saved a second time");
    assert.equal(afterRetry.savedCount, 1);
    assert.equal(afterRetry.runs[1].saveError, undefined);
    assert.ok(afterRetry.runs.every((run) => run.savedRunId !== undefined));
  });
});

describe("duplicate save protection", () => {
  const calculated = calculateAll(draftRuns(RUN_1, RUN_2)).runs;

  it("does not save runs that are already saved", async () => {
    const first = fakeSaver();
    const saved = await saveDraftRuns({ runs: calculated, save: first.save });
    const second = fakeSaver();
    const again = await saveDraftRuns({ runs: saved.runs, save: second.save });

    assert.deepEqual(second.calls, []);
    assert.equal(again.savedCount, 0);
    assert.equal(again.skippedCount, 2);
  });

  it("saves a run added later without re-saving the earlier ones", async () => {
    const first = fakeSaver();
    const saved = await saveDraftRuns({ runs: calculated, save: first.save });
    const withThird = addDraftRun(saved.runs, "run-3", experiment.runFields).map((run) =>
      run.id === "run-3" ? { ...run, runValues: pipeflowRunValues(...RUN_3) } : run,
    );
    const recalculated = calculateAll(withThird).runs;

    assert.equal(recalculated[0].savedRunId, "saved-1", "saved runs survive Calculate All");
    assert.equal(recalculated[0].result, saved.runs[0].result, "and are not recalculated");

    const second = fakeSaver();

    await saveDraftRuns({ runs: recalculated, save: second.save });

    assert.deepEqual(second.calls, ["run-3"]);
  });

  it("ignores a second tap while the first save is still running", async () => {
    const saver = fakeSaver();
    const singleFlight = createSingleFlight<Awaited<ReturnType<typeof saveDraftRuns>>>();
    const task = () => saveDraftRuns({ runs: calculated, save: saver.save });

    const [a, b] = await Promise.all([singleFlight(task), singleFlight(task)]);

    assert.deepEqual(saver.calls, ["run-1", "run-2"], "each run is saved exactly once");
    assert.equal(a, b, "both taps receive the same result");
  });

  it("accepts a new save once the previous one has finished", async () => {
    const saver = fakeSaver();
    const singleFlight = createSingleFlight<number>();
    let runs = 0;

    await singleFlight(async () => (runs += 1));
    await singleFlight(async () => (runs += 1));

    assert.equal(runs, 2);
    assert.deepEqual(saver.calls, []);
  });
});

describe("saved runs are frozen", () => {
  it("cannot be edited, removed or invalidated, and are not recalculated", async () => {
    const calculated = calculateAll(draftRuns(RUN_1, RUN_2)).runs;
    const saved = (await saveDraftRuns({ runs: calculated, save: fakeSaver().save })).runs;

    assert.equal(hasSavedRuns(saved), true);
    assert.equal(editDraftRunValue(saved, "run-1", "time", "99")[0], saved[0]);
    assert.equal(editDraftRunUnit(saved, "run-1", "time", "s")[0], saved[0]);
    assert.equal(removeDraftRun(saved, "run-1").length, 2);
    assert.deepEqual(invalidateCalculatedRuns(saved), saved);

    let engineCalls = 0;

    calculateAllDraftRuns({
      experiment,
      setup,
      runs: saved,
      calculate: (params) => {
        engineCalls += 1;
        return calculateExperiment(params);
      },
    });

    assert.equal(engineCalls, 0);
  });
});

describe("drafting never writes anywhere", () => {
  it("only saveDraftRuns can reach persistence, and only through the function it is given", () => {
    const saver = fakeSaver();
    let runs = draftRuns(RUN_1);

    runs = addDraftRun(runs, "run-2", experiment.runFields);
    runs = editDraftRunValue(runs, "run-2", "time", "10");
    runs = calculateAll(runs).runs;
    runs = removeDraftRun(runs, "run-2");
    buildRunGraphs(experiment, runs);

    assert.deepEqual(saver.calls, []);
  });
});
