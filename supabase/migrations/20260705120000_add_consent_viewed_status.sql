-- Patient opened the active consent document (GET consents/latest) but has not accepted yet.
-- Enum value must be committed before use; see 20260705120001_restore_tokens_for_consent_viewed.sql.

ALTER TYPE invitation_status ADD VALUE IF NOT EXISTS 'consent_viewed';
