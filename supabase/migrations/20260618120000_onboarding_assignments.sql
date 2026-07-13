-- Feature 1: Complete onboarding
-- Table: onboarding_assignments
-- Spec: docs/onboarding-doc.md §4.1

CREATE TABLE onboarding_assignments (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        UUID NOT NULL,
  invitation_id  BIGINT NOT NULL REFERENCES patient_invitations (id) ON DELETE RESTRICT,
  hospital_id    UUID NOT NULL,
  program_id     UUID NOT NULL,
  license_id     UUID NOT NULL,
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE onboarding_assignments IS
  'Binds authenticated user to invitation/hospital/program/license after complete-onboarding (§4.1).';

COMMENT ON COLUMN onboarding_assignments.license_id IS
  'Auto-assigned license. Replace with license service lookup when license tables exist.';

CREATE UNIQUE INDEX idx_onboarding_assignments_invitation_id
  ON onboarding_assignments (invitation_id);

CREATE INDEX idx_onboarding_assignments_user_id
  ON onboarding_assignments (user_id);
