import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuthUser } from "../../../types/User";
import { authReducer, initialAuthState, roleOf, type AuthAction, type AuthState } from "../authState";
import { profileOf } from "./authFakes";

const ada: AuthUser = { uid: "ada", email: "ada@example.com", displayName: "Ada" };
const grace: AuthUser = { uid: "grace", email: "grace@example.com", displayName: "Grace" };

const run = (actions: AuthAction[], start: AuthState = initialAuthState) => actions.reduce(authReducer, start);

describe("authReducer", () => {
  it("starts loading and uninitialized, so nothing renders before Firebase answers", () => {
    assert.equal(initialAuthState.status, "loading");
    assert.equal(initialAuthState.initialized, false);
    assert.equal(initialAuthState.user, null);
  });

  it("becomes unauthenticated when nobody is signed in", () => {
    const state = run([{ type: "signed-out" }]);

    assert.equal(state.status, "unauthenticated");
    assert.equal(state.initialized, true);
    assert.equal(roleOf(state), null);
  });

  it("stays loading while a signed-in user's profile is being read", () => {
    const state = run([{ type: "user-detected", user: ada }]);

    assert.equal(state.status, "loading");
    assert.equal(state.user, ada);
    assert.equal(state.initialized, false, "still no answer about role");
    assert.equal(roleOf(state), null, "no role, so no area can be shown");
  });

  it("becomes authenticated with a role once the profile arrives", () => {
    const state = run([
      { type: "user-detected", user: ada },
      { type: "profile-loaded", user: ada, profile: profileOf("ada", "student") },
    ]);

    assert.equal(state.status, "authenticated");
    assert.equal(state.initialized, true);
    assert.equal(roleOf(state), "student");
  });

  it("carries a faculty role through for faculty accounts", () => {
    const state = run([
      { type: "user-detected", user: ada },
      { type: "profile-loaded", user: ada, profile: profileOf("ada", "faculty") },
    ]);

    assert.equal(roleOf(state), "faculty");
  });

  it("reports a profile error without pretending to be signed out or in", () => {
    const state = run([{ type: "user-detected", user: ada }, { type: "profile-failed", user: ada }]);

    assert.equal(state.status, "profile-error");
    assert.equal(state.user, ada);
    assert.equal(roleOf(state), null);
    assert.equal(state.initialized, true);
  });

  it("returns to unauthenticated on sign-out", () => {
    const state = run([
      { type: "user-detected", user: ada },
      { type: "profile-loaded", user: ada, profile: profileOf("ada") },
      { type: "signed-out" },
    ]);

    assert.equal(state.status, "unauthenticated");
    assert.equal(state.user, null);
    assert.equal(state.profile, null);
  });

  it("shows loading between sign-in and the profile, without becoming uninitialized again", () => {
    const signedOut = run([{ type: "signed-out" }]);
    const signingIn = authReducer(signedOut, { type: "user-detected", user: ada });

    assert.equal(signingIn.status, "loading");
    assert.equal(signingIn.initialized, true, "the app stays mounted; only the area switches");
  });

  it("ignores a late profile for a user who is no longer current", () => {
    const state = run([
      { type: "user-detected", user: ada },
      { type: "user-detected", user: grace },
      { type: "profile-loaded", user: ada, profile: profileOf("ada", "faculty") },
    ]);

    assert.equal(state.status, "loading", "Ada's answer must not authenticate Grace");
    assert.equal(state.user, grace);
  });

  it("ignores a late failure for a user who is no longer current", () => {
    const state = run([
      { type: "user-detected", user: ada },
      { type: "signed-out" },
      { type: "profile-failed", user: ada },
    ]);

    assert.equal(state.status, "unauthenticated");
  });
});
