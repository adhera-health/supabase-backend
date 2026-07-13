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

export { parseSchema };
