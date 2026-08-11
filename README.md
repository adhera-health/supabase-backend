# Adhera Backend

Supabase Edge Functions backend for the Adhera patient onboarding API (invitations, onboarding, consent, staff dashboard).

**Stack:** Deno, Hono, Supabase (Postgres + Auth + Storage), Zod validation.

## Prerequisites

- [Deno](https://deno.land/) 2.x
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Docker (for local Supabase)

## Local setup

```bash
# 1. Start Supabase (applies migrations)
supabase start

# 2. Environment
cp .env.example .env
# Fill SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY from `supabase start` output

# 3. Seed dev admin (admin@adhera.dev by default)
deno task seed:admin

# 4. Serve edge functions (separate terminal)
supabase functions serve --env-file .env
```

Functions are available at:

`http://127.0.0.1:54321/functions/v1/<function-name>`

| Function | Purpose |
|----------|---------|
| `invitations` | Send, resend, list, detail, validate token, drop-out |
| `analytics` | Dashboard overview totals + funnel-over-time (staff) |
| `onboarding` | Complete onboarding, consent, mark active |
| `consent-documents` | Admin upload/activate consent PDFs |
| `email-templates` | Admin email template CRUD |
| `users` | Staff user management (admin) |
| `reminders` | Cron: onboarding reminder emails |
| `patient-opt-out-email-reminders` | Patient opt-out of reminders |

## Deno tasks

```bash
deno task seed:admin      # Create/update local admin user
deno task test:e2e        # Full patient flow smoke test (requires steps above)
deno task run:reminders   # Run reminder job manually (dev)
```

## Tests

```bash
# Unit tests
deno test --allow-env src/shared/auth/rbac.test.ts src/integrations/license/auth0.test.ts

# Rate limiter integration tests (Postgres-backed; requires `supabase start`)
deno test --env-file=.env --allow-env --allow-net src/shared/utils/rate-limit.test.ts

# E2E (Supabase + functions serve must be running)
deno task test:e2e
```

## Environment variables

See [`.env.example`](./.env.example) for the full list with comments.

**Required for local dev:**

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Local: `http://127.0.0.1:54321` |
| `SUPABASE_ANON_KEY` | From `supabase start` |
| `SUPABASE_SERVICE_ROLE_KEY` | From `supabase start` |
| `ENVIRONMENT` | `development` locally |

**Optional local dev:**

| Variable | Description |
|----------|-------------|
| `DEV_ADMIN_EMAIL` / `DEV_ADMIN_PASSWORD` | Admin seed credentials |
| `DEV_ADMIN_CLIENT_ID` / `DEV_ADMIN_PROGRAM_ID` | Tenant UUIDs for invitations |
| `PATIENT_APP_BASE_URL` | Patient app origin for onboarding links |

**E2E / local invitations:** When using `DEV_ADMIN_CLIENT_ID` + `DEV_ADMIN_PROGRAM_ID`, license snapshot defaults to integers `1`/`1` and `https://dev-stub.local` unless `DEV_ADMIN_LICENSE_*` and `LICENSE_CORE_API_HOST` are set. Onboarding then uses `dev_stub` license when Auth0 env is unset.

**Production-only:** `ALLOWED_CORS_ORIGINS`, `REMINDER_CRON_SECRET`, `RESEND_API_KEY`, `INVITATION_FROM_EMAIL` — see `.env.example`.

## Admin login (local)

After `deno task seed:admin`:

```http
POST http://127.0.0.1:54321/auth/v1/token?grant_type=password
apikey: <SUPABASE_ANON_KEY>
Content-Type: application/json

{ "email": "admin@adhera.dev", "password": "AdminPass123" }
```

Use the returned `access_token` as `Authorization: Bearer <token>` on staff routes.

Staff roles: `admin`, `recruiter`, `manager` (permission-based RBAC).

## Project layout

```
src/
  shared/          # Services, queries, validators, auth
  types/           # Domain types (@domain import alias)
  integrations/    # License Service, Adhera Core API
supabase/
  functions/       # Edge function entrypoints (Hono apps)
  migrations/      # Postgres schema + RPCs
scripts/           # Dev seed, E2E, reminders
```

## Production deploy

1. Link Supabase project: `supabase link`
2. Push migrations: `supabase db push`
3. Set secrets on hosted edge functions (all vars from `.env.example` marked production-required)
4. Deploy functions: `supabase functions deploy`
