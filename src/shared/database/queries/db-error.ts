/**
 * Shared Postgres / Supabase error helpers for query modules.
 */

import { AppError, ConflictError } from "@shared/utils/errors.ts";

export function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === "23505";
}

export function isNotFoundViolation(error: { code?: string }): boolean {
  return error.code === "P0002";
}

export interface RaiseDbErrorOptions {
  /** When set, unique violations throw ConflictError with this message. */
  conflictMessage?: string;
}

export function raiseDbError(
  context: string,
  error: { message: string; code?: string },
  options?: RaiseDbErrorOptions,
): never {
  if (isUniqueViolation(error) && options?.conflictMessage) {
    throw new ConflictError(options.conflictMessage);
  }

  throw new AppError("An internal error occurred", {
    statusCode: 500,
    code: "INTERNAL_ERROR",
    cause: { context, dbCode: error.code, dbMessage: error.message },
  });
}

export function raiseRpcError(
  context: string,
  error: { message: string; code?: string },
  conflictMessages: Record<string, string>,
): never {
  if (isUniqueViolation(error)) {
    for (const fragment of Object.keys(conflictMessages)) {
      if (error.message.includes(fragment)) {
        throw new ConflictError(conflictMessages[fragment]!);
      }
    }
  }

  raiseDbError(context, error);
}
