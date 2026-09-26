import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile as updateFirebaseAuthProfile,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../firebase/config";
import type { AuthUser, NewUserProfile, UserProfile } from "../types/User";
import {
  createAuthService,
  type AuthBackend,
  type ProfileStore,
} from "./auth/createAuthService";
import { parseUserProfile, profileToDocument } from "./auth/userProfile";

// The real Firebase Authentication + Firestore wiring for the tested logic in services/auth.
// It uses the single `auth` and `db` from firebase/config.ts; nothing is initialized twice.

function toAuthUser(user: User): AuthUser {
  return { uid: user.uid, email: user.email, displayName: user.displayName };
}

const backend: AuthBackend = {
  async createUser(email, password) {
    const credential = await createUserWithEmailAndPassword(auth, email, password);

    return toAuthUser(credential.user);
  },

  async signIn(email, password) {
    const credential = await signInWithEmailAndPassword(auth, email, password);

    return toAuthUser(credential.user);
  },

  signOut: () => firebaseSignOut(auth),

  async updateDisplayName(name) {
    if (auth.currentUser) await updateFirebaseAuthProfile(auth.currentUser, { displayName: name });
  },

  getCurrentUser: () => (auth.currentUser ? toAuthUser(auth.currentUser) : null),

  onAuthStateChanged: (listener) =>
    onAuthStateChanged(auth, (user) => listener(user ? toAuthUser(user) : null)),
};

const profileRef = (uid: string) => doc(db, "users", uid);

/** Fields written for a new profile: the profile itself plus a server-side creation time. */
function newProfileDocument(profile: NewUserProfile) {
  return { ...profileToDocument(profile), createdAt: serverTimestamp() };
}

function signedInFallback() {
  return {
    displayName: auth.currentUser?.displayName ?? null,
    email: auth.currentUser?.email ?? null,
  };
}

const store: ProfileStore = {
  async get(uid) {
    const snapshot = await getDoc(profileRef(uid));

    return snapshot.exists() ? parseUserProfile(uid, snapshot.data(), signedInFallback()) : null;
  },

  async create(profile) {
    await setDoc(profileRef(profile.uid), newProfileDocument(profile));

    // The server timestamp resolves on the server, so it is not known here.
    return { ...profile, createdAt: null };
  },

  async createIfAbsent(profile): Promise<UserProfile> {
    const reference = profileRef(profile.uid);

    return runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(reference);

      if (snapshot.exists()) {
        return parseUserProfile(profile.uid, snapshot.data(), signedInFallback());
      }

      transaction.set(reference, newProfileDocument(profile));

      return { ...profile, createdAt: null };
    });
  },

  async update(uid, fields) {
    // updateDoc changes only the fields listed here: a student's four, or a faculty member's three.
    // It leaves uid, email, role and createdAt alone, and fails instead of creating a document that
    // would have no role. The keys are spelled out so nothing else in `fields` can be written.
    const data =
      "department" in fields
        ? { name: fields.name, university: fields.university, department: fields.department }
        : {
            name: fields.name,
            university: fields.university,
            program: fields.program,
            branch: fields.branch,
          };

    await updateDoc(profileRef(uid), data);
  },
};

function log(message: string, error?: unknown): void {
  if (__DEV__) console.warn(`[auth] ${message}`, error);
}

export const authService = createAuthService(backend, store, log);

export const {
  signUp,
  signIn,
  signOut,
  updateProfile,
  getCurrentUser,
  getCurrentUserId,
  subscribeToAuthState,
  loadUserProfile,
} = authService;
