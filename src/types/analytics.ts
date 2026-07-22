/**
 * Dashboard analytics types (PRD §16). Metrics derived from patient_invitations.
 */

export const ANALYTICS_PERIODS = ["daily", "weekly", "monthly"] as const;

export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

/** GET /analytics/overview — funnel totals. */
export interface AnalyticsOverview {
  invitations: number;
  emails_opened: number;
  registered: number;
  consent_completed: number;
  active: number;
  dropped_out: number;
}

export interface GetAnalyticsOverviewResponse {
  overview: AnalyticsOverview;
}

/** One time bucket in the funnel-over-time chart (cohort by invited_at). */
export interface AnalyticsFunnelBucket {
  /** Sortable key, e.g. "2026-07-01" (daily/weekly) or "2026-07" (monthly). */
  period: string;
  /** Display label, e.g. "01 Jul" or "Jul 2026". */
  label: string;
  invitations: number;
  emails_opened: number;
  registered: number;
  consent_completed: number;
  active: number;
}

export interface GetAnalyticsFunnelResponse {
  buckets: AnalyticsFunnelBucket[];
}
