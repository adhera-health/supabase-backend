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

/** Why a template cannot be deleted, or null when deletion is allowed. */
export type TemplateDeletionBlockReason = "shared_default" | "no_fallback";

/**
 * A client's default may be deleted once the shared fallback can take over.
 * The shared default itself may not while it is the default, and neither may a
 * client's default when no shared fallback exists — either would leave sends
 * for that client with no template at all.
 */
export function templateDeletionBlockReason(
  row: EmailTemplateRow,
  context: { sharedDefaultExists: boolean },
): TemplateDeletionBlockReason | null {
  if (!row.is_default) return null;
  if (row.client_id === null) return "shared_default";

  return context.sharedDefaultExists ? null : "no_fallback";
}
