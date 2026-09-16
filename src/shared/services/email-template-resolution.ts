/**
 * Chooses which stored invitation template a send should use.
 *
 * Templates belong to a client (Adhera Core id as text), with `client_id = null`
 * as the shared fallback. The rule is "most specific wins": the invitation's own
 * client first, then the shared template, and nothing otherwise.
 *
 * Kept pure so send and resend resolve identically and the rule is testable
 * without a database.
 */

import type { EmailTemplateRow } from "@domain/email-template.ts";

export function pickDefaultTemplate(
  rows: EmailTemplateRow[],
  clientId?: string | null,
): EmailTemplateRow | null {
  const defaults = rows.filter((row) => row.is_default);

  // Core ids are integers upstream and text here; compare as strings.
  const client = clientId === undefined || clientId === null
    ? null
    : String(clientId);

  if (client !== null) {
    const ownTemplate = defaults.find(
      (row) => row.client_id !== null && String(row.client_id) === client,
    );
    if (ownTemplate) return ownTemplate;
  }

  return defaults.find((row) => row.client_id === null) ?? null;
}
