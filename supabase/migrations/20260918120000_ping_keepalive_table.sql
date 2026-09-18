-- Keep-alive table for the hosted project — operational scaffolding, not product data.
--
-- Supabase pauses inactive projects. A scheduled job inserts and then deletes a
-- row here so the database registers activity. No application code reads or
-- writes this table; it exists only to keep the project awake.
--
-- It lives in a migration (rather than being created by hand in the dashboard)
-- so it survives `db reset` and re-provisioning, and so the next person finds an
-- explanation instead of a mystery table.

CREATE TABLE ping (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ping IS
  'Operational keep-alive: a scheduled job inserts/deletes a row so the hosted project is not paused for inactivity. Not product data — no application code reads it.';

-- Access posture, deliberately a shade different from every other table here.
--
-- Like the rest of the schema (20260730120000_rls_and_least_privilege.sql) this
-- table gets RLS with no policies and no Data API grants, so `anon` and
-- `authenticated` cannot touch it through PostgREST.
--
-- Unlike the rest, RLS is NOT forced. FORCE also subjects the table owner
-- (`postgres`, which has no BYPASSRLS on hosted Supabase) to the deny-all, which
-- would break a keep-alive running inside the database via pg_cron. Leaving
-- FORCE off keeps both options open:
--   * pg_cron job running as `postgres` — works;
--   * external scheduler using the service role key — works (service_role has
--     BYPASSRLS and the default grants).
-- A job authenticating with the anon key will NOT work, by design; switch it to
-- the service role key rather than granting `anon` access here.
ALTER TABLE ping ENABLE ROW LEVEL SECURITY;
