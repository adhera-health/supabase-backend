-- Data-layer access control backstop (SEC-01 + SEC-32).
--
-- Context: the backend reaches every table through the service role only — the
-- user-scoped client (`getUserClient`) is used solely for `auth.getUser()` and never
-- touches the `public` schema. Authorization lives in the application layer (RBAC
-- permissions + tenant scope + ownership checks). That layer is sound, but it was the
-- ONLY layer: nothing at the database level stopped a mistake from exposing PHI.
--
-- This migration adds the missing floor. It changes nothing for the backend, because
-- `service_role` has BYPASSRLS and is granted explicitly below.
--
--   1. RLS on every table, with no policies → default deny for anon/authenticated.
--   2. RLS force-enabled, so the table owner isn't implicitly exempt either.
--   3. EXECUTE revoked on every public function (SEC-32 — see below).
--   4. Table/sequence privileges revoked from the Data API roles.
--   5. Default privileges changed so FUTURE objects inherit all of the above.
--
-- Step 4 is the important one: the original risk was never today's grants, it was
-- that one future migration or one Studio-created table could expose everything.
--
-- SEC-32 (the sharper half of this migration): Postgres grants EXECUTE on new
-- functions to PUBLIC by default, Supabase grants USAGE ON SCHEMA public to anon and
-- authenticated, and PostgREST exposes public-schema functions as /rest/v1/rpc/<name>.
-- Nothing in this repo revoked that. The five `atomic_*` functions are SECURITY
-- DEFINER, so they run as their owner and bypass RLS and table grants alike —
-- revoking table access does NOT protect them. Worst case was pre-auth account
-- takeover: `atomic_resend_invitation_token(p_invitation_id, p_token_hash, ...)`
-- accepts a CALLER-SUPPLIED token hash, so an anonymous caller could mint a valid
-- onboarding token for any invitation id (sequential BIGINT) and receive that
-- patient's email in the result set.
--
-- Idempotent and safe to re-run. Role operations are guarded on role existence so the
-- migration works on a bare local Postgres as well as hosted Supabase.

-- ---------------------------------------------------------------------------
-- 1. Enable RLS on every table in `public`.
--
-- Enumerated dynamically rather than listed: `licenses` and `programs` were dropped
-- and restored across migrations, so a hardcoded list would drift. No policies are
-- created — RLS with zero policies denies all access to non-BYPASSRLS roles, which is
-- exactly the intent. Do not read the absence of policies as "policies still to write".
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
      -- Same reasoning as the function loop below: never touch extension-owned objects.
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = c.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target.relname);
    RAISE NOTICE 'RLS enabled on public.%', target.relname;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Force RLS, so the table owner isn't implicitly exempt either.
--
-- By default a table's owner bypasses RLS regardless of superuser status --
-- migrations here run as `postgres`, which owns every table and does not have
-- BYPASSRLS on hosted Supabase, so without FORCE it would sail through step 1's
-- default-deny untouched. service_role is unaffected either way (it has
-- BYPASSRLS, which always wins over FORCE). Applied unconditionally rather than
-- filtered like step 1, so it stays idempotent and correct even if only this
-- step is re-run after a new table is added.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = c.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', target.relname);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Revoke EXECUTE on every public function; re-grant to the service role.
--
-- Revoking FROM PUBLIC removes the implicit default grant; the explicit grant to
-- service_role then restores access for the only caller that should have it.
-- Trigger functions (`set_updated_at`, `prevent_audit_log_mutation`) are unaffected at
-- runtime — Postgres checks EXECUTE when a trigger is created, not when it fires, and
-- service_role holds EXECUTE regardless.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  fn record;
  target_role text;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      -- Skip extension-owned functions. No migration installs an extension, but some
      -- Supabase projects have pgcrypto/uuid-ossp in `public` rather than `extensions`,
      -- and revoking on those would be collateral damage rather than hardening.
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    -- %s is safe here: regprocedure renders an already-quoted signature.
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.signature);

    FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', fn.signature, target_role);
      END IF;
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.signature);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Revoke table and sequence privileges from the Data API roles.
--
-- Expected to be a no-op on a correctly configured project — this is the belt to
-- step 1's braces, and it makes the intent explicit and auditable.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  target_role text;
BEGIN
  FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', target_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', target_role);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Future objects: deny by default.
--
-- ALTER DEFAULT PRIVILEGES applies to objects created by the role that runs it
-- (migrations run as `postgres`), so a future migration cannot silently re-expose
-- tables or ship another world-executable SECURITY DEFINER function.
--
-- NOTE: this does NOT enable RLS on future tables — Postgres has no default for that,
-- and event triggers are unavailable on hosted Supabase. Re-run this migration's
-- step 1, or the verification query below, after adding tables.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  target_role text;
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC';

  FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I',
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I',
        target_role
      );
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Re-affirm service role access (mirrors 20260710130000).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO service_role';
    EXECUTE 'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role';
    EXECUTE 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO service_role';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO service_role';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Verification — run after applying. Every row of the first three queries should
-- be empty; the fourth should list only `service_role`.
--
--   -- (a) tables without RLS:
--   SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
--
--   -- (a2) tables with RLS enabled but not forced:
--   SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity AND NOT c.relforcerowsecurity;
--
--   -- (b) any table privilege still held by the Data API roles:
--   SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
--
--   -- (c) who can execute public functions:
--   SELECT p.proname, a.grantee
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
--   JOIN pg_roles r ON r.oid = a.grantee AND a.privilege_type = 'EXECUTE'
--   WHERE n.nspname = 'public';
-- ---------------------------------------------------------------------------
