/**
 * Invitation validators — Feature 1: Send invitation
 * Spec: onboarding-doc §6.1
 */

import { z } from "zod";
import { parseSchema } from "@shared/validators/parse-schema.ts";
import type {
  CreateInvitationInput,
  DropOutInvitationInput,
  DropOutInvitationParams,
  GetInvitationAttentionReasonsParams,
  ResendInvitationParams,
  ValidateTokenQuery,
} from "@domain/invitation.ts";
import { DROP_OUT_REASON_TYPES, INVITATION_STATUSES } from "@domain/invitation.ts";
import { optionalInvitationEmailOverrideSchema } from "@shared/validators/email-template.schema.ts";
import { flexibleTenantIdSchema } from "@shared/validators/tenant-id.schema.ts";

const uuidSchema = z.string().uuid("Must be a valid UUID");

const emailSchema = z
  .string()
  .trim()
  .email("Must be a valid email address")
  .transform((value: string) => value.toLowerCase());

/** POST /api/v1/invitations */
export const createInvitationSchema = z.object({
  email: emailSchema,
  program_id: flexibleTenantIdSchema,
  client_id: flexibleTenantIdSchema,
  email_override: optionalInvitationEmailOverrideSchema,
}) satisfies z.ZodType<CreateInvitationInput>;

export type CreateInvitationPayload = z.infer<typeof createInvitationSchema>;

/** GET /invitations/clients/:clientId/programs */
export const listClientProgramsParamsSchema = z.object({
  clientId: z.coerce.number().int().positive("clientId must be a positive integer"),
});

export type ListClientProgramsParamsPayload = z.infer<
  typeof listClientProgramsParamsSchema
>;

/** GET /api/v1/invitation/validate-token?token=... */
export const validateTokenQuerySchema = z.object({
  token: z.string().min(32, "Token is required"),
}) satisfies z.ZodType<ValidateTokenQuery>;

export type ValidateTokenQueryPayload = z.infer<typeof validateTokenQuerySchema>;

/** POST /api/v1/invitations/{invitation_id}/resend */
export const resendInvitationParamsSchema = z.object({
  invitation_id: uuidSchema,
}) satisfies z.ZodType<ResendInvitationParams>;

export type ResendInvitationParamsPayload = z.infer<
  typeof resendInvitationParamsSchema
>;

/** POST /api/v1/invitations/{invitation_id}/resend — optional body */
export const resendInvitationBodySchema = z
  .object({
    email_override: optionalInvitationEmailOverrideSchema,
  })
  .optional();

export type ResendInvitationBodyPayload = z.infer<typeof resendInvitationBodySchema>;

function emptyToUndefined(value: string | undefined): string | undefined {
  if (value === undefined || value === "") return undefined;
  return value;
}

/** GET /api/v1/invitations */
export const listInvitationsQuerySchema = z
  .object({
    status: z.enum(INVITATION_STATUSES).optional(),
    program_id: uuidSchema.optional(),
    client_id: uuidSchema.optional(),
    date_from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
      .optional(),
    date_to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
      .optional(),
    search: z.string().trim().min(1).max(255).optional(),
    page: z.coerce.number().int().min(1).default(1),
    per_page: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (data) => !data.date_from || !data.date_to || data.date_from <= data.date_to,
    {
      message: "date_from must be on or before date_to",
      path: ["date_to"],
    },
  );

export type ListInvitationsQueryPayload = z.output<
  typeof listInvitationsQuerySchema
>;

/** POST /api/v1/invitations/{invitation_id}/drop-out */
export const dropOutInvitationParamsSchema = z.object({
  invitation_id: uuidSchema,
}) satisfies z.ZodType<DropOutInvitationParams>;

export type DropOutInvitationParamsPayload = z.infer<
  typeof dropOutInvitationParamsSchema
>;

export const dropOutInvitationBodySchema = z
  .object({
    reason_type: z.enum(DROP_OUT_REASON_TYPES),
    free_text: z.string().trim().min(1).max(2000).optional(),
  })
  .refine(
    (data) => data.reason_type !== "other" || Boolean(data.free_text?.trim()),
    {
      message: "free_text is required when reason_type is other",
      path: ["free_text"],
    },
  ) satisfies z.ZodType<DropOutInvitationInput>;

export type DropOutInvitationBodyPayload = z.infer<
  typeof dropOutInvitationBodySchema
>;

/** GET /api/v1/invitations/{invitation_id}/attention-reasons */
export const getInvitationAttentionReasonsParamsSchema = z.object({
  invitation_id: uuidSchema,
}) satisfies z.ZodType<GetInvitationAttentionReasonsParams>;

export type GetInvitationAttentionReasonsParamsPayload = z.infer<
  typeof getInvitationAttentionReasonsParamsSchema
>;

export { emptyToUndefined, parseSchema };
