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

const ALLOWED_HTML_TAGS = new Set([
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
]);

const ALLOWED_ATTRIBUTES: Record<string, readonly string[]> = {
  a: ["href", "title", "target", "rel"],
  img: ["src", "alt", "title", "width", "height"],
  div: ["title"],
  span: ["title"],
  table: ["border", "cellpadding", "cellspacing"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
};

const PLACEHOLDER_PATTERN = /\{\{\s*[a-z_]+\s*\}\}/g;

function isPlaceholderValue(value: string): boolean {
  return PLACEHOLDER_PATTERN.test(value);
}

function isSafeUrl(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, "");
  if (!normalized) return false;
  if (isPlaceholderValue(normalized)) return true;

  return /^(https?:|mailto:|cid:)/i.test(normalized);
}

function sanitizeElement(el: Element): void {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();

    if (name.startsWith("on")) {
      el.removeAttribute(attr.name);
      continue;
    }

    if (name === "style") {
      el.removeAttribute(attr.name);
      continue;
    }

    const allowedAttrs = ALLOWED_ATTRIBUTES[el.tagName.toLowerCase()] ?? [];
    if (!allowedAttrs.includes(name)) {
      el.removeAttribute(attr.name);
      continue;
    }

    if ((name === "href" || name === "src") && !isSafeUrl(attr.value)) {
      el.removeAttribute(attr.name);
      continue;
    }

    if (el.tagName.toLowerCase() === "a" && name === "target") {
      el.setAttribute("rel", "noreferrer noopener");
    }
  }
}

function sanitizeNode(node: Node): void {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (!ALLOWED_HTML_TAGS.has(tag)) {
      if (["script", "style", "iframe", "object", "embed", "svg", "math"].includes(tag)) {
        el.remove();
        return;
      }

      while (el.firstChild) {
        el.parentNode?.insertBefore(el.firstChild, el);
      }
      el.remove();
      return;
    }

    sanitizeElement(el);
  }

  for (const child of Array.from(node.childNodes)) {
    sanitizeNode(child);
  }
}



export function sanitizeInvitationEmailHtmlBody(htmlBody: string): string {
  const parser = new DOMParser();
  const document = parser.parseFromString(htmlBody, "text/html");

  if (!document.body) {
    return "";
  }

  sanitizeNode(document.body);

  return document.body.innerHTML;
}
