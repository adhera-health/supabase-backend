-- Seed data for local development.

-- Dev consent document (matches Postman example client/program UUIDs)
INSERT INTO consent_documents (
  client_id,
  program_id,
  version,
  document_url,
  document_hash,
  privacy_notice_url,
  data_usage_summary,
  summary_bullets,
  storage_duration,
  rights_info
) VALUES (
  '36',
  '42',
  '1.0',
  'https://example.com/consent/adhera-participation-v1.pdf',
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'https://example.com/privacy/adhera',
  'Your health data is processed to deliver the Adhera digital care program, monitor your progress, and improve our services. Data is stored securely and accessed only by authorized care teams.',
  '[
    "Your health data is used to deliver and improve your digital care program.",
    "Authorized care teams can access your data only as needed for your care.",
    "You may withdraw consent at any time with the same ease as giving it.",
    "Your data is stored securely and retained as described in the full consent document."
  ]'::jsonb,
  '7 years after program completion or as required by applicable law',
  '{
    "access": "You may request a copy of the personal data we hold about you.",
    "rectification": "You may request correction of inaccurate or incomplete data.",
    "erasure": "You may request deletion of your data, subject to legal and medical retention requirements."
  }'::jsonb
);

-- Alternate dev pair (common Postman test UUIDs)
INSERT INTO consent_documents (
  client_id,
  program_id,
  version,
  document_url,
  document_hash,
  privacy_notice_url,
  data_usage_summary,
  summary_bullets,
  storage_duration,
  rights_info
) VALUES (
  '37',
  '41',
  '1.0',
  'https://example.com/consent/adhera-participation-v1.pdf',
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'https://example.com/privacy/adhera',
  'Your health data is processed to deliver the Adhera digital care program, monitor your progress, and improve our services. Data is stored securely and accessed only by authorized care teams.',
  '[
    "Your health data is used to deliver and improve your digital care program.",
    "Authorized care teams can access your data only as needed for your care.",
    "You may withdraw consent at any time with the same ease as giving it.",
    "Your data is stored securely and retained as described in the full consent document."
  ]'::jsonb,
  '7 years after program completion or as required by applicable law',
  '{
    "access": "You may request a copy of the personal data we hold about you.",
    "rectification": "You may request correction of inaccurate or incomplete data.",
    "erasure": "You may request deletion of your data, subject to legal and medical retention requirements."
  }'::jsonb
);
