-- Keep invite tokens restorable for in-progress invitations (includes consent_viewed).
-- Separate migration: consent_viewed enum value must exist before this UPDATE runs.

UPDATE patient_invitation_tokens t
SET
  consumed_at = NULL,
  is_active = true
FROM patient_invitations i
WHERE t.id = i.latest_token_id
  AND t.invitation_id = i.id
  AND i.status IN ('onboarding_completed', 'consent_viewed', 'consent_completed_and_registered')
  AND t.consumed_at IS NOT NULL;
