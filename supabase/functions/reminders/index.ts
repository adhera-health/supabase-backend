/**
 * Reminders edge function — scheduled onboarding reminder runs.
 *
 * POST /reminders/run — process due +2h / +48h reminders (cron or manual)
 */

import { assertReminderCronAuth } from "@shared/auth/reminder-cron-auth.ts";
import { runDueOnboardingReminders } from "@shared/services/reminder.service.ts";
import { BadRequestError } from "@shared/utils/errors.ts";
import { createHonoApp } from "@shared/utils/hono.ts";
import type { Context } from "hono";
import { createLogger } from "@shared/utils/logger.ts";
import { success } from "@shared/utils/response.ts";
import {
  parseSchema,
  runRemindersBodySchema,
} from "@shared/validators/reminder.schema.ts";
import type { RunRemindersResponse } from "@domain/reminder.ts";

const FUNCTION_NAME = "reminders";

const app = createHonoApp().basePath(`/${FUNCTION_NAME}`);

async function handleRunReminders(c: Context) {
  const logger = createLogger("reminders");

  assertReminderCronAuth(c);

  let body: unknown = {};
  if (c.req.header("content-length") && c.req.header("content-length") !== "0") {
    try {
      body = await c.req.json();
    } catch {
      throw new BadRequestError("Invalid JSON body");
    }
  }

  const input = parseSchema(runRemindersBodySchema, body);

  logger.info("Starting reminder run", {
    has_invitation_uuid: Boolean(input.invitation_uuid),
  });

  const summary = await runDueOnboardingReminders({
    invitationUuid: input.invitation_uuid,
  });

  logger.info("Reminder run finished", summary.counts);

  const response: RunRemindersResponse = { run: summary };

  return success(response);
}

app.post("/run", handleRunReminders);

export default app;
