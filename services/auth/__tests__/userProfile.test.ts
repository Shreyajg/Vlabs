import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NewUserProfile } from "../../../types/User";
import {
  buildNewStudentProfile,
  fallbackName,
  isUserRole,
  parseUserProfile,
  profileToDocument,
} from "../userProfile";

describe("buildNewStudentProfile", () => {
  it("always creates a student profile", () => {
    const profile = buildNewStudentProfile({ uid: "u1", name: "  Ada  ", email: " ada@example.com " });

    assert.deepEqual(profile, {
      uid: "u1",
      name: "Ada",
      email: "ada@example.com",
      role: "student",
      university: "",
      program: "",
      branch: "",
    });
  });

  it("cannot be talked into a faculty role", () => {
    const hostile = { uid: "u1", name: "Eve", email: "eve@example.com", role: "faculty" };
    const profile = buildNewStudentProfile(hostile);

    assert.equal(profile.role, "student");
  });

  it("is a compile-time error to build a faculty profile from client code", () => {
    // @ts-expect-error "faculty" is not assignable to "student"
    const faculty: NewUserProfile = { uid: "u", name: "n", email: "e", role: "faculty", university: "", program: "", branch: "" };

    assert.equal(faculty.role, "faculty", "only reachable by bypassing the types");
  });

  it("writes the identity fields plus empty academic fields, nothing invented", () => {
    const document = profileToDocument(buildNewStudentProfile({ uid: "u1", name: "Ada", email: "a@b.co" }));

    assert.deepEqual(Object.keys(document).sort(), ["branch", "email", "name", "program", "role", "uid", "university"]);
    assert.equal(document.university, "");
    assert.equal(document.program, "");
    assert.equal(document.branch, "");
  });
});

describe("parseUserProfile", () => {
  const user = { displayName: null, email: "ada@example.com" };

  it("reads a stored profile", () => {
    const profile = parseUserProfile("u1", { name: "Ada", email: "ada@example.com", role: "student" }, user);

    assert.equal(profile.uid, "u1");
    assert.equal(profile.name, "Ada");
    assert.equal(profile.role, "student");
    assert.equal(profile.createdAt, null);
  });

  it("keeps a faculty role that an administrator provisioned", () => {
    assert.equal(parseUserProfile("u1", { name: "Dr X", role: "faculty" }, user).role, "faculty");
  });

  it("falls back to the least-privileged role for unknown or missing roles", () => {
    for (const role of ["admin", "", 5, null, undefined, "Faculty"]) {
      assert.equal(parseUserProfile("u1", { name: "X", role }, user).role, "student", String(role));
    }
  });

  it("fills a missing name and email from the signed-in user", () => {
    const profile = parseUserProfile("u1", {}, user);

    assert.equal(profile.name, "ada");
    assert.equal(profile.email, "ada@example.com");
  });

  it("keeps a Firestore timestamp", () => {
    const timestamp = { toDate: () => new Date(0) };
    const profile = parseUserProfile("u1", { createdAt: timestamp }, user);

    assert.equal(profile.createdAt, timestamp as never);
  });
});

describe("fallbackName / isUserRole", () => {
  it("prefers the display name, then the email prefix, then a default", () => {
    assert.equal(fallbackName({ displayName: "Ada L", email: "x@y.z" }), "Ada L");
    assert.equal(fallbackName({ displayName: "  ", email: "grace@navy.mil" }), "grace");
    assert.equal(fallbackName({ displayName: null, email: null }), "Student");
  });

  it("recognises only the two roles", () => {
    assert.equal(isUserRole("student"), true);
    assert.equal(isUserRole("faculty"), true);
    assert.equal(isUserRole("admin"), false);
    assert.equal(isUserRole(undefined), false);
  });
});
