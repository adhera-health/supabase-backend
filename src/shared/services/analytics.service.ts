/**
 * Analytics service — overview totals + funnel-over-time buckets (PRD §16).
 * Funnel buckets are cohorts keyed on invited_at.
 */

import {
  fetchInvitationTimestamps,
  getOverviewCounts,
  type AnalyticsQueryFilters,
  type InvitationTimestampsRow,
} from "@shared/database/queries/analytics.query.ts";
import type {
  AnalyticsFunnelBucket,
  AnalyticsOverview,
  AnalyticsPeriod,
} from "@domain/analytics.ts";
import { createLogger } from "@shared/utils/logger.ts";

const logger = createLogger("analytics");

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Returns the sortable key + display label for a timestamp under a bucketing period. */
function bucketFor(
  iso: string,
  period: AnalyticsPeriod,
): { key: string; label: string } {
  const d = new Date(iso);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();

  if (period === "monthly") {
    return { key: `${year}-${pad2(month + 1)}`, label: `${MONTHS[month]} ${year}` };
  }

  if (period === "weekly") {
    // ISO week start (Monday), computed in UTC.
    const weekdayFromMonday = (d.getUTCDay() + 6) % 7;
    const monday = new Date(Date.UTC(year, month, day - weekdayFromMonday));
    const key = monday.toISOString().slice(0, 10);
    return {
      key,
      label: `Wk ${pad2(monday.getUTCDate())} ${MONTHS[monday.getUTCMonth()]}`,
    };
  }

  // daily
  return { key: `${year}-${pad2(month + 1)}-${pad2(day)}`, label: `${pad2(day)} ${MONTHS[month]}` };
}

export async function getAnalyticsOverview(
  filters: AnalyticsQueryFilters,
): Promise<{ overview: AnalyticsOverview }> {
  const overview = await getOverviewCounts(filters);
  return { overview };
}

export async function getAnalyticsFunnel(
  filters: AnalyticsQueryFilters,
  period: AnalyticsPeriod,
): Promise<{ buckets: AnalyticsFunnelBucket[] }> {
  const { rows, truncated } = await fetchInvitationTimestamps(filters);

  if (truncated) {
    logger.warn("Funnel scan hit the row cap; results are partial", { period });
  }

  const byKey = new Map<string, AnalyticsFunnelBucket>();

  const ensure = (key: string, label: string): AnalyticsFunnelBucket => {
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = {
        period: key,
        label,
        invitations: 0,
        emails_opened: 0,
        registered: 0,
        consent_completed: 0,
        active: 0,
      };
      byKey.set(key, bucket);
    }
    return bucket;
  };

  for (const row of rows as InvitationTimestampsRow[]) {
    if (!row.invited_at) continue;
    const { key, label } = bucketFor(row.invited_at, period);
    const bucket = ensure(key, label);

    bucket.invitations += 1;
    if (row.email_opened_at) bucket.emails_opened += 1;
    if (row.registered_at) bucket.registered += 1;
    if (row.consent_completed_at) bucket.consent_completed += 1;
    if (row.activated_at) bucket.active += 1;
  }

  const buckets = [...byKey.values()].sort((a, b) =>
    a.period < b.period ? -1 : a.period > b.period ? 1 : 0
  );

  return { buckets };
}
