-- Step 1: add new pipeline status (must commit before use in data updates).

ALTER TYPE invitation_status ADD VALUE IF NOT EXISTS 'onboarding_completed';
