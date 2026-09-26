import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasErrors,
  isValidEmail,
  passwordError,
  validateSignIn,
  validateSignUp,
  type SignUpInput,
} from "../authValidation";

const valid: SignUpInput = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "engine1842",
  confirmPassword: "engine1842",
};

describe("validateSignUp", () => {
  it("accepts valid input", () => {
    const errors = validateSignUp(valid);

    assert.deepEqual(errors, {});
    assert.equal(hasErrors(errors), false);
  });

  it("requires a name, ignoring surrounding spaces", () => {
    assert.equal(validateSignUp({ ...valid, name: "" }).name, "Name is required.");
    assert.equal(validateSignUp({ ...valid, name: "    " }).name, "Name is required.");
  });

  it("rejects an over-long name", () => {
    assert.match(validateSignUp({ ...valid, name: "x".repeat(81) }).name ?? "", /80 characters or fewer/);
  });

  it("requires a valid email", () => {
    assert.equal(validateSignUp({ ...valid, email: "" }).email, "Email is required.");

    for (const email of ["plain", "a@b", "a@b.", "@example.com", "a b@example.com", "a@@example.com"]) {
      assert.equal(validateSignUp({ ...valid, email }).email, "Please enter a valid email address.", email);
    }
  });

  it("accepts normal email shapes", () => {
    for (const email of ["a@b.co", "first.last+tag@sub.example.edu", "  padded@example.com  "]) {
      assert.equal(isValidEmail(email), true, email);
    }
  });

  it("enforces a reasonable password", () => {
    assert.equal(validateSignUp({ ...valid, password: "", confirmPassword: "" }).password, "Password is required.");
    assert.match(passwordError("abc123") ?? "", /at least 8 characters/);
    assert.equal(passwordError("onlyletters"), "Password must include a letter and a number.");
    assert.equal(passwordError("12345678"), "Password must include a letter and a number.");
    assert.match(passwordError("a1".repeat(70)) ?? "", /128 characters or fewer/);
    assert.equal(passwordError("goodpass1"), undefined);
  });

  it("requires the confirmation to match", () => {
    assert.equal(validateSignUp({ ...valid, confirmPassword: "" }).confirmPassword, "Please confirm your password.");
    assert.equal(validateSignUp({ ...valid, confirmPassword: "engine1843" }).confirmPassword, "Passwords do not match.");
  });

  it("reports every problem at once", () => {
    const errors = validateSignUp({ name: "", email: "x", password: "y", confirmPassword: "z" });

    assert.deepEqual(Object.keys(errors).sort(), ["confirmPassword", "email", "name", "password"]);
  });
});

describe("validateSignIn", () => {
  it("accepts an email and any non-empty password", () => {
    assert.deepEqual(validateSignIn({ email: "ada@example.com", password: "x" }), {});
  });

  it("does not reveal the password policy", () => {
    assert.deepEqual(validateSignIn({ email: "ada@example.com", password: "short" }), {});
  });

  it("requires both fields", () => {
    assert.deepEqual(validateSignIn({ email: "", password: "" }), {
      email: "Email is required.",
      password: "Password is required.",
    });
  });

  it("rejects a malformed email", () => {
    assert.equal(validateSignIn({ email: "nope", password: "x" }).email, "Please enter a valid email address.");
  });
});
