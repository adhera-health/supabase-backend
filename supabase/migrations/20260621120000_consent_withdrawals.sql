-- Feature 4: Withdraw consent
-- Table: consent_withdrawals
-- Spec: docs/onboarding-doc.md §4.1, §6.2, §8

CREATE TABLE consent_withdrawals (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id               UUID NOT NULL,
  invitation_id         BIGINT NOT NULL REFERENCES patient_invitations (id) ON DELETE RESTRICT,
  user_consent_id       BIGINT NOT NULL REFERENCES user_consents (id) ON DELETE RESTRICT,
  consent_document_id   BIGINT NOT NULL REFERENCES consent_documents (id) ON DELETE RESTRICT,
  withdrawn_at          TIMESTAMPTZ NOT NULL,
  ip_address            TEXT,
  user_agent            TEXT,
  reason                TEXT,
  evidence_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE consent_withdrawals IS
  'Immutable withdrawal evidence records (§4.1, §8).';

-- One withdrawal record per invitation
CREATE UNIQUE INDEX idx_consent_withdrawals_invitation
  ON consent_withdrawals (invitation_id);

CREATE INDEX idx_consent_withdrawals_user_id
  ON consent_withdrawals (user_id);

CREATE INDEX idx_consent_withdrawals_consent_document_id
  ON consent_withdrawals (consent_document_id);
