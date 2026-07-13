-- Feature 3: Sign consent
-- Table: user_consents
-- Spec: docs/onboarding-doc.md §4.1, §8

CREATE TABLE user_consents (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id               UUID NOT NULL,
  invitation_id         BIGINT NOT NULL REFERENCES patient_invitations (id) ON DELETE RESTRICT,
  consent_document_id   BIGINT NOT NULL REFERENCES consent_documents (id) ON DELETE RESTRICT,
  accepted_at           TIMESTAMPTZ NOT NULL,
  ip_address            TEXT,
  user_agent            TEXT,
  signature_storage_path TEXT NOT NULL,
  signature_hash        TEXT NOT NULL,
  evidence_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_withdrawn          BOOLEAN NOT NULL DEFAULT false,
  withdrawn_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE user_consents IS
  'Append-only consent evidence records (§4.1, §8).';

COMMENT ON COLUMN user_consents.signature_storage_path IS
  'Storage path for signature artifact; inline placeholder until object storage is wired.';

-- One active (non-withdrawn) consent per invitation
CREATE UNIQUE INDEX idx_user_consents_invitation_active
  ON user_consents (invitation_id)
  WHERE is_withdrawn = false;

CREATE INDEX idx_user_consents_user_id
  ON user_consents (user_id);

CREATE INDEX idx_user_consents_consent_document_id
  ON user_consents (consent_document_id);
