-- Use consent_completed_and_registered instead of consent_completed for invitation status.

UPDATE patient_invitations
SET status = 'consent_completed_and_registered'
WHERE status = 'consent_completed';

UPDATE patient_invitations
SET status = 'consent_completed_and_registered'
WHERE status = 'registered'
  AND consent_completed_at IS NOT NULL;
