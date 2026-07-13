/**
 * Shared password validation for patient registration.
 */

import { z } from "zod";

/** Minimum bar: 8+ chars with upper, lower, and digit. */
export const patientPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number");
