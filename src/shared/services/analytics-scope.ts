/**
 * Builds analytics query filters from the actor's tenant scope.
 *
 * Requested filters are validated against the scope (out-of-scope ones are
 * refused), and the scope itself becomes part of the filters so an actor who
 * requests nothing still only sees their own clients.
 */

import {
  applyAdminScopeToListFilters,
  resolveAdminScope,
} from "@shared/auth/admin-scope.ts";
import type { AuthenticatedUser } from "@shared/auth/request-auth.ts";
import type { AnalyticsQueryFilters } from "@shared/database/queries/analytics-filters.ts";

export interface AnalyticsFilterInput {
  client_id?: string;
  program_id?: string;
  date_from?: string;
  date_to?: string;
}

export function buildAnalyticsQueryFilters(
  actor: AuthenticatedUser,
  input: AnalyticsFilterInput,
): AnalyticsQueryFilters {
  const scoped = applyAdminScopeToListFilters(resolveAdminScope(actor), {
    client_id: input.client_id,
    program_id: input.program_id,
  });

  return {
    clientId: scoped.client_id,
    programId: scoped.program_id,
    allowedClientIds: scoped.allowedClientIds,
    allowedProgramIds: scoped.allowedProgramIds,
    dateFrom: input.date_from,
    dateTo: input.date_to,
  };
}
