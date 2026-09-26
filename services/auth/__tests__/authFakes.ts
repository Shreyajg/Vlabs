import type { AuthUser, NewUserProfile, ProfileFieldsUpdate, UserProfile } from "../../../types/User";
import type { AuthBackend, ProfileStore } from "../createAuthService";

/** An error shaped like the ones Firebase throws. */
export function firebaseError(code: string, message = "Firebase: Error (" + code + ")."): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

export interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

export function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

/** Lets pending promise callbacks run. */
export const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export interface FakeBackendOptions {
  accounts?: Record<string, string>;
  createError?: unknown;
  signInError?: unknown;
  signOutError?: unknown;
  updateNameError?: unknown;
}

/** A small in-memory stand-in for Firebase Authentication. */
export function fakeBackend(options: FakeBackendOptions = {}) {
  const accounts = new Map<string, { uid: string; password: string }>();
  const listeners = new Set<(user: AuthUser | null) => void>();
  const calls: string[] = [];
  let current: AuthUser | null = null;
  let counter = 0;

  for (const [email, password] of Object.entries(options.accounts ?? {})) {
    counter += 1;
    accounts.set(email, { uid: `uid-${counter}`, password });
  }

  const emit = () => {
    const snapshot = current;

    // Real Firebase notifies listeners asynchronously.
    setTimeout(() => listeners.forEach((listener) => listener(snapshot)), 0);
  };

  const backend: AuthBackend = {
    async createUser(email, password) {
      calls.push(`createUser:${email}`);

      if (options.createError) throw options.createError;
      if (accounts.has(email)) throw firebaseError("auth/email-already-in-use");
      if (password.length < 6) throw firebaseError("auth/weak-password");

      counter += 1;
      accounts.set(email, { uid: `uid-${counter}`, password });
      current = { uid: `uid-${counter}`, email, displayName: null };
      emit();

      return current;
    },

    async signIn(email, password) {
      calls.push(`signIn:${email}`);

      if (options.signInError) throw options.signInError;

      const account = accounts.get(email);

      if (!account || account.password !== password) throw firebaseError("auth/invalid-credential");

      current = { uid: account.uid, email, displayName: null };
      emit();

      return current;
    },

    async signOut() {
      calls.push("signOut");

      if (options.signOutError) throw options.signOutError;

      current = null;
      emit();
    },

    async updateDisplayName(name) {
      calls.push(`updateDisplayName:${name}`);

      if (options.updateNameError) throw options.updateNameError;

      if (current) current = { ...current, displayName: name };
    },

    getCurrentUser: () => current,

    onAuthStateChanged(listener) {
      listeners.add(listener);
      // Firebase reports the current state to a new listener.
      setTimeout(() => listener(current), 0);

      return () => {
        listeners.delete(listener);
      };
    },
  };

  return { backend, calls, listenerCount: () => listeners.size };
}

export interface FakeStoreOptions {
  profiles?: UserProfile[];
  createError?: unknown;
  getError?: unknown;
  createIfAbsentError?: unknown;
  updateError?: unknown;
  /** When set, create() waits for it, simulating a slow write. */
  createGate?: Deferred;
}

/** An in-memory stand-in for users/{uid}. */
export function fakeStore(options: FakeStoreOptions = {}) {
  const profiles = new Map<string, UserProfile>();
  const created: NewUserProfile[] = [];
  const createdIfAbsent: NewUserProfile[] = [];
  const updates: { uid: string; fields: ProfileFieldsUpdate }[] = [];
  let reads = 0;

  for (const profile of options.profiles ?? []) profiles.set(profile.uid, profile);

  const toProfile = (profile: NewUserProfile): UserProfile => ({ ...profile, createdAt: null });

  const store: ProfileStore = {
    async get(uid) {
      reads += 1;

      if (options.getError) throw options.getError;

      return profiles.get(uid) ?? null;
    },

    async create(profile) {
      created.push(profile);

      if (options.createGate) await options.createGate.promise;
      if (options.createError) throw options.createError;

      const stored = toProfile(profile);

      profiles.set(profile.uid, stored);

      return stored;
    },

    async createIfAbsent(profile) {
      createdIfAbsent.push(profile);

      if (options.createIfAbsentError) throw options.createIfAbsentError;

      const existing = profiles.get(profile.uid);

      if (existing) return existing;

      const stored = toProfile(profile);

      profiles.set(profile.uid, stored);

      return stored;
    },

    // Like Firestore's updateDoc: changes only the named fields and never creates a document.
    async update(uid, fields) {
      updates.push({ uid, fields });

      if (options.updateError) throw options.updateError;

      const existing = profiles.get(uid);

      if (!existing) throw firebaseError("not-found");

      profiles.set(uid, { ...existing, ...fields });
    },
  };

  return { store, profiles, created, createdIfAbsent, updates, reads: () => reads };
}

export function profileOf(uid: string, role: UserProfile["role"] = "student"): UserProfile {
  return {
    uid,
    name: `Name ${uid}`,
    email: `${uid}@example.com`,
    role,
    university: "",
    program: "",
    branch: "",
    createdAt: null,
  };
}
