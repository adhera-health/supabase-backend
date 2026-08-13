/**
 * Rate limit maintenance — prunes stale rate_limits rows.
 *
 * A row only needs to survive slightly past its own window to correctly
 * enforce a limit: acquire_rate_limit_bucket recreates it fresh (via
 * INSERT ... ON CONFLICT DO NOTHING) the next time that key is used, so
 * deleting rows well past their last update is always safe. The default
 * retention is generous (24h) relative to the ~60s windows the presets
 * use today, purely to keep the table bounded, not for correctness.
 */

import { deleteStaleRateLimits } from "@shared/database/queries/rate-limit.query.ts";
import type { RateLimitCleanupSummary } from "@domain/rate-limit.ts";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Deletes rate_limits rows untouched for longer than the retention window. */
export async function cleanupStaleRateLimits(): Promise<RateLimitCleanupSummary> {
  const retentionMs = parsePositiveInt(
    Deno.env.get("RATE_LIMIT_CLEANUP_RETENTION_MS"),
    DEFAULT_RETENTION_MS,
  );

  const cutoff = new Date(Date.now() - retentionMs).toISOString();
  const deletedCount = await deleteStaleRateLimits(cutoff);

  return { cutoff, retention_ms: retentionMs, deleted_count: deletedCount };
}
