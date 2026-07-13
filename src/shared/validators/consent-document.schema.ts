/**
 * Consent document validators — admin upload + activate
 */

import type { UploadConsentDocumentInput } from "@domain/consent.ts";
import { z } from "zod";
import { parseSchema } from "@shared/validators/parse-schema.ts";

const uuidSchema = z.string().uuid("Must be a valid UUID");
const documentHashSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "document_hash must be a 64-character SHA-256 hex string");

const rightsInfoSchema = z.object({
  access: z.string().trim().min(1, "rights_info.access is required"),
  rectification: z.string().trim().min(1, "rights_info.rectification is required"),
  erasure: z.string().trim().min(1, "rights_info.erasure is required"),
});

const summaryBulletsSchema = z
  .array(z.string().trim().min(1, "Summary bullet cannot be empty"))
  .min(3, "summary_bullets must contain at least 3 items")
  .max(5, "summary_bullets must contain at most 5 items");

/** POST /consent-documents/upload — JSON metadata (file uploaded separately as base64) */
export const uploadConsentDocumentSchema = z.object({
  client_id: uuidSchema,
  program_id: uuidSchema,
  version: z.string().trim().min(1, "version is required").max(50),
  privacy_notice_url: z
    .string()
    .trim()
    .url("privacy_notice_url must be a valid URL")
    .refine((value) => value.startsWith("https://"), {
      message: "privacy_notice_url must use HTTPS",
    }),
  data_usage_summary: z.string().trim().min(1, "data_usage_summary is required").max(5000),
  summary_bullets: summaryBulletsSchema,
  storage_duration: z.string().trim().max(500).optional(),
  rights_info: rightsInfoSchema,
  effective_from: z.string().datetime({ offset: true }).optional(),
  /** Base64-encoded PDF; max ~10MB decoded */
  document_pdf_base64: z
    .string()
    .trim()
    .min(1, "document_pdf_base64 is required")
    .max(14_000_000, "document_pdf_base64 exceeds maximum allowed size"),
}) satisfies z.ZodType<UploadConsentDocumentInput>;

export type UploadConsentDocumentPayload = z.infer<typeof uploadConsentDocumentSchema>;

export const activateConsentDocumentParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type ActivateConsentDocumentParamsPayload = z.infer<
  typeof activateConsentDocumentParamsSchema
>;

export { parseSchema };
