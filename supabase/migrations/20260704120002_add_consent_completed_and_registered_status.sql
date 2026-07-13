-- Post-consent pipeline status (consent accepted + patient registered for program).

ALTER TYPE invitation_status ADD VALUE IF NOT EXISTS 'consent_completed_and_registered';
