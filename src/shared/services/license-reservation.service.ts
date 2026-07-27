/**
 * License reservations.
 */

import {
  createLicenseReservationRow,
  getLicenseReservationByEmailRow,
} from "@shared/database/queries/license-reservations.query.ts";
import type {
  CreateLicenseReservationInput,
  CreateLicenseReservationResult,
  GetLicenseReservationByEmailInput,
  GetLicenseReservationByEmailResult,
} from "@domain/license-reservation.ts";

export async function createLicenseReservation(
  input: CreateLicenseReservationInput,
): Promise<CreateLicenseReservationResult> {
  const license_reservation = await createLicenseReservationRow(input);

  return {
    success: true,
    id: license_reservation.id,
    license_code: license_reservation.license_code,
    user_email: license_reservation.user_email,
    is_european: license_reservation.is_european,
  };
}

export async function getLicenseReservationByEmail(
  input: GetLicenseReservationByEmailInput,
): Promise<GetLicenseReservationByEmailResult> {
  const license_reservation = await getLicenseReservationByEmailRow(input);

  return {
    success: true,
    id: license_reservation.id,
    license_code: license_reservation.license_code,
    user_email: license_reservation.user_email,
    is_european: license_reservation.is_european,
  };
}
