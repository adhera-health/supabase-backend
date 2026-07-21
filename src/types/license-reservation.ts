/**
 * License Service domain types — create result used at complete-onboarding.
 */

export const LICENSE_SOURCES = ["license_service", "dev_stub"] as const;
export type LicenseSource = (typeof LICENSE_SOURCES)[number];

/** Default License Service role for patients (not staff dashboard roles). */
export const DEFAULT_PATIENT_LICENSE_ROLE = "app_member";


/**
 * Create License Reservation
 */
export interface CreateLicenseReservationInput {
  user_email: string;
  license_code: string;
}

export interface CreateLicenseReservationResult {
  success: boolean;
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
