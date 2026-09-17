/**
 * Per-client invitation templates: a client's own default wins, and the shared
 * template (client_id IS NULL) is the fallback.
 *
 * Templates used to be global: any recruiter editing the single default changed
 * the email every tenant's patients received. Templates are now tenant-owned,
 * so send/resend must resolve the most specific one for the invitation's client.
 */

import { assertEquals } from "@std/assert";
import {
  pickDefaultTemplate,
  templateDeletionBlockReason,
} from "@shared/services/email-template-resolution.ts";
import type { EmailTemplateRow } from "@domain/email-template.ts";

function row(partial: Partial<EmailTemplateRow>): EmailTemplateRow {
  return {
    id: 1,
    uuid: "11111111-1111-4111-8111-111111111111",
    name: "Template",
    template_type: "invitation",
    client_id: null,
    subject: "Subject",
    html_body: "<p>{{onboarding_url}}</p>",
    is_default: true,
    created_at: "2026-09-16T00:00:00.000Z",
    updated_at: "2026-09-16T00:00:00.000Z",
    ...partial,
  };
}

const shared = row({ id: 1, name: "Shared", client_id: null });
const clientA = row({ id: 2, name: "Hospital A", client_id: "36" });
const clientB = row({ id: 3, name: "Hospital B", client_id: "37" });

Deno.test("a client's own default wins over the shared default", () => {
  const picked = pickDefaultTemplate([shared, clientA, clientB], "36");

  assertEquals(picked?.name, "Hospital A");
});

Deno.test("falls back to the shared default when the client has none", () => {
  const picked = pickDefaultTemplate([shared, clientB], "36");

  assertEquals(picked?.name, "Shared");
});

Deno.test("another client's default is never used", () => {
  const picked = pickDefaultTemplate([clientB], "36");

  assertEquals(picked, null);
});

Deno.test("no template at all resolves to null", () => {
  assertEquals(pickDefaultTemplate([], "36"), null);
});

Deno.test("non-default rows are ignored", () => {
  const draft = row({ id: 4, name: "Draft", client_id: "36", is_default: false });

  assertEquals(pickDefaultTemplate([draft, shared], "36")?.name, "Shared");
  assertEquals(pickDefaultTemplate([draft], "36"), null);
});

Deno.test("without a client only the shared default applies", () => {
  assertEquals(pickDefaultTemplate([shared, clientA], undefined)?.name, "Shared");
  assertEquals(pickDefaultTemplate([clientA], undefined), null);
});

Deno.test("client ids compare as strings", () => {
  // Adhera Core ids are integers upstream, stored as text here.
  assertEquals(pickDefaultTemplate([shared, clientA], 36 as unknown as string)?.name, "Hospital A");
});

/**
 * Deletion rule. Templates used to be global, so refusing to delete any default
 * was right. Now a client's default can go as long as the shared fallback
 * remains — otherwise that client's sends would have no template at all.
 */

Deno.test("a non-default template is always deletable", () => {
  const draft = row({ client_id: "36", is_default: false });

  assertEquals(
    templateDeletionBlockReason(draft, { sharedDefaultExists: true }),
    null,
  );
  assertEquals(
    templateDeletionBlockReason(draft, { sharedDefaultExists: false }),
    null,
  );
});

Deno.test("a client default is deletable while the shared fallback exists", () => {
  assertEquals(
    templateDeletionBlockReason(clientA, { sharedDefaultExists: true }),
    null,
  );
});

Deno.test("a client default is blocked without a shared fallback", () => {
  assertEquals(
    templateDeletionBlockReason(clientA, { sharedDefaultExists: false }),
    "no_fallback",
  );
});

Deno.test("the shared default is never deleted while it is the default", () => {
  assertEquals(
    templateDeletionBlockReason(shared, { sharedDefaultExists: true }),
    "shared_default",
  );
});
