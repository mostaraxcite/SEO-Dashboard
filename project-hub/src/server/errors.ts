export type ErrorCode = "unauthenticated" | "forbidden" | "not_found" | "invalid" | "conflict" | "rate_limited" | "unavailable";

/** Domain error. `key` is an i18n key under `errors.` shown to the user. */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public key: string = code,
    public details?: Record<string, unknown>,
  ) {
    super(`${code}:${key}`);
  }
}

export const notFound = () => new AppError("not_found");
export const forbidden = (key = "forbidden") => new AppError("forbidden", key);
export const invalid = (key = "invalid", details?: Record<string, unknown>) => new AppError("invalid", key, details);
