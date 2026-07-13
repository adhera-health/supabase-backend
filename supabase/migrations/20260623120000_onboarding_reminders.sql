-- Phase 1 Step A: reminder logs + communication opt-outs
-- Spec: docs/onboarding-doc.md §4.1, §9

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

CREATE TYPE reminder_delivery_type AS ENUM (
  'email',
  'dashboard_flag'
);

CREATE TYPE reminder_schedule_slot AS ENUM (
  '2h',
  '24h',
  '48h'
);

CREATE TYPE reminder_log_status AS ENUM (
  'pending',
  'sent',
  'skipped',
  'failed'
);

CREATE TYPE communication_opt_out_channel AS ENUM (
  'email',
  'all'
);

-- -----------------------------------------------------------------------------
-- onboarding_reminder_logs
-- Idempotency: one row per (invitation_id, reminder_type, schedule_slot).
-- -----------------------------------------------------------------------------

CREATE TABLE onboarding_reminder_logs (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invitation_id   BIGINT NOT NULL REFERENCES patient_invitations (id) ON DELETE RESTRICT,
  reminder_type   reminder_delivery_type NOT NULL,
  schedule_slot   reminder_schedule_slot NOT NULL,
  scheduled_for   TIMESTAMPTZ NOT NULL,
  sent_at         TIMESTAMPTZ,
  status          reminder_log_status NOT NULL DEFAULT 'pending',
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE onboarding_reminder_logs IS
  'Reminder delivery attempts. One row per invitation + type + schedule slot (§9).';

CREATE UNIQUE INDEX idx_onboarding_reminder_logs_idempotency
  ON onboarding_reminder_logs (invitation_id, reminder_type, schedule_slot);

CREATE INDEX idx_onboarding_reminder_logs_pending_schedule
  ON onboarding_reminder_logs (status, scheduled_for)
  WHERE status = 'pending';

CREATE INDEX idx_onboarding_reminder_logs_invitation_id
  ON onboarding_reminder_logs (invitation_id);

-- -----------------------------------------------------------------------------
-- communication_opt_outs
-- -----------------------------------------------------------------------------

CREATE TABLE communication_opt_outs (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invitation_id   BIGINT NOT NULL REFERENCES patient_invitations (id) ON DELETE RESTRICT,
  user_id         UUID,
  channel         communication_opt_out_channel NOT NULL,
  opted_out_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE communication_opt_outs IS
  'Patient communication opt-outs per invitation (§6.2, §9). Stops reminder delivery.';

CREATE UNIQUE INDEX idx_communication_opt_outs_invitation_channel
  ON communication_opt_outs (invitation_id, channel);

CREATE INDEX idx_communication_opt_outs_invitation_id
  ON communication_opt_outs (invitation_id);

CREATE INDEX idx_communication_opt_outs_user_id
  ON communication_opt_outs (user_id)
  WHERE user_id IS NOT NULL;
