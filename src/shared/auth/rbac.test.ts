import { assertEquals, assertThrows } from "@std/assert";
import { PERMISSIONS } from "@shared/auth/permissions.ts";
import {
  canViewAllInvitations,
  getPermissionsForRole,
  hasAnyPermission,
  hasPermission,
  shouldScopeInvitationsToCreator,
} from "@shared/auth/rbac.ts";
import type { AuthenticatedUser } from "@shared/auth/request-auth.ts";
import { ForbiddenError } from "@shared/utils/errors.ts";
import { assertPermission } from "@shared/auth/rbac.ts";

function staffUser(role: AuthenticatedUser["role"]): AuthenticatedUser {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    email: `${role}@example.com`,
    role,
    clientIds: null,
    programIds: null,
  };
}

Deno.test("admin receives all permissions", () => {
  const permissions = getPermissionsForRole("admin");
  assertEquals(permissions.includes(PERMISSIONS.USERS_CREATE), true);
  assertEquals(permissions.includes(PERMISSIONS.INVITATIONS_DROP_OUT), true);
  assertEquals(permissions.includes(PERMISSIONS.AUDIT_LOGS_VIEW), true);
});

Deno.test("recruiter runs all operations except user management", () => {
  const recruiter = staffUser("recruiter");

  assertEquals(hasPermission(recruiter, PERMISSIONS.INVITATIONS_SEND), true);
  assertEquals(hasPermission(recruiter, PERMISSIONS.INVITATIONS_VIEW_ALL), true);
  assertEquals(hasPermission(recruiter, PERMISSIONS.INVITATIONS_DROP_OUT), true);
  assertEquals(hasPermission(recruiter, PERMISSIONS.EMAIL_TEMPLATES_MANAGE), true);
  assertEquals(hasPermission(recruiter, PERMISSIONS.CONSENT_DOCUMENTS_MANAGE), true);
  assertEquals(hasPermission(recruiter, PERMISSIONS.DASHBOARD_ANALYTICS_VIEW), true);
  assertEquals(hasPermission(recruiter, PERMISSIONS.AUDIT_LOGS_VIEW), true);
  // No staff user management.
  assertEquals(hasPermission(recruiter, PERMISSIONS.USERS_VIEW), false);
  assertEquals(hasPermission(recruiter, PERMISSIONS.USERS_CREATE), false);
  assertEquals(canViewAllInvitations(recruiter), true);
  assertEquals(shouldScopeInvitationsToCreator(recruiter), false);
});

Deno.test("manager handles user management only", () => {
  const manager = staffUser("manager");

  // User management: view + create (recruiter/manager) only.
  assertEquals(hasPermission(manager, PERMISSIONS.USERS_VIEW), true);
  assertEquals(hasPermission(manager, PERMISSIONS.USERS_CREATE), true);
  // Role changes and deletions stay admin-only.
  assertEquals(hasPermission(manager, PERMISSIONS.USERS_UPDATE_ROLE), false);
  assertEquals(hasPermission(manager, PERMISSIONS.USERS_DELETE), false);
  // No operational (patient/invitation) permissions.
  assertEquals(hasPermission(manager, PERMISSIONS.INVITATIONS_SEND), false);
  assertEquals(hasPermission(manager, PERMISSIONS.INVITATIONS_VIEW_ALL), false);
  assertEquals(hasPermission(manager, PERMISSIONS.DASHBOARD_ANALYTICS_VIEW), false);
  assertEquals(canViewAllInvitations(manager), false);
});

Deno.test("patient has onboarding permissions only", () => {
  const patient = staffUser("patient");

  assertEquals(hasPermission(patient, PERMISSIONS.CONSENTS_VIEW), true);
  assertEquals(hasPermission(patient, PERMISSIONS.ONBOARDING_MARK_ACTIVE), true);
  assertEquals(hasPermission(patient, PERMISSIONS.INVITATIONS_SEND), false);
});

Deno.test("assertPermission throws ForbiddenError when denied", () => {
  const recruiter = staffUser("recruiter");

  assertThrows(
    () => assertPermission(recruiter, PERMISSIONS.USERS_CREATE),
    ForbiddenError,
  );
});

Deno.test("requireAnyPermission pattern for invitation list", () => {
  const recruiter = staffUser("recruiter");
  const manager = staffUser("manager");

  // Recruiter is the operational role and can list invitations.
  assertEquals(
    hasAnyPermission(recruiter, [
      PERMISSIONS.INVITATIONS_VIEW_ALL,
      PERMISSIONS.INVITATIONS_VIEW_OWN,
    ]),
    true,
  );
  // Manager only does user management — no invitation list access.
  assertEquals(
    hasAnyPermission(manager, [
      PERMISSIONS.INVITATIONS_VIEW_ALL,
      PERMISSIONS.INVITATIONS_VIEW_OWN,
    ]),
    false,
  );
});
