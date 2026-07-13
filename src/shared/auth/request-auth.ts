/**
 * Request authentication helpers.
 *
 * All protected routes use Supabase Auth JWT via `Authorization: Bearer <access_token>`.
 * Role is read from `user.app_metadata.role`. Authorization is enforced via permissions
 * in `@shared/auth/authorization.ts` — not role string checks in route handlers.
 */

import type { User } from "@supabase/supabase-js";
import { parseAdminScopeFromMetadata } from "@shared/auth/admin-scope.ts";
import { getUserClient } from "@shared/database/client.ts";
import { ForbiddenError, UnauthorizedError } from "@shared/utils/errors.ts";

const BEARER_PREFIX = /^Bearer\s+/i;

export type AppRole =
  | "admin"
  | "recruiter"
  | "manager"
  | "healthcare_professional"
  | "patient";

export interface AuthenticatedUser {
  id: string;
  email: string | undefined;
  role: AppRole;
  /** When set, admin can only manage invitations for these clients. */
  clientIds: string[] | null;
  /** When set, admin can only manage invitations for these programs. */
  programIds: string[] | null;
}

/** Role required on admin-only provisioning routes (DB validation). */
export const ADMIN_ROLE: AppRole = "admin";

/** Role allowed to send and resend patient invitations. */
export const RECRUITER_ROLE: AppRole = "recruiter";

/** Role required on patient onboarding routes. */
export const PATIENT_ROLE: AppRole = "patient";

/** Extracts a Bearer access token from the Authorization header. */
export function extractBearerToken(
  authorizationHeader: string | undefined,
): string {
  const header = authorizationHeader?.trim();

  if (!header || !BEARER_PREFIX.test(header)) {
    throw new UnauthorizedError(
      "Authentication required. Provide Authorization: Bearer <access_token>.",
    );
  }

  const token = header.replace(BEARER_PREFIX, "").trim();

  if (!token) {
    throw new UnauthorizedError("Authentication required. Bearer token is missing.");
  }

  return token;
}

function resolveAppRole(user: User): AppRole | undefined {
  const role = user.app_metadata?.role;

  if (role === "invitation_sender" || role === "inviter") {
    return "recruiter";
  }
  if (role === "dashboard_manager") {
    return "manager";
  }

  if (
    role === "admin" ||
    role === "recruiter" ||
    role === "manager" ||
    role === "healthcare_professional" ||
    role === "patient"
  ) {
    return role;
  }

  return undefined;
}

/** Verifies a Supabase access token and returns the authenticated user. */
export async function getAuthenticatedSupabaseUser(
  accessToken: string,
): Promise<AuthenticatedUser> {
  const client = getUserClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new UnauthorizedError("Invalid or expired access token.");
  }

  const role = resolveAppRole(data.user);

  if (!role) {
    throw new ForbiddenError(
      "User account is missing a valid app_metadata.role claim.",
    );
  }

  const scope = parseAdminScopeFromMetadata(
    (data.user.app_metadata ?? {}) as Record<string, unknown>,
  );

  return {
    id: data.user.id,
    email: data.user.email,
    role,
    clientIds: scope.clientIds,
    programIds: scope.programIds,
  };
}

/** Verifies Supabase JWT and enforces RBAC for the given roles. */
export async function requireSupabaseAuth(
  authorizationHeader: string | undefined,
  allowedRoles: AppRole[],
): Promise<AuthenticatedUser> {
  const token = extractBearerToken(authorizationHeader);
  const user = await getAuthenticatedSupabaseUser(token);

  if (!allowedRoles.includes(user.role)) {
    throw new ForbiddenError(
      "You do not have permission to access this resource.",
    );
  }

  return user;
}
