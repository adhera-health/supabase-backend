/**
 * Communication database queries — opt-out persistence.
 */

import { getServiceClient } from "@shared/database/client.ts";
import { isUniqueViolation, raiseDbError } from "@shared/database/queries/db-error.ts";
import type {
  CommunicationOptOutChannel,
  CommunicationOptOutRow,
  InsertCommunicationOptOutInput,
} from "@domain/reminder.ts";

export async function getCommunicationOptOutByInvitationAndChannel(
  invitationId: number,
  channel: CommunicationOptOutChannel,
): Promise<CommunicationOptOutRow | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("communication_opt_outs")
    .select()
    .eq("invitation_id", invitationId)
    .eq("channel", channel)
    .maybeSingle();

  if (error) {
    raiseDbError("Failed to load communication opt-out", error);
  }

  return (data as CommunicationOptOutRow | null) ?? null;
}

export async function insertCommunicationOptOutRow(
  input: InsertCommunicationOptOutInput,
): Promise<{ row: CommunicationOptOutRow; created: boolean }> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("communication_opt_outs")
    .insert({
      invitation_id: input.invitation_id,
      user_id: input.user_id ?? null,
      channel: input.channel,
      ...(input.opted_out_at !== undefined ? { opted_out_at: input.opted_out_at } : {}),
    })
    .select()
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      const existing = await getCommunicationOptOutByInvitationAndChannel(
        input.invitation_id,
        input.channel,
      );
      if (existing) {
        return { row: existing, created: false };
      }
    }

    raiseDbError("Failed to record communication opt-out", error);
  }

  return { row: data as CommunicationOptOutRow, created: true };
}

/** True when email reminders must not be sent (channel email or all). */
export async function hasEmailCommunicationOptOut(invitationId: number): Promise<boolean> {
  const emailOptOut = await getCommunicationOptOutByInvitationAndChannel(invitationId, "email");
  if (emailOptOut) {
    return true;
  }

  const allOptOut = await getCommunicationOptOutByInvitationAndChannel(invitationId, "all");
  return Boolean(allOptOut);
}
