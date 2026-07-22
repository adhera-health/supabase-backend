/**
 * Reminder job validators — Phase 1 Step D.
 */

import { z } from "zod";
import { parseSchema } from "@shared/validators/parse-schema.ts";

const uuidSchema = z.string().uuid("Must be a valid UUID");

/** POST /api/v1/reminders/run — optional body for targeted dev/cron runs */
export const runRemindersBodySchema = z.object({
  invitation_uuid: uuidSchema.optional(),
});

export type RunRemindersBodyPayload = z.infer<typeof runRemindersBodySchema>;

/** GET /reminders/logs — query params */
export const listReminderLogsQuerySchema = z.object({
  invitation_id: uuidSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListReminderLogsQueryPayload = z.output<
  typeof listReminderLogsQuerySchema
>;

export { parseSchema };
