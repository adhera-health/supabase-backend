/**
 * Onboarding reminder engine — +2h/+48h emails and invitation lifecycle sync (Phase A).
 * Spec: onboarding-doc §9
 */

import { hasEmailCommunicationOptOut } from "@shared/database/queries/communication.query.ts";
import {
  getReminderLogByIdempotencyKey,
  insertOnboardingReminderLogRow,
  listInvitationsDueForConsentReminderSlot,
  listInvitationsDueForReminderSlot,
  updateOnboardingReminderLogRow,
} from "@shared/database/queries/reminder.query.ts";
import { runInvitationLifecycleSync, runPostClickAutoDropouts } from "@shared/services/invitation-lifecycle.service.ts";
import { rotateOnboardingTokenForReminder } from "@shared/services/invitation.service.ts";
import { INVITED_STATUSES, PRE_CONSENT_ACCEPT_STATUSES } from "@shared/services/invitation-status-rules.ts";
import { sendReminderEmail } from "@shared/services/reminder-email.service.ts";
import { isResendConfigured } from "@shared/utils/resend.ts";
import { createLogger } from "@shared/utils/logger.ts";
import type { InvitationStatus, PatientInvitation } from "@domain/invitation.ts";
import type {
  OnboardingReminderLogRow,
  ReminderDeliveryType,
  ReminderProcessResult,
  ReminderRunSummary,
  ReminderScheduleSlot,
  ReminderSkipReason,
} from "@domain/reminder.ts";

const logger = createLogger("reminder");

const SLOT_HOURS: Record<ReminderScheduleSlot, number> = {
  "2h": 2,
  "24h": 24,
  "48h": 48,
};

/** Email reminders sent to patients (+24h is a dashboard flag via lifecycle sync). */
const EMAIL_REMINDER_SLOTS: ReminderScheduleSlot[] = ["2h", "48h"];

const ONBOARDING_EMAIL_TYPE: ReminderDeliveryType = "email";
const CONSENT_EMAIL_TYPE: ReminderDeliveryType = "email_consent";

const ONBOARDING_REMINDER_STATUSES: InvitationStatus[] = [
  "invited_lt_24h",
  "invited_24_48h",
  "invited_gt_48h",
  "email_opened",
];

const CONSENT_REMINDER_STATUSES: InvitationStatus[] = [...PRE_CONSENT_ACCEPT_STATUSES];

const REMINDER_TERMINAL_STATUSES: InvitationStatus[] = [
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

export interface RunDueOnboardingRemindersOptions {
  asOf?: Date;
  invitationUuid?: string;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function getReminderTypeForInvitation(invitation: PatientInvitation): ReminderDeliveryType {
  return PRE_CONSENT_ACCEPT_STATUSES.includes(invitation.status)
    ? CONSENT_EMAIL_TYPE
    : ONBOARDING_EMAIL_TYPE;
}

function getReminderAnchorIso(invitation: PatientInvitation): string | null {
  if (PRE_CONSENT_ACCEPT_STATUSES.includes(invitation.status)) {
    return invitation.registered_at;
  }

  return invitation.invited_at;
}

function computeScheduledFor(
  anchorIso: string,
  scheduleSlot: ReminderScheduleSlot,
): Date {
  return addHours(new Date(anchorIso), SLOT_HOURS[scheduleSlot]);
}

function invitationNeedsReminder(
  invitation: PatientInvitation,
  reminderType: ReminderDeliveryType,
): boolean {
  if (REMINDER_TERMINAL_STATUSES.includes(invitation.status)) {
    return false;
  }

  if (reminderType === CONSENT_EMAIL_TYPE) {
    return CONSENT_REMINDER_STATUSES.includes(invitation.status) &&
      invitation.registered_at !== null;
  }

  return ONBOARDING_REMINDER_STATUSES.includes(invitation.status);
}

function needsOnboardingTokenForReminder(status: InvitationStatus): boolean {
  return INVITED_STATUSES.includes(status) || status === "email_opened";
}

async function evaluateSkipReason(
  invitation: PatientInvitation,
  scheduleSlot: ReminderScheduleSlot,
  reminderType: ReminderDeliveryType,
  asOf: Date,
): Promise<ReminderSkipReason | null> {
  const anchorIso = getReminderAnchorIso(invitation);

  if (!anchorIso) {
    return "not_eligible";
  }

  const scheduledFor = computeScheduledFor(anchorIso, scheduleSlot);

  if (asOf < scheduledFor) {
    return "not_due";
  }

  if (REMINDER_TERMINAL_STATUSES.includes(invitation.status)) {
    return invitation.status === "consent_completed_and_registered" || invitation.status === "active"
      ? "onboarding_complete"
      : "terminal_status";
  }

  if (!invitationNeedsReminder(invitation, reminderType)) {
    return "not_eligible";
  }

  if (await hasEmailCommunicationOptOut(invitation.id)) {
    return "opted_out";
  }

  return null;
}

async function persistReminderLog(
  input: {
    invitationId: number;
    reminderType: ReminderDeliveryType;
    scheduleSlot: ReminderScheduleSlot;
    scheduledForIso: string;
    status: "sent" | "skipped" | "failed";
    sentAt?: string | null;
    errorMessage?: string | null;
  },
  existingFailedLog: OnboardingReminderLogRow | null,
): Promise<{ row: OnboardingReminderLogRow; created: boolean }> {
  if (existingFailedLog) {
    const row = await updateOnboardingReminderLogRow(existingFailedLog.id, {
      status: input.status,
      sent_at: input.sentAt ?? null,
      error_message: input.errorMessage ?? null,
    });

    return { row, created: false };
  }

  return insertOnboardingReminderLogRow({
    invitation_id: input.invitationId,
    reminder_type: input.reminderType,
    schedule_slot: input.scheduleSlot,
    scheduled_for: input.scheduledForIso,
    status: input.status,
    sent_at: input.sentAt ?? null,
    error_message: input.errorMessage ?? null,
  });
}

async function processInvitationReminderSlot(
  invitation: PatientInvitation,
  scheduleSlot: ReminderScheduleSlot,
  asOf: Date,
): Promise<ReminderProcessResult> {
  const reminderType = getReminderTypeForInvitation(invitation);
  const anchorIso = getReminderAnchorIso(invitation);

  if (!anchorIso) {
    return {
      invitation_uuid: invitation.uuid,
      schedule_slot: scheduleSlot,
      reminder_type: reminderType,
      status: "skipped",
      skip_reason: "not_eligible",
      already_logged: false,
    };
  }

  const scheduledFor = computeScheduledFor(anchorIso, scheduleSlot);
  const scheduledForIso = scheduledFor.toISOString();

  const existing = await getReminderLogByIdempotencyKey(
    invitation.id,
    reminderType,
    scheduleSlot,
  );

  if (existing && existing.status !== "failed") {
    return {
      invitation_uuid: invitation.uuid,
      schedule_slot: scheduleSlot,
      reminder_type: reminderType,
      status: existing.status,
      already_logged: true,
      ...(existing.status === "skipped" && existing.error_message
        ? { skip_reason: existing.error_message as ReminderSkipReason }
        : {}),
    };
  }

  const existingFailedLog = existing?.status === "failed" ? existing : null;

  const skipReason = await evaluateSkipReason(invitation, scheduleSlot, reminderType, asOf);

  if (skipReason === "not_due") {
    return {
      invitation_uuid: invitation.uuid,
      schedule_slot: scheduleSlot,
      reminder_type: reminderType,
      status: "skipped",
      skip_reason: "not_due",
      already_logged: false,
    };
  }

  if (skipReason) {
    const { row, created } = await persistReminderLog(
      {
        invitationId: invitation.id,
        reminderType,
        scheduleSlot,
        scheduledForIso,
        status: "skipped",
        errorMessage: skipReason,
      },
      existingFailedLog,
    );

    logger.info("Reminder skipped", {
      invitation_uuid: invitation.uuid,
      schedule_slot: scheduleSlot,
      reminder_type: reminderType,
      skip_reason: skipReason,
      created,
    });

    return {
      invitation_uuid: invitation.uuid,
      schedule_slot: scheduleSlot,
      reminder_type: reminderType,
      status: row.status,
      skip_reason: skipReason,
      already_logged: !created,
    };
  }

  const sentAt = asOf.toISOString();

  try {
    let onboardingToken: string | undefined;

    if (needsOnboardingTokenForReminder(invitation.status) && isResendConfigured()) {
      onboardingToken = await rotateOnboardingTokenForReminder(invitation.id);
    }

    const emailResult = await sendReminderEmail({
      to: invitation.email,
      invitationUuid: invitation.uuid,
      invitationStatus: invitation.status,
      scheduleSlot,
      onboardingToken,
    });

    const deliveryNote = !emailResult.sent && emailResult.skip_reason === "resend_not_configured"
      ? "resend_not_configured_dev"
      : null;

    if (!emailResult.sent && emailResult.skip_reason !== "resend_not_configured") {
      const { row, created } = await persistReminderLog(
        {
          invitationId: invitation.id,
          reminderType,
          scheduleSlot,
          scheduledForIso,
          status: "failed",
          errorMessage: emailResult.skip_reason ?? "email_not_sent",
        },
        existingFailedLog,
      );

      return {
        invitation_uuid: invitation.uuid,
        schedule_slot: scheduleSlot,
        reminder_type: reminderType,
        status: row.status,
        already_logged: !created,
      };
    }

    const { row, created } = await persistReminderLog(
      {
        invitationId: invitation.id,
        reminderType,
        scheduleSlot,
        scheduledForIso,
        status: "sent",
        sentAt,
        errorMessage: deliveryNote,
      },
      existingFailedLog,
    );

    logger.info("Reminder processed", {
      invitation_uuid: invitation.uuid,
      schedule_slot: scheduleSlot,
      reminder_type: reminderType,
      email_sent: emailResult.sent,
      created,
    });

    return {
      invitation_uuid: invitation.uuid,
      schedule_slot: scheduleSlot,
      reminder_type: reminderType,
      status: row.status,
      already_logged: !created,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    const { row, created } = await persistReminderLog(
      {
        invitationId: invitation.id,
        reminderType,
        scheduleSlot,
        scheduledForIso,
        status: "failed",
        errorMessage: message.slice(0, 500),
      },
      existingFailedLog,
    );

    logger.error("Reminder email failed", {
      invitation_uuid: invitation.uuid,
      schedule_slot: scheduleSlot,
      reminder_type: reminderType,
      error: message,
      created,
    });

    return {
      invitation_uuid: invitation.uuid,
      schedule_slot: scheduleSlot,
      reminder_type: reminderType,
      status: row.status,
      already_logged: !created,
    };
  }
}

function buildCounts(results: ReminderProcessResult[]): ReminderRunSummary["counts"] {
  return results.reduce(
    (counts, result) => {
      if (result.already_logged) {
        counts.already_logged += 1;
        return counts;
      }

      if (result.status === "sent") {
        counts.sent += 1;
      } else if (result.status === "skipped") {
        counts.skipped += 1;
      } else if (result.status === "failed") {
        counts.failed += 1;
      }

      return counts;
    },
    { sent: 0, skipped: 0, failed: 0, already_logged: 0 },
  );
}

/**
 * Runs invitation lifecycle sync, then processes due +2h and +48h email reminders.
 */
export async function runDueOnboardingReminders(
  options: RunDueOnboardingRemindersOptions = {},
): Promise<ReminderRunSummary> {
  const asOf = options.asOf ?? new Date();

  const lifecycle = await runInvitationLifecycleSync({
    asOf,
    invitationUuid: options.invitationUuid,
  });

  const results: ReminderProcessResult[] = [];

  for (const scheduleSlot of EMAIL_REMINDER_SLOTS) {
    const hours = SLOT_HOURS[scheduleSlot];
    const cutoff = addHours(asOf, -hours).toISOString();

    const onboardingInvitations = await listInvitationsDueForReminderSlot(
      ONBOARDING_REMINDER_STATUSES,
      cutoff,
    );

    const consentInvitations = await listInvitationsDueForConsentReminderSlot(cutoff);

    const invitations = [...onboardingInvitations, ...consentInvitations];

    const filtered = options.invitationUuid
      ? invitations.filter((row) => row.uuid === options.invitationUuid)
      : invitations;

    for (const invitation of filtered) {
      const result = await processInvitationReminderSlot(invitation, scheduleSlot, asOf);
      results.push(result);
    }
  }

  const postClickDropped = await runPostClickAutoDropouts({
    asOf,
    invitationUuid: options.invitationUuid,
  });

  lifecycle.invitations_auto_dropped_out += postClickDropped;

  const summary: ReminderRunSummary = {
    as_of: asOf.toISOString(),
    lifecycle,
    results,
    counts: buildCounts(results),
  };

  logger.info("Reminder run complete", summary.counts);

  return summary;
}
