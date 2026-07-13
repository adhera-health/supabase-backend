-- Consent V1 update: checkbox acceptance (no signature), summary bullets, re-consent support
-- Client requirement: identity via Supabase Auth; immutable evidence records

-- -----------------------------------------------------------------------------
-- consent_documents: short plain-language summary for consent screen
-- -----------------------------------------------------------------------------

ALTER TABLE consent_documents
  ADD COLUMN IF NOT EXISTS summary_bullets JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN consent_documents.summary_bullets IS
  '3–5 plain-language bullet points shown on the consent screen before accept.';

UPDATE consent_documents
SET summary_bullets = '[
  "Your health data is used to deliver and improve your digital care program.",
  "Authorized care teams can access your data only as needed for your care.",
  "You may withdraw consent at any time with the same ease as giving it.",
  "Your data is stored securely and retained as described in the full consent document."
]'::jsonb
WHERE jsonb_array_length(summary_bullets) < 3;

ALTER TABLE consent_documents
  ADD CONSTRAINT chk_consent_documents_summary_bullets_count
  CHECK (
    jsonb_typeof(summary_bullets) = 'array'
    AND jsonb_array_length(summary_bullets) BETWEEN 3 AND 5
  );

-- -----------------------------------------------------------------------------
-- user_consents: remove signature artifacts; add acceptance evidence fields
-- -----------------------------------------------------------------------------

ALTER TABLE user_consents
  DROP COLUMN IF EXISTS signature_storage_path,
  DROP COLUMN IF EXISTS signature_hash;

ALTER TABLE user_consents
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS program_id UUID,
  ADD COLUMN IF NOT EXISTS consent_version TEXT,
  ADD COLUMN IF NOT EXISTS document_hash TEXT,
  ADD COLUMN IF NOT EXISTS accepted BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill new columns from existing evidence + consent_documents
UPDATE user_consents uc
SET
  email = COALESCE(uc.evidence_payload_json->>'email', ''),
  consent_version = COALESCE(uc.evidence_payload_json->>'consent_version', cd.version),
  document_hash = COALESCE(uc.evidence_payload_json->>'document_hash', cd.document_hash),
  program_id = cd.program_id
FROM consent_documents cd
WHERE uc.consent_document_id = cd.id
  AND (
    uc.email IS NULL
    OR uc.program_id IS NULL
    OR uc.consent_version IS NULL
    OR uc.document_hash IS NULL
  );

ALTER TABLE user_consents
  ALTER COLUMN email SET NOT NULL,
  ALTER COLUMN program_id SET NOT NULL,
  ALTER COLUMN consent_version SET NOT NULL,
  ALTER COLUMN document_hash SET NOT NULL;

ALTER TABLE user_consents
  ADD CONSTRAINT chk_user_consents_document_hash_format
  CHECK (document_hash ~ '^[a-f0-9]{64}$');

ALTER TABLE user_consents
  ADD CONSTRAINT chk_user_consents_consent_version_nonempty
  CHECK (length(trim(consent_version)) > 0);

DROP INDEX IF EXISTS idx_user_consents_invitation_active;

CREATE UNIQUE INDEX idx_user_consents_invitation_current
  ON user_consents (invitation_id)
  WHERE is_withdrawn = false AND superseded_at IS NULL;

-- -----------------------------------------------------------------------------
-- Storage bucket for admin-uploaded consent PDFs
-- -----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'consent-documents',
  'consent-documents',
  true,
  10485760,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;
