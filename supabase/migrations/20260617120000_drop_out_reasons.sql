-- Feature 5: Drop out invitation
-- Table: drop_out_reasons
-- Spec: docs/onboarding-doc.md §6.1

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

CREATE TYPE drop_out_reason_type AS ENUM (
  'voluntary',
  'clinical',
  'technical',
  'other'
);

-- -----------------------------------------------------------------------------
-- drop_out_reasons
-- -----------------------------------------------------------------------------

CREATE TABLE drop_out_reasons (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invitation_id  BIGINT NOT NULL REFERENCES patient_invitations (id) ON DELETE CASCADE,
  user_id        UUID NOT NULL,
  reason_type    drop_out_reason_type NOT NULL,
  free_text      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE drop_out_reasons IS
  'Records why a patient invitation was marked as dropped out (§6.1).';

CREATE INDEX idx_drop_out_reasons_invitation_id
  ON drop_out_reasons (invitation_id);

ALTER TABLE patient_invitations
  ADD CONSTRAINT fk_invitations_drop_out_reason
  FOREIGN KEY (drop_out_reason_id)
  REFERENCES drop_out_reasons (id);
