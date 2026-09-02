/**
 * rate_limits maintenance queries.
 */

import { getServiceClient } from "@shared/database/client.ts";
import { raiseDbError } from "@shared/database/queries/db-error.ts";

/** Deletes rate_limits rows not touched since `cutoffIso`. Returns rows deleted. */
export async function deleteStaleRateLimits(cutoffIso: string): Promise<number> {
  const db = getServiceClient();
  const { count, error } = await db
    .from("rate_limits")
    .delete({ count: "exact" })
    .lt("updated_at", cutoffIso);

  if (error) raiseDbError("Failed to delete stale rate_limits rows", error);

  return count ?? 0;
}

/** Reads the current request_count for `key`/`windowStart` without incrementing it. Returns 0 if no row exists. */
export async function getRateLimitCount(key: string, windowStart: number): Promise<number> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("rate_limits")
    .select("request_count")
    .eq("key", key)
    .eq("window_start", windowStart)
    .maybeSingle();

  if (error) raiseDbError("Failed to read rate_limits row", error);

  return data?.request_count ?? 0;
}
