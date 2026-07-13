/**
 * Invitation lifecycle — PRD §7.3 age statuses, §12/+24h flags, auto drop-out.
 * Invoked from POST /reminders/run before email reminders.
 */

import {
  insertPatientAttentionFlagRow,
  listInvitationsForLifecycleProcessing,
  listInvitationsForPostClickAutoDropout,
  resolveActiveAttentionFlagsForInvitation,
} from "@shared/database/queries/patient-attention-flag.query.ts";
import { getReminderLogByIdempotencyKey } from "@shared/database/queries/reminder.query.ts";
import { updateInvitationAgeStatus } from "@shared/database/queries/invitations.query.ts";
import { logAuditEvent } from "@shared/services/audit.service.ts";
import {
  autoDropOutInvitation,
} from "@shared/services/invitation.service.ts";
import {
  AUTO_DROPOUT_NEVER_CLICKED_STATUSES,
  PRE_CONSENT_ACCEPT_STATUSES,
} from "@shared/services/invitation-status-rules.ts";
import { createLogger } from "@shared/utils/logger.ts";
import type { InvitationLifecycleRunSummary } from "@domain/attention.ts";
import type { PatientAttentionFlagType } from "@domain/attention.ts";
import type { InvitationStatus } from "@domain/invitation.ts";

const logger = createLogger("invitation-lifecycle");

/** Never-clicked auto drop-out window — must match invitation token TTL. */
const AUTO_DROPOUT_NEVER_CLICKED_HOURS = 72;

/** Post-click auto drop-out after +48h reminder window (from invited_at). */
const AUTO_DROPOUT_POST_CLICK_HOURS = 48;

const INVITED_AGE_STATUSES: InvitationStatus[] = [
  "invited_lt_24h",
  "invited_24_48h",
  "invited_gt_48h",
];

const NOT_REGISTERED_FLAG_ELIGIBLE_STATUSES: InvitationStatus[] = [
  ...INVITED_AGE_STATUSES,
  "email_opened",
];

const LIFECYCLE_TERMINAL_STATUSES: InvitationStatus[] = [
  "consent_completed_and_registered",
  "active",
  "dropped_out_voluntary",
  "dropped_out_clinical",
  "dropped_out_technical",
  "dropped_out_other",
  "consent_withdrawn",
  "expired",
  "cancelled",
];

export interface RunInvitationLifecycleSyncOptions {
  asOf?: Date;
  invitationUuid?: string;
}

export interface RunPostClickAutoDropoutOptions {
  asOf?: Date;
  invitationUuid?: string;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

/** Maps invited_at age to PRD invitation age bucket (does not change email_opened). */
function resolveInvitedAgeStatus(
  invitedAt: string,
  asOf: Date,
): InvitationStatus {
  const invitedDate = new Date(invitedAt);
  const hoursSinceInvite = (asOf.getTime() - invitedDate.getTime()) / (60 * 60 * 1000);

  if (hoursSinceInvite >= 48) return "invited_gt_48h";
  if (hoursSinceInvite >= 24) return "invited_24_48h";
  return "invited_lt_24h";
}

async function syncInvitationAgeStatusFromInvitedAt(
  invitationId: number,
  currentStatus: InvitationStatus,
  invitedAt: string,
  asOf: Date,
): Promise<boolean> {
  if (!INVITED_AGE_STATUSES.includes(currentStatus)) {
    return false;
  }

  const nextStatus = resolveInvitedAgeStatus(invitedAt, asOf);
  if (nextStatus === currentStatus) {
    return false;
  }

  await updateInvitationAgeStatus(invitationId, nextStatus);
  return true;
}

async function autoDropOutNeverClickedIfDue(
  invitationId: number,
  invitationUuid: string,
  status: InvitationStatus,
  invitedAt: string,
  emailOpenedAt: string | null,
  asOf: Date,
): Promise<boolean> {
  if (!AUTO_DROPOUT_NEVER_CLICKED_STATUSES.includes(status)) {
    return false;
  }

  if (emailOpenedAt) {
    return false;
  }

  const dueAt = addHours(new Date(invitedAt), AUTO_DROPOUT_NEVER_CLICKED_HOURS);
  if (asOf < dueAt) {
    return false;
  }

  const dropped = await autoDropOutInvitation(invitationId, "never_clicked");
  if (!dropped) {
    return false;
  }

  await logAuditEvent({
    entity_type: "invitation",
    entity_id: invitationUuid,
    action: "auto_drop_out",
    metadata_json: {
      failure_stage: "never_clicked",
      status: "dropped_out_other",
    },
  });

  await resolveActiveAttentionFlagsForInvitation(invitationId, asOf.toISOString());
  return true;
}

async function createNotRegisteredAfter24hFlagIfDue(
  invitationId: number,
  status: InvitationStatus,
  invitedAt: string,
  asOf: Date,
): Promise<boolean> {
  if (!NOT_REGISTERED_FLAG_ELIGIBLE_STATUSES.includes(status)) {
    return false;
  }

  const dueAt = addHours(new Date(invitedAt), 24);
  if (asOf < dueAt) {
    return false;
  }

  const { created } = await insertPatientAttentionFlagRow({
    invitation_id: invitationId,
    flag_type: "not_registered_24h",
    detected_at: asOf.toISOString(),
    metadata_json: { invited_at: invitedAt },
  });

  return created;
}

async function createNoConsentAfter24hFlagIfDue(
  invitationId: number,
  status: InvitationStatus,
  registeredAt: string | null,
  consentCompletedAt: string | null,
  asOf: Date,
): Promise<boolean> {
  if (
    !PRE_CONSENT_ACCEPT_STATUSES.includes(status) ||
    !registeredAt ||
    consentCompletedAt
  ) {
    return false;
  }

  const dueAt = addHours(new Date(registeredAt), 24);
  if (asOf < dueAt) {
    return false;
  }

  const { created } = await insertPatientAttentionFlagRow({
    invitation_id: invitationId,
    flag_type: "no_consent_24h",
    detected_at: asOf.toISOString(),
    metadata_json: { registered_at: registeredAt },
  });

  return created;
}

async function resolveAttentionFlagsForTerminalStatus(
  invitationId: number,
  status: InvitationStatus,
  asOf: Date,
): Promise<number> {
  if (!LIFECYCLE_TERMINAL_STATUSES.includes(status)) {
    return 0;
  }

  return resolveActiveAttentionFlagsForInvitation(invitationId, asOf.toISOString());
}

/** Clears flags when patient progresses (called from register / consent / drop-out flows). */
export async function resolveAttentionFlagsAfterPatientProgress(
  invitationId: number,
  flagTypes: PatientAttentionFlagType[],
): Promise<void> {
  const resolvedAt = new Date().toISOString();
  await resolveActiveAttentionFlagsForInvitation(invitationId, resolvedAt, flagTypes);
}

/**
 * Syncs invitation ages, never-clicked auto drop-out (72h), and +24h dashboard flags.
 * Post-click auto drop-out runs after reminders in the same cron job.
 */
export async function runInvitationLifecycleSync(
  options: RunInvitationLifecycleSyncOptions = {},
): Promise<InvitationLifecycleRunSummary> {
  const asOf = options.asOf ?? new Date();
  const invitations = await listInvitationsForLifecycleProcessing(options.invitationUuid);

  let statusesUpdated = 0;
  let invitationsAutoDroppedOut = 0;
  let attentionFlagsCreated = 0;
  let attentionFlagsResolved = 0;

  for (const invitation of invitations) {
    if (await syncInvitationAgeStatusFromInvitedAt(
      invitation.id,
      invitation.status,
      invitation.invited_at,
      asOf,
    )) {
      statusesUpdated += 1;
      invitation.status = resolveInvitedAgeStatus(invitation.invited_at, asOf);
    }

    if (await autoDropOutNeverClickedIfDue(
      invitation.id,
      invitation.uuid,
      invitation.status,
      invitation.invited_at,
      invitation.email_opened_at,
      asOf,
    )) {
      invitationsAutoDroppedOut += 1;
      invitation.status = "dropped_out_other";
      continue;
    }

    if (await createNotRegisteredAfter24hFlagIfDue(
      invitation.id,
      invitation.status,
      invitation.invited_at,
      asOf,
    )) {
      attentionFlagsCreated += 1;
    }

    if (await createNoConsentAfter24hFlagIfDue(
      invitation.id,
      invitation.status,
      invitation.registered_at,
      invitation.consent_completed_at,
      asOf,
    )) {
      attentionFlagsCreated += 1;
    }

    attentionFlagsResolved += await resolveAttentionFlagsForTerminalStatus(
      invitation.id,
      invitation.status,
      asOf,
    );
  }

  const summary: InvitationLifecycleRunSummary = {
    as_of: asOf.toISOString(),
    statuses_updated: statusesUpdated,
    invitations_auto_dropped_out: invitationsAutoDroppedOut,
    attention_flags_created: attentionFlagsCreated,
    attention_flags_resolved: attentionFlagsResolved,
  };

  logger.info("Invitation lifecycle sync complete", { ...summary });

  return summary;
}

/**
 * Auto drop-out for patients who opened the invite but never registered,
 * after the +48h reminder slot has been processed.
 */
export async function runPostClickAutoDropouts(
  options: RunPostClickAutoDropoutOptions = {},
): Promise<number> {
  const asOf = options.asOf ?? new Date();
  const invitations = await listInvitationsForPostClickAutoDropout(options.invitationUuid);

  let dropped = 0;

  for (const invitation of invitations) {
    const dueAt = addHours(new Date(invitation.invited_at), AUTO_DROPOUT_POST_CLICK_HOURS);
    if (asOf < dueAt) {
      continue;
    }

    const reminderLog = await getReminderLogByIdempotencyKey(
      invitation.id,
      "email",
      "48h",
    );

    if (!reminderLog) {
      continue;
    }

    const didDrop = await autoDropOutInvitation(
      invitation.id,
      "post_click_pre_register",
    );

    if (!didDrop) {
      continue;
    }

    await logAuditEvent({
      entity_type: "invitation",
      entity_id: invitation.uuid,
      action: "auto_drop_out",
      metadata_json: {
        failure_stage: "post_click_pre_register",
        status: "dropped_out_other",
      },
    });

    dropped += 1;
  }

  if (dropped > 0) {
    logger.info("Post-click auto drop-outs complete", { dropped });
  }

  return dropped;
}
