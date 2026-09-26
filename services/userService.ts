import { collection, getDocs, query, Timestamp, where } from "firebase/firestore";
import { db } from "../firebase/config";
import type { UserProfile } from "../types/User";
import { ServiceError } from "./serviceError";

// Faculty-facing reads only. A student's own profile is handled by services/authService.ts; this module
// is for a faculty member reading OTHER users' profiles (student counts, names, performance), which the
// experimentRuns-style rule requires filtering in the query itself: where('role','==','student') is what
// makes the users/{uid} `list` rule provable for a faculty caller, not a broad unfiltered query.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStudentProfile(uid: string, data: Record<string, unknown>): UserProfile {
  return {
    uid,
    name: typeof data.name === "string" ? data.name : "",
    email: typeof data.email === "string" ? data.email : "",
    role: "student",
    university: typeof data.university === "string" ? data.university : "",
    program: typeof data.program === "string" ? data.program : "",
    branch: typeof data.branch === "string" ? data.branch : "",
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
  };
}

/**
 * Every student profile — faculty-only (the rule requires the isFaculty() caller and this exact
 * where('role','==','student') filter; a student calling this gets permission-denied, same as any other
 * student attempting to list users).
 * @throws ServiceError when Firestore rejects the read.
 */
export async function getStudentProfiles(): Promise<UserProfile[]> {
  try {
    const snapshot = await getDocs(
      query(collection(db, "users"), where("role", "==", "student")),
    );

    return snapshot.docs
      .filter((document) => isRecord(document.data()))
      .map((document) => toStudentProfile(document.id, document.data()));
  } catch (error) {
    throw new ServiceError("load student profiles", error);
  }
}
