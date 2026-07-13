/**
 * Onboarding validators — complete-onboarding
 * Spec: onboarding-doc §6.2
 */

import { z } from "zod";
import type { CompleteOnboardingInput } from "@domain/onboarding.ts";
import type { MarkInvitationActiveQuery } from "@domain/client-program-query.ts";
import { parseSchema } from "@shared/validators/parse-schema.ts";
import { patientPasswordSchema } from "@shared/validators/password.schema.ts";

const invitationTokenSchema = z.string().min(32, "Token is required");

/** POST /api/v1/onboarding/complete-onboarding */
export const completeOnboardingSchema = z
  .object({
    token: invitationTokenSchema,
    password: patientPasswordSchema,
    confirm_password: z.string().min(1, "Confirm password is required"),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  }) satisfies z.ZodType<CompleteOnboardingInput>;

export type CompleteOnboardingPayload = z.infer<typeof completeOnboardingSchema>;

/** POST /onboarding/mark-active — client/program from query (patient JWT). */
export const markInvitationActiveQuerySchema = z.object({
  client_id: z.string().uuid("Must be a valid UUID"),
  program_id: z.string().uuid("Must be a valid UUID"),
}) satisfies z.ZodType<MarkInvitationActiveQuery>;

export type MarkInvitationActiveQueryPayload = z.infer<
  typeof markInvitationActiveQuerySchema
>;

export { parseSchema };
