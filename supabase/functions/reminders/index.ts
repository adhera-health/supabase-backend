/**
 * Reminders edge function — scheduled onboarding reminder runs.
 *
 * POST /reminders/run — process due +2h / +48h reminders (cron or manual)
 */

import { assertReminderCronAuth } from "@shared/auth/reminder-cron-auth.ts";
import { requireAnyPermission } from "@shared/auth/authorization.ts";
import { PERMISSIONS } from "@shared/auth/permissions.ts";
import { runDueOnboardingReminders } from "@shared/services/reminder.service.ts";
import { listReminderLogs } from "@shared/database/queries/reminder.query.ts";
import { BadRequestError } from "@shared/utils/errors.ts";
import { createHonoApp } from "@shared/utils/hono.ts";
import type { Context } from "hono";
import { createLogger } from "@shared/utils/logger.ts";
import { success } from "@shared/utils/response.ts";
import {
  listReminderLogsQuerySchema,
  parseSchema,
  runRemindersBodySchema,
} from "@shared/validators/reminder.schema.ts";
import type {
  ListReminderLogsResponse,
  ReminderLogResource,
  RunRemindersResponse,
} from "@domain/reminder.ts";

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

async function handleListReminderLogs(c: Context) {
  const logger = createLogger("reminders");

  const actor = await requireAnyPermission(c.req.header("Authorization"), [
    PERMISSIONS.INVITATIONS_VIEW_ALL,
    PERMISSIONS.INVITATIONS_VIEW_OWN,
  ]);

  const input = parseSchema(listReminderLogsQuerySchema, {
    invitation_id: c.req.query("invitation_id") || undefined,
    page: c.req.query("page"),
    per_page: c.req.query("per_page"),
  });

  logger.info("Listing reminder logs", {
    role: actor.role,
    has_invitation_filter: Boolean(input.invitation_id),
    page: input.page,
  });

  const { rows, total } = await listReminderLogs({
    invitationUuid: input.invitation_id,
    page: input.page,
    perPage: input.per_page,
  });

  const logs: ReminderLogResource[] = rows.map((row) => ({
    invitation_uuid: row.patient_invitations?.uuid ?? "",
    email: row.patient_invitations?.email ?? "",
    reminder_type: row.reminder_type,
    schedule_slot: row.schedule_slot,
    status: row.status,
    scheduled_for: row.scheduled_for,
    sent_at: row.sent_at,
    error_message: row.error_message,
    created_at: row.created_at,
  }));

  const response: ListReminderLogsResponse = {
    logs,
    pagination: {
      page: input.page,
      per_page: input.per_page,
      total,
      total_pages: Math.max(1, Math.ceil(total / input.per_page)),
    },
  };

  return success(response);
}

app.post("/run", handleRunReminders);
app.get("/logs", handleListReminderLogs);

export default app;
