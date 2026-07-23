/**
 * License reservation database queries (data-access layer only).
 */

import { getServiceClient } from "@shared/database/client.ts";
import { NotFoundError } from "@shared/utils/errors.ts";
import { raiseDbError } from "@shared/database/queries/db-error.ts";
import type {
  CreateLicenseReservationInput,
  GetLicenseReservationByEmailInput,
  LicenseReservation,
} from "@domain/license-reservation.ts";


export async function createLicenseReservationRow(
  input: CreateLicenseReservationInput,
): Promise<LicenseReservation> 
{

  const db = getServiceClient();
  const { data, error } = await db
    .from("license_reservations")
    .upsert(
      {
        user_email: input.user_email,
        license_code: input.license_code,
        is_european: false,
      },
      { onConflict: "user_email" },
    )
    .select()
    .maybeSingle();

    if (error) {
      raiseDbError("Failed to create or fetch license reservation", error);
    }
    
    if (!data) {
      throw new NotFoundError("License reservation could not be created or was not found");
    }

  return data as LicenseReservation;
}

export async function getLicenseReservationByEmailRow(
  input: GetLicenseReservationByEmailInput,
): Promise<LicenseReservation> 
{
  const db = getServiceClient();
  const { data, error } = await db
    .from("license_reservations")
    .select()
    .eq("user_email", input.user_email)
    .single();

    if (error) {
      raiseDbError("Failed to fetch license reservation", error);
    }

  return data as LicenseReservation;
}