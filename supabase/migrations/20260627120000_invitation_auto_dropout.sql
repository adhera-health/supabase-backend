-- Auto dropout analytics + staff/auto drop-out reason metadata
-- Spec: invitation lifecycle — never-clicked (72h) and post-click pre-register (48h+ reminders)

CREATE TYPE invitation_dropout_source AS ENUM (
  'staff',
  'auto'
);

CREATE TYPE invitation_dropout_failure_stage AS ENUM (
  'never_clicked',
  'post_click_pre_register',
  'staff_recorded'
);

ALTER TABLE drop_out_reasons
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE drop_out_reasons
  ADD COLUMN dropout_source invitation_dropout_source NOT NULL DEFAULT 'staff';

ALTER TABLE drop_out_reasons
  ADD COLUMN failure_stage invitation_dropout_failure_stage;

COMMENT ON COLUMN drop_out_reasons.dropout_source IS
  'Whether drop-out was recorded by staff or the automated lifecycle cron.';

COMMENT ON COLUMN drop_out_reasons.failure_stage IS
  'Pipeline stage at drop-out; NULL for legacy staff rows before this migration.';

CREATE TABLE invitation_dropouts (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invitation_id      BIGINT NOT NULL REFERENCES patient_invitations (id) ON DELETE CASCADE,
  drop_out_reason_id BIGINT NOT NULL REFERENCES drop_out_reasons (id) ON DELETE CASCADE,
  failure_stage      invitation_dropout_failure_stage NOT NULL,
  dropout_source     invitation_dropout_source NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE invitation_dropouts IS
  'Analytics record for each invitation drop-out (staff or auto).';

CREATE UNIQUE INDEX idx_invitation_dropouts_invitation_id
  ON invitation_dropouts (invitation_id);

CREATE INDEX idx_invitation_dropouts_failure_stage
  ON invitation_dropouts (failure_stage);
