/**
 * Invitation token utilities (hashing + state resolution).
 */

import type { TokenValidationState } from "@domain/invitation.ts";

export async function hashInvitationToken(token: string): Promise<string> {
  return hashSha256Hex(token);
}

export async function hashSha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function resolveInvitationTokenState(
  tokenRow: {
    expires_at: string;
    consumed_at: string | null;
    is_active: boolean;
    superseded_by_token_id: number | null;
  },
): TokenValidationState {
  if (tokenRow.consumed_at) return "consumed";
  if (!tokenRow.is_active || tokenRow.superseded_by_token_id) return "superseded";
  if (new Date(tokenRow.expires_at) < new Date()) return "expired";
  return "valid";
}
