/**
 * Backend validation for admin email templates and invitation send overrides.
 * Sanitizes HTML against an allowlist of tags/attributes/URL schemes and checks
 * for required placeholders.
 */

import {
  clearNonPrintableCharacter,
  escapeAttrValue,
  escapeDangerHtml5Entities,
  escapeHtmlEntities,
  FilterXSS,
  unescapeQuote,
} from "xss";
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

/** Schemes allowed in URL-bearing attribute values (e.g. href). No scheme (relative/fragment/placeholder) is always allowed. */
const ALLOWED_URL_SCHEMES = new Set(["http", "https", "mailto", "cid"]);

/** Attributes whose value is a URL and must be checked against ALLOWED_URL_SCHEMES. */
const URL_ATTRIBUTE_NAMES = new Set(["href"]);

/**
 * Same entity-decoding pipeline xss's own default safeAttrValue uses internally
 * (unexported as a single function), so scheme checks below see e.g. `javascript&colon;x`
 * as `javascript:x` — otherwise the entity-encoded form would slip past the scheme check.
 */
function decodeAttrValueForSafetyCheck(value: string): string {
  return clearNonPrintableCharacter(
    escapeDangerHtml5Entities(escapeHtmlEntities(unescapeQuote(value))),
  );
}

function isSafeUrlAttrValue(decodedValue: string): boolean {
  const trimmed = decodedValue.trim();
  if (trimmed.startsWith("//")) return false; // no protocol-relative URLs
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  if (!schemeMatch) return true; // relative URL, fragment, or placeholder token
  return ALLOWED_URL_SCHEMES.has(schemeMatch[1].toLowerCase());
}

const ATTRIBUTE_WHITELIST: Record<string, string[]> = Object.fromEntries(
  ALLOWED_HTML_TAGS.map((tag) => [tag, ALLOWED_ATTRIBUTES[tag] ?? []]),
);

/**
 * Removes DISALLOWED_CONTENT_TAGS blocks (tag + inner content) before the tags reach
 * the whitelist filter below. Done by hand rather than via xss's `stripIgnoreTagBody`
 * option: that option tracks a single non-stack "removal start" position, which
 * produces corrupted output for tags nested inside another stripped tag (e.g. a
 * <script> inside an <svg>) and for tags with no closing tag (e.g. <embed>), both of
 * which this project's html_body inputs can contain.
 */
function stripDisallowedContentTags(html: string): string {
  let result = html;
  for (const tag of DISALLOWED_CONTENT_TAGS) {
    const pairPattern = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi");
    let previous: string;
    do {
      previous = result;
      result = result.replace(pairPattern, "");
    } while (result !== previous);
    // Unmatched open/close tags of this name (e.g. a void-style <embed> with no closer).
    result = result
      .replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "")
      .replace(new RegExp(`<\\/${tag}\\s*>`, "gi"), "");
  }
  return result;
}

const xssFilter = new FilterXSS({
  whiteList: ATTRIBUTE_WHITELIST,
  onIgnoreTag: () => "", // unwrap: drop the tag, keep its (already-safe) inner content
  onTagAttr(_tag, name, value, isWhiteAttr) {
    if (!isWhiteAttr) return undefined; // not whitelisted for this tag; default removes it
    if (!URL_ATTRIBUTE_NAMES.has(name)) return undefined; // default escaping is fine
    // xss's own default safeAttrValue only allows a fixed http(s)/mailto/tel/data-image/
    // ftp/relative prefix list for href — no `cid:` and no scheme-less placeholder tokens
    // like "{{onboarding_url}}" — so href is fully handled here instead of deferring to it.
    const decoded = decodeAttrValueForSafetyCheck(value);
    if (!isSafeUrlAttrValue(decoded)) return ""; // drop the attribute entirely
    return `${name}="${escapeAttrValue(decoded)}"`;
  },
});

/** Forces rel="noreferrer noopener" on any <a> that has target, matching the previous sanitize-html transform. */
function applyAnchorTargetRel(html: string): string {
  return html.replace(/<a\b([^>]*)>/g, (full: string, attrs: string) => {
    if (!/\btarget\s*=/.test(attrs)) return full;
    const withoutRel = attrs.replace(/\s+rel\s*=\s*"(?:[^"\\]|\\.)*"/, "");
    return `<a${withoutRel} rel="noreferrer noopener">`;
  });
}

export function sanitizeInvitationEmailHtmlBody(htmlBody: string): string {
  const withoutDangerousContent = stripDisallowedContentTags(htmlBody);
  return applyAnchorTargetRel(xssFilter.process(withoutDangerousContent));
}
