/**
 * Zod validation + tolerant mapping for Active Clients API → frontend DTOs.
 *
 * Pipeline: raw → Zod list shape → Zod per item (safeParse) → map.
 * Unknown fields are ignored (Zod default strip). Invalid items are skipped.
 */

import { z } from "zod";
import type { ClientOption } from "@domain/adhera-core.ts";
import { AppError } from "@shared/utils/errors.ts";
import type { Logger } from "@shared/utils/logger.ts";

/**
 * Required fields only. Extra properties are stripped, not rejected.
 * Name: prefer hospital_name, fall back to name / title until client docs finalize.
 */
const externalClientItemSchema = z
  .object({
    id: z.coerce.number().int().positive(),
    hospital_name: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).optional(),
  })
  .transform((item, ctx) => {
    const displayName = item.hospital_name ?? item.name ?? item.title;
    if (!displayName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Missing hospital_name, name, or title",
      });
      return z.NEVER;
    }
    return { id: item.id, name: displayName };
  });

const externalClientListSchema = z.array(z.unknown());

/**
 * Validates and maps external clients payload.
 * Fails only when: not an array, or zero items map successfully.
 */
export function mapActiveClientsResponse(
  raw: unknown,
  logger: Logger,
): ClientOption[] {
  const listResult = externalClientListSchema.safeParse(raw);
  if (!listResult.success) {
    throw new AppError(
      "External clients API returned an invalid response shape (expected an array)",
      { statusCode: 502, code: "INTERNAL_ERROR" },
    );
  }

  const clients: ClientOption[] = [];

  for (const [index, item] of listResult.data.entries()) {
    const parsed = externalClientItemSchema.safeParse(item);
    if (!parsed.success) {
      logger.warn("Skipping invalid external client record", {
        index,
        issues: parsed.error.issues.map((issue) => issue.message),
      });
      continue;
    }
    clients.push(parsed.data);
  }

  if (clients.length === 0) {
    throw new AppError(
      "External clients API returned no valid client records",
      { statusCode: 502, code: "INTERNAL_ERROR" },
    );
  }

  return clients;
}
