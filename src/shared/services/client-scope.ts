/**
 * Tenant scope for the Adhera Core client/program dropdowns.
 *
 * These lists come from the external Core API rather than our database, so
 * scope is applied to the returned options instead of in a query. Core ids are
 * numbers while scope stores them as strings, so comparisons normalise to
 * strings (see `admin-scope.ts`, where `null` means unrestricted).
 */

import { resolveAdminScope } from "@shared/auth/admin-scope.ts";
import type { AuthenticatedUser } from "@shared/auth/request-auth.ts";
import { ForbiddenError } from "@shared/utils/errors.ts";
import type { ClientOption, ProgramOption } from "@domain/adhera-core.ts";

function scopeAllows(scopeList: string[] | null, id: number | string): boolean {
  if (scopeList === null) return true;
  return scopeList.includes(String(id));
}

/** Narrows the client dropdown to the clients the actor may work with. */
export function filterClientsInScope(
  actor: AuthenticatedUser,
  clients: ClientOption[],
): ClientOption[] {
  const { clientIds } = resolveAdminScope(actor);
  if (clientIds === null) return clients;

  return clients.filter((client) => scopeAllows(clientIds, client.id));
}

/** Refuses a client the actor has no access to, before any Core API call. */
export function assertClientInScope(
  actor: AuthenticatedUser,
  clientId: number | string,
): void {
  const { clientIds } = resolveAdminScope(actor);
  if (scopeAllows(clientIds, clientId)) return;

  throw new ForbiddenError(
    "You do not have access to invitations for this client.",
  );
}

/** Narrows the program dropdown when the actor is scoped to programs. */
export function filterProgramsInScope(
  actor: AuthenticatedUser,
  programs: ProgramOption[],
): ProgramOption[] {
  const { programIds } = resolveAdminScope(actor);
  if (programIds === null) return programs;

  return programs.filter((program) => scopeAllows(programIds, program.id));
}
