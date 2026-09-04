/**
 * Rate limit maintenance types.
 */

export interface RateLimitCleanupSummary {
  cutoff: string;
  retention_ms: number;
  deleted_count: number;
}

/** POST /rate-limits-cleanup/run — response body (inside success.data) */
export interface CleanupRateLimitsResponse {
  cleanup: RateLimitCleanupSummary;
}
