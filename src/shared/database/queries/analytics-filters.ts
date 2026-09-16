/**
 * Analytics query filters, including tenant scope.
 *
 * Separate from `analytics.query.ts` so the filter logic stays unit-testable:
 * that module imports the Supabase client, which requires env at import time.
 */

export interface AnalyticsQueryFilters {
  clientId?: string;
  programId?: string;
  /** Tenant scope — only these clients are visible. Empty means nothing is. */
  allowedClientIds?: string[];
  /** Tenant scope — only these programs are visible. Empty means nothing is. */
  allowedProgramIds?: string[];
  /** Inclusive YYYY-MM-DD bounds on invited_at. */
  dateFrom?: string;
  dateTo?: string;
}

// deno-lint-ignore no-explicit-any
type QueryBuilder = any;

/**
 * True when the actor's scope can never match a row, so the query can be
 * skipped entirely (mirrors `listInvitations`' early return).
 */
export function analyticsScopeSelectsNothing(f: AnalyticsQueryFilters): boolean {
  return f.allowedClientIds?.length === 0 || f.allowedProgramIds?.length === 0;
}

/**
 * Applies tenant scope first, then the caller's own filters. Scope is applied
 * whether or not a filter was requested — a scoped actor asking for nothing
 * must still only see their own clients.
 */
export function applyAnalyticsFilters(
  query: QueryBuilder,
  f: AnalyticsQueryFilters,
): QueryBuilder {
  let q = query;

  if (f.allowedClientIds?.length) q = q.in("client_id", f.allowedClientIds);
  if (f.clientId) q = q.eq("client_id", f.clientId);

  if (f.allowedProgramIds?.length) q = q.in("program_id", f.allowedProgramIds);
  if (f.programId) q = q.eq("program_id", f.programId);

  if (f.dateFrom) q = q.gte("invited_at", `${f.dateFrom}T00:00:00.000Z`);
  if (f.dateTo) q = q.lte("invited_at", `${f.dateTo}T23:59:59.999Z`);

  return q;
}
