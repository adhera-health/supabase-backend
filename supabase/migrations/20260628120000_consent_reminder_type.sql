-- Consent-phase reminders use registered_at anchor (separate idempotency from onboarding emails).

ALTER TYPE reminder_delivery_type ADD VALUE IF NOT EXISTS 'email_consent';
