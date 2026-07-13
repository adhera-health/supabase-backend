/**
 * Shared Zod parse helper for all API validators.
 */

import { z } from "zod";
import { ValidationError } from "@shared/utils/errors.ts";

function formatZodError(error: z.ZodError): Record<string, string[]> {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

/** Parse and validate; throws ValidationError on failure. */
export function parseSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  data: unknown,
  message = "Validation failed",
): z.output<TSchema> {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new ValidationError(message, {
      field_errors: formatZodError(result.error),
    });
  }

  return result.data;
}
