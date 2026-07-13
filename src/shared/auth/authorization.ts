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
