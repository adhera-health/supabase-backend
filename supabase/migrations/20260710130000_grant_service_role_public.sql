-- Grant the Supabase service role access to public tables.
--
-- Supabase's `auto_expose_new_tables` default flipped to revoked on 2026-05-30,
-- so migration-created tables are no longer auto-granted to the Data API roles —
-- causing "permission denied for table ..." for the backend (which connects with
-- the service role via supabase-js / PostgREST).
--
-- The backend accesses every table through the service role only (never anon/
-- authenticated), so we grant it explicitly here. This is durable across local
-- and hosted environments, unlike the local-only config flag, and keeps tables
-- private from the public anon key.

GRANT USAGE ON SCHEMA public TO service_role;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Cover tables/sequences created by future migrations too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;
