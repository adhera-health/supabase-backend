/**
 * Rate limits cleanup edge function — scheduled maintenance run.
 *
 * POST /rate-limits-cleanup/run — delete rate_limits rows past retention (cron or manual)
 */

import { assertCronAuth } from "@shared/auth/cron-auth.ts";
import { cleanupStaleRateLimits } from "@shared/services/rate-limit-cleanup.service.ts";
import { createHonoApp } from "@shared/utils/hono.ts";
import type { Context } from "hono";
import { createLogger } from "@shared/utils/logger.ts";
import { success } from "@shared/utils/response.ts";
import type { CleanupRateLimitsResponse } from "@domain/rate-limit.ts";

const FUNCTION_NAME = "rate-limits-cleanup";

const app = createHonoApp().basePath(`/${FUNCTION_NAME}`);

async function handleRunCleanup(c: Context) {
  const logger = createLogger("rate-limits-cleanup");

  assertCronAuth(c);

  const cleanup = await cleanupStaleRateLimits();

  logger.info("Rate limits cleanup finished", { ...cleanup });

  const response: CleanupRateLimitsResponse = { cleanup };

  return success(response);
}

app.post("/run", handleRunCleanup);

export default app;
