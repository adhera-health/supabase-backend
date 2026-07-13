-- Align programs.license_config with client format (client_id, program_id, role, core_api_host).

COMMENT ON COLUMN programs.license_config IS
  'JSON: client_id, program_id, role, core_api_host (License Service integers — not Supabase UUIDs).';

UPDATE programs
SET
  license_config = '{
    "client_id": 21,
    "program_id": 12,
    "role": "app_member",
    "core_api_host": "test.adheracare.com"
  }'::jsonb,
  updated_at = now()
WHERE id IN (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '33333333-3333-4333-8333-333333333333'
);
