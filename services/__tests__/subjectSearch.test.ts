import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeExperiment } from "../normalizeExperiment";
import type { NormalizedExperiment, RawExperimentData } from "../../types/Experiment";
import { searchSubjectsAndExperiments, type SubjectLike } from "../subjectSearch";

// Pure module: nothing here touches Firestore.

function experiment(overrides: Partial<RawExperimentData> & { id: string; subjectId: string }): NormalizedExperiment {
  return normalizeExperiment({
    id: overrides.id,
    subjectId: overrides.subjectId,
    data: { title: overrides.id, aim: [], ...overrides } as RawExperimentData,
  });
}

const fluidMechanics: SubjectLike = { id: "fluid-mechanics", title: "Fluid Mechanics", description: "Flow, pressure and viscosity labs." };
const heatTransfer: SubjectLike = { id: "heat-transfer", title: "Heat Transfer" };
const subjects: SubjectLike[] = [fluidMechanics, heatTransfer];

const venturimeter = experiment({ id: "venturimeter", subjectId: "fluid-mechanics", title: "Venturimeter", aim: ["To calibrate the given Venturi meter."] });
const orificemeter = experiment({ id: "orificemeter", subjectId: "fluid-mechanics", title: "Orifice Meter", aim: ["To calibrate the given orifice meter."] });
const centrifugalpump = experiment({ id: "centrifugalpump", subjectId: "fluid-mechanics", title: "Centrifugal Pump", aim: ["To study the behavior of a centrifugal pump."] });

const experimentsBySubject = new Map<string, NormalizedExperiment[]>([
  ["fluid-mechanics", [venturimeter, orificemeter, centrifugalpump]],
  ["heat-transfer", []],
]);

describe("searchSubjectsAndExperiments", () => {
  it("an empty or whitespace-only query matches nothing (the caller shows the unfiltered list instead)", () => {
    assert.deepEqual(searchSubjectsAndExperiments("", subjects, experimentsBySubject), { subjects: [], experiments: [] });
    assert.deepEqual(searchSubjectsAndExperiments("   ", subjects, experimentsBySubject), { subjects: [], experiments: [] });
  });

  it("matches a subject by title: 'fluid' finds Fluid Mechanics", () => {
    const result = searchSubjectsAndExperiments("fluid", subjects, experimentsBySubject);

    assert.deepEqual(result.subjects.map((s) => s.id), ["fluid-mechanics"]);
  });

  it("matches a subject by description too", () => {
    const result = searchSubjectsAndExperiments("viscosity", subjects, experimentsBySubject);

    assert.deepEqual(result.subjects.map((s) => s.id), ["fluid-mechanics"]);
  });

  it("matches an experiment by title: 'venturi' finds Venturimeter, paired with its subject's title", () => {
    const result = searchSubjectsAndExperiments("venturi", subjects, experimentsBySubject);

    assert.equal(result.subjects.length, 0, "no subject named venturi");
    assert.equal(result.experiments.length, 1);
    assert.equal(result.experiments[0].experiment.id, "venturimeter");
    assert.equal(result.experiments[0].subjectTitle, "Fluid Mechanics");
  });

  it("matches an experiment by title: 'pump' finds Centrifugal Pump", () => {
    const result = searchSubjectsAndExperiments("pump", subjects, experimentsBySubject);

    assert.deepEqual(result.experiments.map((m) => m.experiment.id), ["centrifugalpump"]);
  });

  it("matches an experiment by title: 'orifice' finds Orifice Meter", () => {
    const result = searchSubjectsAndExperiments("orifice", subjects, experimentsBySubject);

    assert.deepEqual(result.experiments.map((m) => m.experiment.id), ["orificemeter"]);
  });

  it("also matches an experiment by its aim text (the description stand-in)", () => {
    const result = searchSubjectsAndExperiments("calibrate", subjects, experimentsBySubject);

    assert.deepEqual(
      result.experiments.map((m) => m.experiment.id).sort(),
      ["orificemeter", "venturimeter"],
    );
  });

  it("a query with no match anywhere returns both lists empty, not an error", () => {
    const result = searchSubjectsAndExperiments("nonexistent-query-xyz", subjects, experimentsBySubject);

    assert.deepEqual(result, { subjects: [], experiments: [] });
  });

  it("is case-insensitive and trims surrounding whitespace", () => {
    assert.deepEqual(
      searchSubjectsAndExperiments("  VENTURI  ", subjects, experimentsBySubject).experiments.map((m) => m.experiment.id),
      ["venturimeter"],
    );
  });

  it("a subject with no experiments loaded (missing from the map) never throws", () => {
    const result = searchSubjectsAndExperiments("heat", subjects, new Map());

    assert.deepEqual(result.subjects.map((s) => s.id), ["heat-transfer"]);
    assert.deepEqual(result.experiments, []);
  });

  it("a subject match and an experiment match from a DIFFERENT subject are not confused with each other", () => {
    const result = searchSubjectsAndExperiments("fluid", subjects, experimentsBySubject);

    assert.deepEqual(result.subjects.map((s) => s.id), ["fluid-mechanics"]);
    assert.deepEqual(result.experiments, [], "no experiment title/aim contains 'fluid' here");
  });

  it("both a subject and one of its own experiments can legitimately match the same query at once", () => {
    // "Fluid Mechanics" subject title contains "mechanics"; give one experiment an aim that also does.
    const mechanicsExperiment = experiment({ id: "mechanics-demo", subjectId: "fluid-mechanics", title: "Demo", aim: ["A mechanics demonstration."] });
    const bySubject = new Map(experimentsBySubject);

    bySubject.set("fluid-mechanics", [...experimentsBySubject.get("fluid-mechanics")!, mechanicsExperiment]);

    const result = searchSubjectsAndExperiments("mechanics", subjects, bySubject);

    assert.deepEqual(result.subjects.map((s) => s.id), ["fluid-mechanics"]);
    assert.deepEqual(result.experiments.map((m) => m.experiment.id), ["mechanics-demo"]);
    // Two distinct rows for two distinct entities: this is not a duplicate, it is two real matches.
    assert.equal(result.subjects.length + result.experiments.length, 2);
  });

  it("preserves subject order for subject matches, and subject-then-definition order for experiment matches", () => {
    const result = searchSubjectsAndExperiments("e", subjects, experimentsBySubject); // "e" is in most titles here

    assert.deepEqual(
      result.experiments.map((m) => m.experiment.id),
      ["venturimeter", "orificemeter", "centrifugalpump"],
    );
  });

  it("a subject with a missing title falls back to its id for both matching and display", () => {
    const untitled: SubjectLike = { id: "mass-transfer" };
    const result = searchSubjectsAndExperiments("mass-transfer", [untitled], new Map());

    assert.deepEqual(result.subjects, [untitled]);
  });
});
