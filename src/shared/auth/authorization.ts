/**
 * HTTP authorization middleware — permission checks on authenticated requests.
 */

import {
  assertAnyPermission,
  assertPermission,
} from "@shared/auth/rbac.ts";
import type { Permission } from "@shared/auth/permissions.ts";
import {
  extractBearerToken,
  getAuthenticatedSupabaseUser,
  type AuthenticatedUser,
} from "@shared/auth/request-auth.ts";
import { ForbiddenError, UnauthorizedError, AppError } from "@shared/utils/errors.ts";
import type { Context } from "hono";

const LICENSE_RESERVATION_SECRET_HEADER = "x-license-reservation-secret";

/** Verifies JWT and requires a single permission. */
export async function requirePermission(
  authorizationHeader: string | undefined,
  permission: Permission,
): Promise<AuthenticatedUser> {
  const token = extractBearerToken(authorizationHeader);
  const user = await getAuthenticatedSupabaseUser(token);
  assertPermission(user, permission);
  return user;
}

/** Verifies JWT and requires at least one of the given permissions. */
export async function requireAnyPermission(
  authorizationHeader: string | undefined,
  permissions: readonly Permission[],
): Promise<AuthenticatedUser> {
  const token = extractBearerToken(authorizationHeader);
  const user = await getAuthenticatedSupabaseUser(token);
  assertAnyPermission(user, permissions);
  return user;
}

export function assertLicenseReservationSecret(c: Context): void 
{
  const configuredSecret = Deno.env.get("LICENSE_RESERVATION_SECRET")?.trim();
  const isProduction = Deno.env.get("ENVIRONMENT") === "production";

    if (!configuredSecret) {
        if (isProduction) {
        throw new AppError("LICENSE_RESERVATION_SECRET is required in production", {
            statusCode: 500,
            code: "INTERNAL_ERROR",
        });
        }
        return;
    }
    const headerSecret = c.req.header(LICENSE_RESERVATION_SECRET_HEADER)?.trim();
    
    if (!headerSecret) {
        throw new UnauthorizedError("Missing license reservation credentials");
    }

    if (headerSecret !== configuredSecret) {
        throw new ForbiddenError("Invalid license reservation credentials");
    }
}
