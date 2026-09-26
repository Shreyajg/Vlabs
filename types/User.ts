import type { Timestamp } from "firebase/firestore";

export type UserRole = "student" | "faculty";

/** The parts of a Firebase user that the app uses. Keeps app code independent of the Firebase SDK. */
export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

/**
 * Document at users/{uid}.
 *
 * university, program and branch are added after registration. Accounts created before they existed
 * have none of them stored, so they are read as empty strings ("Not added" in the UI).
 */
export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  university: string;
  program: string;
  branch: string;
  /** Faculty only. Added after the account exists, so it is absent on older documents and on students. */
  department?: string;
  createdAt: Timestamp | null;
}

/**
 * What a client is allowed to create: a student profile, always.
 * The literal type makes it impossible to build a faculty profile from client code by accident.
 * Faculty accounts are provisioned by an administrator, never through public registration.
 * The academic fields start empty: registration does not collect them.
 */
export interface NewUserProfile {
  uid: string;
  name: string;
  email: string;
  role: "student";
  university: string;
  program: string;
  branch: string;
}

/**
 * The only fields a student may change on their own profile.
 * uid, email, role and createdAt are deliberately absent, so an update cannot carry them.
 */
export interface ProfileUpdate {
  name: string;
  university: string;
  program: string;
  branch: string;
}

/**
 * The only fields a faculty member may change on their own profile.
 * Like ProfileUpdate, it has no uid, email, role or createdAt, so an update cannot carry them.
 */
export interface FacultyProfileUpdate {
  name: string;
  university: string;
  department: string;
}

/** Any profile edit the app can write. Exactly one of these two fixed shapes ever reaches Firestore. */
export type ProfileFieldsUpdate = ProfileUpdate | FacultyProfileUpdate;
