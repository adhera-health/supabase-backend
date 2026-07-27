/**
 * License reservation validators.
 */

import { z } from "zod";
import type {
  CreateLicenseReservationInput,
  GetLicenseReservationByEmailInput,
} from "@domain/license-reservation.ts";

const emailSchema = z
  .string()
  .trim()
  .email("Must be a valid email address")
  .transform((value: string) => value.toLowerCase());

/** POST /license-reservation */
export const createLicenseReservationSchema = z.object({
  user_email: emailSchema,
  license_code: z.string().trim().min(1, "License code is required")
}) satisfies z.ZodType<CreateLicenseReservationInput>;

export type CreateLicenseReservationPayload = z.infer<typeof createLicenseReservationSchema>;

/** POST /license-reservation/get-by-email */
export const getLicenseReservationByEmailSchema = z.object({
  user_email: emailSchema
}) satisfies z.ZodType<GetLicenseReservationByEmailInput>;

export type GetLicenseReservationByEmailPayload = z.infer<
  typeof getLicenseReservationByEmailSchema
>;
