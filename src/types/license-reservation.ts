/**
 * License reservation domain types.
 */

/**
 * Create License Reservation
 */
export interface CreateLicenseReservationInput {
  user_email: string;
  license_code: string;
}

export interface CreateLicenseReservationResult {
  success: boolean;
  id: number;
  license_code: string;
  user_email: string;
  is_european: boolean;
}

/**
 * Get License Reservation by Email
 */
export interface GetLicenseReservationByEmailInput {
  user_email: string;
}

export interface GetLicenseReservationByEmailResult {
  success: boolean;
  id: number;
  license_code: string | null;
  user_email: string | null;
  is_european: boolean | null;
}

/** License reservation. */
export interface LicenseReservation {
  id: number;
  license_code: string;
  user_email: string;
  is_european: boolean;
  created_at: string;
}
