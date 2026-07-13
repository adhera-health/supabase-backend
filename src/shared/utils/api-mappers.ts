/**
 * Maps internal DB/service shapes to consistent public API resources.
 * Tenant field is `client_id` (renamed from hospital_id).
 */

import type {
  InvitationResource,
  SessionResource,
  UserResource,
} from "@domain/api-response.ts";
import type { PatientInvitation } from "@domain/invitation.ts";

/** Send/resend — only fields known at creation time (no null lifecycle timestamps). */
export function toInvitationCreatedResource(
  row: Pick<
    PatientInvitation,
    "uuid" | "email" | "client_id" | "program_id" | "status" | "invited_at"
  >,
): Pick<
  InvitationResource,
  "invitation_uuid" | "email" | "client_id" | "program_id" | "status" | "invited_at"
> {
  return {
    invitation_uuid: row.uuid,
    email: row.email,
    client_id: row.client_id,
    program_id: row.program_id,
    status: row.status,
    invited_at: row.invited_at,
  };
}

export function toUserResource(userId: string, email: string): UserResource {
  return {
    user_id: userId,
    email,
  };
}

export function toSessionResource(session: {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  token_type?: string;
}): SessionResource {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in ?? 3600,
    token_type: session.token_type ?? "bearer",
  };
}
