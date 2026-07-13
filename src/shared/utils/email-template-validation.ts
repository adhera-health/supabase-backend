/**
 * Backend validation for admin email templates and invitation send overrides.
 * Not a full browser sanitizer — blocks obvious unsafe HTML and missing required placeholders.
 */

import { ValidationError } from "@shared/utils/errors.ts";

/** Must appear in invitation html_body so send-time rendering can substitute values. */
export const REQUIRED_INVITATION_EMAIL_PLACEHOLDERS = [
  "onboarding_url",
  "privacy_notice_url",
  "expires_in_hours",
] as const;

export type RequiredInvitationEmailPlaceholder =
  (typeof REQUIRED_INVITATION_EMAIL_PLACEHOLDERS)[number];

const UNSAFE_HTML_RULES: ReadonlyArray<{ message: string; pattern: RegExp }> = [
  { message: "HTML must not contain script tags", pattern: /<script\b/i },
  { message: "HTML must not contain javascript: URLs", pattern: /javascript\s*:/i },
  { message: "HTML must not contain vbscript: URLs", pattern: /vbscript\s*:/i },
  { message: "HTML must not contain inline event handlers", pattern: /\bon[a-z]+\s*=/i },
  { message: "HTML must not contain iframe elements", pattern: /<iframe\b/i },
  { message: "HTML must not contain object elements", pattern: /<object\b/i },
  { message: "HTML must not contain embed elements", pattern: /<embed\b/i },
];

/** Returns human-readable unsafe HTML violations (empty when safe). */
export function collectUnsafeEmailHtmlIssues(html: string): string[] {
  return UNSAFE_HTML_RULES
    .filter((rule) => rule.pattern.test(html))
    .map((rule) => rule.message);
}

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

  const unsafeIssues = collectUnsafeEmailHtmlIssues(htmlBody);
  if (unsafeIssues.length > 0) {
    fieldErrors[fieldPath] = unsafeIssues;
  }

  const missingPlaceholders = findMissingRequiredInvitationPlaceholders(htmlBody);
  if (missingPlaceholders.length > 0) {
    const placeholderMessage =
      `HTML must include required placeholders: ${missingPlaceholders.join(", ")}`;
    fieldErrors[fieldPath] = [...(fieldErrors[fieldPath] ?? []), placeholderMessage];
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError("Validation failed", { field_errors: fieldErrors });
  }
}
