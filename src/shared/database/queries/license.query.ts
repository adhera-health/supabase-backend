/**
 * License database queries — lookup by invitation (complete-onboarding recovery).
 */

import { getServiceClient } from "@shared/database/client.ts";
import { raiseDbError } from "@shared/database/queries/db-error.ts";
import type { License } from "@domain/license.ts";

export async function getLicenseByInvitationId(
  invitationId: number,
): Promise<License | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("licenses")
    .select()
    .eq("invitation_id", invitationId)
    .maybeSingle();

  if (error) {
    raiseDbError("Failed to load license for invitation", error);
  }

  return data ? data as License : null;
}
