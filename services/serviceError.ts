/** Wraps a Firestore failure with the operation that caused it, keeping the original error. */
export class ServiceError extends Error {
  /** Firebase error code such as "permission-denied", or "unknown". */
  readonly code: string;
  readonly operation: string;
  readonly originalError: unknown;

  constructor(operation: string, originalError: unknown) {
    const code =
      typeof originalError === "object" &&
      originalError !== null &&
      "code" in originalError &&
      typeof originalError.code === "string"
        ? originalError.code
        : "unknown";

    const detail = originalError instanceof Error ? originalError.message : String(originalError);

    super(`Failed to ${operation}: ${detail}`);
    this.name = "ServiceError";
    this.code = code;
    this.operation = operation;
    this.originalError = originalError;
  }
}
