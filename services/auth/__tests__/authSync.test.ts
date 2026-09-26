import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authReducer, initialAuthState, roleOf, type AuthAction, type AuthState } from "../authState";
import { startAuthSync } from "../authSync";
import { createAuthService } from "../createAuthService";
import { fakeBackend, fakeStore, firebaseError, profileOf, tick } from "./authFakes";

/** Wires the real sync logic and reducer to fakes, the way AuthProvider does, and records every state. */
function harness(options: {
  accounts?: Record<string, string>;
  profiles?: ReturnType<typeof profileOf>[];
  getError?: unknown;
} = {}) {
  const backend = fakeBackend({ accounts: options.accounts });
  const store = fakeStore({ profiles: options.profiles, getError: options.getError });
  const service = createAuthService(backend.backend, store.store);
  const states: AuthState[] = [];
  let state = initialAuthState;

  const dispatch = (action: AuthAction) => {
    state = authReducer(state, action);
    states.push(state);
  };

  const sync = startAuthSync(service, dispatch);

  return {
    service,
    backend,
    store,
    sync,
    states,
    current: () => state,
    statuses: () => states.map((entry) => entry.status),
  };
}

const ACCOUNTS = { "ada@example.com": "engine1842" };

describe("auth state over time", () => {
  it("starts loading, then becomes unauthenticated when nobody is signed in", async () => {
    const h = harness();

    assert.equal(h.current().status, "loading");

    await tick();

    assert.equal(h.current().status, "unauthenticated");
    assert.equal(h.current().initialized, true);
  });

  it("goes signed out -> loading -> authenticated as the student role on sign-in", async () => {
    const h = harness({ accounts: ACCOUNTS, profiles: [profileOf("uid-1", "student")] });

    await tick();
    await h.service.signIn("ada@example.com", "engine1842");
    await tick();
    await tick();

    assert.deepEqual(h.statuses(), ["unauthenticated", "loading", "authenticated"]);
    assert.equal(roleOf(h.current()), "student");
    assert.equal(h.current().user?.uid, "uid-1");
  });

  it("routes a faculty account by the role stored in its profile", async () => {
    const h = harness({ accounts: ACCOUNTS, profiles: [profileOf("uid-1", "faculty")] });

    await tick();
    await h.service.signIn("ada@example.com", "engine1842");
    await tick();
    await tick();

    assert.equal(roleOf(h.current()), "faculty");
  });

  it("goes back to unauthenticated on sign-out", async () => {
    const h = harness({ accounts: ACCOUNTS, profiles: [profileOf("uid-1")] });

    await tick();
    await h.service.signIn("ada@example.com", "engine1842");
    await tick();
    await tick();
    await h.service.signOut();
    await tick();

    assert.equal(h.current().status, "unauthenticated");
    assert.equal(h.current().user, null);
    assert.equal(roleOf(h.current()), null);
  });

  it("restores a session that already exists when the app starts (a refresh)", async () => {
    const backend = fakeBackend({ accounts: ACCOUNTS });

    await backend.backend.signIn("ada@example.com", "engine1842");

    const store = fakeStore({ profiles: [profileOf("uid-1")] });
    const service = createAuthService(backend.backend, store.store);
    let state = initialAuthState;

    startAuthSync(service, (action) => {
      state = authReducer(state, action);
    });

    assert.equal(state.status, "loading", "not signed out yet: Firebase has not reported");

    await tick();
    await tick();

    assert.equal(state.status, "authenticated");
    assert.equal(state.user?.email, "ada@example.com");
  });

  it("creates the student profile when a new account has none, then authenticates", async () => {
    const h = harness({ accounts: ACCOUNTS });

    await tick();
    await h.service.signIn("ada@example.com", "engine1842");
    await tick();
    await tick();

    assert.equal(h.current().status, "authenticated");
    assert.equal(roleOf(h.current()), "student");
    assert.equal(h.store.createdIfAbsent.length, 1);
  });

  it("registers a new student straight into an authenticated session", async () => {
    const h = harness();

    await tick();
    await h.service.signUp("new@example.com", "engine1842", { name: "New Student" });
    await tick();
    await tick();

    assert.equal(h.current().status, "authenticated");
    assert.equal(roleOf(h.current()), "student");
    assert.equal(h.current().profile?.name, "New Student");
    assert.equal(h.store.created.length, 1);
    assert.equal(h.store.createdIfAbsent.length, 0, "sign-up's profile is not replaced by an automatic one");
  });

  it("shows a profile error when the profile cannot be read, and recovers on retry", async () => {
    const backend = fakeBackend({ accounts: ACCOUNTS });
    let failing = true;
    const profiles = new Map([["uid-1", profileOf("uid-1")]]);
    const flakyStore = {
      async get(uid: string) {
        if (failing) throw firebaseError("unavailable");

        return profiles.get(uid) ?? null;
      },
      create: async () => profileOf("uid-1"),
      createIfAbsent: async () => profileOf("uid-1"),
      update: async () => undefined,
    };
    const service = createAuthService(backend.backend, flakyStore);
    let state = initialAuthState;
    const sync = startAuthSync(service, (action) => {
      state = authReducer(state, action);
    });

    await tick();
    await service.signIn("ada@example.com", "engine1842");
    await tick();
    await tick();

    assert.equal(state.status, "profile-error");
    assert.equal(state.user?.uid, "uid-1");

    failing = false;
    await sync.reloadProfile(state.user!);

    assert.equal(state.status, "authenticated");
  });

  it("ignores a slow profile for a user who signed out in the meantime", async () => {
    const backend = fakeBackend({ accounts: ACCOUNTS });
    const slow = { resolve: () => undefined as void };
    const store = {
      get: () =>
        new Promise<ReturnType<typeof profileOf>>((resolve) => {
          slow.resolve = () => resolve(profileOf("uid-1", "faculty"));
        }),
      create: async () => profileOf("uid-1"),
      createIfAbsent: async () => profileOf("uid-1"),
      update: async () => undefined,
    };
    const service = createAuthService(backend.backend, store);
    let state = initialAuthState;

    startAuthSync(service, (action) => {
      state = authReducer(state, action);
    });

    await tick();
    await service.signIn("ada@example.com", "engine1842");
    await tick();
    await service.signOut();
    await tick();

    slow.resolve();
    await tick();

    assert.equal(state.status, "unauthenticated", "the late profile must not sign anyone back in");
    assert.equal(roleOf(state), null);
  });

  it("uses a single Firebase listener and stops it when asked", async () => {
    const h = harness();

    assert.equal(h.backend.listenerCount(), 1);

    h.sync.stop();

    assert.equal(h.backend.listenerCount(), 0);
  });
});
