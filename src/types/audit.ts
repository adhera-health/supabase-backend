/**
 * Audit log types — append-only critical action trail.
 */

export const INVITATION_AUDIT_ACTIONS = [
  "invitation_sent",
  "invitation_resent",
  "email_opened",
  "drop_out_recorded",
  "auto_drop_out"
] as const;

export type InvitationAuditAction = (typeof INVITATION_AUDIT_ACTIONS)[number];

export const ONBOARDING_AUDIT_ACTIONS = [
  "registration_completed",
  "license_created",
  "consent_document_viewed",
  "consent_completed",
  "consent_withdrawn",
  "consent_document_uploaded",
  "consent_document_activated",
  "invitation_activated",
] as const;

export type OnboardingAuditAction = (typeof ONBOARDING_AUDIT_ACTIONS)[number];

export const COMMUNICATION_AUDIT_ACTIONS = [
  "communication_opt_out",
] as const;

export type CommunicationAuditAction = (typeof COMMUNICATION_AUDIT_ACTIONS)[number];

export const USER_AUDIT_ACTIONS = [
  "user_created",
  "user_deleted",
  "user_role_updated",
] as const;

export type UserAuditAction = (typeof USER_AUDIT_ACTIONS)[number];

export interface AuditLogRow {
  id: number;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_user_id: string | null;
  actor_ip: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

export interface InsertAuditLogInput {
  entity_type: string;
  entity_id: string;
  action: string;
  actor_user_id?: string | null;
  actor_ip?: string | null;
  metadata_json?: Record<string, unknown> | null;
}

export const LICENSE_AUDIT_ACTIONS = [
  "license_reserved",
  "license_reservation_obtained"
] as const;

export type LicenseAuditAction = (typeof LICENSE_AUDIT_ACTIONS)[number];
