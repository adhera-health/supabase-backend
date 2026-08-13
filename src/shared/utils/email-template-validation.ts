/**
 * Backend validation for admin email templates and invitation send overrides.
 * Sanitizes HTML against an allowlist of tags/attributes/URL schemes and checks
 * for required placeholders.
 */

import sanitizeHtml from "sanitize-html";
import { ValidationError } from "@shared/utils/errors.ts";

/** Must appear in invitation html_body so send-time rendering can substitute values. */
export const REQUIRED_INVITATION_EMAIL_PLACEHOLDERS = [
  "onboarding_url",
  "privacy_notice_url",
  "expires_in_hours",
] as const;

export type RequiredInvitationEmailPlaceholder =
  (typeof REQUIRED_INVITATION_EMAIL_PLACEHOLDERS)[number];

/** Returns missing required placeholder tokens e.g. "{{onboarding_url}}". */
export function findMissingRequiredInvitationPlaceholders(
  content: string,
): string[] {
  const missing: string[] = [];
  for (const key of REQUIRED_INVITATION_EMAIL_PLACEHOLDERS) {
    const token = `{{${key}}}`;
    if (!content.includes(token)) {
      missing.push(token);
    }
  }
  return missing;
}

export interface InvitationEmailHtmlValidationOptions {
  /** JSON field path prefix for ValidationError details (default: html_body). */
  fieldPath?: string;
}

/**
 * Validates invitation HTML body for unsafe markup and required placeholders.
 * Throws ValidationError when invalid.
 */
export function assertInvitationEmailHtmlBodyValid(
  htmlBody: string,
  options?: InvitationEmailHtmlValidationOptions,
): void {
  const fieldPath = options?.fieldPath ?? "html_body";
  const fieldErrors: Record<string, string[]> = {};

  const sanitizedHtmlBody = sanitizeInvitationEmailHtmlBody(htmlBody);

  if (sanitizedHtmlBody !== htmlBody) {
      fieldErrors[fieldPath] = [
        "HTML contains disallowed markup or attributes.",
      ];
  }

  const missingPlaceholders = findMissingRequiredInvitationPlaceholders(sanitizedHtmlBody);
  
  if (missingPlaceholders.length > 0) {
    const placeholderMessage =
      `HTML must include required placeholders: ${missingPlaceholders.join(", ")}`;
    fieldErrors[fieldPath] = [...(fieldErrors[fieldPath] ?? []), placeholderMessage];
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError("Validation failed", { field_errors: fieldErrors });
  }
}

const ALLOWED_HTML_TAGS = [
  "a",
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "div",
  "span",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "blockquote",
  "pre",
  "code",
  "small",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ["href", "title", "target", "rel"],
  div: ["title"],
  span: ["title"],
  table: ["border", "cellpadding", "cellspacing"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
};

/** Tags dropped along with their entire text content — not just unwrapped. */
const DISALLOWED_CONTENT_TAGS = [
  "script",
  "style",
  "textarea",
  "option",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "noscript",
];

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_HTML_TAGS,
  allowedAttributes: ALLOWED_ATTRIBUTES,
  allowedSchemes: ["http", "https", "mailto", "cid"],
  allowProtocolRelative: false,
  nonTextTags: DISALLOWED_CONTENT_TAGS,
  transformTags: {
    a: (tagName: string, attribs: Record<string, string>) => {
      if (attribs.target) {
        attribs.rel = "noreferrer noopener";
      }
      return { tagName, attribs };
    },
  },
};

export function sanitizeInvitationEmailHtmlBody(htmlBody: string): string {
  return sanitizeHtml(htmlBody, SANITIZE_OPTIONS);
}
