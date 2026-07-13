-- Consent documents integrity constraints (§4.2, §8)

ALTER TABLE consent_documents
  ADD CONSTRAINT chk_consent_documents_version_nonempty
  CHECK (length(trim(version)) > 0);

ALTER TABLE consent_documents
  ADD CONSTRAINT chk_consent_documents_hash_format
  CHECK (document_hash ~ '^[a-f0-9]{64}$');

ALTER TABLE consent_documents
  ADD CONSTRAINT chk_consent_documents_document_url_https
  CHECK (document_url ~ '^https://');

ALTER TABLE consent_documents
  ADD CONSTRAINT chk_consent_documents_privacy_notice_url_https
  CHECK (privacy_notice_url ~ '^https://');

ALTER TABLE consent_documents
  ADD CONSTRAINT chk_consent_documents_data_usage_summary_nonempty
  CHECK (length(trim(data_usage_summary)) > 0);
