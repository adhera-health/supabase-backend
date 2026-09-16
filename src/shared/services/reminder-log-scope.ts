/**
 * Builds reminder log filters from the actor's tenant scope.
 *
 * `GET /reminders/logs` accepts no client filter, so the actor's scope is the
 * only thing restricting which tenants' reminder history (and patient emails)
 * they can read.
 */

import { resolveAdminScope } from "@shared/auth/admin-scope.ts";
import type { AuthenticatedUser } from "@shared/auth/request-auth.ts";
import type { ListReminderLogsFilters } from "@shared/database/queries/reminder-log-filters.ts";

export interface ReminderLogFilterInput {
  invitation_id?: string;
  page: number;
  per_page: number;
}

export function buildReminderLogFilters(
  actor: AuthenticatedUser,
  input: ReminderLogFilterInput,
): ListReminderLogsFilters {
  const scope = resolveAdminScope(actor);

  return {
    invitationUuid: input.invitation_id,
    ...(scope.clientIds !== null ? { allowedClientIds: scope.clientIds } : {}),
    ...(scope.programIds !== null ? { allowedProgramIds: scope.programIds } : {}),
    page: input.page,
    perPage: input.per_page,
  };
}
