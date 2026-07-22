import type { InvitationAttentionFlagResource } from "@domain/attention.ts";
import type { ApiPagination, InvitationResource } from "@domain/api-response.ts";
import type { InvitationStatus } from "@domain/invitation-status.ts";

export {
  INVITATION_STATUSES,
  type InvitationStatus,
} from "@domain/invitation-status.ts";

/** Row: patient_invitations */
export interface PatientInvitation {
  id: number;
  uuid: string;
  email: string;
  client_id: string;
  program_id: string;
  invited_by_user_id: string;
  status: InvitationStatus;
  latest_token_id: number | null;
  invited_at: string;
  email_opened_at: string | null;
  registered_at: string | null;
  consent_completed_at: string | null;
  activated_at: string | null;
  dropped_out_at: string | null;
  drop_out_reason_id: number | null;
  last_activity_at: string | null;
  license_client_id: number | null;
  license_program_id: number | null;
  core_api_host: string | null;
  created_at: string;
  updated_at: string;
}

/** Row: patient_invitation_tokens */
export interface PatientInvitationToken {
  id: number;
  invitation_id: number;
  token_hash: string;
  expires_at: string;
  consumed_at: string | null;
  superseded_by_token_id: number | null;
  is_active: boolean;
  created_at: string;
}

import type { InvitationEmailContentOverride } from "@domain/email-template.ts";
import type { TenantIdInput } from "@domain/tenant-id.ts";

/** POST /api/v1/invitations — request body */
export interface CreateInvitationInput {
  email: string;
  program_id: TenantIdInput;
  client_id: TenantIdInput;
  email_override?: InvitationEmailContentOverride["email_override"];
}

/** Server-side invitation create (after auth; ids may be UUID or integer). */
export interface CreateInvitationSendInput {
  email: string;
  client_id: TenantIdInput;
  program_id: TenantIdInput;
  invited_by_user_id: string;
}

/** POST /api/v1/invitations/{invitation_id}/resend — optional body */
export type ResendInvitationInput = InvitationEmailContentOverride;

/** POST /api/v1/invitations — response body (inside success.data) */
export type CreateInvitationResponse = {
  invitation: Pick<
    InvitationResource,
    "invitation_uuid" | "email" | "client_id" | "program_id" | "status" | "invited_at"
  >;
};

/** Used when inserting a new invitation (server-side fields) */
export interface CreatePatientInvitationInput {
  email: string;
  client_id: string;
  program_id: string;
  invited_by_user_id: string;
  status?: InvitationStatus;
}

/** Row insert including license snapshot resolved at invite send. */
export interface InsertPatientInvitationRow extends CreatePatientInvitationInput {
  license_client_id: number;
  license_program_id: number;
  core_api_host: string;
}

/** Used when inserting a new token (server-side; hash only, never plaintext) */
export interface NewPatientInvitationToken {
  invitation_id: number;
  token_hash: string;
  expires_at: string;
}

/** GET /api/v1/invitation/validate-token — validates token and records email_opened on first success. */
export type TokenValidationState =
  | "valid"
  | "expired"
  | "consumed"
  | "superseded"
  | "invalid";

/** Patient resume step resolved from invitation status (business vocabulary, not UI routes). */
export type InvitationJourneyNextStep =
  | "welcome"
  | "create_account"
  | "consent"
  | "program_entry"
  | "journey_complete"
  | "blocked";

export interface InvitationJourney {
  next_step: InvitationJourneyNextStep;
}

export interface ValidateTokenQuery {
  token: string;
}

export interface ValidateTokenResult {
  token: {
    state: TokenValidationState;
  };
  invitation?: Pick<
    InvitationResource,
    "invitation_uuid" | "email" | "client_id" | "program_id" | "status"
  >;
  journey: InvitationJourney;
  /** Present when GET validate-token transitions invited_* → email_opened. */
  email_opened_recorded?: boolean;
}

/** POST /api/v1/invitations/{invitation_id}/resend — path param */
export interface ResendInvitationParams {
  invitation_id: string;
}

/** POST /api/v1/invitations/{invitation_id}/resend — response (same as create) */
export type ResendInvitationResponse = CreateInvitationResponse;

/** GET /api/v1/invitations — query params */
export interface ListInvitationsQuery {
  status?: InvitationStatus;
  program_id?: string;
  client_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  page: number;
  per_page: number;
}

/** GET /api/v1/invitations — one row (no internal ids or secrets) */
export type InvitationListItem = InvitationResource & {
  invited_at: string;
  email_opened_at: string | null;
  registered_at: string | null;
  last_activity_at: string | null;
  attention_flags: InvitationAttentionFlagResource[];
};

/** GET /api/v1/invitations — response body */
export interface ListInvitationsResponse {
  invitations: InvitationListItem[];
  pagination: ApiPagination;
}

/** Postgres enum: drop_out_reason_type */
export const DROP_OUT_REASON_TYPES = [
  "voluntary",
  "clinical",
  "technical",
  "other",
] as const;

export type DropOutReasonType = (typeof DROP_OUT_REASON_TYPES)[number];

/** Postgres enum: invitation_dropout_source */
export const INVITATION_DROPOUT_SOURCES = ["staff", "auto"] as const;

export type InvitationDropoutSource = (typeof INVITATION_DROPOUT_SOURCES)[number];

/** Postgres enum: invitation_dropout_failure_stage */
export const INVITATION_DROPOUT_FAILURE_STAGES = [
  "never_clicked",
  "post_click_pre_register",
  "staff_recorded",
] as const;

export type InvitationDropoutFailureStage =
  (typeof INVITATION_DROPOUT_FAILURE_STAGES)[number];

/** Row: drop_out_reasons */
export interface DropOutReason {
  id: number;
  invitation_id: number;
  user_id: string;
  reason_type: DropOutReasonType;
  free_text: string | null;
  created_at: string;
}

/** POST /api/v1/invitations/{invitation_id}/drop-out — path param */
export interface DropOutInvitationParams {
  invitation_id: string;
}

/** POST /api/v1/invitations/{invitation_id}/drop-out — request body */
export interface DropOutInvitationInput {
  reason_type: DropOutReasonType;
  free_text?: string;
}

/** POST /api/v1/invitations/{invitation_id}/drop-out — response body */
export interface DropOutInvitationResponse {
  invitation: Pick<
    InvitationResource,
    "invitation_uuid" | "status"
  > & { dropped_out_at: string };
  drop_out: {
    reason_type: DropOutReasonType;
  };
}

/** GET /api/v1/invitations/{invitation_id}/attention-reasons — path param */
export interface GetInvitationAttentionReasonsParams {
  invitation_id: string;
}

/** GET /api/v1/invitations/{invitation_id} — full detail resource (timeline). */
export interface InvitationDetailResource {
  invitation_uuid: string;
  email: string;
  client_id: string;
  program_id: string;
  status: InvitationStatus;
  invited_at: string;
  email_opened_at: string | null;
  registered_at: string | null;
  consent_completed_at: string | null;
  activated_at: string | null;
  dropped_out_at: string | null;
  last_activity_at: string | null;
}

/** Consent evidence summary shown on the member detail (checkbox model, DEC-3). */
export interface InvitationConsentRecord {
  version: string;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
  withdrawn: boolean;
  withdrawn_at: string | null;
}

/** GET /api/v1/invitations/{invitation_id} — response body */
export interface GetInvitationResponse {
  invitation: InvitationDetailResource;
  attention_flags: InvitationAttentionFlagResource[];
  /** Latest consent record for this invitation, or null if none yet. */
  consent: InvitationConsentRecord | null;
}
