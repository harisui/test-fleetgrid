import type { ZodError, ZodType } from "zod";

export const APP_ERROR_CODES = [
  "NOT_FOUND",
  "FORBIDDEN",
  "VALIDATION",
  "CONFLICT",
  "RATE_LIMITED",
  "INTERNAL",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export type FieldErrors = Record<string, string>;

/** The only error type services throw. Messages are safe to show to users. */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly fieldErrors?: FieldErrors;

  constructor(
    code: AppErrorCode,
    message: string,
    options: { fieldErrors?: FieldErrors; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.fieldErrors = options.fieldErrors;
  }

  static notFound(message = "Not found"): AppError {
    return new AppError("NOT_FOUND", message);
  }

  static forbidden(message = "You do not have access to this"): AppError {
    return new AppError("FORBIDDEN", message);
  }

  static validation(message = "Please check the highlighted fields", fieldErrors?: FieldErrors) {
    return new AppError("VALIDATION", message, { fieldErrors });
  }

  static conflict(message = "This already exists"): AppError {
    return new AppError("CONFLICT", message);
  }

  static rateLimited(message = "Too many attempts. Please wait and try again."): AppError {
    return new AppError("RATE_LIMITED", message);
  }

  static internal(cause?: unknown): AppError {
    return new AppError("INTERNAL", INTERNAL_MESSAGE, { cause });
  }

  /** One message per field, keyed by the dotted field path. The first issue per field wins. */
  static fromZod(error: ZodError): AppError {
    const fieldErrors: FieldErrors = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "form";
      fieldErrors[key] ??= issue.message;
    }
    return AppError.validation(undefined, fieldErrors);
  }
}

/**
 * Validates untrusted input against an object schema and throws a VALIDATION AppError with
 * per-field messages. Anything that is not an object is treated as an empty form, so the
 * user sees "Enter your name" instead of a parser message.
 */
export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const candidate = typeof input === "object" && input !== null ? input : {};
  const result = schema.safeParse(candidate);
  if (!result.success) throw AppError.fromZod(result.error);
  return result.data;
}

export const INTERNAL_MESSAGE = "Something went wrong. Please try again.";

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: AppErrorCode; message: string; fieldErrors?: FieldErrors } };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail<T = never>(error: AppError): Result<T> {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
    },
  };
}

/**
 * Converts anything thrown into a Result. Unknown errors become INTERNAL with a generic
 * message, so raw database or library errors never reach the UI.
 */
export function toResult<T = never>(
  error: unknown,
  log: (error: unknown) => void = defaultLog,
): Result<T> {
  if (error instanceof AppError) {
    if (error.code === "INTERNAL") log(error.cause ?? error);
    return fail(error);
  }
  log(error);
  return fail(AppError.internal(error));
}

function defaultLog(error: unknown): void {
  console.error("[FleetGrid] Unexpected error:", error);
}

/** Runs a service call and wraps the outcome in a Result. Used by server actions. */
export async function runAction<T>(
  fn: () => Promise<T>,
  log?: (error: unknown) => void,
): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (error) {
    // Next.js uses thrown errors for redirect() and notFound(); let those through.
    if (isNextControlFlowError(error)) throw error;
    return toResult(error, log);
  }
}

function isNextControlFlowError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"))
  );
}
