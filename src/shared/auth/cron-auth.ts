/**
 * Cron / internal auth for scheduled maintenance runs (reminders, rate limit
 * cleanup, ...).
 */

import { ForbiddenError, UnauthorizedError, AppError } from "@shared/utils/errors.ts";
import type { Context } from "hono";

const CRON_SECRET_HEADER = "x-cron-secret";

export function assertCronAuth(c: Context): void {
  const configuredSecret = Deno.env.get("CRON_SECRET")?.trim();
  const isProduction = Deno.env.get("ENVIRONMENT") === "production";

  if (!configuredSecret) {
    if (isProduction) {
      throw new AppError("CRON_SECRET is required in production", {
        statusCode: 500,
        code: "INTERNAL_ERROR",
      });
    }
    return;
  }

  const bearer = c.req.header("Authorization")?.trim();
  const headerSecret = c.req.header(CRON_SECRET_HEADER)?.trim();

  const providedSecret = headerSecret ??
    (bearer?.startsWith("Bearer ") ? bearer.slice("Bearer ".length).trim() : undefined);

  if (!providedSecret) {
    throw new UnauthorizedError("Missing cron credentials");
  }

  if (providedSecret !== configuredSecret) {
    throw new ForbiddenError("Invalid cron credentials");
  }
}
