/**
 * Shared-secret auth for the machine-to-machine license reservation lookup.
 *
 * Kept out of `authorization.ts` (which pulls in the Supabase client for JWT
 * verification) so this gate stays dependency-light and directly testable —
 * it mirrors `reminder-cron-auth.ts`.
 */

import { timingSafeEqualStrings } from "@shared/utils/secret-compare.ts";
import { ForbiddenError, UnauthorizedError, AppError } from "@shared/utils/errors.ts";
import type { Context } from "hono";

const LICENSE_RESERVATION_SECRET_HEADER = "x-license-reservation-secret";

/**
 * Guards `POST /license-reservation/get-by-email` with a shared secret.
 *
 * Fails closed in every environment (SEC-02): a missing secret is a 500, never an
 * open door. This route returns PII keyed on email and runs with `verify_jwt = false`,
 * so an unconfigured secret previously left it fully unauthenticated outside production.
 */
export async function assertLicenseReservationSecret(c: Context): Promise<void> {
  const configuredSecret = Deno.env.get("LICENSE_RESERVATION_SECRET")?.trim();

  if (!configuredSecret) {
    throw new AppError(
      "LICENSE_RESERVATION_SECRET is not configured. This route is unavailable until it is set.",
      { statusCode: 500, code: "INTERNAL_ERROR" },
    );
  }

  const headerSecret = c.req.header(LICENSE_RESERVATION_SECRET_HEADER)?.trim();

  if (!headerSecret) {
    throw new UnauthorizedError("Missing license reservation credentials");
  }

  if (!await timingSafeEqualStrings(headerSecret, configuredSecret)) {
    throw new ForbiddenError("Invalid license reservation credentials");
  }
}
