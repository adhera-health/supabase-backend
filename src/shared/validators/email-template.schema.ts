/**
 * Email template validators — admin CRUD + invitation send-time overrides.
 */

import { z } from "zod";
import { EMAIL_TEMPLATE_TYPES } from "@domain/email-template.ts";
import type {
  CreateEmailTemplateInput,
  EmailTemplateType,
  InvitationEmailOverride,
  UpdateEmailTemplateInput,
} from "@domain/email-template.ts";
import { parseSchema } from "@shared/validators/parse-schema.ts";
import {
  collectUnsafeEmailHtmlIssues,
  findMissingRequiredInvitationPlaceholders,
} from "@shared/utils/email-template-validation.ts";

const uuidSchema = z.string().uuid("Must be a valid UUID");

const templateTypeSchema = z.enum(
  EMAIL_TEMPLATE_TYPES as unknown as [EmailTemplateType, ...EmailTemplateType[]],
);

function addHtmlBodyIssues(
  value: string,
  ctx: z.RefinementCtx,
  fieldPath: (string | number)[] = ["html_body"],
): void {
  for (const message of collectUnsafeEmailHtmlIssues(value)) {
    ctx.addIssue({ code: "custom", message, path: fieldPath });
  }

  const missing = findMissingRequiredInvitationPlaceholders(value);
  if (missing.length > 0) {
    ctx.addIssue({
      code: "custom",
      message: `HTML must include required placeholders: ${missing.join(", ")}`,
      path: fieldPath,
    });
  }
}

export const subjectSchema = z
  .string()
  .trim()
  .min(1, "Subject is required")
  .max(200, "Subject must be at most 200 characters");

/** Stored invitation template HTML — safe markup + required placeholders. */
export const invitationHtmlBodySchema = z
  .string()
  .trim()
  .min(1, "HTML body is required")
  .max(100_000, "HTML body must be at most 100,000 characters")
  .superRefine((value, ctx) => addHtmlBodyIssues(value, ctx));

const htmlBodySchema = invitationHtmlBodySchema;

/** POST /email-templates */
export const createEmailTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  template_type: templateTypeSchema,
  subject: subjectSchema,
  html_body: htmlBodySchema,
  is_default: z.boolean().optional(),
}) satisfies z.ZodType<CreateEmailTemplateInput>;

export type CreateEmailTemplatePayload = z.infer<typeof createEmailTemplateSchema>;

/** PATCH /email-templates/:template_uuid */
export const updateEmailTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    subject: subjectSchema.optional(),
    html_body: htmlBodySchema.optional(),
    is_default: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.subject !== undefined ||
      data.html_body !== undefined ||
      data.is_default !== undefined,
    { message: "At least one field must be provided" },
  ) satisfies z.ZodType<UpdateEmailTemplateInput>;

export type UpdateEmailTemplatePayload = z.infer<typeof updateEmailTemplateSchema>;

export const emailTemplateUuidParamsSchema = z.object({
  template_uuid: uuidSchema,
});

export type EmailTemplateUuidParamsPayload = z.infer<
  typeof emailTemplateUuidParamsSchema
>;

export const listEmailTemplatesQuerySchema = z.object({
  template_type: templateTypeSchema.optional(),
});

export type ListEmailTemplatesQueryPayload = z.infer<
  typeof listEmailTemplatesQuerySchema
>;

export const getDefaultEmailTemplateQuerySchema = z.object({
  template_type: templateTypeSchema.default("invitation"),
});

export type GetDefaultEmailTemplateQueryPayload = z.infer<
  typeof getDefaultEmailTemplateQuerySchema
>;

/** Per-send invitation email override fields (nested under email_override). */
export const invitationEmailOverrideSchema = z
  .object({
    subject: subjectSchema.optional(),
    html_body: invitationHtmlBodySchema.optional(),
  })
  .refine(
    (data) => data.subject !== undefined || data.html_body !== undefined,
    { message: "email_override must include subject and/or html_body" },
  ) satisfies z.ZodType<InvitationEmailOverride>;

export const optionalInvitationEmailOverrideSchema = invitationEmailOverrideSchema
  .optional();

export { parseSchema };
