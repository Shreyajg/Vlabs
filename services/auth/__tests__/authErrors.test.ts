import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AUTH_ERROR_MESSAGES, AuthError, mapAuthError, type AuthErrorCode } from "../authErrors";
import { firebaseError } from "./authFakes";

describe("mapAuthError", () => {
  const cases: [string, AuthErrorCode, string][] = [
    ["auth/invalid-credential", "invalid-credentials", "Email or password is incorrect."],
    ["auth/wrong-password", "invalid-credentials", "Email or password is incorrect."],
    ["auth/user-not-found", "invalid-credentials", "Email or password is incorrect."],
    ["auth/invalid-login-credentials", "invalid-credentials", "Email or password is incorrect."],
    ["auth/email-already-in-use", "email-in-use", "An account already exists with this email."],
    ["auth/weak-password", "weak-password", "Please choose a stronger password."],
    ["auth/invalid-email", "invalid-email", "Please enter a valid email address."],
    ["auth/network-request-failed", "network", "Network error. Please check your connection and try again."],
    ["auth/too-many-requests", "too-many-requests", "Too many attempts. Please wait and try again."],
    ["auth/user-disabled", "user-disabled", "This account has been disabled."],
  ];

  for (const [firebaseCodeName, code, message] of cases) {
    it(`maps ${firebaseCodeName} to "${message}"`, () => {
      const mapped = mapAuthError(firebaseError(firebaseCodeName));

      assert.equal(mapped.code, code);
      assert.equal(mapped.message, message);
    });
  }

  it("treats a Firestore 'unavailable' as a network problem", () => {
    assert.equal(mapAuthError(firebaseError("unavailable")).code, "network");
  });

  it("gives unknown errors a generic message", () => {
    for (const error of [firebaseError("auth/some-new-code"), new Error("boom"), "text", null, undefined, 42, {}]) {
      const mapped = mapAuthError(error);

      assert.equal(mapped.code, "unknown");
      assert.equal(mapped.message, "Something went wrong. Please try again.");
    }
  });

  it("never exposes the raw Firebase message", () => {
    const raw = firebaseError("auth/invalid-credential", "Firebase: Error (auth/invalid-credential). internal detail");
    const mapped = mapAuthError(raw);

    assert.doesNotMatch(mapped.message, /Firebase|auth\/|internal/);
    assert.equal(mapped.originalError, raw, "kept for development logging only");
  });

  it("passes an AuthError through unchanged", () => {
    const original = new AuthError("validation", { fieldErrors: { email: "bad" } });

    assert.equal(mapAuthError(original), original);
  });

  it("has a message for every code", () => {
    for (const message of Object.values(AUTH_ERROR_MESSAGES)) {
      assert.ok(message.length > 0);
    }
  });
});
