/**
 * Reminder log listing filters, including tenant scope.
 *
 * Scope is applied through the joined invitation (`patient_invitations!inner`),
 * which owns the tenant columns. Separate from `reminder.query.ts` so the
 * filter logic stays unit-testable: that module imports the Supabase client,
 * which requires env at import time.
 */

export interface ListReminderLogsFilters {
  invitationUuid?: string;
  /** Tenant scope — only these clients are visible. Empty means nothing is. */
  allowedClientIds?: string[];
  /** Tenant scope — only these programs are visible. Empty means nothing is. */
  allowedProgramIds?: string[];
  page: number;
  perPage: number;
}

// deno-lint-ignore no-explicit-any
type QueryBuilder = any;

/**
 * True when the actor's scope can never match a row, so the query can be
 * skipped entirely (mirrors `listInvitations`' early return).
 */
export function reminderLogScopeSelectsNothing(
  f: ListReminderLogsFilters,
): boolean {
  return f.allowedClientIds?.length === 0 || f.allowedProgramIds?.length === 0;
}

/**
 * Applies tenant scope first, then the caller's own filter. An invitation from
 * outside the actor's scope therefore yields an empty page rather than another
 * tenant's reminder history.
 */
export function applyReminderLogFilters(
  query: QueryBuilder,
  f: ListReminderLogsFilters,
): QueryBuilder {
  let q = query;

  if (f.allowedClientIds?.length) {
    q = q.in("patient_invitations.client_id", f.allowedClientIds);
  }

  if (f.allowedProgramIds?.length) {
    q = q.in("patient_invitations.program_id", f.allowedProgramIds);
  }

  if (f.invitationUuid) {
    q = q.eq("patient_invitations.uuid", f.invitationUuid);
  }

  return q;
}
