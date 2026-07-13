/**
 * License Service domain types — create result used at complete-onboarding.
 */

export const LICENSE_SOURCES = ["license_service", "dev_stub"] as const;
export type LicenseSource = (typeof LICENSE_SOURCES)[number];

/** Default License Service role for patients (not staff dashboard roles). */
export const DEFAULT_PATIENT_LICENSE_ROLE = "app_member";

/** Input for creating one patient license (from invitation snapshot). */
export interface CreatePatientLicenseInput {
  license_client_id: number;
  license_program_id: number;
  core_api_host: string;
  /** Defaults to app_member. */
  role?: string;
}

/** Normalized license returned by License Service or local dev stub. */
export interface CreatedLicense {
  code: string;
  core_api_host: string;
  license_client_id: number;
  license_program_id: number;
  role: string;
  is_available: boolean;
  source: LicenseSource;
}

/** Row: licenses */
export interface License {
  id: number;
  uuid: string;
  code: string;
  core_api_host: string;
  license_client_id: number;
  license_program_id: number;
  role: string;
  is_available: boolean;
  client_id: string;
  program_id: string;
  invitation_id: number;
  user_id: string;
  source: LicenseSource;
  created_at: string;
}
