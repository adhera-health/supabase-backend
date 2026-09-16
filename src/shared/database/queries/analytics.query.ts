/**
 * Analytics queries — funnel counts derived from patient_invitations.
 */

import { getServiceClient } from "@shared/database/client.ts";
import { raiseDbError } from "@shared/database/queries/db-error.ts";
import {
  analyticsScopeSelectsNothing,
  applyAnalyticsFilters,
} from "@shared/database/queries/analytics-filters.ts";
import type { AnalyticsQueryFilters } from "@shared/database/queries/analytics-filters.ts";
import type { AnalyticsOverview } from "@domain/analytics.ts";

export type { AnalyticsQueryFilters };

const DROPOUT_STATUSES = [
  "dropped_out_voluntary",
  "dropped_out_clinical",
  "dropped_out_technical",
  "dropped_out_other",
];

// deno-lint-ignore no-explicit-any
type QueryBuilder = any;

async function countWhere(
  f: AnalyticsQueryFilters,
  refine?: (q: QueryBuilder) => QueryBuilder,
): Promise<number> {
  if (analyticsScopeSelectsNothing(f)) return 0;

  const db = getServiceClient();
  let q = db
    .from("patient_invitations")
    .select("id", { count: "exact", head: true });
  q = applyAnalyticsFilters(q, f);
  if (refine) q = refine(q);

  const { count, error } = await q;
  if (error) raiseDbError("Failed to count invitations for analytics", error);
  return count ?? 0;
}

export async function getOverviewCounts(
  f: AnalyticsQueryFilters,
): Promise<AnalyticsOverview> {
  const [
    invitations,
    emails_opened,
    registered,
    consent_completed,
    active,
    dropped_out,
  ] = await Promise.all([
    countWhere(f),
    countWhere(f, (q) => q.not("email_opened_at", "is", null)),
    countWhere(f, (q) => q.not("registered_at", "is", null)),
    countWhere(f, (q) => q.not("consent_completed_at", "is", null)),
    countWhere(f, (q) => q.eq("status", "active")),
    countWhere(f, (q) => q.in("status", DROPOUT_STATUSES)),
  ]);

  return {
    invitations,
    emails_opened,
    registered,
    consent_completed,
    active,
    dropped_out,
  };
}

export interface InvitationTimestampsRow {
  invited_at: string | null;
  email_opened_at: string | null;
  registered_at: string | null;
  consent_completed_at: string | null;
  activated_at: string | null;
}

const PAGE_SIZE = 1000;
/** Safety cap for the funnel scan (V1 volumes). Replace with an RPC if exceeded. */
const MAX_ROWS = 50_000;

/** Streams invitation milestone timestamps for the funnel, paginating past the row cap. */
export async function fetchInvitationTimestamps(
  f: AnalyticsQueryFilters,
): Promise<{ rows: InvitationTimestampsRow[]; truncated: boolean }> {
  if (analyticsScopeSelectsNothing(f)) return { rows: [], truncated: false };

  const db = getServiceClient();
  const rows: InvitationTimestampsRow[] = [];

  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    let q = db
      .from("patient_invitations")
      .select(
        "invited_at, email_opened_at, registered_at, consent_completed_at, activated_at",
      );
    q = applyAnalyticsFilters(q, f);
    q = q.order("invited_at", { ascending: true }).range(from, from + PAGE_SIZE - 1);

    const { data, error } = await q;
    if (error) raiseDbError("Failed to load invitations for funnel", error);

    const batch = (data ?? []) as InvitationTimestampsRow[];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) {
      return { rows, truncated: false };
    }
  }

  return { rows, truncated: true };
}
