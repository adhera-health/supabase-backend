/**
 * Admin multi-tenant scope from Supabase app_metadata.
 */

import type { AuthenticatedUser } from "@shared/auth/request-auth.ts";
import { ForbiddenError } from "@shared/utils/errors.ts";

export interface AdminScope {
  /** null = unrestricted (no scope keys in metadata). [] = scoped but no valid IDs. */
  clientIds: string[] | null;
  programIds: string[] | null;
}

/** Parses a scope list of tenant ids (Adhera Core integer ids as strings). */
function parseScopeIdList(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;

  const raw = Array.isArray(value) ? value : [value];
  return raw
    .filter((item): item is string | number =>
      typeof item === "string" || typeof item === "number"
    )
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0);
}

/** Reads optional client/program scope from admin JWT app_metadata. */
export function resolveAdminScope(user: AuthenticatedUser): AdminScope {
  return {
    clientIds: user.clientIds,
    programIds: user.programIds,
  };
}

export function parseAdminScopeFromMetadata(metadata: Record<string, unknown>): {
  clientIds: string[] | null;
  programIds: string[] | null;
} {
  return {
    clientIds: parseScopeIdList(metadata.client_ids),
    programIds: parseScopeIdList(metadata.program_ids),
  };
}

function assertScopeAllowsId(
  scopeList: string[] | null,
  id: string,
  resourceLabel: "client" | "program",
): void {
  if (scopeList === null) return;

  if (scopeList.length === 0 || !scopeList.includes(id)) {
    throw new ForbiddenError(
      `You do not have access to invitations for this ${resourceLabel}.`,
    );
  }
}

export function assertAdminCanAccessClientProgram(
  scope: AdminScope,
  clientId: string,
  programId: string,
): void {
  assertScopeAllowsId(scope.clientIds, clientId, "client");
  assertScopeAllowsId(scope.programIds, programId, "program");
}

export function assertAdminListFiltersAllowed(
  scope: AdminScope,
  filters: { client_id?: string; program_id?: string },
): void {
  if (filters.client_id) {
    assertScopeAllowsId(scope.clientIds, filters.client_id, "client");
  }

  if (filters.program_id) {
    assertScopeAllowsId(scope.programIds, filters.program_id, "program");
  }
}

export function applyAdminScopeToListFilters<T extends {
  client_id?: string;
  program_id?: string;
}>(
  scope: AdminScope,
  filters: T,
): T & { allowedClientIds?: string[]; allowedProgramIds?: string[] } {
  assertAdminListFiltersAllowed(scope, filters);

  return {
    ...filters,
    ...(scope.clientIds !== null ? { allowedClientIds: scope.clientIds } : {}),
    ...(scope.programIds !== null ? { allowedProgramIds: scope.programIds } : {}),
  };
}
