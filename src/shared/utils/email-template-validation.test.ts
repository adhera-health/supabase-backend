import { assertEquals, assertThrows } from "@std/assert";
import {
  assertInvitationEmailHtmlBodyValid,
  findMissingRequiredInvitationPlaceholders,
  sanitizeInvitationEmailHtmlBody,
} from "@shared/utils/email-template-validation.ts";
import { ValidationError } from "@shared/utils/errors.ts";

const VALID_TEMPLATE_HTML =
  "<p>Hi, use {{onboarding_url}}. See {{privacy_notice_url}}. Link expires in {{expires_in_hours}} hours.</p>";

Deno.test("sanitizeInvitationEmailHtmlBody strips script tags and their content", () => {
  const result = sanitizeInvitationEmailHtmlBody(
    "<p>hi</p><script>alert(document.cookie)</script>",
  );
  assertEquals(result, "<p>hi</p>");
});

Deno.test("sanitizeInvitationEmailHtmlBody strips inline event handler attributes", () => {
  const result = sanitizeInvitationEmailHtmlBody(
    '<p onclick="alert(1)" onmouseover="alert(2)">hi</p>',
  );
  assertEquals(result, "<p>hi</p>");
});

Deno.test("sanitizeInvitationEmailHtmlBody strips javascript: URLs from href", () => {
  const result = sanitizeInvitationEmailHtmlBody(
    '<a href="javascript:alert(1)">click</a>',
  );
  assertEquals(result, "<a>click</a>");
});

Deno.test("sanitizeInvitationEmailHtmlBody strips entity-encoded javascript: URL bypass", () => {
  const result = sanitizeInvitationEmailHtmlBody(
    '<a href="javascript&colon;alert(1)">click</a>',
  );
  assertEquals(result, "<a>click</a>");
});

Deno.test("sanitizeInvitationEmailHtmlBody strips data: URLs from href", () => {
  const result = sanitizeInvitationEmailHtmlBody(
    '<a href="data:text/html,<script>alert(1)</script>">click</a>',
  );
  assertEquals(result, "<a>click</a>");
});

Deno.test("sanitizeInvitationEmailHtmlBody strips iframe/object/embed/svg/math and their content", () => {
  assertEquals(
    sanitizeInvitationEmailHtmlBody('<iframe src="https://evil.example">leak</iframe>after'),
    "after",
  );
  assertEquals(
    sanitizeInvitationEmailHtmlBody("<object>leak</object>after"),
    "after",
  );
  assertEquals(
    sanitizeInvitationEmailHtmlBody('<embed src="evil.swf">after'),
    "after",
  );
  assertEquals(
    sanitizeInvitationEmailHtmlBody("<svg onload=alert(1)><script>alert(2)</script>leak</svg>after"),
    "after",
  );
  assertEquals(
    sanitizeInvitationEmailHtmlBody("<math><script>alert(1)</script>leak</math>after"),
    "after",
  );
});

Deno.test("sanitizeInvitationEmailHtmlBody strips style attribute and style tag", () => {
  assertEquals(
    sanitizeInvitationEmailHtmlBody('<p style="background:url(javascript:alert(1))">hi</p>'),
    "<p>hi</p>",
  );
  assertEquals(
    sanitizeInvitationEmailHtmlBody("<style>body{background:red}</style><p>hi</p>"),
    "<p>hi</p>",
  );
});

Deno.test("sanitizeInvitationEmailHtmlBody unwraps disallowed tags but keeps their text content", () => {
  const result = sanitizeInvitationEmailHtmlBody('<font color="red">hi</font>');
  assertEquals(result, "hi");
});

Deno.test("sanitizeInvitationEmailHtmlBody preserves allowed tags and attributes", () => {
  const html =
    '<table border="1"><tr><td colspan="2">a</td></tr></table><ul><li><strong>bold</strong> <em>em</em></li></ul>';
  assertEquals(sanitizeInvitationEmailHtmlBody(html), html);
});

Deno.test("sanitizeInvitationEmailHtmlBody preserves placeholder tokens in href", () => {
  const html = '<a href="{{onboarding_url}}">Activate</a>';
  assertEquals(sanitizeInvitationEmailHtmlBody(html), html);
});

Deno.test("sanitizeInvitationEmailHtmlBody allows http, https, mailto and cid schemes", () => {
  assertEquals(
    sanitizeInvitationEmailHtmlBody('<a href="http://example.com">x</a>'),
    '<a href="http://example.com">x</a>',
  );
  assertEquals(
    sanitizeInvitationEmailHtmlBody('<a href="https://example.com">x</a>'),
    '<a href="https://example.com">x</a>',
  );
  assertEquals(
    sanitizeInvitationEmailHtmlBody('<a href="mailto:help@example.com">x</a>'),
    '<a href="mailto:help@example.com">x</a>',
  );
  assertEquals(
    sanitizeInvitationEmailHtmlBody('<a href="cid:logo">x</a>'),
    '<a href="cid:logo">x</a>',
  );
});

Deno.test("sanitizeInvitationEmailHtmlBody adds rel=noreferrer noopener when target is set", () => {
  const result = sanitizeInvitationEmailHtmlBody(
    '<a href="https://example.com" target="_blank">go</a>',
  );
  assertEquals(
    result,
    '<a href="https://example.com" target="_blank" rel="noreferrer noopener">go</a>',
  );
});

Deno.test("sanitizeInvitationEmailHtmlBody leaves already-safe html unchanged", () => {
  assertEquals(sanitizeInvitationEmailHtmlBody(VALID_TEMPLATE_HTML), VALID_TEMPLATE_HTML);
});

Deno.test("findMissingRequiredInvitationPlaceholders returns all tokens when none are present", () => {
  const missing = findMissingRequiredInvitationPlaceholders("<p>no placeholders here</p>");
  assertEquals(missing, [
    "{{onboarding_url}}",
    "{{privacy_notice_url}}",
    "{{expires_in_hours}}",
  ]);
});

Deno.test("findMissingRequiredInvitationPlaceholders returns empty array when all placeholders present", () => {
  const missing = findMissingRequiredInvitationPlaceholders(VALID_TEMPLATE_HTML);
  assertEquals(missing, []);
});

Deno.test("findMissingRequiredInvitationPlaceholders returns only the missing tokens", () => {
  const missing = findMissingRequiredInvitationPlaceholders(
    "<p>{{onboarding_url}} only</p>",
  );
  assertEquals(missing, ["{{privacy_notice_url}}", "{{expires_in_hours}}"]);
});

Deno.test("assertInvitationEmailHtmlBodyValid does not throw for valid sanitized html", () => {
  assertInvitationEmailHtmlBodyValid(VALID_TEMPLATE_HTML);
});

Deno.test("assertInvitationEmailHtmlBodyValid throws ValidationError when html contains disallowed markup", () => {
  const unsafeHtml = `<script>alert(1)</script>${VALID_TEMPLATE_HTML}`;

  const error = assertThrows(
    () => assertInvitationEmailHtmlBodyValid(unsafeHtml),
    ValidationError,
  ) as ValidationError;

  const fieldErrors = (error.details as { field_errors: Record<string, string[]> })
    .field_errors;
  assertEquals(
    fieldErrors.html_body,
    ["HTML contains disallowed markup or attributes."],
  );
});

Deno.test("assertInvitationEmailHtmlBodyValid throws ValidationError when required placeholders are missing", () => {
  const error = assertThrows(
    () => assertInvitationEmailHtmlBodyValid("<p>{{onboarding_url}} only</p>"),
    ValidationError,
  ) as ValidationError;

  const fieldErrors = (error.details as { field_errors: Record<string, string[]> })
    .field_errors;
  assertEquals(fieldErrors.html_body, [
    "HTML must include required placeholders: {{privacy_notice_url}}, {{expires_in_hours}}",
  ]);
});

Deno.test("assertInvitationEmailHtmlBodyValid reports markup and placeholder issues together", () => {
  const error = assertThrows(
    () => assertInvitationEmailHtmlBodyValid('<p onclick="alert(1)">no placeholders</p>'),
    ValidationError,
  ) as ValidationError;

  const fieldErrors = (error.details as { field_errors: Record<string, string[]> })
    .field_errors;
  assertEquals(fieldErrors.html_body.length, 2);
});

Deno.test("assertInvitationEmailHtmlBodyValid uses a custom fieldPath in error details", () => {
  const error = assertThrows(
    () =>
      assertInvitationEmailHtmlBodyValid("<p>no placeholders</p>", {
        fieldPath: "email_override.html_body",
      }),
    ValidationError,
  ) as ValidationError;

  const fieldErrors = (error.details as { field_errors: Record<string, string[]> })
    .field_errors;
  assertEquals(Object.keys(fieldErrors), ["email_override.html_body"]);
});
