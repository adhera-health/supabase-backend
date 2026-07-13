/**
 * Email template types — invitation template CRUD + send-time overrides.
 */

/** Supported stored template kinds (extend when adding reminder templates). */
export const EMAIL_TEMPLATE_TYPES = ["invitation"] as const;

export type EmailTemplateType = (typeof EMAIL_TEMPLATE_TYPES)[number];

/** Row: email_templates */
export interface EmailTemplateRow {
  id: number;
  uuid: string;
  name: string;
  template_type: EmailTemplateType;
  subject: string;
  html_body: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/** API resource (no internal id). */
export interface EmailTemplateResource {
  template_uuid: string;
  name: string;
  template_type: EmailTemplateType;
  subject: string;
  html_body: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateEmailTemplateInput {
  name: string;
  template_type: EmailTemplateType;
  subject: string;
  html_body: string;
  is_default?: boolean;
}

export interface UpdateEmailTemplateInput {
  name?: string;
  subject?: string;
  html_body?: string;
  is_default?: boolean;
}

/** Per-send email fields — never written back to email_templates. */
export interface InvitationEmailOverride {
  subject?: string;
  html_body?: string;
}

/** Nested on invitation send/resend request bodies. */
export interface InvitationEmailContentOverride {
  email_override?: InvitationEmailOverride;
}

export interface CreateEmailTemplateResponse {
  template: EmailTemplateResource;
}

export interface GetEmailTemplateResponse {
  template: EmailTemplateResource;
}

export interface ListEmailTemplatesResponse {
  templates: EmailTemplateResource[];
}

export interface DeleteEmailTemplateResponse {
  template_uuid: string;
  deleted: true;
}

/** Resolved subject + HTML before placeholder substitution. */
export interface ResolvedInvitationEmailContent {
  subject: string;
  html_body: string;
  /** true when loaded from DB default; false when override supplied for that field. */
  used_default_subject: boolean;
  used_default_html_body: boolean;
  default_template_uuid: string | null;
}
