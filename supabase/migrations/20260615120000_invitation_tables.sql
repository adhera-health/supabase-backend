-- Feature 1: Send invitation
-- Tables: patient_invitations, patient_invitation_tokens
-- Spec: docs/onboarding-doc.md §4.1, §4.2, §5

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

CREATE TYPE invitation_status AS ENUM (
  'invited_lt_24h',
  'invited_24_48h',
  'invited_gt_48h',
  'email_opened',
  'registered',
  'consent_completed',
  'active',
  'dropped_out_voluntary',
  'dropped_out_clinical',
  'dropped_out_technical',
  'dropped_out_other',
  'consent_withdrawn',
  'expired',
  'cancelled'
);

-- -----------------------------------------------------------------------------
-- patient_invitations
-- -----------------------------------------------------------------------------

CREATE TABLE patient_invitations (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uuid                 UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  email                TEXT NOT NULL,
  hospital_id          UUID NOT NULL,
  program_id           UUID NOT NULL,
  invited_by_user_id   UUID NOT NULL,
  status               invitation_status NOT NULL DEFAULT 'invited_lt_24h',
  latest_token_id      BIGINT,
  invited_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  email_opened_at      TIMESTAMPTZ,
  registered_at        TIMESTAMPTZ,
  consent_completed_at TIMESTAMPTZ,
  activated_at         TIMESTAMPTZ,
  dropped_out_at       TIMESTAMPTZ,
  drop_out_reason_id   BIGINT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE patient_invitations IS
  'Patient recruitment invitations. Status should align with timestamp fields (§5).';

COMMENT ON COLUMN patient_invitations.drop_out_reason_id IS
  'FK to drop_out_reasons added when that table is created (drop-out feature).';

-- One active pipeline invitation per email + program + hospital (§4.2)
CREATE UNIQUE INDEX idx_patient_invitations_unique_active
  ON patient_invitations (lower(email), program_id, hospital_id)
  WHERE status NOT IN (
    'cancelled',
    'expired',
    'active',
    'dropped_out_voluntary',
    'dropped_out_clinical',
    'dropped_out_technical',
    'dropped_out_other',
    'consent_withdrawn'
  );

CREATE INDEX idx_patient_invitations_status_invited_at
  ON patient_invitations (status, invited_at);

CREATE INDEX idx_patient_invitations_email
  ON patient_invitations (lower(email));

-- -----------------------------------------------------------------------------
-- patient_invitation_tokens
-- Only token_hash stored — never plaintext (§4.2). TTL enforced in app: 72h.
-- -----------------------------------------------------------------------------

CREATE TABLE patient_invitation_tokens (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invitation_id          BIGINT NOT NULL REFERENCES patient_invitations (id) ON DELETE CASCADE,
  token_hash             TEXT NOT NULL,
  expires_at             TIMESTAMPTZ NOT NULL,
  consumed_at            TIMESTAMPTZ,
  superseded_by_token_id BIGINT,
  is_active              BOOLEAN NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE patient_invitation_tokens IS
  'Hashed invitation tokens only; never store plaintext tokens (§4.2).';

CREATE INDEX idx_patient_invitation_tokens_expires_active
  ON patient_invitation_tokens (expires_at, is_active);

CREATE INDEX idx_patient_invitation_tokens_invitation_id
  ON patient_invitation_tokens (invitation_id);

CREATE UNIQUE INDEX idx_patient_invitation_tokens_one_active_per_invitation
  ON patient_invitation_tokens (invitation_id)
  WHERE is_active = true;

ALTER TABLE patient_invitation_tokens
  ADD CONSTRAINT fk_tokens_superseded_by
  FOREIGN KEY (superseded_by_token_id)
  REFERENCES patient_invitation_tokens (id);

ALTER TABLE patient_invitations
  ADD CONSTRAINT fk_invitations_latest_token
  FOREIGN KEY (latest_token_id)
  REFERENCES patient_invitation_tokens (id);

-- -----------------------------------------------------------------------------
-- updated_at trigger
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_patient_invitations_updated_at
  BEFORE UPDATE ON patient_invitations
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
