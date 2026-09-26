// Tests for firebase/firestore.rules against the local Firestore emulator.
// Nothing here talks to the real Firebase project: the project id is a "demo-" id and the auth
// identities are mocked by @firebase/rules-unit-testing.
//
// Run with:  npm run test:rules
// Needs a JDK 11+ on PATH (the Firestore emulator is a Java program).
//
// Cases marked [#n] are the numbered acceptance cases from the Phase 2 brief.

/* global __dirname */

const { describe, it, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} = require("firebase/firestore");

const STUDENT_A = "student-a";
const STUDENT_B = "student-b";
const LEGACY = "legacy-student";
const FACULTY = "faculty-1";
const NO_PROFILE = "no-profile";
const NO_ROLE = "no-role";
const ODD_ROLE = "odd-role";

const EMAIL = {
  [STUDENT_A]: "a@example.com",
  [STUDENT_B]: "b@example.com",
  [LEGACY]: "legacy@example.com",
  [FACULTY]: "faculty@example.com",
  [NO_PROFILE]: "new@example.com",
  [NO_ROLE]: "norole@example.com",
  [ODD_ROLE]: "odd@example.com",
};

let env;

const asUser = (uid) =>
  env.authenticatedContext(uid, { email: EMAIL[uid] }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

function profile(uid, role, extra = {}) {
  return {
    uid,
    name: `Name ${uid}`,
    email: EMAIL[uid],
    role,
    university: "Uni",
    program: "B.Tech",
    branch: "Chemical",
    createdAt: Timestamp.fromDate(new Date("2026-01-01T00:00:00Z")),
    ...extra,
  };
}

// The exact document services/experimentRunService.ts writes.
function runPayload(studentId, overrides = {}) {
  return {
    studentId,
    subjectId: "fluid-mechanics",
    experimentId: "pipeflow",
    inputs: { density: { value: "1000", unit: "kg/m3" } },
    runValues: { flow: { value: 2, unit: "m3/s" } },
    results: { f: 0.02 },
    graphData: [{ key: "friction", points: [{ x: 1, y: 2 }] }],
    status: "completed",
    startedAt: Timestamp.fromDate(new Date()),
    completedAt: serverTimestamp(),
    ...overrides,
  };
}

// The exact document services/authService.ts writes for a new account.
function newProfilePayload(uid, overrides = {}) {
  return {
    uid,
    name: "New Student",
    email: EMAIL[uid],
    role: "student",
    university: "",
    program: "",
    branch: "",
    createdAt: serverTimestamp(),
    ...overrides,
  };
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-vlabs-rules",
    firestore: {
      // RULES_FILE lets a copy of the rules be tested (used to check that these tests can fail).
      rules: fs.readFileSync(
        process.env.RULES_FILE || path.join(__dirname, "..", "firestore.rules"),
        "utf8",
      ),
    },
  });
});

after(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const legacy = profile(LEGACY, "student");

    delete legacy.university;
    delete legacy.program;
    delete legacy.branch;

    await setDoc(doc(db, "users", STUDENT_A), profile(STUDENT_A, "student"));
    await setDoc(doc(db, "users", STUDENT_B), profile(STUDENT_B, "student"));
    await setDoc(doc(db, "users", LEGACY), legacy);
    await setDoc(doc(db, "users", FACULTY), profile(FACULTY, "faculty"));
    await setDoc(doc(db, "users", ODD_ROLE), profile(ODD_ROLE, "admin"));
    await setDoc(
      doc(db, "users", NO_ROLE),
      (() => {
        const data = profile(NO_ROLE, "student");

        delete data.role;

        return data;
      })(),
    );

    await setDoc(doc(db, "subjects", "fluid-mechanics"), {
      title: "Fluid Mechanics",
    });
    await setDoc(
      doc(db, "subjects", "fluid-mechanics", "experiments", "pipeflow"),
      {
        id: "pipeflow",
        title: "Pipe Flow",
        isPublished: true,
        createdBy: "admin",
      },
    );
    await setDoc(
      doc(db, "subjects", "fluid-mechanics", "experiments", "draft-exp"),
      {
        id: "draft-exp",
        title: "Draft",
        isPublished: false,
        createdBy: "admin",
      },
    );

    await setDoc(doc(db, "experimentRuns", "run-a"), {
      ...runPayload(STUDENT_A),
      completedAt: Timestamp.fromDate(new Date("2026-02-01T00:00:00Z")),
    });
    await setDoc(doc(db, "experimentRuns", "run-b"), {
      ...runPayload(STUDENT_B),
      completedAt: Timestamp.fromDate(new Date("2026-02-02T00:00:00Z")),
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe("users: reading", () => {
  it("[#1] denies an unauthenticated client reading a profile", async () => {
    await assertFails(getDoc(doc(anonymous(), "users", STUDENT_A)));
  });

  it("[#2] lets a student read their own profile", async () => {
    await assertSucceeds(getDoc(doc(asUser(STUDENT_A), "users", STUDENT_A)));
  });

  it("[#3] denies a student reading another student's profile", async () => {
    await assertFails(getDoc(doc(asUser(STUDENT_A), "users", STUDENT_B)));
  });

  it("denies unfiltered user listing, but lets faculty list student profiles", async () => {
    await assertFails(getDocs(collection(asUser(STUDENT_A), "users")));
    await assertFails(getDocs(collection(asUser(FACULTY), "users")));

    await assertSucceeds(
      getDocs(
        query(
          collection(asUser(FACULTY), "users"),
          where("role", "==", "student"),
        ),
      ),
    );
  });

  it("lets faculty read a student's profile", async () => {
    await assertSucceeds(getDoc(doc(asUser(FACULTY), "users", STUDENT_A)));
  });
});

// ---------------------------------------------------------------------------------------------
describe("users: updating", () => {
  it("[#4] lets a student update all four editable fields", async () => {
    await assertSucceeds(
      updateDoc(doc(asUser(STUDENT_A), "users", STUDENT_A), {
        name: "Example1",
        university: "Analytical University",
        program: "B.Tech",
        branch: "Chemical",
      }),
    );
  });

  it("lets a legacy profile that has no academic fields gain them", async () => {
    await assertSucceeds(
      updateDoc(doc(asUser(LEGACY), "users", LEGACY), {
        name: "Legacy",
        university: "Old Uni",
        program: "M.Tech",
        branch: "Civil",
      }),
    );
  });

  it("lets a student clear an academic field back to empty", async () => {
    await assertSucceeds(
      updateDoc(doc(asUser(STUDENT_A), "users", STUDENT_A), {
        name: "Same",
        university: "",
        program: "",
        branch: "",
      }),
    );
  });

  it("[#5] denies a student changing their role", async () => {
    await assertFails(
      updateDoc(doc(asUser(STUDENT_A), "users", STUDENT_A), {
        role: "faculty",
      }),
    );
  });

  it("[#6] denies a student changing their email", async () => {
    await assertFails(
      updateDoc(doc(asUser(STUDENT_A), "users", STUDENT_A), {
        email: "someone-else@example.com",
      }),
    );
  });

  it("[#7] denies a student changing their uid", async () => {
    await assertFails(
      updateDoc(doc(asUser(STUDENT_A), "users", STUDENT_A), { uid: STUDENT_B }),
    );
  });

  it("denies a student changing createdAt", async () => {
    await assertFails(
      updateDoc(doc(asUser(STUDENT_A), "users", STUDENT_A), {
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("[#8] denies a student updating another student's profile", async () => {
    await assertFails(
      updateDoc(doc(asUser(STUDENT_A), "users", STUDENT_B), { name: "Hacked" }),
    );
  });

  it("[#9] denies a student promoting themselves to faculty, even alongside allowed fields", async () => {
    const ref = doc(asUser(STUDENT_A), "users", STUDENT_A);

    await assertFails(updateDoc(ref, { role: "faculty" }));
    await assertFails(updateDoc(ref, { name: "Legit Name", role: "faculty" }));
    await assertFails(updateDoc(ref, { role: "admin" }));
    await assertFails(updateDoc(ref, { role: deleteField() }));
    await assertFails(setDoc(ref, profile(STUDENT_A, "faculty")));
  });

  it("denies adding any field the app does not offer (no field injection)", async () => {
    const ref = doc(asUser(STUDENT_A), "users", STUDENT_A);

    await assertFails(updateDoc(ref, { isAdmin: true }));
    await assertFails(updateDoc(ref, { name: "Ok", permissions: ["all"] }));
  });

  it("denies unusable values for the editable fields", async () => {
    const ref = doc(asUser(STUDENT_A), "users", STUDENT_A);

    await assertFails(updateDoc(ref, { name: "" }));
    await assertFails(updateDoc(ref, { name: "x".repeat(81) }));
    await assertFails(updateDoc(ref, { name: 42 }));
    await assertFails(updateDoc(ref, { university: "x".repeat(101) }));
    await assertFails(updateDoc(ref, { branch: { nested: true } }));
  });

  it("accepts values exactly at the limits", async () => {
    await assertSucceeds(
      updateDoc(doc(asUser(STUDENT_A), "users", STUDENT_A), {
        name: "x".repeat(80),
        university: "y".repeat(100),
      }),
    );
  });

  it("denies an unauthenticated client updating a user", async () => {
    await assertFails(
      updateDoc(doc(anonymous(), "users", STUDENT_A), { name: "Anon" }),
    );
    await assertFails(
      updateDoc(doc(anonymous(), "users", STUDENT_A), { role: "faculty" }),
    );
  });

  it("denies faculty updating a student's profile (no broad user-write access)", async () => {
    await assertFails(
      updateDoc(doc(asUser(FACULTY), "users", STUDENT_A), { name: "Changed" }),
    );
  });

  it("denies a faculty member changing their own role or email", async () => {
    const ref = doc(asUser(FACULTY), "users", FACULTY);

    await assertFails(updateDoc(ref, { role: "admin" }));
    await assertFails(updateDoc(ref, { email: "x@example.com" }));
    await assertSucceeds(updateDoc(ref, { name: "Dr New Name" }));
  });
});

// ---------------------------------------------------------------------------------------------
describe("users: faculty editing their own profile (name, institution, department)", () => {
  const ref = () => doc(asUser(FACULTY), "users", FACULTY);
  // The exact fields the Faculty Edit Profile screen writes.
  const edit = {
    name: "Dr Faculty One",
    university: "Analytical University",
    department: "Chemical Engineering",
  };

  it("lets a faculty member update name, university and department", async () => {
    await assertSucceeds(updateDoc(ref(), edit));

    const stored = (await getDoc(ref())).data();

    if (
      stored.department !== "Chemical Engineering" ||
      stored.university !== "Analytical University"
    ) {
      throw new Error("the edited fields were not stored");
    }
    // Everything the app does not edit is exactly as provisioned.
    if (
      stored.role !== "faculty" ||
      stored.uid !== FACULTY ||
      stored.email !== EMAIL[FACULTY]
    ) {
      throw new Error("role, uid or email changed");
    }
  });

  it("lets a faculty member edit again once a department is already stored", async () => {
    await assertSucceeds(updateDoc(ref(), edit));
    await assertSucceeds(
      updateDoc(ref(), { ...edit, department: "Civil Engineering" }),
    );
  });

  it("lets a faculty member clear the department and institution", async () => {
    await assertSucceeds(
      updateDoc(ref(), { ...edit, university: "", department: "" }),
    );
  });

  it("denies changing role, email, uid or createdAt, even alongside the allowed fields", async () => {
    await assertFails(updateDoc(ref(), { ...edit, role: "student" }));
    await assertFails(updateDoc(ref(), { ...edit, role: "admin" }));
    await assertFails(
      updateDoc(ref(), { ...edit, email: "someone-else@example.com" }),
    );
    await assertFails(updateDoc(ref(), { ...edit, uid: STUDENT_A }));
    await assertFails(
      updateDoc(ref(), { ...edit, createdAt: serverTimestamp() }),
    );
  });

  it("denies adding any other field next to department (no field injection)", async () => {
    await assertFails(updateDoc(ref(), { ...edit, isAdmin: true }));
    await assertFails(updateDoc(ref(), { ...edit, permissions: ["all"] }));
  });

  it("keeps department a short string", async () => {
    await assertFails(
      updateDoc(ref(), { ...edit, department: "x".repeat(101) }),
    );
    await assertFails(updateDoc(ref(), { ...edit, department: 42 }));
    await assertFails(
      updateDoc(ref(), { ...edit, department: { nested: true } }),
    );
    await assertSucceeds(
      updateDoc(ref(), { ...edit, department: "x".repeat(100) }),
    );
  });

  it("still requires a name", async () => {
    await assertFails(updateDoc(ref(), { ...edit, name: "" }));
    await assertFails(updateDoc(ref(), { ...edit, name: "x".repeat(81) }));
  });

  it("denies editing someone else's department", async () => {
    await assertFails(
      updateDoc(doc(asUser(FACULTY), "users", STUDENT_A), {
        department: "Hacked",
      }),
    );
    await assertFails(
      updateDoc(doc(asUser(STUDENT_A), "users", FACULTY), {
        department: "Hacked",
      }),
    );
    await assertFails(
      updateDoc(doc(anonymous(), "users", FACULTY), { department: "Hacked" }),
    );
  });

  it("still denies creating any profile that carries a department (create shape is unchanged)", async () => {
    await assertFails(
      setDoc(
        doc(asUser(NO_PROFILE), "users", NO_PROFILE),
        newProfilePayload(NO_PROFILE, { department: "Chemical Engineering" }),
      ),
    );
  });

  it("still denies a faculty member deleting their profile", async () => {
    await assertFails(deleteDoc(ref()));
  });
});

// ---------------------------------------------------------------------------------------------
describe("users: creating and deleting", () => {
  it("lets an account with no profile yet read its own (missing) profile document", async () => {
    const snapshot = await assertSucceeds(
      getDoc(doc(asUser(NO_PROFILE), "users", NO_PROFILE)),
    );

    if (snapshot.exists())
      throw new Error("expected the profile not to exist yet");
  });

  it("lets the app create a missing profile in a transaction (createIfAbsent)", async () => {
    const db = asUser(NO_PROFILE);
    const reference = doc(db, "users", NO_PROFILE);

    await assertSucceeds(
      runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(reference);

        if (!snapshot.exists())
          transaction.set(reference, newProfilePayload(NO_PROFILE));
      }),
    );
  });

  it("denies that same transaction when it tries to create a faculty profile", async () => {
    const db = asUser(NO_PROFILE);
    const reference = doc(db, "users", NO_PROFILE);

    await assertFails(
      runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(reference);

        if (!snapshot.exists()) {
          transaction.set(
            reference,
            newProfilePayload(NO_PROFILE, { role: "faculty" }),
          );
        }
      }),
    );
  });

  it("lets a new account create its own student profile (the sign-up write)", async () => {
    await assertSucceeds(
      setDoc(
        doc(asUser(NO_PROFILE), "users", NO_PROFILE),
        newProfilePayload(NO_PROFILE),
      ),
    );
  });

  it("accepts a mixed-case email that matches the auth email", async () => {
    await assertSucceeds(
      setDoc(
        doc(asUser(NO_PROFILE), "users", NO_PROFILE),
        newProfilePayload(NO_PROFILE, { email: "New@Example.COM" }),
      ),
    );
  });

  it("[#9] denies creating your own profile as faculty", async () => {
    const ref = doc(asUser(NO_PROFILE), "users", NO_PROFILE);

    await assertFails(
      setDoc(ref, newProfilePayload(NO_PROFILE, { role: "faculty" })),
    );
    await assertFails(
      setDoc(ref, newProfilePayload(NO_PROFILE, { role: "admin" })),
    );
    await assertFails(setDoc(ref, newProfilePayload(NO_PROFILE, { role: "" })));
  });

  it("denies creating a profile for someone else", async () => {
    // Same email as the caller, so only the "wrong uid" rule can be what denies these.
    await assertFails(
      setDoc(
        doc(asUser(NO_PROFILE), "users", "victim-uid"),
        newProfilePayload("victim-uid", { email: EMAIL[NO_PROFILE] }),
      ),
    );
    await assertFails(
      setDoc(
        doc(asUser(NO_PROFILE), "users", NO_PROFILE),
        newProfilePayload(NO_PROFILE, { uid: STUDENT_A }),
      ),
    );
  });

  it("denies a profile with a different email than the account has", async () => {
    await assertFails(
      setDoc(
        doc(asUser(NO_PROFILE), "users", NO_PROFILE),
        newProfilePayload(NO_PROFILE, { email: "ceo@example.com" }),
      ),
    );
  });

  it("denies extra or missing fields on create", async () => {
    const ref = doc(asUser(NO_PROFILE), "users", NO_PROFILE);
    const missing = newProfilePayload(NO_PROFILE);

    delete missing.branch;

    await assertFails(
      setDoc(ref, newProfilePayload(NO_PROFILE, { isAdmin: true })),
    );
    await assertFails(setDoc(ref, missing));
  });

  it("denies a client-chosen createdAt", async () => {
    await assertFails(
      setDoc(
        doc(asUser(NO_PROFILE), "users", NO_PROFILE),
        newProfilePayload(NO_PROFILE, {
          createdAt: Timestamp.fromDate(new Date("2020-01-01")),
        }),
      ),
    );
  });

  it("denies an unauthenticated client creating a user", async () => {
    await assertFails(
      setDoc(
        doc(anonymous(), "users", NO_PROFILE),
        newProfilePayload(NO_PROFILE),
      ),
    );
  });

  it("denies deleting a profile: own, someone elses, faculty, or unauthenticated", async () => {
    await assertFails(deleteDoc(doc(asUser(STUDENT_A), "users", STUDENT_A)));
    await assertFails(deleteDoc(doc(asUser(STUDENT_A), "users", STUDENT_B)));
    await assertFails(deleteDoc(doc(asUser(FACULTY), "users", STUDENT_A)));
    await assertFails(deleteDoc(doc(anonymous(), "users", STUDENT_A)));
  });
});

// ---------------------------------------------------------------------------------------------
describe("missing or unusable profiles fail safe", () => {
  const experimentRef = (db) =>
    doc(db, "subjects", "fluid-mechanics", "experiments", "pipeflow");

  it("grants nothing to a signed-in user with no profile", async () => {
    const db = asUser(NO_PROFILE);

    await assertFails(getDoc(doc(db, "subjects", "fluid-mechanics")));
    await assertFails(getDoc(experimentRef(db)));
    await assertFails(
      addDoc(collection(db, "experimentRuns"), runPayload(NO_PROFILE)),
    );
    await assertFails(
      setDoc(doc(db, "subjects", "fluid-mechanics", "experiments", "x"), {
        isPublished: true,
      }),
    );
  });

  it("grants nothing to a profile whose role is missing", async () => {
    const db = asUser(NO_ROLE);

    await assertFails(getDoc(experimentRef(db)));
    await assertFails(
      addDoc(collection(db, "experimentRuns"), runPayload(NO_ROLE)),
    );
    await assertFails(
      setDoc(doc(db, "subjects", "fluid-mechanics", "experiments", "x"), {
        isPublished: true,
      }),
    );
  });

  it("grants nothing to a profile with an unknown role", async () => {
    const db = asUser(ODD_ROLE);

    await assertFails(getDoc(experimentRef(db)));
    await assertFails(
      addDoc(collection(db, "experimentRuns"), runPayload(ODD_ROLE)),
    );
    await assertFails(
      setDoc(doc(db, "subjects", "fluid-mechanics", "experiments", "x"), {
        isPublished: true,
      }),
    );
  });
});

// ---------------------------------------------------------------------------------------------
describe("subjects and experiments", () => {
  const published = (db) =>
    doc(db, "subjects", "fluid-mechanics", "experiments", "pipeflow");
  const draft = (db) =>
    doc(db, "subjects", "fluid-mechanics", "experiments", "draft-exp");
  const experiments = (db) =>
    collection(db, "subjects", "fluid-mechanics", "experiments");

  it("denies unauthenticated reads of subjects and experiments", async () => {
    await assertFails(getDocs(collection(anonymous(), "subjects")));
    await assertFails(getDoc(published(anonymous())));
    await assertFails(getDocs(experiments(anonymous())));
  });

  it("lets signed-in students and faculty read subjects", async () => {
    await assertSucceeds(getDocs(collection(asUser(STUDENT_A), "subjects")));
    await assertSucceeds(getDocs(collection(asUser(FACULTY), "subjects")));
  });

  it("[#12] lets a student read a published experiment", async () => {
    await assertSucceeds(getDoc(published(asUser(STUDENT_A))));
  });

  it("[#12] lets a student list published experiments (the query the app runs)", async () => {
    await assertSucceeds(
      getDocs(
        query(experiments(asUser(STUDENT_A)), where("isPublished", "==", true)),
      ),
    );
  });

  it("denies a student reading an unpublished experiment, by id or by list", async () => {
    await assertFails(getDoc(draft(asUser(STUDENT_A))));
    await assertFails(
      getDocs(
        query(
          experiments(asUser(STUDENT_A)),
          where("isPublished", "==", false),
        ),
      ),
    );
  });

  it("denies a student an unfiltered list, since it would include unpublished experiments", async () => {
    await assertFails(getDocs(experiments(asUser(STUDENT_A))));
  });

  it("[#10] lets faculty read published and unpublished experiments, filtered or not", async () => {
    const db = asUser(FACULTY);

    await assertSucceeds(getDoc(published(db)));
    await assertSucceeds(getDoc(draft(db)));
    await assertSucceeds(getDocs(experiments(db)));
  });

  it("[#10] lets faculty create an experiment", async () => {
    await assertSucceeds(
      setDoc(
        doc(
          asUser(FACULTY),
          "subjects",
          "fluid-mechanics",
          "experiments",
          "new-exp",
        ),
        {
          id: "new-exp",
          title: "New",
          isPublished: false,
          createdBy: FACULTY,
        },
      ),
    );
  });

  it("[#10] lets faculty edit, publish and unpublish", async () => {
    const db = asUser(FACULTY);

    await assertSucceeds(updateDoc(draft(db), { title: "Edited draft" }));
    await assertSucceeds(updateDoc(draft(db), { isPublished: true }));
    await assertSucceeds(updateDoc(published(db), { isPublished: false }));
  });

  it("keeps isPublished a boolean", async () => {
    const db = asUser(FACULTY);

    await assertFails(updateDoc(published(db), { isPublished: "yes" }));
    await assertFails(
      setDoc(doc(db, "subjects", "fluid-mechanics", "experiments", "no-flag"), {
        title: "x",
      }),
    );
  });

  it("[#11] denies a student creating, editing, publishing or deleting experiments", async () => {
    const db = asUser(STUDENT_A);

    await assertFails(
      setDoc(doc(db, "subjects", "fluid-mechanics", "experiments", "sneaky"), {
        id: "sneaky",
        isPublished: true,
      }),
    );
    await assertFails(updateDoc(published(db), { title: "Defaced" }));
    await assertFails(updateDoc(draft(db), { isPublished: true }));
    await assertFails(updateDoc(published(db), { isPublished: false }));
    await assertFails(deleteDoc(published(db)));
  });

  it("denies an unauthenticated client writing experiments", async () => {
    await assertFails(updateDoc(published(anonymous()), { title: "Defaced" }));
    await assertFails(
      setDoc(
        doc(anonymous(), "subjects", "fluid-mechanics", "experiments", "x"),
        { isPublished: true },
      ),
    );
  });

  it("denies deleting experiments (the Faculty UI has no delete)", async () => {
    await assertFails(deleteDoc(published(asUser(FACULTY))));
    await assertFails(deleteDoc(draft(asUser(FACULTY))));
  });

  it("denies every client writing subjects", async () => {
    await assertFails(
      setDoc(doc(asUser(FACULTY), "subjects", "new-subject"), { title: "x" }),
    );
    await assertFails(
      updateDoc(doc(asUser(FACULTY), "subjects", "fluid-mechanics"), {
        title: "x",
      }),
    );
    await assertFails(
      setDoc(doc(asUser(STUDENT_A), "subjects", "new-subject"), { title: "x" }),
    );
  });
});

// ---------------------------------------------------------------------------------------------
describe("experimentRuns", () => {
  const runs = (db) => collection(db, "experimentRuns");

  it("[#13] lets a student create their own run (exactly what the app writes)", async () => {
    await assertSucceeds(
      addDoc(runs(asUser(STUDENT_A)), runPayload(STUDENT_A)),
    );
  });

  it("[#14] lets a student read their own run, by id and by the query the app runs", async () => {
    const db = asUser(STUDENT_A);

    await assertSucceeds(getDoc(doc(db, "experimentRuns", "run-a")));
    await assertSucceeds(
      getDocs(query(runs(db), where("studentId", "==", STUDENT_A))),
    );
  });

  it("[#15] denies a student reading another student's run", async () => {
    const db = asUser(STUDENT_A);

    await assertFails(getDoc(doc(db, "experimentRuns", "run-b")));
    await assertFails(
      getDocs(query(runs(db), where("studentId", "==", STUDENT_B))),
    );
  });

  it("denies a student listing every student's runs", async () => {
    await assertFails(getDocs(runs(asUser(STUDENT_A))));
  });

  it("[#16] denies a student creating a run owned by someone else", async () => {
    const db = asUser(STUDENT_A);

    await assertFails(addDoc(runs(db), runPayload(STUDENT_B)));
    await assertFails(
      setDoc(doc(db, "experimentRuns", "planted"), runPayload(STUDENT_B)),
    );
    await assertFails(addDoc(runs(db), runPayload("")));
  });

  it("[#16] denies the spoofed run from ever becoming readable by its 'owner'", async () => {
    await assertFails(addDoc(runs(asUser(STUDENT_A)), runPayload(STUDENT_B)));
    await env.withSecurityRulesDisabled(async (context) => {
      const snapshot = await getDocs(
        query(runs(context.firestore()), where("studentId", "==", STUDENT_B)),
      );

      // Only the seeded run-b exists; the rejected spoof left nothing behind.
      if (snapshot.size !== 1)
        throw new Error(`expected 1 run for student B, found ${snapshot.size}`);
    });
  });

  it("[#17] denies a student changing the owner of an existing run", async () => {
    const db = asUser(STUDENT_A);

    await assertFails(
      updateDoc(doc(db, "experimentRuns", "run-a"), { studentId: STUDENT_B }),
    );
    await assertFails(
      updateDoc(doc(db, "experimentRuns", "run-b"), { studentId: STUDENT_A }),
    );
  });

  it("denies updating a saved run at all (saved runs are frozen)", async () => {
    const db = asUser(STUDENT_A);

    await assertFails(
      updateDoc(doc(db, "experimentRuns", "run-a"), { results: { f: 999 } }),
    );
    await assertFails(
      updateDoc(doc(db, "experimentRuns", "run-b"), { results: { f: 999 } }),
    );
  });

  it("denies deleting a run, including your own", async () => {
    const db = asUser(STUDENT_A);

    await assertFails(deleteDoc(doc(db, "experimentRuns", "run-a")));
    await assertFails(deleteDoc(doc(db, "experimentRuns", "run-b")));
  });

  it("denies unauthenticated access to runs", async () => {
    await assertFails(getDoc(doc(anonymous(), "experimentRuns", "run-a")));
    await assertFails(addDoc(runs(anonymous()), runPayload(STUDENT_A)));
    await assertFails(getDocs(runs(anonymous())));
  });

  it("denies a run with an unexpected extra field", async () => {
    await assertFails(
      addDoc(runs(asUser(STUDENT_A)), runPayload(STUDENT_A, { grade: "A+" })),
    );
  });

  it("denies a run with a missing field", async () => {
    const payload = runPayload(STUDENT_A);

    delete payload.graphData;

    await assertFails(addDoc(runs(asUser(STUDENT_A)), payload));
  });

  it("denies a run that is not marked completed", async () => {
    await assertFails(
      addDoc(
        runs(asUser(STUDENT_A)),
        runPayload(STUDENT_A, { status: "draft" }),
      ),
    );
  });

  it("denies a run with a client-chosen completion time", async () => {
    await assertFails(
      addDoc(
        runs(asUser(STUDENT_A)),
        runPayload(STUDENT_A, {
          completedAt: Timestamp.fromDate(new Date("2020-01-01")),
        }),
      ),
    );
  });

  it("denies runs with the wrong field types", async () => {
    const db = asUser(STUDENT_A);

    await assertFails(
      addDoc(runs(db), runPayload(STUDENT_A, { inputs: "not a map" })),
    );
    await assertFails(
      addDoc(runs(db), runPayload(STUDENT_A, { graphData: {} })),
    );
    await assertFails(
      addDoc(runs(db), runPayload(STUDENT_A, { experimentId: "" })),
    );
    await assertFails(
      addDoc(runs(db), runPayload(STUDENT_A, { startedAt: "yesterday" })),
    );
  });

  it("denies faculty creating a run (runs are a student action)", async () => {
    await assertFails(addDoc(runs(asUser(FACULTY)), runPayload(FACULTY)));
  });

  it("lets faculty read student runs for Reports", async () => {
    await assertSucceeds(
      getDoc(doc(asUser(FACULTY), "experimentRuns", "run-a")),
    );

    await assertSucceeds(getDocs(runs(asUser(FACULTY))));
  });
});

// ---------------------------------------------------------------------------------------------
describe("everything else", () => {
  it("denies collections the app does not use", async () => {
    await assertFails(
      setDoc(doc(asUser(FACULTY), "admin", "config"), { open: true }),
    );
    await assertFails(getDoc(doc(asUser(FACULTY), "admin", "config")));
    await assertFails(
      setDoc(doc(asUser(STUDENT_A), "reports", "r1"), { x: 1 }),
    );
  });
});
