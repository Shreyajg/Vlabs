import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { AuthError } from "../authErrors";
import { authReducer, initialAuthState, roleOf, type AuthAction, type AuthState } from "../authState";
import { startAuthSync } from "../authSync";
import {
  ACADEMIC_MAX_LENGTH,
  NAME_MAX_LENGTH,
  hasErrors,
  isFacultyProfileEdit,
  validateFacultyProfileEdit,
} from "../authValidation";
import { createAuthService } from "../createAuthService";
import { academicValue, buildFacultyProfileUpdate, buildProfileUpdate, parseUserProfile } from "../userProfile";
import { fakeBackend, fakeStore, firebaseError, profileOf, tick } from "./authFakes";

const signedIn = { displayName: null, email: "faculty@example.com" };

// What the Faculty Edit Profile screen submits.
const EDIT = { name: "Dr Faculty One", university: "Analytical University", department: "Chemical Engineering" };
const STUDENT_EDIT = { name: "Ada", university: "AU", program: "B.Tech", branch: "Chemical" };

function service(options: { updateError?: unknown; profiles?: ReturnType<typeof profileOf>[] } = {}) {
  const backend = fakeBackend({ accounts: { "faculty@example.com": "engine1842" } });
  const store = fakeStore({
    profiles: options.profiles ?? [profileOf("uid-1", "faculty")],
    updateError: options.updateError,
  });
  const auth = createAuthService(backend.backend, store.store);

  return { auth, backend, store };
}

async function rejection(promise: Promise<unknown>): Promise<AuthError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof AuthError, "expected an AuthError, never a raw Firebase error");

    return error;
  }

  return assert.fail("expected the promise to reject");
}

describe("faculty profile: reading users/{uid}", () => {
  it("reads the department and institution (university) a faculty member saved", () => {
    const profile = parseUserProfile(
      "u1",
      { name: "Dr X", role: "faculty", university: " Analytical University ", department: "  Chemical Engineering " },
      signedIn,
    );

    assert.equal(profile.role, "faculty");
    assert.equal(profile.university, "Analytical University");
    assert.equal(profile.department, "Chemical Engineering");
  });

  it("reads a Console-provisioned faculty profile that has no department yet", () => {
    const profile = parseUserProfile(
      "u1",
      { uid: "u1", name: "Dr X", email: "f@x.co", role: "faculty" },
      signedIn,
    );

    assert.equal(profile.department, "");
    assert.equal(profile.university, "");
    assert.equal(academicValue(profile.department), "Not added");
    assert.equal(academicValue(profile.university), "Not added");
    assert.equal(profile.role, "faculty");
  });

  it("treats a wrong-typed department as not added", () => {
    for (const bad of [5, null, { x: 1 }, ["a"]]) {
      assert.equal(parseUserProfile("u1", { department: bad }, signedIn).department, "");
    }
  });
});

describe("faculty profile: validation", () => {
  it("accepts a complete, valid form", () => {
    assert.deepEqual(validateFacultyProfileEdit(EDIT), {});
  });

  it("requires a name", () => {
    for (const name of ["", "   "]) {
      assert.equal(validateFacultyProfileEdit({ ...EDIT, name }).name, "Name is required.");
    }
  });

  it("limits the name length", () => {
    assert.ok(validateFacultyProfileEdit({ ...EDIT, name: "x".repeat(NAME_MAX_LENGTH + 1) }).name);
    assert.equal(validateFacultyProfileEdit({ ...EDIT, name: "x".repeat(NAME_MAX_LENGTH) }).name, undefined);
  });

  it("lets department and institution be left blank, but limits their length", () => {
    assert.deepEqual(validateFacultyProfileEdit({ ...EDIT, department: "", university: "" }), {});

    const errors = validateFacultyProfileEdit({
      ...EDIT,
      department: "d".repeat(ACADEMIC_MAX_LENGTH + 1),
      university: "u".repeat(ACADEMIC_MAX_LENGTH + 1),
    });

    assert.match(errors.department ?? "", /Department must be 100 characters or fewer/);
    assert.match(errors.university ?? "", /Institution must be 100 characters or fewer/);
    assert.equal(
      hasErrors(validateFacultyProfileEdit({ ...EDIT, department: "d".repeat(ACADEMIC_MAX_LENGTH) })),
      false,
      "exactly at the limit is fine",
    );
  });

  it("measures length after trimming, like the value that is saved", () => {
    assert.deepEqual(validateFacultyProfileEdit({ ...EDIT, department: `  ${"d".repeat(ACADEMIC_MAX_LENGTH)}  ` }), {});
  });

  it("tells the two forms apart", () => {
    assert.equal(isFacultyProfileEdit(EDIT), true);
    assert.equal(isFacultyProfileEdit(STUDENT_EDIT), false);
  });
});

describe("faculty profile: buildFacultyProfileUpdate", () => {
  it("keeps exactly name, university and department, trimmed", () => {
    assert.deepEqual(buildFacultyProfileUpdate({ name: " Dr X ", university: " AU ", department: " Chem " }), {
      name: "Dr X",
      university: "AU",
      department: "Chem",
    });
  });

  it("drops role, email, uid, createdAt, program, branch and anything else", () => {
    const hostile = {
      ...EDIT,
      role: "student",
      email: "hijack@example.com",
      uid: "another-user",
      createdAt: "yesterday",
      program: "P",
      branch: "B",
      isAdmin: true,
    };

    assert.deepEqual(Object.keys(buildFacultyProfileUpdate(hostile)).sort(), ["department", "name", "university"]);
  });

  it("leaves the student builder exactly as it was", () => {
    assert.deepEqual(Object.keys(buildProfileUpdate({ ...STUDENT_EDIT })).sort(), ["branch", "name", "program", "university"]);
  });
});

describe("faculty profile: updateProfile", () => {
  it("saves name, university and department to users/{uid} for the signed-in user", async () => {
    const { auth, store } = service();

    await auth.signIn("faculty@example.com", "engine1842");

    const saved = await auth.updateProfile(EDIT);

    assert.deepEqual(saved, EDIT);
    assert.equal(store.updates.length, 1, "exactly one write");
    assert.equal(store.updates[0].uid, "uid-1", "the Firebase uid, not the email");
    assert.deepEqual(store.updates[0].fields, EDIT);
    assert.deepEqual(Object.keys(store.updates[0].fields).sort(), ["department", "name", "university"]);
  });

  it("trims what it saves", async () => {
    const { auth, store } = service();

    await auth.signIn("faculty@example.com", "engine1842");
    await auth.updateProfile({ name: "  Dr X ", university: " AU ", department: " Chem " });

    assert.deepEqual(store.updates[0].fields, { name: "Dr X", university: "AU", department: "Chem" });
  });

  it("preserves uid, email, role and createdAt in the stored document", async () => {
    const before = { ...profileOf("uid-1", "faculty"), createdAt: { toDate: () => new Date(0) } as never };
    const { auth, store } = service({ profiles: [before] });

    await auth.signIn("faculty@example.com", "engine1842");
    await auth.updateProfile(EDIT);

    const after = store.profiles.get("uid-1");

    assert.equal(after?.uid, before.uid);
    assert.equal(after?.email, before.email);
    assert.equal(after?.role, "faculty", "still faculty");
    assert.equal(after?.createdAt, before.createdAt);
    assert.equal(after?.name, "Dr Faculty One");
    assert.equal(after?.university, "Analytical University");
    assert.equal(after?.department, "Chemical Engineering");
  });

  it("cannot be used to change the role, email or uid, or to touch program and branch", async () => {
    const { auth, store } = service();

    await auth.signIn("faculty@example.com", "engine1842");
    await auth.updateProfile({
      ...EDIT,
      role: "student",
      email: "hijack@example.com",
      uid: "someone-else",
      program: "P",
      branch: "B",
    } as unknown as typeof EDIT);

    assert.deepEqual(Object.keys(store.updates[0].fields).sort(), ["department", "name", "university"]);
    assert.equal(store.updates[0].uid, "uid-1", "a caller cannot choose whose profile is written");
    assert.equal(store.profiles.get("uid-1")?.role, "faculty");
    assert.equal(store.profiles.get("uid-1")?.email, "uid-1@example.com");
    assert.equal(store.profiles.get("uid-1")?.program, "", "program untouched");
  });

  it("still saves a student's four fields, and never a department (student path unchanged)", async () => {
    const { auth, store } = service({ profiles: [profileOf("uid-1", "student")] });

    await auth.signIn("faculty@example.com", "engine1842");
    await auth.updateProfile(STUDENT_EDIT);

    assert.deepEqual(Object.keys(store.updates[0].fields).sort(), ["branch", "name", "program", "university"]);
    assert.equal("department" in store.updates[0].fields, false);
  });

  it("rejects an empty name without writing anything", async () => {
    const { auth, store } = service();

    await auth.signIn("faculty@example.com", "engine1842");

    const error = await rejection(auth.updateProfile({ ...EDIT, name: "  " }));

    assert.equal(error.code, "validation");
    assert.equal(error.fieldErrors?.name, "Name is required.");
    assert.equal(store.updates.length, 0);
  });

  it("rejects an over-long department without writing anything", async () => {
    const { auth, store } = service();

    await auth.signIn("faculty@example.com", "engine1842");

    const error = await rejection(auth.updateProfile({ ...EDIT, department: "d".repeat(ACADEMIC_MAX_LENGTH + 1) }));

    assert.equal(error.code, "validation");
    assert.ok(error.fieldErrors?.department);
    assert.equal(store.updates.length, 0);
  });

  it("refuses when nobody is signed in", async () => {
    const { auth, store } = service();

    const error = await rejection(auth.updateProfile(EDIT));

    assert.equal(error.code, "not-signed-in");
    assert.equal(store.updates.length, 0);
  });

  it("reports a rejected write (for example permission-denied) as a friendly error", async () => {
    const { auth, store } = service({ updateError: firebaseError("permission-denied") });

    await auth.signIn("faculty@example.com", "engine1842");

    const error = await rejection(auth.updateProfile(EDIT));

    assert.equal(error.code, "profile-update-failed");
    assert.equal(store.updates.length, 1, "the write was attempted");
    assert.equal(store.profiles.get("uid-1")?.department, undefined, "and nothing was stored");
    assert.doesNotMatch(error.message, /permission-denied|firebase/i, "no internals shown to the user");
  });

  it("reports a network failure as such", async () => {
    const { auth } = service({ updateError: firebaseError("unavailable") });

    await auth.signIn("faculty@example.com", "engine1842");

    assert.equal((await rejection(auth.updateProfile(EDIT))).code, "network");
  });
});

describe("faculty profile: shared state (the reducer)", () => {
  function authenticated(): AuthState {
    let state = initialAuthState;
    const user = { uid: "uid-1", email: "faculty@example.com", displayName: null };
    const actions: AuthAction[] = [
      { type: "user-detected", user },
      { type: "profile-loaded", user, profile: profileOf("uid-1", "faculty") },
    ];

    for (const action of actions) state = authReducer(state, action);

    return state;
  }

  it("merges name, university and department, so the Profile screen updates at once", () => {
    const state = authReducer(authenticated(), { type: "profile-updated", uid: "uid-1", fields: EDIT });

    assert.equal(state.profile?.name, "Dr Faculty One");
    assert.equal(state.profile?.university, "Analytical University");
    assert.equal(state.profile?.department, "Chemical Engineering");
  });

  it("changes nothing else: role, email, uid, program, branch and createdAt", () => {
    const before = authenticated();
    const after = authReducer(before, { type: "profile-updated", uid: "uid-1", fields: EDIT });

    assert.equal(roleOf(after), "faculty");
    for (const key of ["uid", "email", "role", "program", "branch", "createdAt"] as const) {
      assert.equal(after.profile?.[key], before.profile?.[key], key);
    }
    assert.equal(after.status, "authenticated");
  });

  it("cannot inject a role through the action", () => {
    const hostile = { ...EDIT, role: "student" } as unknown as typeof EDIT;
    const after = authReducer(authenticated(), { type: "profile-updated", uid: "uid-1", fields: hostile });

    assert.equal(roleOf(after), "faculty");
  });

  it("does not disturb a stored department when a student-shaped update arrives", () => {
    const withDepartment = authReducer(authenticated(), { type: "profile-updated", uid: "uid-1", fields: EDIT });
    const after = authReducer(withDepartment, { type: "profile-updated", uid: "uid-1", fields: STUDENT_EDIT });

    assert.equal(after.profile?.department, "Chemical Engineering");
    assert.equal(after.profile?.program, "B.Tech");
  });

  it("ignores an update for a different user", () => {
    const state = authenticated();

    assert.equal(authReducer(state, { type: "profile-updated", uid: "other", fields: EDIT }), state);
  });
});

describe("faculty profile: end to end", () => {
  it("shows 'Not added' first, then the saved values, and they survive a reload", async () => {
    const backend = fakeBackend({ accounts: { "faculty@example.com": "engine1842" } });
    const store = fakeStore({ profiles: [profileOf("uid-1", "faculty")] });
    const auth = createAuthService(backend.backend, store.store);
    let state = initialAuthState;
    const dispatch = (action: AuthAction) => {
      state = authReducer(state, action);
    };

    startAuthSync(auth, dispatch);
    await tick();
    await auth.signIn("faculty@example.com", "engine1842");
    await tick();
    await tick();

    assert.equal(roleOf(state), "faculty");
    assert.deepEqual(
      [state.profile?.department, state.profile?.university].map(academicValue),
      ["Not added", "Not added"],
    );

    // What AuthProvider.updateProfile does: save, then update the shared state.
    const fields = await auth.updateProfile(EDIT);

    dispatch({ type: "profile-updated", uid: auth.getCurrentUserId() as string, fields });

    assert.deepEqual(
      [state.profile?.department, state.profile?.university].map(academicValue),
      ["Chemical Engineering", "Analytical University"],
    );
    assert.equal(state.profile?.name, "Dr Faculty One");

    // F5, or logging out and back in: a fresh service and state read the same stored document.
    let reloaded = initialAuthState;
    const second = createAuthService(backend.backend, store.store);

    startAuthSync(second, (action) => {
      reloaded = authReducer(reloaded, action);
    });
    await tick();
    await tick();

    assert.equal(reloaded.status, "authenticated");
    assert.equal(roleOf(reloaded), "faculty");
    assert.equal(reloaded.profile?.name, "Dr Faculty One");
    assert.equal(reloaded.profile?.department, "Chemical Engineering");
    assert.equal(reloaded.profile?.university, "Analytical University");
  });
});

describe("faculty profile: the app and the Firestore rules agree", () => {
  // Reads the real rules file, so the app cannot start writing a field the rules would reject
  // (which is exactly what happened with `department` before the rules were updated).
  const rules = readFileSync(join(process.cwd(), "firebase", "firestore.rules"), "utf8");
  const updateRule = rules.slice(rules.indexOf("allow update: if isOwner(uid)"));
  const allowList = /hasOnly\(\[([^\]]*)\]\)/.exec(updateRule)?.[1]
    .split(",")
    .map((entry) => entry.trim().replace(/^'|'$/g, ""))
    .filter(Boolean);

  it("finds the profile-update allow-list in the rules", () => {
    assert.ok(allowList && allowList.length > 0, "could not read the allow-list from firebase/firestore.rules");
  });

  it("allows every field a faculty update writes", () => {
    for (const key of Object.keys(buildFacultyProfileUpdate(EDIT))) {
      assert.ok(allowList?.includes(key), `the rules do not allow "${key}"`);
    }
  });

  it("allows every field a student update writes", () => {
    for (const key of Object.keys(buildProfileUpdate(STUDENT_EDIT))) {
      assert.ok(allowList?.includes(key), `the rules do not allow "${key}"`);
    }
  });

  it("never allows the fields that must stay immutable", () => {
    for (const key of ["uid", "email", "role", "createdAt"]) {
      assert.equal(allowList?.includes(key), false, `the rules must not allow "${key}"`);
    }
  });
});
