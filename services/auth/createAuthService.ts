import type { AuthUser, NewUserProfile, ProfileFieldsUpdate, UserProfile } from "../../types/User";
import { AuthError, mapAuthError } from "./authErrors";
import {
  hasErrors,
  isFacultyProfileEdit,
  validateFacultyProfileEdit,
  validateProfileEdit,
  validateSignIn,
  validateSignUp,
  type FacultyProfileEditInput,
  type ProfileEditInput,
} from "./authValidation";
import {
  buildFacultyProfileUpdate,
  buildNewStudentProfile,
  buildProfileUpdate,
  fallbackName,
} from "./userProfile";

// Pure module: the authentication logic, with Firebase supplied from outside.
// services/authService.ts wires in the real Firebase Auth and Firestore.

/** The Firebase Authentication operations this app uses. */
export interface AuthBackend {
  createUser(email: string, password: string): Promise<AuthUser>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  updateDisplayName(name: string): Promise<void>;
  getCurrentUser(): AuthUser | null;
  onAuthStateChanged(listener: (user: AuthUser | null) => void): () => void;
}

/** Reads and writes users/{uid}. */
export interface ProfileStore {
  get(uid: string): Promise<UserProfile | null>;
  /** Writes the profile, replacing anything there. Used once, right after sign-up. */
  create(profile: NewUserProfile): Promise<UserProfile>;
  /** Writes the profile only if none exists (atomically) and returns whichever is stored. */
  createIfAbsent(profile: NewUserProfile): Promise<UserProfile>;
  /**
   * Changes only the given fields of an existing profile, leaving uid, email, role, createdAt and
   * anything else as they are. Never creates a profile.
   */
  update(uid: string, fields: ProfileFieldsUpdate): Promise<void>;
}

export type AuthLogger = (message: string, error?: unknown) => void;

export interface SignUpResult {
  user: AuthUser;
  profile: UserProfile;
}

export interface AuthService {
  /** Creates the account, then its student profile. Public sign-up cannot choose a role. */
  signUp(email: string, password: string, profileData: { name: string }): Promise<SignUpResult>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  getCurrentUser(): AuthUser | null;
  /** The signed-in user's uid, or null. What Save All Runs uses as studentId. */
  getCurrentUserId(): string | null;
  subscribeToAuthState(listener: (user: AuthUser | null) => void): () => void;
  /** Reads the user's profile, creating a student profile if none exists yet. */
  loadUserProfile(user: AuthUser): Promise<UserProfile>;
  /**
   * Saves the signed-in user's own profile fields to users/{uid}: a student's name, university,
   * program and branch, or a faculty member's name, university (institution) and department.
   * The role, email and uid cannot be changed through this method. Returns what was saved.
   */
  updateProfile(input: ProfileEditInput | FacultyProfileEditInput): Promise<ProfileFieldsUpdate>;
}

export function createAuthService(
  backend: AuthBackend,
  store: ProfileStore,
  log: AuthLogger = () => undefined,
): AuthService {
  // While a sign-up is running, profile loading waits for it, so the profile written by
  // sign-up (with the name the student typed) is never raced by an automatic one.
  let signUpInFlight: Promise<void> | null = null;

  async function signUp(
    email: string,
    password: string,
    profileData: { name: string },
  ): Promise<SignUpResult> {
    const fieldErrors = validateSignUp({
      name: profileData.name,
      email,
      password,
      confirmPassword: password,
    });

    if (hasErrors(fieldErrors)) {
      throw new AuthError("validation", { fieldErrors: fieldErrors as Record<string, string> });
    }

    let finish: () => void = () => undefined;

    signUpInFlight = new Promise<void>((resolve) => {
      finish = resolve;
    });

    try {
      let user: AuthUser;

      try {
        user = await backend.createUser(email.trim(), password);
      } catch (error) {
        log("createUser failed", error);
        throw mapAuthError(error);
      }

      try {
        await backend.updateDisplayName(profileData.name.trim());
      } catch (error) {
        // The Firestore profile is the source of the name, so this is not fatal.
        log("updateDisplayName failed", error);
      }

      try {
        const profile = await store.create(
          buildNewStudentProfile({
            uid: user.uid,
            name: profileData.name,
            email: user.email ?? email,
          }),
        );

        return { user, profile };
      } catch (error) {
        log("profile creation failed after sign-up", error);

        // Do not leave a half-set-up session. Signing in later repairs the missing profile.
        await backend.signOut().catch((signOutError) => log("sign-out after failed sign-up failed", signOutError));

        throw new AuthError("profile-setup-failed", { originalError: error });
      }
    } finally {
      finish();
      signUpInFlight = null;
    }
  }

  async function signIn(email: string, password: string): Promise<AuthUser> {
    const fieldErrors = validateSignIn({ email, password });

    if (hasErrors(fieldErrors)) {
      throw new AuthError("validation", { fieldErrors: fieldErrors as Record<string, string> });
    }

    try {
      return await backend.signIn(email.trim(), password);
    } catch (error) {
      log("signIn failed", error);
      throw mapAuthError(error);
    }
  }

  async function signOut(): Promise<void> {
    try {
      await backend.signOut();
    } catch (error) {
      log("signOut failed", error);
      throw mapAuthError(error);
    }
  }

  async function loadUserProfile(user: AuthUser): Promise<UserProfile> {
    if (signUpInFlight) await signUpInFlight;

    const existing = await store.get(user.uid);

    if (existing) return existing;

    // No profile yet (for example, sign-up finished creating the account but not the profile).
    // Always a student profile: this path can never grant another role.
    return store.createIfAbsent(
      buildNewStudentProfile({
        uid: user.uid,
        name: fallbackName(user),
        email: user.email ?? "",
      }),
    );
  }

  async function updateProfile(
    input: ProfileEditInput | FacultyProfileEditInput,
  ): Promise<ProfileFieldsUpdate> {
    // The uid always comes from the signed-in Firebase user, never from the caller.
    const uid = backend.getCurrentUser()?.uid;

    if (!uid) throw new AuthError("not-signed-in");

    const faculty = isFacultyProfileEdit(input);
    const fieldErrors: Record<string, string | undefined> = faculty
      ? validateFacultyProfileEdit(input)
      : validateProfileEdit(input);

    if (hasErrors(fieldErrors)) {
      throw new AuthError("validation", { fieldErrors: fieldErrors as Record<string, string> });
    }

    // Only one of two fixed shapes survives this step: name, university, program and branch for a
    // student, or name, university and department for a faculty member.
    const update: ProfileFieldsUpdate = faculty
      ? buildFacultyProfileUpdate(input)
      : buildProfileUpdate(input);

    try {
      await store.update(uid, update);
    } catch (error) {
      log("profile update failed", error);

      const mapped = mapAuthError(error);

      throw mapped.code === "network"
        ? mapped
        : new AuthError("profile-update-failed", { originalError: error });
    }

    return update;
  }

  return {
    signUp,
    signIn,
    signOut,
    updateProfile,
    getCurrentUser: () => backend.getCurrentUser(),
    getCurrentUserId: () => backend.getCurrentUser()?.uid ?? null,
    subscribeToAuthState: (listener) => backend.onAuthStateChanged(listener),
    loadUserProfile,
  };
}
