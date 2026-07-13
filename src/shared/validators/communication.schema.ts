/**
 * Communication validators — Phase 1: opt-out
 * Spec: onboarding-doc §6.2
 */

import { z } from "zod";
import { parseSchema } from "@shared/validators/parse-schema.ts";
import {
  COMMUNICATION_OPT_OUT_CHANNELS,
  type OptOutCommunicationInput,
} from "@domain/reminder.ts";

const uuidSchema = z.string().uuid("Must be a valid UUID");

/** POST /patient-opt-out-email-reminders/opt-out */
export const optOutCommunicationSchema = z
  .object({
    invitation_id: uuidSchema.optional(),
    user_id: uuidSchema.optional(),
    opt_out_token: z.string().min(16).optional(),
    channel: z.enum(COMMUNICATION_OPT_OUT_CHANNELS, {
      errorMap: () => ({ message: "channel must be email or all" }),
    }),
  })
  .superRefine((value, ctx) => {
    const identifiers = [
      value.invitation_id !== undefined,
      value.user_id !== undefined,
      value.opt_out_token !== undefined,
    ].filter(Boolean).length;

    if (identifiers !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of invitation_id, user_id, or opt_out_token",
        path: ["opt_out_token"],
      });
    }
  }) satisfies z.ZodType<OptOutCommunicationInput>;

export type OptOutCommunicationPayload = z.infer<typeof optOutCommunicationSchema>;

export { parseSchema };
