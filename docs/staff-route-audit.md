# Staff route audit (Phase 1, task 4)

Date: 2026-09-16

**Purpose.** The recruitment bridge will set `verify_jwt = false` on the staff
functions, because Supabase's gateway only accepts tokens issued by *this*
project and staff will authenticate with studio-issued tokens. That is only
safe if every route in those functions runs its own authentication check,
**awaited**, before it touches any data. This audit is the evidence for that
step.

**Method.** Every route registration and every auth/secret call in
`supabase/functions/**` was enumerated and each handler read top to bottom,
checking: which auth call guards it, whether the call is awaited, and whether
anything reads or writes data before it.

**Why "awaited" matters.** These guards are `async`. An un-awaited call rejects
into an unhandled promise while the handler keeps running, so the check no
longer stops the request (see `fix/await-secret-guards`, commit `52a039c`).

## Functions in scope for `verify_jwt = false`

| Route | Guard | Awaited | Data access before guard |
|---|---|---|---|
| `GET /analytics/overview` | `requirePermission(DASHBOARD_ANALYTICS_VIEW)` | yes (:37) | none |
| `GET /analytics/funnel` | `requirePermission(DASHBOARD_ANALYTICS_VIEW)` | yes (:66) | none |
| `POST /consent-documents/upload` | `requirePermission(CONSENT_DOCUMENTS_MANAGE)` | yes (:48) | none (body parsed after) |
| `POST /consent-documents/:id/activate` | `requirePermission(CONSENT_DOCUMENTS_MANAGE)` | yes (:95) | none |
| `GET /email-templates/` | `requirePermission(EMAIL_TEMPLATES_MANAGE)` | yes (:58) | none |
| `GET /email-templates/default` | `requirePermission(EMAIL_TEMPLATES_MANAGE)` | yes (:73) | none |
| `GET /email-templates/:template_uuid` | `requirePermission(EMAIL_TEMPLATES_MANAGE)` | yes (:88) | none |
| `POST /email-templates/` | `requirePermission(EMAIL_TEMPLATES_MANAGE)` | yes (:104) | none |
| `PATCH /email-templates/:template_uuid` | `requirePermission(EMAIL_TEMPLATES_MANAGE)` | yes (:141) | none |
| `DELETE /email-templates/:template_uuid` | `requirePermission(EMAIL_TEMPLATES_MANAGE)` | yes (:178) | none |
| `GET /invitations/` and `GET /invitations` | `requireAnyPermission(INVITATIONS_VIEW_ALL, _VIEW_OWN)` | yes (:387) | none |
| `GET /invitations/clients` | `requirePermission(INVITATIONS_CLIENTS_LIST)` | yes (:132) | none |
| `GET /invitations/clients/:clientId/programs` | `requirePermission(INVITATIONS_CLIENTS_LIST)` | yes (:154) | none (param parsed first) |
| `POST /invitations/send` | `requirePermission(INVITATIONS_SEND)` | yes (:179) | none (auth runs first — F1 fixed) |
| `GET /invitations/validate-token` | **public by design** (patient opens the emailed link) | n/a | none; IP rate limit first |
| `POST /invitations/:invitation_id/resend` | `requirePermission(INVITATIONS_RESEND)` | yes (:302) | none (auth runs first — F1 fixed) |
| `GET /invitations/:invitation_id/attention-reasons` | `requirePermission(INVITATIONS_ATTENTION_REASONS_VIEW)` | yes (:516) | none |
| `GET /invitations/:invitation_id` | `requireAnyPermission(INVITATIONS_VIEW_ALL, _VIEW_OWN)` | yes (:492) | none |
| `POST /invitations/:invitation_id/drop-out` | `requirePermission(INVITATIONS_DROP_OUT)` | yes (:426) | none (auth runs first — F1 fixed) |
| `POST /reminders/run` | `assertCronAuth` (shared secret) | yes (:36) | none |
| `GET /reminders/logs` | `requireAnyPermission(INVITATIONS_VIEW_ALL, _VIEW_OWN)` | yes (:67) | none |

**Result: no route in these five functions reaches data before an awaited
check.** `GET /invitations/validate-token` is the single intentional public
route: it is how a patient opens the invitation link, it takes an opaque
32+ character token, and it is rate limited per IP. Turning off the gateway
JWT check does not change its exposure, since the gateway only ever required
*some* valid token from this project, which the patient never had.

## Functions NOT in scope (gateway check stays on)

| Function | Why it stays |
|---|---|
| `onboarding` | patient routes, tokens issued by this project (:129, :183, :231, :273 — all awaited) |
| `patient-opt-out-email-reminders` | public opt-out link, own rate limiting |
| `license-reservation` | already `verify_jwt = false`; secret gate awaited (:78); `POST /` uses `requirePermission` (:46) |
| `rate-limits-cleanup` | cron secret only |
| `users` | retired in Phase 5 of the bridge |

## Findings

- **F1 (low, ordering) — FIXED 2026-09-16.** `POST /invitations/send`,
  `POST /:invitation_id/resend` and `POST /:invitation_id/drop-out` parsed the
  request body *before* authenticating, so an unauthenticated caller received
  400 validation errors instead of 401 and spent server-side parsing on an
  unauthenticated request. No data was read or written, so this was never an
  access issue — it disclosed schema shape. The auth call (and its
  actor-keyed rate limit) now runs first in all three handlers, guarded by
  `src/shared/auth/invitations-auth-order.test.ts`, which fails if any
  invitations handler reads the body before authenticating.
- **F2 (informational).** `rate-limits-cleanup` had an un-awaited
  `assertCronAuth`; fixed on `develop` by PR #10. This audit branch was cut
  from `develop` *before* that merge, so the file still shows the old line
  here; the fix arrives with the merge and is not reverted (this branch never
  touches that file).
- **F3 (informational).** Rate limiting runs *after* authentication on staff
  routes, so it is keyed to the actor rather than the caller's IP. That is the
  intended design (`assertAdminActionRateLimit(actor.id, …)`), but it means
  unauthenticated floods are absorbed by the auth path, not the rate limiter.

## Conclusion

`verify_jwt = false` is safe for `analytics`, `consent-documents`,
`email-templates`, `invitations` and `reminders` once the staff auth entry
point lands (bridge spec, Phase 5). Every route in them authenticates before
touching data, F1 is fixed, and two source-scanning tests keep it that way:
`src/shared/auth/secret-gate-call-sites.test.ts` (every async secret gate is
awaited) and `src/shared/auth/invitations-auth-order.test.ts` (auth precedes
body reads).
