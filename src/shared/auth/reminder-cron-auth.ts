/**
 * Cron / internal auth for scheduled reminder runs.
 */

import { ForbiddenError, UnauthorizedError, AppError } from "@shared/utils/errors.ts";
import type { Context } from "hono";

const CRON_SECRET_HEADER = "x-reminder-cron-secret";

export function assertReminderCronAuth(c: Context): void {
  const configuredSecret = Deno.env.get("REMINDER_CRON_SECRET")?.trim();
  const isProduction = Deno.env.get("ENVIRONMENT") === "production";

  if (!configuredSecret) {
    if (isProduction) {
      throw new AppError("REMINDER_CRON_SECRET is required in production", {
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
    throw new UnauthorizedError("Missing reminder cron credentials");
  }

  if (providedSecret !== configuredSecret) {
    throw new ForbiddenError("Invalid reminder cron credentials");
  }
}
