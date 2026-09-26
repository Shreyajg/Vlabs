import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDraftRun,
  calculateAllDraftRuns,
  createDraftRun,
  editDraftRunValue,
  saveDraftRuns,
  type DraftRun,
} from "../../calculation/draftRuns";
import {
  normalizedPipeflow,
  pipeflowEntries,
} from "../../calculation/__tests__/fixtures";
import { createAuthService } from "../createAuthService";
import { fakeBackend, fakeStore } from "./authFakes";

const experiment = normalizedPipeflow();
const setup = pipeflowEntries().inputs;

function threeRuns(): DraftRun[] {
  let runs = [createDraftRun("r1", experiment.runFields)];

  runs = addDraftRun(runs, "r2", experiment.runFields);
  runs = addDraftRun(runs, "r3", experiment.runFields);

  const values: [string, string, string, string][] = [
    ["30", "10", "0.1", "20"],
    ["40", "10", "0.1", "10"],
    ["50", "10", "0.1", "5"],
  ];

  values.forEach(([lhs, rhs, height, time], index) => {
    const id = `r${index + 1}`;

    runs = editDraftRunValue(runs, id, "lhs", lhs);
    runs = editDraftRunValue(runs, id, "rhs", rhs);
    runs = editDraftRunValue(runs, id, "height", height);
    runs = editDraftRunValue(runs, id, "time", time);
  });

  return runs;
}

function auth(accounts: Record<string, string> = {}) {
  return createAuthService(fakeBackend({ accounts }).backend, fakeStore().store);
}

describe("local calculation does not depend on authentication", () => {
  it("calculates every run while nobody is signed in", () => {
    const service = auth();

    assert.equal(service.getCurrentUserId(), null);

    const { runs } = calculateAllDraftRuns({ experiment, setup, runs: threeRuns() });

    assert.deepEqual(runs.map((run) => run.status), ["calculated", "calculated", "calculated"]);
    assert.ok(runs.every((run) => run.result), "results are produced without a user");
  });

  it("keeps working after a sign-out, with the drafts intact", async () => {
    const service = auth({ "ada@example.com": "engine1842" });

    await service.signIn("ada@example.com", "engine1842");

    const first = calculateAllDraftRuns({ experiment, setup, runs: threeRuns() }).runs;

    await service.signOut();

    const again = calculateAllDraftRuns({ experiment, setup, runs: first }).runs;

    assert.equal(service.getCurrentUserId(), null);
    assert.deepEqual(again.map((run) => run.status), ["calculated", "calculated", "calculated"]);
  });
});

describe("Save All Runs takes its studentId from the auth layer", () => {
  it("saves each run under the signed-in user's uid", async () => {
    const service = auth({ "ada@example.com": "engine1842" });
    const user = await service.signIn("ada@example.com", "engine1842");
    const calculated = calculateAllDraftRuns({ experiment, setup, runs: threeRuns() }).runs;

    const studentId = service.getCurrentUserId();

    assert.equal(studentId, user.uid);

    const saved: { studentId: string; runId: string }[] = [];
    const outcome = await saveDraftRuns({
      runs: calculated,
      save: async (run) => {
        saved.push({ studentId: studentId as string, runId: run.id });

        return `doc-${run.id}`;
      },
    });

    assert.equal(outcome.savedCount, 3);
    assert.deepEqual(saved.map((entry) => entry.studentId), [user.uid, user.uid, user.uid]);
  });

  it("has no uid when signed out, so the screen asks the student to sign in instead of saving", () => {
    const service = auth();

    assert.equal(service.getCurrentUserId(), null, "nothing to save under");
  });

  it("uses the newly registered student's uid straight after sign-up", async () => {
    const service = auth();
    const { user } = await service.signUp("new@example.com", "engine1842", { name: "New Student" });

    assert.equal(service.getCurrentUserId(), user.uid);
  });
});
