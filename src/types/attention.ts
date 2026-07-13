/**
 * Patient attention flags — Phase A dashboard alerts (PRD §14).
 */

/** Postgres enum: patient_attention_flag_type */
export const PATIENT_ATTENTION_FLAG_TYPES = [
  "not_registered_24h",
  "no_consent_24h",
] as const;

export type PatientAttentionFlagType = (typeof PATIENT_ATTENTION_FLAG_TYPES)[number];

/** Postgres enum: patient_attention_flag_severity */
export const PATIENT_ATTENTION_FLAG_SEVERITIES = ["warning", "critical"] as const;

export type PatientAttentionFlagSeverity =
  (typeof PATIENT_ATTENTION_FLAG_SEVERITIES)[number];

/** Row: patient_attention_flags */
export interface PatientAttentionFlag {
  id: number;
  invitation_id: number;
  flag_type: PatientAttentionFlagType;
  severity: PatientAttentionFlagSeverity;
  detected_at: string;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

/** Public API shape for one active attention flag. */
export interface InvitationAttentionFlagResource {
  flag_type: PatientAttentionFlagType;
  severity: PatientAttentionFlagSeverity;
  detected_at: string;
}

/** GET /invitations/:invitation_id/attention-reasons — response */
export interface GetInvitationAttentionReasonsResponse {
  invitation_uuid: string;
  attention_flags: InvitationAttentionFlagResource[];
}

/** Counts from POST /reminders/run invitation lifecycle sync (Phase A). */
export interface InvitationLifecycleRunSummary {
  as_of: string;
  statuses_updated: number;
  invitations_auto_dropped_out: number;
  attention_flags_created: number;
  attention_flags_resolved: number;
}
