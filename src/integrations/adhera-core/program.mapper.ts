/**
 * Zod validation + tolerant mapping for Client Programs API → frontend DTOs.
 *
 * Pipeline: raw → Zod list shape → Zod per item (safeParse) → map.
 * Unknown fields are ignored (Zod default strip). Invalid items are skipped.
 */

import { z } from "zod";
import type { ProgramOption } from "@domain/adhera-core.ts";
import { AppError } from "@shared/utils/errors.ts";
import type { Logger } from "@shared/utils/logger.ts";

/**
 * Required fields only. Extra properties are stripped, not rejected.
 * Name: prefer program_name / name / title until client docs finalize.
 */
const externalProgramItemSchema = z
  .object({
    id: z.coerce.number().int().positive(),
    program_name: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).optional(),
  })
  .transform((item, ctx) => {
    const displayName = item.program_name ?? item.name ?? item.title;
    if (!displayName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Missing program_name, name, or title",
      });
      return z.NEVER;
    }
    return { id: item.id, name: displayName };
  });

const externalProgramListSchema = z.array(z.unknown());

/**
 * Validates and maps external programs payload.
 * Empty array → empty list (client may have no programs).
 * Non-empty array with zero valid items → integration error.
 * Non-array → integration error.
 */
export function mapClientProgramsResponse(
  raw: unknown,
  logger: Logger,
): ProgramOption[] {
  const listResult = externalProgramListSchema.safeParse(raw);
  if (!listResult.success) {
    throw new AppError(
      "External programs API returned an invalid response shape (expected an array)",
      { statusCode: 502, code: "INTERNAL_ERROR" },
    );
  }

  if (listResult.data.length === 0) {
    return [];
  }

  const programs: ProgramOption[] = [];

  for (const [index, item] of listResult.data.entries()) {
    const parsed = externalProgramItemSchema.safeParse(item);
    if (!parsed.success) {
      logger.warn("Skipping invalid external program record", {
        index,
        issues: parsed.error.issues.map((issue) => issue.message),
      });
      continue;
    }
    programs.push(parsed.data);
  }

  if (programs.length === 0) {
    throw new AppError(
      "External programs API returned no valid program records",
      { statusCode: 502, code: "INTERNAL_ERROR" },
    );
  }

  return programs;
}
