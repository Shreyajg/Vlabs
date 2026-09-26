import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthError } from "../authErrors";
import { createAuthService, type AuthService } from "../createAuthService";
import {
  deferred,
  fakeBackend,
  fakeStore,
  firebaseError,
  profileOf,
  tick,
  type FakeBackendOptions,
  type FakeStoreOptions,
} from "./authFakes";

function setup(backendOptions: FakeBackendOptions = {}, storeOptions: FakeStoreOptions = {}) {
  const backend = fakeBackend(backendOptions);
  const store = fakeStore(storeOptions);
  const logged: string[] = [];
  const service = createAuthService(backend.backend, store.store, (message) => logged.push(message));

  return { service, backend, store, logged };
}

async function rejection(promise: Promise<unknown>): Promise<AuthError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof AuthError, "expected an AuthError, never a raw Firebase error");

    return error;
  }

  assert.fail("expected the promise to reject");
}

const NAME = { name: "  Ada Lovelace " };

describe("signUp", () => {
  it("creates the account and a student profile", async () => {
    const { service, backend, store } = setup();
    const { user, profile } = await service.signUp(" ada@example.com ", "engine1842", NAME);

    assert.equal(user.email, "ada@example.com", "the email is trimmed");
    assert.deepEqual(backend.calls, ["createUser:ada@example.com", "updateDisplayName:Ada Lovelace"]);
    assert.equal(store.created.length, 1);
    assert.deepEqual(store.created[0], {
      uid: user.uid,
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "student",
      university: "",
      program: "",
      branch: "",
    });
    assert.equal(profile.uid, user.uid, "users/{uid} is keyed by the Firebase uid");
    assert.equal(store.profiles.get(user.uid)?.role, "student");
  });

  it("defaults the role to student", async () => {
    const { service } = setup();
    const { profile } = await service.signUp("a@example.com", "engine1842", NAME);

    assert.equal(profile.role, "student");
  });

  it("does not let public registration choose faculty", async () => {
    const { service, store } = setup();
    const hostile = { name: "Eve", role: "faculty", isAdmin: true } as unknown as { name: string };
    const { profile } = await service.signUp("eve@example.com", "engine1842", hostile);

    assert.equal(profile.role, "student");
    assert.equal(store.created[0].role, "student");
    assert.deepEqual(
      Object.keys(store.created[0]).sort(),
      ["branch", "email", "name", "program", "role", "uid", "university"],
      "no extra fields are stored",
    );
  });

  it("validates before touching Firebase", async () => {
    const { service, backend, store } = setup();

    const error = await rejection(service.signUp("not-an-email", "engine1842", NAME));

    assert.equal(error.code, "validation");
    assert.equal(error.fieldErrors?.email, "Please enter a valid email address.");
    assert.deepEqual(backend.calls, []);
    assert.equal(store.created.length, 0);
  });

  it("rejects a weak password and a missing name up front", async () => {
    const { service, backend } = setup();

    const weak = await rejection(service.signUp("a@example.com", "abc", NAME));
    const unnamed = await rejection(service.signUp("a@example.com", "engine1842", { name: "  " }));

    assert.equal(weak.code, "validation");
    assert.ok(weak.fieldErrors?.password);
    assert.equal(unnamed.fieldErrors?.name, "Name is required.");
    assert.deepEqual(backend.calls, []);
  });

  it("reports an email that is already registered, without creating a profile", async () => {
    const { service, store } = setup({ accounts: { "ada@example.com": "engine1842" } });

    const error = await rejection(service.signUp("ada@example.com", "another1234", NAME));

    assert.equal(error.code, "email-in-use");
    assert.equal(error.message, "An account already exists with this email.");
    assert.equal(store.created.length, 0);
  });

  it("maps a network failure", async () => {
    const { service } = setup({ createError: firebaseError("auth/network-request-failed") });

    assert.equal((await rejection(service.signUp("a@example.com", "engine1842", NAME))).code, "network");
  });

  it("maps a weak-password rejection from Firebase itself", async () => {
    const { service } = setup({ createError: firebaseError("auth/weak-password") });

    assert.equal((await rejection(service.signUp("a@example.com", "engine1842", NAME))).message, "Please choose a stronger password.");
  });

  it("still succeeds when only the display name update fails", async () => {
    const { service, logged } = setup({ updateNameError: firebaseError("auth/network-request-failed") });
    const { profile } = await service.signUp("a@example.com", "engine1842", NAME);

    assert.equal(profile.name, "Ada Lovelace");
    assert.ok(logged.includes("updateDisplayName failed"));
  });

  it("signs the user out and says so when the profile cannot be created", async () => {
    const { service, backend, store } = setup({}, { createError: firebaseError("permission-denied") });

    const error = await rejection(service.signUp("a@example.com", "engine1842", NAME));

    assert.equal(error.code, "profile-setup-failed");
    assert.match(error.message, /account was created/);
    assert.equal(backend.calls.at(-1), "signOut", "no half-set-up session is left behind");
    assert.equal(service.getCurrentUser(), null);
    assert.equal(store.profiles.size, 0);
  });

  it("logs details for developers without leaking them", async () => {
    const { service, logged } = setup({ createError: firebaseError("auth/email-already-in-use") });

    const error = await rejection(service.signUp("a@example.com", "engine1842", NAME));

    assert.ok(logged.includes("createUser failed"));
    assert.doesNotMatch(error.message, /auth\//);
  });
});

describe("signIn", () => {
  const accounts = { "ada@example.com": "engine1842" };

  it("returns the signed-in user", async () => {
    const { service } = setup({ accounts });
    const user = await service.signIn(" ada@example.com ", "engine1842");

    assert.equal(user.email, "ada@example.com");
    assert.equal(service.getCurrentUser()?.uid, user.uid);
  });

  it("gives the same friendly answer for a wrong password and an unknown email", async () => {
    const { service } = setup({ accounts });

    const wrongPassword = await rejection(service.signIn("ada@example.com", "wrong"));
    const unknownEmail = await rejection(service.signIn("nobody@example.com", "engine1842"));

    assert.equal(wrongPassword.code, "invalid-credentials");
    assert.equal(wrongPassword.message, "Email or password is incorrect.");
    assert.equal(unknownEmail.message, wrongPassword.message, "accounts cannot be probed");
  });

  it("validates the form before calling Firebase", async () => {
    const { service, backend } = setup({ accounts });

    const error = await rejection(service.signIn("", ""));

    assert.equal(error.code, "validation");
    assert.deepEqual(Object.keys(error.fieldErrors ?? {}).sort(), ["email", "password"]);
    assert.deepEqual(backend.calls, []);
  });

  it("maps throttling, network and unknown errors", async () => {
    const throttled = setup({ signInError: firebaseError("auth/too-many-requests") });
    const offline = setup({ signInError: firebaseError("auth/network-request-failed") });
    const strange = setup({ signInError: new Error("kaboom") });

    assert.equal((await rejection(throttled.service.signIn("a@example.com", "x"))).message, "Too many attempts. Please wait and try again.");
    assert.equal((await rejection(offline.service.signIn("a@example.com", "x"))).code, "network");
    assert.equal((await rejection(strange.service.signIn("a@example.com", "x"))).message, "Something went wrong. Please try again.");
  });
});

describe("signOut", () => {
  it("signs the user out", async () => {
    const { service } = setup({ accounts: { "ada@example.com": "engine1842" } });

    await service.signIn("ada@example.com", "engine1842");
    assert.ok(service.getCurrentUser());

    await service.signOut();

    assert.equal(service.getCurrentUser(), null);
    assert.equal(service.getCurrentUserId(), null);
  });

  it("maps a failure", async () => {
    const { service } = setup({ signOutError: firebaseError("auth/network-request-failed") });

    assert.equal((await rejection(service.signOut())).code, "network");
  });
});

describe("current user (what Save All Runs uses)", () => {
  it("is null when nobody is signed in", () => {
    assert.equal(setup().service.getCurrentUserId(), null);
  });

  it("is the Firebase uid once signed in, and is what becomes experimentRuns.studentId", async () => {
    const { service } = setup({ accounts: { "ada@example.com": "engine1842" } });
    const user = await service.signIn("ada@example.com", "engine1842");

    assert.equal(service.getCurrentUserId(), user.uid);
    assert.match(user.uid, /^uid-/);
  });

  it("follows the same user through sign-up, so a new student can save immediately", async () => {
    const { service } = setup();
    const { user } = await service.signUp("new@example.com", "engine1842", NAME);

    assert.equal(service.getCurrentUserId(), user.uid);
  });
});

describe("subscribeToAuthState", () => {
  it("reports the current state, then each change, and stops when unsubscribed", async () => {
    const { service, backend } = setup({ accounts: { "ada@example.com": "engine1842" } });
    const seen: (string | null)[] = [];

    const unsubscribe = service.subscribeToAuthState((user) => seen.push(user?.uid ?? null));

    await tick();
    await service.signIn("ada@example.com", "engine1842");
    await tick();
    await service.signOut();
    await tick();

    assert.deepEqual(seen, [null, "uid-1", null]);
    assert.equal(backend.listenerCount(), 1);

    unsubscribe();

    assert.equal(backend.listenerCount(), 0);

    await service.signIn("ada@example.com", "engine1842");
    await tick();

    assert.deepEqual(seen, [null, "uid-1", null], "no events after unsubscribing");
  });
});

describe("loadUserProfile", () => {
  const user = { uid: "u1", email: "grace@navy.mil", displayName: null };

  it("returns the stored profile without writing", async () => {
    const stored = profileOf("u1");
    const { service, store } = setup({}, { profiles: [stored] });

    assert.equal(await service.loadUserProfile(user), stored);
    assert.equal(store.createdIfAbsent.length, 0);
  });

  it("keeps a faculty role provisioned by an administrator", async () => {
    const { service } = setup({}, { profiles: [profileOf("u1", "faculty")] });

    assert.equal((await service.loadUserProfile(user)).role, "faculty");
  });

  it("creates a student profile when none exists, so an account never lacks one", async () => {
    const { service, store } = setup();
    const profile = await service.loadUserProfile(user);

    assert.equal(profile.role, "student");
    assert.equal(profile.name, "grace", "falls back to the email prefix");
    assert.equal(store.createdIfAbsent.length, 1);
    assert.equal(store.createdIfAbsent[0].role, "student");
  });

  it("uses the display name when the account has one", async () => {
    const { service } = setup();
    const profile = await service.loadUserProfile({ ...user, displayName: "Grace Hopper" });

    assert.equal(profile.name, "Grace Hopper");
  });

  it("lets storage errors reach the caller, which shows the profile-error state", async () => {
    const { service } = setup({}, { getError: firebaseError("permission-denied") });

    await assert.rejects(service.loadUserProfile(user), { code: "permission-denied" });
  });

  it("waits for a sign-up in progress instead of racing it", async () => {
    const gate = deferred();
    const { service, store, backend } = setup({}, { createGate: gate });

    const signingUp = service.signUp("ada@example.com", "engine1842", NAME);

    await tick();

    // Firebase reports the new user before sign-up has written the profile.
    const newUser = backend.backend.getCurrentUser();

    assert.ok(newUser, "the account exists while the profile write is still pending");

    let settled = false;
    const loading = service.loadUserProfile(newUser).then((profile) => {
      settled = true;

      return profile;
    });

    await tick();

    assert.equal(settled, false, "profile loading is held back while sign-up is writing");
    assert.equal(store.createdIfAbsent.length, 0, "no automatic profile is written over sign-up's");

    gate.resolve();
    await signingUp;

    const profile = await loading;

    assert.equal(profile.name, "Ada Lovelace", "the name the student typed survives");
    assert.equal(store.createdIfAbsent.length, 0);
    assert.equal(store.created.length, 1);
  });
});

describe("the service works without Firebase credentials", () => {
  it("is fully exercised above with in-memory fakes", () => {
    const service: AuthService = setup().service;

    assert.equal(typeof service.signUp, "function");
    assert.equal(typeof service.subscribeToAuthState, "function");
  });
});
