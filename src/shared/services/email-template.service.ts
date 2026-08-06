/**
 * Email template admin service — CRUD and default resolution for invitation sends.
 */

import {
  clearDefaultEmailTemplate,
  countEmailTemplatesByType,
  deleteEmailTemplateRow,
  getDefaultEmailTemplateRow,
  getEmailTemplateByUuid,
  insertEmailTemplateRow,
  listEmailTemplateRows,
  updateEmailTemplateRow,
} from "@shared/database/queries/email-template.query.ts";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "@shared/utils/errors.ts";
import { assertInvitationEmailHtmlBodyValid } from "@shared/utils/email-template-validation.ts";
import type {
  CreateEmailTemplateInput,
  CreateEmailTemplateResponse,
  DeleteEmailTemplateResponse,
  EmailTemplateResource,
  EmailTemplateRow,
  EmailTemplateType,
  GetEmailTemplateResponse,
  InvitationEmailContentOverride,
  ListEmailTemplatesResponse,
  ResolvedInvitationEmailContent,
  UpdateEmailTemplateInput,
} from "@domain/email-template.ts";
import { sanitizeInvitationEmailHtmlBody } from "../utils/email-template-validation";

function toEmailTemplateResource(row: EmailTemplateRow): EmailTemplateResource {
  return {
    template_uuid: row.uuid,
    name: row.name,
    template_type: row.template_type,
    subject: row.subject,
    html_body: row.html_body,
    is_default: row.is_default,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listEmailTemplates(
  templateType?: EmailTemplateType,
): Promise<ListEmailTemplatesResponse> {
  const rows = await listEmailTemplateRows(templateType);
  return { templates: rows.map(toEmailTemplateResource) };
}

export async function getEmailTemplate(
  templateUuid: string,
): Promise<GetEmailTemplateResponse> {
  const row = await getEmailTemplateByUuid(templateUuid);
  if (!row) {
    throw new NotFoundError("Email template not found");
  }
  return { template: toEmailTemplateResource(row) };
}

export async function getDefaultEmailTemplate(
  templateType: EmailTemplateType,
): Promise<GetEmailTemplateResponse> {
  const row = await getDefaultEmailTemplateRow(templateType);
  if (!row) {
    throw new NotFoundError("Default email template not found");
  }
  return { template: toEmailTemplateResource(row) };
}

export async function createEmailTemplate(
  input: CreateEmailTemplateInput,
): Promise<CreateEmailTemplateResponse> {
  const isDefault = input.is_default ?? false;

  if (isDefault) {
    await clearDefaultEmailTemplate(input.template_type);
  }

  const sanitizedHtmlBody = sanitizeInvitationEmailHtmlBody(input.html_body);

  const row = await insertEmailTemplateRow({
    name: input.name,
    template_type: input.template_type,
    subject: input.subject,
    html_body: sanitizedHtmlBody,
    is_default: isDefault,
  });

  return { template: toEmailTemplateResource(row) };
}

export async function updateEmailTemplate(
  templateUuid: string,
  input: UpdateEmailTemplateInput,
): Promise<GetEmailTemplateResponse> {
  const existing = await getEmailTemplateByUuid(templateUuid);
  if (!existing) {
    throw new NotFoundError("Email template not found");
  }

  if (input.is_default === true) {
    await clearDefaultEmailTemplate(existing.template_type, existing.id);
  }

  if (input.is_default === false && existing.is_default) {
    throw new BadRequestError(
      "Set another template as default before unsetting this one",
    );
  }

  const patch: UpdateEmailTemplateInput = { ...input };

  if (input.html_body !== undefined) {
    const sanitizedHtmlBody = sanitizeInvitationEmailHtmlBody(input.html_body);
    assertInvitationEmailHtmlBodyValid(sanitizedHtmlBody, { fieldPath: "html_body" });
    patch.html_body = sanitizedHtmlBody;
  }

  const row = await updateEmailTemplateRow(existing.id, patch);
  return { template: toEmailTemplateResource(row) };
}

export async function deleteEmailTemplate(
  templateUuid: string,
): Promise<DeleteEmailTemplateResponse> {
  const existing = await getEmailTemplateByUuid(templateUuid);
  if (!existing) {
    throw new NotFoundError("Email template not found");
  }

  if (existing.is_default) {
    const count = await countEmailTemplatesByType(existing.template_type);
    if (count <= 1) {
      throw new ConflictError("Cannot delete the only invitation email template");
    }
    throw new ConflictError(
      "Cannot delete the default template; set another template as default first",
    );
  }

  await deleteEmailTemplateRow(existing.id);
  return { template_uuid: templateUuid, deleted: true };
}

/**
 * Merge DB default with optional per-send overrides.
 * Overrides are never persisted to email_templates.
 */
export async function resolveInvitationEmailContent(
  override?: InvitationEmailContentOverride,
): Promise<ResolvedInvitationEmailContent> {
  const emailOverride = override?.email_override;
  const defaultTemplate = await getDefaultEmailTemplateRow("invitation");

  if (!defaultTemplate && !emailOverride?.subject && !emailOverride?.html_body) {
    throw new NotFoundError("Default invitation email template not found");
  }

  const subject = emailOverride?.subject ?? defaultTemplate?.subject;
  const htmlBody = emailOverride?.html_body ?? defaultTemplate?.html_body;

  if (!subject || !htmlBody) {
    throw new BadRequestError(
      "Invitation email requires both subject and HTML body from default template or overrides",
    );
  }

  const sanitizedHtmlBody = sanitizeInvitationEmailHtmlBody(htmlBody);
  
  assertInvitationEmailHtmlBodyValid(sanitizedHtmlBody, {
    fieldPath: emailOverride?.html_body !== undefined
      ? "email_override.html_body"
      : "html_body",
  });

  return {
    subject,
    html_body: sanitizedHtmlBody,
    used_default_subject: emailOverride?.subject === undefined,
    used_default_html_body: emailOverride?.html_body === undefined,
    default_template_uuid: defaultTemplate?.uuid ?? null,
  };
}
