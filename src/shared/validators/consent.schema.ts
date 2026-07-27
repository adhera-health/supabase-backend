/**
 * Consent validators — latest, accept, withdraw
 * Spec: onboarding-doc §6.2
 */

import { z } from "zod";
import type {
  AcceptConsentInput,
  WithdrawConsentInput,
} from "@domain/consent.ts";
import type { LatestConsentQuery as GetLatestConsentQuery } from "@domain/client-program-query.ts";
import { parseSchema } from "@shared/validators/parse-schema.ts";
import { tenantIdStringSchema } from "@shared/validators/tenant-id.schema.ts";

const documentHashSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "document_hash must be a 64-character SHA-256 hex string");

const literalTrue = (field: string) =>
  z.literal(true, {
    errorMap: () => ({ message: `${field} must be true` }),
  });

/** GET /api/v1/consents/latest */
export const getLatestConsentQuerySchema = z.object({
  program_id: tenantIdStringSchema,
  client_id: tenantIdStringSchema,
}) satisfies z.ZodType<GetLatestConsentQuery>;

export type GetLatestConsentQueryPayload = z.infer<
  typeof getLatestConsentQuerySchema
>;

/** POST /api/v1/consents/accept */
export const acceptConsentSchema = z.object({
  consent_document_id: z.coerce.number().int().positive(),
  document_hash: documentHashSchema,
  read_and_understood_accepted: literalTrue("read_and_understood_accepted"),
  participation_and_data_processing_accepted: literalTrue(
    "participation_and_data_processing_accepted",
  ),
}) satisfies z.ZodType<AcceptConsentInput>;

export type AcceptConsentPayload = z.infer<typeof acceptConsentSchema>;

/** POST /api/v1/consents/withdraw */
export const withdrawConsentSchema = z.object({
  consent_document_id: z.coerce.number().int().positive(),
  reason: z.string().trim().max(2000).optional(),
}) satisfies z.ZodType<WithdrawConsentInput>;

export type WithdrawConsentPayload = z.infer<typeof withdrawConsentSchema>;

export { parseSchema };
