export type ErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid"
  | "too_large"
  | "unsupported"
  | "integration";

const STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invalid: 422,
  too_large: 413,
  unsupported: 415,
  integration: 502,
};

/** Thrown by services; the route wrapper turns it into a JSON response `{ error: { code, message, details } }`. */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
  get status() {
    return STATUS[this.code];
  }
}

export const notFound = (what = "Record") => new AppError("not_found", `${what} not found`);
/** `current` is the server's latest copy so the client can show both versions. */
export const conflict = (current: unknown) =>
  new AppError("conflict", "Someone else changed this since you opened it", { current });
