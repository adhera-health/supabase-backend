/**
 * Communication service — opt-out and reminder stop rules (Phase 1).
 * Spec: onboarding-doc §6.2, §9
 */

import {
  getCommunicationOptOutByInvitationAndChannel,
  insertCommunicationOptOutRow,
} from "@shared/database/queries/communication.query.ts";
import {
  getInvitationById,
  getInvitationByUuid,
} from "@shared/database/queries/invitations.query.ts";
import {
  getAssignmentByInvitationId,
  getLatestAssignmentByUserId,
} from "@shared/database/queries/onboarding.query.ts";
import { NotFoundError, BadRequestError } from "@shared/utils/errors.ts";
import { isProductionEnvironment } from "@shared/utils/environment.ts";
import { verifyOptOutToken } from "@shared/utils/opt-out-token.ts";
import type { PatientInvitation } from "@domain/invitation.ts";
import type {
  CommunicationOptOutRow,
  OptOutCommunicationInput,
  OptOutCommunicationResponse,
} from "@domain/reminder.ts";

export interface RecordCommunicationOptOutResult extends OptOutCommunicationResponse {
  invitation_uuid: string;
  audit_required: boolean;
}

/** In production, only signed tokens from reminder emails are accepted (no bare UUIDs). */
export function assertProductionOptOutIdentifier(
  input: OptOutCommunicationInput,
): void {
  if (!isProductionEnvironment()) return;

  if (!input.opt_out_token) {
    throw new BadRequestError(
      "opt_out_token is required in production. Use the signed link from the reminder email.",
    );
  }
}

async function resolveInvitationForOptOut(
  input: OptOutCommunicationInput,
): Promise<PatientInvitation> {
  if (input.opt_out_token) {
    const invitationUuid = await verifyOptOutToken(input.opt_out_token);
    const invitation = await getInvitationByUuid(
      invitationUuid,
      "Failed to load invitation for opt-out",
    );

    if (!invitation) {
      throw new NotFoundError("Invitation not found");
    }

    return invitation;
  }

  if (input.invitation_id) {
    const invitation = await getInvitationByUuid(
      input.invitation_id,
      "Failed to load invitation for opt-out",
    );

    if (!invitation) {
      throw new NotFoundError("Invitation not found");
    }

    return invitation;
  }

  const assignment = await getLatestAssignmentByUserId(input.user_id!);

  if (!assignment) {
    throw new NotFoundError("No onboarding assignment found for this user");
  }

  const invitation = await getInvitationById(
    assignment.invitation_id,
    "Failed to load invitation for opt-out",
  );

  if (!invitation) {
    throw new NotFoundError("Invitation not found");
  }

  return invitation;
}

function toOptOutResponse(
  invitationUuid: string,
  row: CommunicationOptOutRow,
  alreadyRecorded: boolean,
): OptOutCommunicationResponse {
  return {
    opt_out: {
      invitation_uuid: invitationUuid,
      channel: row.channel,
      opted_out_at: row.opted_out_at,
      already_recorded: alreadyRecorded,
    },
  };
}

/** Records a communication opt-out for an invitation (idempotent per channel). */
export async function recordCommunicationOptOut(
  input: OptOutCommunicationInput,
): Promise<RecordCommunicationOptOutResult> {
  assertProductionOptOutIdentifier(input);

  const invitation = await resolveInvitationForOptOut(input);

  const existing = await getCommunicationOptOutByInvitationAndChannel(
    invitation.id,
    input.channel,
  );

  if (existing) {
    return {
      ...toOptOutResponse(invitation.uuid, existing, true),
      invitation_uuid: invitation.uuid,
      audit_required: false,
    };
  }

  let userId: string | null = input.user_id ?? null;
  if (!userId) {
    const assignment = await getAssignmentByInvitationId(invitation.id);
    userId = assignment?.user_id ?? null;
  }

  const { row, created } = await insertCommunicationOptOutRow({
    invitation_id: invitation.id,
    user_id: userId,
    channel: input.channel,
  });

  return {
    ...toOptOutResponse(invitation.uuid, row, !created),
    invitation_uuid: invitation.uuid,
    audit_required: created,
  };
}
