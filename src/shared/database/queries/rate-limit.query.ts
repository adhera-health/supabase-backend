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
