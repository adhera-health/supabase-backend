/**
 * Onboarding reminder log database queries — Phase 1 Step C.
 */

import { getServiceClient } from "@shared/database/client.ts";
import { isUniqueViolation, raiseDbError } from "@shared/database/queries/db-error.ts";
import type { InvitationStatus, PatientInvitation } from "@domain/invitation.ts";
import { PRE_CONSENT_ACCEPT_STATUSES } from "@shared/services/invitation-status-rules.ts";
import type {
  InsertOnboardingReminderLogInput,
  OnboardingReminderLogRow,
  ReminderDeliveryType,
  ReminderLogStatus,
  ReminderScheduleSlot,
} from "@domain/reminder.ts";

export interface ReminderLogWithInvitation extends OnboardingReminderLogRow {
  patient_invitations: { uuid: string; email: string } | null;
}

export interface ListReminderLogsFilters {
  invitationUuid?: string;
  page: number;
  perPage: number;
}

/** Paginated reminder history, joined to the member (email + uuid). */
export async function listReminderLogs(
  filters: ListReminderLogsFilters,
): Promise<{ rows: ReminderLogWithInvitation[]; total: number }> {
  const db = getServiceClient();
  const fromIdx = (filters.page - 1) * filters.perPage;
  const toIdx = fromIdx + filters.perPage - 1;

  let query = db
    .from("onboarding_reminder_logs")
    .select(
      "id, invitation_id, reminder_type, schedule_slot, scheduled_for, sent_at, status, error_message, created_at, patient_invitations!inner(uuid, email)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(fromIdx, toIdx);

  if (filters.invitationUuid) {
    query = query.eq("patient_invitations.uuid", filters.invitationUuid);
  }

  const { data, count, error } = await query;
  if (error) raiseDbError("Failed to list reminder logs", error);

  return {
    rows: (data ?? []) as unknown as ReminderLogWithInvitation[],
    total: count ?? 0,
  };
}

export async function getReminderLogByIdempotencyKey(
  invitationId: number,
  reminderType: ReminderDeliveryType,
  scheduleSlot: ReminderScheduleSlot,
): Promise<OnboardingReminderLogRow | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("onboarding_reminder_logs")
    .select()
    .eq("invitation_id", invitationId)
    .eq("reminder_type", reminderType)
    .eq("schedule_slot", scheduleSlot)
    .maybeSingle();

  if (error) {
    raiseDbError("Failed to load onboarding reminder log", error);
  }

  return (data as OnboardingReminderLogRow | null) ?? null;
}

export async function insertOnboardingReminderLogRow(
  input: InsertOnboardingReminderLogInput,
): Promise<{ row: OnboardingReminderLogRow; created: boolean }> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("onboarding_reminder_logs")
    .insert({
      invitation_id: input.invitation_id,
      reminder_type: input.reminder_type,
      schedule_slot: input.schedule_slot,
      scheduled_for: input.scheduled_for,
      sent_at: input.sent_at ?? null,
      status: input.status ?? "pending",
      error_message: input.error_message ?? null,
    })
    .select()
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      const existing = await getReminderLogByIdempotencyKey(
        input.invitation_id,
        input.reminder_type,
        input.schedule_slot,
      );
      if (existing) {
        return { row: existing, created: false };
      }
    }

    raiseDbError("Failed to write onboarding reminder log", error);
  }

  return { row: data as OnboardingReminderLogRow, created: true };
}

export async function updateOnboardingReminderLogRow(
  id: number,
  input: {
    status: ReminderLogStatus;
    sent_at?: string | null;
    error_message?: string | null;
  },
): Promise<OnboardingReminderLogRow> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("onboarding_reminder_logs")
    .update({
      status: input.status,
      sent_at: input.sent_at ?? null,
      error_message: input.error_message ?? null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    raiseDbError("Failed to update onboarding reminder log", error);
  }

  return data as OnboardingReminderLogRow;
}

export async function listInvitationsDueForConsentReminderSlot(
  registeredAtOnOrBefore: string,
): Promise<PatientInvitation[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_invitations")
    .select()
    .in("status", PRE_CONSENT_ACCEPT_STATUSES)
    .not("registered_at", "is", null)
    .lte("registered_at", registeredAtOnOrBefore);

  if (error) {
    raiseDbError("Failed to list invitations for consent reminder processing", error);
  }

  return (data as PatientInvitation[]) ?? [];
}

export async function listInvitationsDueForReminderSlot(
  statuses: InvitationStatus[],
  invitedAtOnOrBefore: string,
): Promise<PatientInvitation[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_invitations")
    .select()
    .in("status", statuses)
    .lte("invited_at", invitedAtOnOrBefore);

  if (error) {
    raiseDbError("Failed to list invitations for reminder processing", error);
  }

  return (data as PatientInvitation[]) ?? [];
}
