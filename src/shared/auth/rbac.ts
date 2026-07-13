/**
 * RBAC helpers — permission checks derived from role mappings.
 */

import { PERMISSIONS, ROLE_PERMISSIONS, type Permission } from "@shared/auth/permissions.ts";
import type { AuthenticatedUser } from "@shared/auth/request-auth.ts";
import { ForbiddenError } from "@shared/utils/errors.ts";

export function getPermissionsForRole(
  role: AuthenticatedUser["role"],
): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function getPermissionsForUser(user: AuthenticatedUser): readonly Permission[] {
  return getPermissionsForRole(user.role);
}

export function hasPermission(user: AuthenticatedUser, permission: Permission): boolean {
  return getPermissionsForUser(user).includes(permission);
}

export function hasAnyPermission(
  user: AuthenticatedUser,
  permissions: readonly Permission[],
): boolean {
  const granted = getPermissionsForUser(user);
  return permissions.some((permission) => granted.includes(permission));
}

export function assertPermission(
  user: AuthenticatedUser,
  permission: Permission,
): void {
  if (!hasPermission(user, permission)) {
    throw new ForbiddenError("You do not have permission to access this resource.");
  }
}

export function assertAnyPermission(
  user: AuthenticatedUser,
  permissions: readonly Permission[],
): void {
  if (!hasAnyPermission(user, permissions)) {
    throw new ForbiddenError("You do not have permission to access this resource.");
  }
}

/** True when the actor may list invitations across all recruiters. */
export function canViewAllInvitations(user: AuthenticatedUser): boolean {
  return hasPermission(user, PERMISSIONS.INVITATIONS_VIEW_ALL);
}

/** True when list queries must be scoped to invitations created by this actor. */
export function shouldScopeInvitationsToCreator(user: AuthenticatedUser): boolean {
  return hasPermission(user, PERMISSIONS.INVITATIONS_VIEW_OWN) &&
    !canViewAllInvitations(user);
}
