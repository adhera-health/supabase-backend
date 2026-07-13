/** Postgres enum: invitation_status */
export const INVITATION_STATUSES = [
  "invited_lt_24h",
  "invited_24_48h",
  "invited_gt_48h",
  "email_opened",
  "onboarding_completed",
  "consent_viewed",
  "consent_completed_and_registered",
  "registered",
  "active",
  "dropped_out_voluntary",
  "dropped_out_clinical",
  "dropped_out_technical",
  "dropped_out_other",
  "consent_withdrawn",
  "expired",
  "cancelled",
] as const;

export type InvitationStatus = (typeof INVITATION_STATUSES)[number];
