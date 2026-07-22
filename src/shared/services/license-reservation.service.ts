/**
 * License reservations.
 */

import { AppError } from "@shared/utils/errors.ts";
import { createLogger } from "@shared/utils/logger.ts";
import { 
  createLicenseReservationRow,
  getLicenseReservationByEmailRow
} from "../database/queries/license-reservations.query.ts";
import type {
  CreateLicenseReservationInput,
  CreateLicenseReservationResult,
  GetLicenseReservationByEmailInput,
  GetLicenseReservationByEmailResult,
  LicenseReservation,
} from "@domain/license-reservation.ts";

const logger = createLogger("license-reservation");

const TOKEN_TTL_HOURS = 72;

export async function createLicenseReservation(
  input: CreateLicenseReservationInput
): Promise<CreateLicenseReservationResult> 
{
  const dbInput: CreateLicenseReservationInput = {
    user_email: input.user_email,
    license_code: input.license_code,
  };

  const license_reservation = await createLicenseReservationRow({
    ...dbInput
  });

  return {
    success: true,
    id: license_reservation.id,
    license_code: license_reservation.license_code,
    user_email: license_reservation.user_email,
    is_european: license_reservation.is_european,
  };
}

export async function getLicenseReservationByEmail(
  input: GetLicenseReservationByEmailInput
): Promise<GetLicenseReservationByEmailResult> 
{
  const dbInput: GetLicenseReservationByEmailInput = {
    user_email: input.user_email
  };

  const license_reservation = await getLicenseReservationByEmailRow({
    ...dbInput
  });

  return {
    success: true,
    id: license_reservation.id,
    license_code: license_reservation.license_code,
    user_email: license_reservation.user_email,
    is_european: license_reservation.is_european,
  };
}
