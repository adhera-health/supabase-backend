/**
 * Onboarding types — Feature 1: complete-onboarding
 * Spec: onboarding-doc §4.1, §6.2
 */

import type {
  InvitationResource,
  SessionResource,
  UserResource,
} from "@domain/api-response.ts";
import type { LicenseSource } from "@domain/license.ts";

/** Row: onboarding_assignments */
export interface OnboardingAssignment {
  id: number;
  user_id: string;
  invitation_id: number;
  client_id: string;
  program_id: string;
  license_id: number | null;
  assigned_at: string;
  created_at: string;
}

/** POST /api/v1/onboarding/complete-onboarding — request body */
export interface CompleteOnboardingInput {
  token: string;
  password: string;
  confirm_password: string;
}

/** POST /api/v1/onboarding/complete-onboarding — response body */
export interface CompleteOnboardingResponse {
  user: UserResource;
  session: SessionResource;
  invitation: Pick<
    InvitationResource,
    "invitation_uuid" | "client_id" | "program_id" | "status"
  > & {
    registered_at: string;
  };
  onboarding: {
    assigned_at: string;
  };
}

/**
 * Service result for complete-onboarding.
 * `license` is for route audit only — never include code, never send in HTTP body as-is without stripping.
 */
export interface CompleteOnboardingResult {
  response: CompleteOnboardingResponse;
  /** Present on first-time complete (not resume). No license code. */
  license?: {
    source: LicenseSource;
    license_client_id: number;
    license_program_id: number;
  };
}

/** POST /onboarding/mark-active — response (patient first program use) */
export interface MarkInvitationActiveResponse {
  invitation: Pick<
    InvitationResource,
    "invitation_uuid" | "client_id" | "program_id" | "status"
  > & {
    activated_at: string;
    last_activity_at: string;
  };
}
