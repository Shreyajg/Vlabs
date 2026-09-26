import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthError } from "../authErrors";
import { authReducer, initialAuthState, roleOf, type AuthAction, type AuthState } from "../authState";
import { ACADEMIC_MAX_LENGTH, hasErrors, validateProfileEdit } from "../authValidation";
import { startAuthSync } from "../authSync";
import { createAuthService } from "../createAuthService";
import {
  NOT_ADDED,
  academicValue,
  buildProfileUpdate,
  parseUserProfile,
  resolveDisplayName,
} from "../userProfile";
import { fakeBackend, fakeStore, firebaseError, profileOf, tick } from "./authFakes";

const signedIn = { displayName: null, email: "ada@example.com" };

describe("profile fields", () => {
  it("reads university, program and branch from users/{uid}", () => {
    const profile = parseUserProfile(
      "u1",
      { name: "Ada", role: "student", university: "  Analytical University ", program: "B.Tech", branch: "Chemical" },
      signedIn,
    );

    assert.equal(profile.university, "Analytical University");
    assert.equal(profile.program, "B.Tech");
    assert.equal(profile.branch, "Chemical");
  });

  it("reads a profile saved before these fields existed without crashing", () => {
    const legacy = parseUserProfile("u1", { uid: "u1", name: "Ada", email: "a@b.co", role: "student" }, signedIn);

    assert.equal(legacy.university, "");
    assert.equal(legacy.program, "");
    assert.equal(legacy.branch, "");
    assert.equal(legacy.role, "student");
  });

  it("treats wrong-typed academic values as not added", () => {
    const profile = parseUserProfile("u1", { university: 5, program: null, branch: { x: 1 } }, signedIn);

    assert.deepEqual([profile.university, profile.program, profile.branch], ["", "", ""]);
  });
});

describe("missing academic fields are displayed, never faked", () => {
  it('shows "Not added" for empty, blank and missing values', () => {
    for (const value of ["", "   ", undefined, null]) {
      assert.equal(academicValue(value), "Not added", JSON.stringify(value));
    }

    assert.equal(NOT_ADDED, "Not added");
  });

  it("shows the real value, trimmed", () => {
    assert.equal(academicValue("  Chemical Engineering "), "Chemical Engineering");
  });

  it("never falls back to placeholder identities from the old mock screen", () => {
    const empty = parseUserProfile("u1", {}, signedIn);

    for (const value of [empty.university, empty.program, empty.branch]) {
      const shown = academicValue(value);

      assert.notEqual(shown, "University Name");
      assert.notEqual(shown, "Chemical Engineering");
    }
  });
});

describe("Home uses the authenticated user's name", () => {
  it("prefers the profile name", () => {
    assert.equal(resolveDisplayName({ name: "Example1" }, signedIn), "Example1");
  });

  it("falls back safely while the profile is missing or has no name", () => {
    assert.equal(resolveDisplayName(null, { displayName: "Ada L", email: "a@b.co" }), "Ada L");
    assert.equal(resolveDisplayName({ name: "  " }, signedIn), "ada");
    assert.equal(resolveDisplayName(null, null), "Student");
  });

  it("is never empty", () => {
    for (const [profile, user] of [[null, null], [{ name: "" }, null], [null, { displayName: "", email: "" }]] as const) {
      assert.ok(resolveDisplayName(profile, user).length > 0);
    }
  });
});

describe("validateProfileEdit", () => {
  const valid = { name: "Ada", university: "AU", program: "BTech", branch: "Chem" };

  it("accepts a full profile", () => {
    assert.deepEqual(validateProfileEdit(valid), {});
  });

  it("lets a student leave the academic fields blank", () => {
    assert.equal(hasErrors(validateProfileEdit({ name: "Ada", university: "", program: "  ", branch: "" })), false);
  });

  it("requires a name", () => {
    assert.equal(validateProfileEdit({ ...valid, name: " " }).name, "Name is required.");
  });

  it("limits the length of every field", () => {
    const long = "x".repeat(ACADEMIC_MAX_LENGTH + 1);
    const errors = validateProfileEdit({ name: "x".repeat(81), university: long, program: long, branch: long });

    assert.deepEqual(Object.keys(errors).sort(), ["branch", "name", "program", "university"]);
  });
});

describe("buildProfileUpdate: what a student can write", () => {
  it("contains exactly name, university, program and branch, trimmed", () => {
    const update = buildProfileUpdate({ name: " Ada ", university: " AU ", program: " BTech ", branch: " Chem " });

    assert.deepEqual(update, { name: "Ada", university: "AU", program: "BTech", branch: "Chem" });
  });

  it("drops role, email, uid and createdAt if a caller smuggles them in", () => {
    const hostile = {
      name: "Eve",
      university: "U",
      program: "P",
      branch: "B",
      role: "faculty",
      email: "someone@else.com",
      uid: "another-user",
      createdAt: "yesterday",
    };
    const update = buildProfileUpdate(hostile);

    assert.deepEqual(Object.keys(update).sort(), ["branch", "name", "program", "university"]);
  });
});

function service(options: { updateError?: unknown; profiles?: ReturnType<typeof profileOf>[] } = {}) {
  const backend = fakeBackend({ accounts: { "ada@example.com": "engine1842" } });
  const store = fakeStore({ profiles: options.profiles ?? [profileOf("uid-1")], updateError: options.updateError });
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

const EDIT = { name: "Example1", university: "Analytical University", program: "B.Tech", branch: "Chemical" };

describe("updateProfile", () => {
  it("saves the four fields to users/{uid} for the signed-in user", async () => {
    const { auth, store } = service();

    await auth.signIn("ada@example.com", "engine1842");

    const saved = await auth.updateProfile(EDIT);

    assert.deepEqual(saved, EDIT);
    assert.equal(store.updates.length, 1);
    assert.equal(store.updates[0].uid, "uid-1", "the Firebase uid, not the email");
    assert.deepEqual(store.updates[0].fields, EDIT);
  });

  it("preserves uid, email, role and createdAt in the stored document", async () => {
    const before = { ...profileOf("uid-1"), createdAt: { toDate: () => new Date(0) } as never };
    const { auth, store } = service({ profiles: [before] });

    await auth.signIn("ada@example.com", "engine1842");
    await auth.updateProfile(EDIT);

    const after = store.profiles.get("uid-1");

    assert.equal(after?.uid, before.uid);
    assert.equal(after?.email, before.email);
    assert.equal(after?.role, "student");
    assert.equal(after?.createdAt, before.createdAt);
    assert.equal(after?.name, "Example1");
    assert.equal(after?.university, "Analytical University");
  });

  it("cannot be used to change the role, email or uid", async () => {
    const { auth, store } = service();

    await auth.signIn("ada@example.com", "engine1842");
    await auth.updateProfile({
      ...EDIT,
      role: "faculty",
      email: "hijack@example.com",
      uid: "someone-else",
    } as unknown as typeof EDIT);

    assert.deepEqual(Object.keys(store.updates[0].fields).sort(), ["branch", "name", "program", "university"]);
    assert.equal(store.updates[0].uid, "uid-1", "a caller cannot choose whose profile is written");
    assert.equal(store.profiles.get("uid-1")?.role, "student");
    assert.equal(store.profiles.get("uid-1")?.email, "uid-1@example.com");
  });

  it("does not upgrade a student to faculty, and leaves a faculty profile's role alone", async () => {
    const { auth, store } = service({ profiles: [profileOf("uid-1", "faculty")] });

    await auth.signIn("ada@example.com", "engine1842");
    await auth.updateProfile(EDIT);

    assert.equal(store.profiles.get("uid-1")?.role, "faculty", "role is not part of the update either way");
  });

  it("requires someone to be signed in", async () => {
    const { auth, store } = service();

    const error = await rejection(auth.updateProfile(EDIT));

    assert.equal(error.code, "not-signed-in");
    assert.equal(store.updates.length, 0);
  });

  it("validates before writing", async () => {
    const { auth, store } = service();

    await auth.signIn("ada@example.com", "engine1842");

    const error = await rejection(auth.updateProfile({ ...EDIT, name: " " }));

    assert.equal(error.code, "validation");
    assert.equal(error.fieldErrors?.name, "Name is required.");
    assert.equal(store.updates.length, 0);
  });

  it("reports a failed write in friendly words and keeps the stored profile as it was", async () => {
    const { auth, store } = service({ updateError: firebaseError("permission-denied") });

    await auth.signIn("ada@example.com", "engine1842");

    const error = await rejection(auth.updateProfile(EDIT));

    assert.equal(error.code, "profile-update-failed");
    assert.equal(error.message, "We could not save your profile. Please try again.");
    assert.doesNotMatch(error.message, /permission|denied/i);
    assert.equal(store.profiles.get("uid-1")?.university, "");
  });

  it("reports a network failure as a network problem", async () => {
    const { auth } = service({ updateError: firebaseError("unavailable") });

    await auth.signIn("ada@example.com", "engine1842");

    assert.equal((await rejection(auth.updateProfile(EDIT))).code, "network");
  });

  it("fails rather than creating a profile that has no role", async () => {
    const { auth, store } = service({ profiles: [] });

    await auth.signIn("ada@example.com", "engine1842");

    const error = await rejection(auth.updateProfile(EDIT));

    assert.equal(error.code, "profile-update-failed");
    assert.equal(store.profiles.size, 0);
  });
});

describe("profile-updated: Home and Profile stay in step", () => {
  const ada = { uid: "uid-1", email: "ada@example.com", displayName: null };
  const authenticated = (): AuthState => {
    const actions: AuthAction[] = [
      { type: "user-detected", user: ada },
      { type: "profile-loaded", user: ada, profile: profileOf("uid-1") },
    ];

    return actions.reduce(authReducer, initialAuthState);
  };

  it("merges the saved fields into the shared profile", () => {
    const state = authReducer(authenticated(), { type: "profile-updated", uid: "uid-1", fields: EDIT });

    assert.equal(state.profile?.name, "Example1");
    assert.equal(state.profile?.university, "Analytical University");
    assert.equal(state.profile?.program, "B.Tech");
    assert.equal(state.profile?.branch, "Chemical");
  });

  it("keeps the role, email, uid and creation time exactly as they were", () => {
    const before = authenticated();
    const after = authReducer(before, { type: "profile-updated", uid: "uid-1", fields: EDIT });

    assert.equal(after.profile?.role, "student");
    assert.equal(after.profile?.email, before.profile?.email);
    assert.equal(after.profile?.uid, before.profile?.uid);
    assert.equal(after.profile?.createdAt, before.profile?.createdAt);
    assert.equal(roleOf(after), "student");
    assert.equal(after.status, "authenticated");
  });

  it("cannot inject a role through the action", () => {
    const hostile = { ...EDIT, role: "faculty" } as unknown as typeof EDIT;
    const after = authReducer(authenticated(), { type: "profile-updated", uid: "uid-1", fields: hostile });

    assert.equal(roleOf(after), "student");
    assert.equal("role" in (after.profile ?? {}), true);
    assert.equal(after.profile?.role, "student");
  });

  it("ignores an update for a different user or when nobody is signed in", () => {
    const state = authenticated();

    assert.equal(authReducer(state, { type: "profile-updated", uid: "other", fields: EDIT }), state);
    assert.equal(authReducer(initialAuthState, { type: "profile-updated", uid: "uid-1", fields: EDIT }), initialAuthState);
  });

  it("gives Home and Profile the same new name from one state", () => {
    const state = authReducer(authenticated(), { type: "profile-updated", uid: "uid-1", fields: EDIT });

    assert.equal(resolveDisplayName(state.profile, state.user), "Example1", "Home heading");
    assert.equal(state.profile?.name, "Example1", "Profile heading");
  });
});

describe("end to end: sign in, edit, and every screen sees the new values", () => {
  it("shows empty academic fields first, then the saved ones after an update", async () => {
    const backend = fakeBackend({ accounts: { "ada@example.com": "engine1842" } });
    const store = fakeStore({ profiles: [profileOf("uid-1")] });
    const auth = createAuthService(backend.backend, store.store);
    let state = initialAuthState;
    const dispatch = (action: AuthAction) => {
      state = authReducer(state, action);
    };

    startAuthSync(auth, dispatch);
    await tick();
    await auth.signIn("ada@example.com", "engine1842");
    await tick();
    await tick();

    assert.deepEqual(
      [state.profile?.university, state.profile?.program, state.profile?.branch].map(academicValue),
      ["Not added", "Not added", "Not added"],
    );

    // What AuthProvider.updateProfile does: save, then update the shared state.
    const fields = await auth.updateProfile(EDIT);

    dispatch({ type: "profile-updated", uid: auth.getCurrentUserId() as string, fields });

    assert.deepEqual(
      [state.profile?.university, state.profile?.program, state.profile?.branch].map(academicValue),
      ["Analytical University", "B.Tech", "Chemical"],
    );
    assert.equal(resolveDisplayName(state.profile, state.user), "Example1");
    assert.equal(roleOf(state), "student");
  });

  it("survives a reload: the values are read back from Firestore", async () => {
    const backend = fakeBackend({ accounts: { "ada@example.com": "engine1842" } });
    const store = fakeStore({ profiles: [profileOf("uid-1")] });
    const auth = createAuthService(backend.backend, store.store);

    await auth.signIn("ada@example.com", "engine1842");
    await auth.updateProfile(EDIT);

    // A new app session: a fresh service and state reading the same stored document.
    let reloaded = initialAuthState;
    const second = createAuthService(backend.backend, store.store);

    startAuthSync(second, (action) => {
      reloaded = authReducer(reloaded, action);
    });
    await tick();
    await tick();

    assert.equal(reloaded.status, "authenticated");
    assert.equal(reloaded.profile?.name, "Example1");
    assert.equal(reloaded.profile?.university, "Analytical University");
    assert.equal(reloaded.profile?.program, "B.Tech");
    assert.equal(reloaded.profile?.branch, "Chemical");
  });
});

describe("registration still needs no academic information", () => {
  it("creates a student with empty academic fields from just name, email and password", async () => {
    const backend = fakeBackend();
    const store = fakeStore();
    const auth = createAuthService(backend.backend, store.store);

    const { profile } = await auth.signUp("new@example.com", "engine1842", { name: "New Student" });

    assert.equal(profile.role, "student");
    assert.deepEqual([profile.university, profile.program, profile.branch], ["", "", ""]);
  });
});
