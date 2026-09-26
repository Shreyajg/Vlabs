import type { AuthUser, ProfileFieldsUpdate, UserProfile, UserRole } from "../../types/User";

// Pure module: the single source of truth for "who is signed in", as a reducer.

/**
 * loading          Firebase has not answered yet, or a signed-in user's profile is still being read
 * unauthenticated  nobody is signed in
 * authenticated    signed in, with a profile (and therefore a role)
 * profile-error    signed in, but the profile could not be read
 */
export type AuthStatus = "loading" | "unauthenticated" | "authenticated" | "profile-error";

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  profile: UserProfile | null;
  /** False until the first answer from Firebase, so the app never renders before it knows who is signed in. */
  initialized: boolean;
}

export type AuthAction =
  | { type: "signed-out" }
  | { type: "user-detected"; user: AuthUser }
  | { type: "profile-loaded"; user: AuthUser; profile: UserProfile }
  | { type: "profile-failed"; user: AuthUser }
  | { type: "profile-updated"; uid: string; fields: ProfileFieldsUpdate };

export const initialAuthState: AuthState = {
  status: "loading",
  user: null,
  profile: null,
  initialized: false,
};

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "signed-out":
      return { status: "unauthenticated", user: null, profile: null, initialized: true };

    case "user-detected":
      return { status: "loading", user: action.user, profile: null, initialized: state.initialized };

    case "profile-loaded":
      // A late answer for a user who is no longer the current one is ignored.
      if (state.user?.uid !== action.user.uid) return state;

      return { status: "authenticated", user: action.user, profile: action.profile, initialized: true };

    case "profile-failed":
      if (state.user?.uid !== action.user.uid) return state;

      return { status: "profile-error", user: action.user, profile: null, initialized: true };

    case "profile-updated": {
      // Merge only the editable fields (a student's four, or a faculty member's three) into the profile
      // already in state, so every screen that reads it (Home, Profile) updates together and role,
      // email, uid and createdAt cannot change.
      if (state.status !== "authenticated" || state.profile?.uid !== action.uid) return state;

      const { fields } = action;
      const edited =
        "department" in fields
          ? { name: fields.name, university: fields.university, department: fields.department }
          : {
              name: fields.name,
              university: fields.university,
              program: fields.program,
              branch: fields.branch,
            };

      return { ...state, profile: { ...state.profile, ...edited } };
    }

    default:
      return state;
  }
}

export function roleOf(state: AuthState): UserRole | null {
  return state.status === "authenticated" ? (state.profile?.role ?? null) : null;
}
