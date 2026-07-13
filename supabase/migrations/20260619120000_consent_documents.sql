-- Feature 2: Get latest consent
-- Table: consent_documents
-- Spec: docs/onboarding-doc.md §4.1

CREATE TABLE consent_documents (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hospital_id          UUID NOT NULL,
  program_id           UUID NOT NULL,
  version              TEXT NOT NULL,
  document_url         TEXT NOT NULL,
  document_hash        TEXT NOT NULL,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  effective_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
  privacy_notice_url   TEXT NOT NULL,
  data_usage_summary   TEXT NOT NULL,
  storage_duration     TEXT,
  rights_info          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE consent_documents IS
  'Versioned consent documents per hospital/program (§4.1).';

COMMENT ON COLUMN consent_documents.document_hash IS
  'SHA-256 hash of the consent document; verified again at sign time.';

COMMENT ON COLUMN consent_documents.rights_info IS
  'GDPR rights statements (access, rectification, erasure, etc.).';

-- One active consent per hospital + program
CREATE UNIQUE INDEX idx_consent_documents_active_unique
  ON consent_documents (hospital_id, program_id)
  WHERE is_active = true;

CREATE INDEX idx_consent_documents_hospital_program
  ON consent_documents (hospital_id, program_id);
