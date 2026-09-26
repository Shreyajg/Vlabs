import type { Timestamp } from "firebase/firestore";
import type {
  AuthUser,
  FacultyProfileUpdate,
  NewUserProfile,
  ProfileUpdate,
  UserProfile,
  UserRole,
} from "../../types/User";

// Pure module: shape and defaults of users/{uid}.

const ROLES: readonly UserRole[] = ["student", "faculty"];

/** Shown wherever an academic field has not been filled in. */
export const NOT_ADDED = "Not added";

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestampLike(value: unknown): value is Timestamp {
  return isRecord(value) && typeof value.toDate === "function";
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** A readable name for someone whose profile has none: their display name, else the part before the @. */
export function fallbackName(user: Pick<AuthUser, "displayName" | "email">): string {
  const displayName = user.displayName?.trim();

  if (displayName) return displayName;

  const local = user.email?.split("@")[0]?.trim();

  return local || "Student";
}

/**
 * The name to show for the signed-in person (for example, on Student Home): the name in their
 * profile, then their Firebase display name, then the start of their email. Never empty.
 */
export function resolveDisplayName(
  profile: Pick<UserProfile, "name"> | null,
  user: Pick<AuthUser, "displayName" | "email"> | null,
): string {
  const profileName = profile?.name.trim();

  if (profileName) return profileName;

  return fallbackName(user ?? { displayName: null, email: null });
}

/** An academic value for display: the value itself, or "Not added" when it is empty or missing. */
export function academicValue(value: string | null | undefined): string {
  const trimmed = value?.trim();

  return trimmed ? trimmed : NOT_ADDED;
}

/**
 * The profile a client creates for a new account. The role is fixed to "student" here:
 * nothing a caller passes can change it, so public registration can never create faculty.
 * Academic fields start empty; nothing is invented.
 */
export function buildNewStudentProfile(input: {
  uid: string;
  name: string;
  email: string;
}): NewUserProfile {
  return {
    uid: input.uid,
    name: input.name.trim(),
    email: input.email.trim(),
    role: "student",
    university: "",
    program: "",
    branch: "",
  };
}

/** Fields written to Firestore for a new profile (createdAt is added by the store as a server timestamp). */
export function profileToDocument(profile: NewUserProfile) {
  return {
    uid: profile.uid,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    university: profile.university,
    program: profile.program,
    branch: profile.branch,
  };
}

/**
 * Reads users/{uid}. An unknown or missing role becomes "student", the least-privileged role,
 * and academic fields that were never saved read as empty.
 */
export function parseUserProfile(
  uid: string,
  data: Record<string, unknown>,
  user: Pick<AuthUser, "displayName" | "email">,
): UserProfile {
  const name = text(data.name);
  const email = text(data.email);

  return {
    uid,
    name: name || fallbackName(user),
    email: email || (user.email ?? ""),
    role: isUserRole(data.role) ? data.role : "student",
    university: text(data.university),
    program: text(data.program),
    branch: text(data.branch),
    department: text(data.department),
    createdAt: isTimestampLike(data.createdAt) ? data.createdAt : null,
  };
}

/**
 * The exact fields written when a student edits their profile: name, university, program, branch.
 * Everything else a caller might pass (role, email, uid, createdAt) is dropped, so it can never
 * reach Firestore through this path.
 */
export function buildProfileUpdate(input: {
  name: string;
  university: string;
  program: string;
  branch: string;
}): ProfileUpdate {
  return {
    name: input.name.trim(),
    university: input.university.trim(),
    program: input.program.trim(),
    branch: input.branch.trim(),
  };
}

/**
 * The exact fields written when a faculty member edits their profile: name, university (the
 * institution) and department. Anything else a caller might pass (role, email, uid, createdAt,
 * program, branch) is dropped, so it can never reach Firestore through this path.
 */
export function buildFacultyProfileUpdate(input: {
  name: string;
  university: string;
  department: string;
}): FacultyProfileUpdate {
  return {
    name: input.name.trim(),
    university: input.university.trim(),
    department: input.department.trim(),
  };
}
