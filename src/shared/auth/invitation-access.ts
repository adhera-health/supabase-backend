/**
 * Row-level invitation access for staff actors (scope + ownership).
 */

import {
  assertAdminCanAccessClientProgram,
  resolveAdminScope,
} from "@shared/auth/admin-scope.ts";
import { canViewAllInvitations } from "@shared/auth/rbac.ts";
import type { AuthenticatedUser } from "@shared/auth/request-auth.ts";
import { ForbiddenError } from "@shared/utils/errors.ts";

export interface StaffInvitationAccessFields {
  client_id: string;
  program_id: string;
  invited_by_user_id: string;
}

/**
 * Ensures the actor may access an invitation within tenant scope.
 * Recruiters are restricted to invitations they created.
 */
export function assertStaffInvitationAccess(
  actor: AuthenticatedUser,
  invitation: StaffInvitationAccessFields,
): void {
  assertAdminCanAccessClientProgram(
    resolveAdminScope(actor),
    invitation.client_id,
    invitation.program_id,
  );

  if (canViewAllInvitations(actor)) return;

  if (invitation.invited_by_user_id !== actor.id) {
    throw new ForbiddenError("You do not have permission to access this invitation.");
  }
}
