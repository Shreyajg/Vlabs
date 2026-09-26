// Pure module: turns Firebase / Firestore errors into friendly, code-stable errors.

export type AuthErrorCode =
  | "validation"
  | "invalid-credentials"
  | "email-in-use"
  | "weak-password"
  | "invalid-email"
  | "network"
  | "too-many-requests"
  | "user-disabled"
  | "profile-setup-failed"
  | "profile-update-failed"
  | "not-signed-in"
  | "unknown";

export const AUTH_ERROR_MESSAGES: Readonly<Record<AuthErrorCode, string>> = {
  validation: "Please check the highlighted fields.",
  "invalid-credentials": "Email or password is incorrect.",
  "email-in-use": "An account already exists with this email.",
  "weak-password": "Please choose a stronger password.",
  "invalid-email": "Please enter a valid email address.",
  network: "Network error. Please check your connection and try again.",
  "too-many-requests": "Too many attempts. Please wait and try again.",
  "user-disabled": "This account has been disabled.",
  "profile-setup-failed":
    "Your account was created, but we could not finish setting it up. Please sign in to continue.",
  "profile-update-failed": "We could not save your profile. Please try again.",
  "not-signed-in": "Please sign in again to continue.",
  unknown: "Something went wrong. Please try again.",
};

/** Codes from Firebase Auth (with the "auth/" prefix removed) and Firestore, grouped by our code. */
const FIREBASE_CODE_MAP: Readonly<Record<string, AuthErrorCode>> = {
  // A wrong password and an unknown account give the same answer, so accounts cannot be probed.
  "invalid-credential": "invalid-credentials",
  "invalid-login-credentials": "invalid-credentials",
  "wrong-password": "invalid-credentials",
  "user-not-found": "invalid-credentials",
  "email-already-in-use": "email-in-use",
  "weak-password": "weak-password",
  "invalid-email": "invalid-email",
  "network-request-failed": "network",
  unavailable: "network",
  "too-many-requests": "too-many-requests",
  "user-disabled": "user-disabled",
};

/** What the UI shows and branches on. Never carries a raw Firebase message. */
export class AuthError extends Error {
  readonly code: AuthErrorCode;
  /** Present for validation errors: a message per field. */
  readonly fieldErrors?: Readonly<Record<string, string>>;
  /** The underlying error, for development logging only. */
  readonly originalError?: unknown;

  constructor(
    code: AuthErrorCode,
    options: { fieldErrors?: Readonly<Record<string, string>>; originalError?: unknown } = {},
  ) {
    super(AUTH_ERROR_MESSAGES[code]);
    this.name = "AuthError";
    this.code = code;
    this.fieldErrors = options.fieldErrors;
    this.originalError = options.originalError;
  }
}

function firebaseCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;

  const { code } = error;

  return typeof code === "string" ? code.replace(/^auth\//, "") : undefined;
}

/** Maps anything thrown by Firebase to an AuthError. AuthErrors pass through untouched. */
export function mapAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) return error;

  const code = firebaseCode(error);
  const mapped = code !== undefined ? FIREBASE_CODE_MAP[code] : undefined;

  return new AuthError(mapped ?? "unknown", { originalError: error });
}
