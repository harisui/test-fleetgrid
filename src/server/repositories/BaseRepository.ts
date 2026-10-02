import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/server/errors/AppError";
import type { Database } from "@/types/database.types";

export type TypedSupabaseClient = SupabaseClient<Database>;

interface QueryError {
  code?: string;
  message: string;
}

interface QueryResult<T> {
  data: T | null;
  error: QueryError | null;
}

/**
 * Base class for repositories. Repositories are the only place that talks to Supabase.
 * Database errors are translated to AppError here so raw messages never leave this layer.
 */
export abstract class BaseRepository {
  constructor(protected readonly supabase: TypedSupabaseClient) {}

  /** Returns the data of a query that must produce a value, or throws an AppError. */
  protected unwrap<T>(result: QueryResult<T>): T {
    if (result.error) throw this.toAppError(result.error);
    if (result.data === null) throw AppError.notFound();
    return result.data;
  }

  /** Returns the data of a query that may legitimately find nothing. */
  protected unwrapMaybe<T>(result: QueryResult<T>): T | null {
    if (result.error) throw this.toAppError(result.error);
    return result.data;
  }

  protected toAppError(error: QueryError): AppError {
    switch (error.code) {
      // PostgREST: no rows for .single()
      case "PGRST116":
        return new AppError("NOT_FOUND", "Not found", { cause: error });
      // unique_violation
      case "23505":
        return new AppError("CONFLICT", "This already exists", { cause: error });
      // insufficient_privilege (RLS, grants, protection triggers)
      case "42501":
        return new AppError("FORBIDDEN", "You do not have access to this", { cause: error });
      // check_violation, not_null_violation, foreign_key_violation, invalid_text_representation
      case "23514":
      case "23502":
      case "23503":
      case "22P02":
        return new AppError("VALIDATION", "Some of the information is not valid", { cause: error });
      default:
        return AppError.internal(error);
    }
  }
}
