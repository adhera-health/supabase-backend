/**
 * Cron / internal auth for scheduled reminder runs.
 */

import { timingSafeEqualStrings } from "@shared/utils/secret-compare.ts";
import { ForbiddenError, UnauthorizedError, AppError } from "@shared/utils/errors.ts";
import type { Context } from "hono";

const CRON_SECRET_HEADER = "x-reminder-cron-secret";

/**
 * Guards `POST /reminders/run` with a shared secret.
 *
 * Fails closed in every environment (SEC-03): a missing secret is a 500, never an
 * open door. This route triggers a batch patient email send, so an unconfigured
 * secret previously let anyone fire it outside production.
 */
export async function assertReminderCronAuth(c: Context): Promise<void> {
  const configuredSecret = Deno.env.get("REMINDER_CRON_SECRET")?.trim();

  if (!configuredSecret) {
    throw new AppError(
      "REMINDER_CRON_SECRET is not configured. This route is unavailable until it is set.",
      { statusCode: 500, code: "INTERNAL_ERROR" },
    );
  }

  const bearer = c.req.header("Authorization")?.trim();
  const headerSecret = c.req.header(CRON_SECRET_HEADER)?.trim();

  const providedSecret = headerSecret ??
    (bearer?.startsWith("Bearer ") ? bearer.slice("Bearer ".length).trim() : undefined);

  if (!providedSecret) {
    throw new UnauthorizedError("Missing reminder cron credentials");
  }

  if (!await timingSafeEqualStrings(providedSecret, configuredSecret)) {
    throw new ForbiddenError("Invalid reminder cron credentials");
  }
}
