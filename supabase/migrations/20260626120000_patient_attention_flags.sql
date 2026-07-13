-- Phase A: professional dashboard attention flags (PRD §12 +24h, §14)
-- Invitation lifecycle support: last_activity_at for dashboard list

-- -----------------------------------------------------------------------------
-- patient_attention_flags — staff "needs follow-up" markers per invitation
-- -----------------------------------------------------------------------------

CREATE TYPE patient_attention_flag_type AS ENUM (
  'not_registered_24h',
  'no_consent_24h'
);

CREATE TYPE patient_attention_flag_severity AS ENUM (
  'warning',
  'critical'
);

CREATE TABLE patient_attention_flags (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invitation_id        BIGINT NOT NULL REFERENCES patient_invitations (id) ON DELETE CASCADE,
  flag_type            patient_attention_flag_type NOT NULL,
  severity             patient_attention_flag_severity NOT NULL DEFAULT 'warning',
  detected_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at          TIMESTAMPTZ,
  resolved_by_user_id  UUID,
  metadata_json        JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE patient_attention_flags IS
  'Dashboard attention flags: not registered after 24h, no consent after 24h (PRD §14).';

CREATE UNIQUE INDEX idx_patient_attention_flags_active_unique
  ON patient_attention_flags (invitation_id, flag_type)
  WHERE resolved_at IS NULL;

CREATE INDEX idx_patient_attention_flags_invitation_id
  ON patient_attention_flags (invitation_id);

CREATE INDEX idx_patient_attention_flags_unresolved
  ON patient_attention_flags (detected_at)
  WHERE resolved_at IS NULL;

-- -----------------------------------------------------------------------------
-- patient_invitations.last_activity_at — dashboard "last activity" column
-- -----------------------------------------------------------------------------

ALTER TABLE patient_invitations
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

COMMENT ON COLUMN patient_invitations.last_activity_at IS
  'Last program activity timestamp; updated on mark-active and future activity hooks.';
