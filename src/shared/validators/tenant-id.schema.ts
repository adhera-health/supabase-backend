/**
 * Accept UUID tenant ids or positive integer ids from external Client/Program APIs.
 */

import { z } from "zod";
import type { TenantIdInput } from "@domain/tenant-id.ts";

const uuidSchema = z.string().uuid("Must be a valid UUID");

const positiveIntSchema = z
  .number()
  .int("Must be a positive integer")
  .positive("Must be a positive integer");

const positiveIntStringSchema = z
  .string()
  .regex(/^\d+$/, "Must be a UUID or positive integer")
  .transform((value) => Number.parseInt(value, 10))
  .pipe(positiveIntSchema);

/** POST body: UUID string, JSON number, or numeric string. */
export const flexibleTenantIdSchema = z.union([
  uuidSchema,
  positiveIntSchema,
  positiveIntStringSchema,
]) satisfies z.ZodType<TenantIdInput>;

/**
 * Stored tenant id as a string — the Adhera Core integer id (e.g. "36").
 * Used where ids arrive already-stringified (patient app echoing them back,
 * admin consent-document management).
 */
export const tenantIdStringSchema = z
  .string()
  .regex(/^\d+$/, "Must be a positive integer id");
