/**
 * Email template database queries — CRUD + default lookup.
 */

import { getServiceClient } from "@shared/database/client.ts";
import {
  isUniqueViolation,
  raiseDbError,
} from "@shared/database/queries/db-error.ts";
import type {
  EmailTemplateRow,
  EmailTemplateType,
} from "@domain/email-template.ts";

const EMAIL_TEMPLATE_COLUMNS =
  "id, uuid, name, template_type, subject, html_body, is_default, created_at, updated_at";

function toEmailTemplateRow(row: Record<string, unknown>): EmailTemplateRow {
  return {
    id: row.id as number,
    uuid: row.uuid as string,
    name: row.name as string,
    template_type: row.template_type as EmailTemplateType,
    subject: row.subject as string,
    html_body: row.html_body as string,
    is_default: row.is_default as boolean,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function raiseEmailTemplateDbError(
  context: string,
  error: { message: string; code?: string },
  conflictMessage?: string,
): never {
  return raiseDbError(context, error, { conflictMessage });
}

export async function listEmailTemplateRows(
  templateType?: EmailTemplateType,
): Promise<EmailTemplateRow[]> {
  const db = getServiceClient();
  let query = db
    .from("email_templates")
    .select(EMAIL_TEMPLATE_COLUMNS)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (templateType) {
    query = query.eq("template_type", templateType);
  }

  const { data, error } = await query;

  if (error) {
    raiseEmailTemplateDbError("Failed to list email templates", error);
  }

  return (data ?? []).map((row) =>
    toEmailTemplateRow(row as Record<string, unknown>)
  );
}

export async function getEmailTemplateByUuid(
  templateUuid: string,
): Promise<EmailTemplateRow | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("email_templates")
    .select(EMAIL_TEMPLATE_COLUMNS)
    .eq("uuid", templateUuid)
    .maybeSingle();

  if (error) {
    raiseEmailTemplateDbError("Failed to load email template", error);
  }
  if (!data) return null;

  return toEmailTemplateRow(data as Record<string, unknown>);
}

export async function getDefaultEmailTemplateRow(
  templateType: EmailTemplateType,
): Promise<EmailTemplateRow | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("email_templates")
    .select(EMAIL_TEMPLATE_COLUMNS)
    .eq("template_type", templateType)
    .eq("is_default", true)
    .maybeSingle();

  if (error) {
    raiseEmailTemplateDbError("Failed to load default email template", error);
  }
  if (!data) return null;

  return toEmailTemplateRow(data as Record<string, unknown>);
}

export interface InsertEmailTemplateRowInput {
  name: string;
  template_type: EmailTemplateType;
  subject: string;
  html_body: string;
  is_default: boolean;
}

export async function insertEmailTemplateRow(
  input: InsertEmailTemplateRowInput,
): Promise<EmailTemplateRow> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("email_templates")
    .insert({
      name: input.name,
      template_type: input.template_type,
      subject: input.subject,
      html_body: input.html_body,
      is_default: input.is_default,
      updated_at: new Date().toISOString(),
    })
    .select(EMAIL_TEMPLATE_COLUMNS)
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      raiseEmailTemplateDbError(
        "Failed to create email template",
        error,
        "A default template already exists for this type",
      );
    }
    raiseEmailTemplateDbError("Failed to create email template", error);
  }

  return toEmailTemplateRow(data as Record<string, unknown>);
}

export async function clearDefaultEmailTemplate(
  templateType: EmailTemplateType,
  exceptTemplateId?: number,
): Promise<void> {
  const db = getServiceClient();
  let query = db
    .from("email_templates")
    .update({
      is_default: false,
      updated_at: new Date().toISOString(),
    })
    .eq("template_type", templateType)
    .eq("is_default", true);

  if (exceptTemplateId !== undefined) {
    query = query.neq("id", exceptTemplateId);
  }

  const { error } = await query;

  if (error) {
    raiseEmailTemplateDbError("Failed to clear default email template", error);
  }
}

export interface UpdateEmailTemplateRowInput {
  name?: string;
  subject?: string;
  html_body?: string;
  is_default?: boolean;
}

export async function updateEmailTemplateRow(
  templateId: number,
  input: UpdateEmailTemplateRowInput,
): Promise<EmailTemplateRow> {
  const db = getServiceClient();
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) patch.name = input.name;
  if (input.subject !== undefined) patch.subject = input.subject;
  if (input.html_body !== undefined) patch.html_body = input.html_body;
  if (input.is_default !== undefined) patch.is_default = input.is_default;

  const { data, error } = await db
    .from("email_templates")
    .update(patch)
    .eq("id", templateId)
    .select(EMAIL_TEMPLATE_COLUMNS)
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      raiseEmailTemplateDbError(
        "Failed to update email template",
        error,
        "A default template already exists for this type",
      );
    }
    raiseEmailTemplateDbError("Failed to update email template", error);
  }

  return toEmailTemplateRow(data as Record<string, unknown>);
}

export async function deleteEmailTemplateRow(templateId: number): Promise<void> {
  const db = getServiceClient();
  const { error } = await db.from("email_templates").delete().eq("id", templateId);

  if (error) {
    raiseEmailTemplateDbError("Failed to delete email template", error);
  }
}

export async function countEmailTemplatesByType(
  templateType: EmailTemplateType,
): Promise<number> {
  const db = getServiceClient();
  const { count, error } = await db
    .from("email_templates")
    .select("id", { count: "exact", head: true })
    .eq("template_type", templateType);

  if (error) {
    raiseEmailTemplateDbError("Failed to count email templates", error);
  }

  return count ?? 0;
}
