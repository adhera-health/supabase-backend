/**
 * License reservation validators — Feature 1: Send invitation
 * Spec: onboarding-doc §6.1
 */

import { z } from "zod";
import { parseSchema } from "@shared/validators/parse-schema.ts";
import type {
  CreateLicenseReservationInput,
} from "@domain/license-reservation.ts";

const emailSchema = z
  .string()
  .trim()
  .email("Must be a valid email address")
  .transform((value: string) => value.toLowerCase());

/** POST /api/v1/license-reservation */
export const createLicenseReservationSchema = z.object({
  user_email: emailSchema,
  license_code: z.string().trim().min(1, "License code is required"),
}) satisfies z.ZodType<CreateLicenseReservationInput>;

export type CreateLicenseReservationPayload = z.infer<typeof createLicenseReservationSchema>;

/** GET /license-reservation-by-email/ */
export const getLicenseReservationByEmailSchema = z.object({
  user_email: emailSchema,
});

export type GetLicenseReservationByEmailPayload = z.infer<
  typeof getLicenseReservationByEmailSchema
>;

function emptyToUndefined(value: string | undefined): string | undefined {
  if (value === undefined || value === "") return undefined;
  return value;
}

export { emptyToUndefined, parseSchema };
