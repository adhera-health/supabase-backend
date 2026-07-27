/**
 * Reminder engine + communication opt-out types (Phase 1).
 * Spec: onboarding-doc §4.1, §9
 */

/** Delivery channel for a scheduled reminder (+2h / +24h / +48h). */
export const REMINDER_DELIVERY_TYPES = ["email", "email_consent", "dashboard_flag"] as const;

export type ReminderDeliveryType = (typeof REMINDER_DELIVERY_TYPES)[number];

/** Schedule offset from invitation time (PRD §9). */
export const REMINDER_SCHEDULE_SLOTS = ["2h", "24h", "48h"] as const;

export type ReminderScheduleSlot = (typeof REMINDER_SCHEDULE_SLOTS)[number];

export const REMINDER_LOG_STATUSES = ["pending", "sent", "skipped", "failed"] as const;

export type ReminderLogStatus = (typeof REMINDER_LOG_STATUSES)[number];

/** Opt-out channel for POST /patient-opt-out-email-reminders/opt-out. */
export const COMMUNICATION_OPT_OUT_CHANNELS = ["email", "all"] as const;

export type CommunicationOptOutChannel = (typeof COMMUNICATION_OPT_OUT_CHANNELS)[number];

/** Row: onboarding_reminder_logs */
export interface OnboardingReminderLogRow {
  id: number;
  invitation_id: number;
  reminder_type: ReminderDeliveryType;
  schedule_slot: ReminderScheduleSlot;
  scheduled_for: string;
  sent_at: string | null;
  status: ReminderLogStatus;
  error_message: string | null;
  created_at: string;
}

/** Insert onboarding_reminder_logs (server-side). */
export interface InsertOnboardingReminderLogInput {
  invitation_id: number;
  reminder_type: ReminderDeliveryType;
  schedule_slot: ReminderScheduleSlot;
  scheduled_for: string;
  sent_at?: string | null;
  status?: ReminderLogStatus;
  error_message?: string | null;
}

/** Row: communication_opt_outs */
export interface CommunicationOptOutRow {
  id: number;
  invitation_id: number;
  user_id: string | null;
  channel: CommunicationOptOutChannel;
  opted_out_at: string;
  created_at: string;
}

/** Insert communication_opt_outs (server-side). */
export interface InsertCommunicationOptOutInput {
  invitation_id: number;
  user_id?: string | null;
  channel: CommunicationOptOutChannel;
  opted_out_at?: string;
}

/** POST /patient-opt-out-email-reminders/opt-out — request body */
export interface OptOutCommunicationInput {
  invitation_id?: string;
  user_id?: string;
  /** Signed token from reminder email opt-out link (preferred). */
  opt_out_token?: string;
  channel: CommunicationOptOutChannel;
}

/** POST /patient-opt-out-email-reminders/opt-out — response body (inside success.data) */
export interface OptOutCommunicationResponse {
  opt_out: {
    invitation_uuid: string;
    channel: CommunicationOptOutChannel;
    opted_out_at: string;
    already_recorded: boolean;
  };
}

/** Why a reminder was skipped (stored in error_message for skipped logs). */
export const REMINDER_SKIP_REASONS = [
  "not_due",
  "already_logged",
  "terminal_status",
  "onboarding_complete",
  "opted_out",
  "not_eligible",
] as const;

export type ReminderSkipReason = (typeof REMINDER_SKIP_REASONS)[number];

export interface ReminderProcessResult {
  invitation_uuid: string;
  schedule_slot: ReminderScheduleSlot;
  reminder_type: ReminderDeliveryType;
  status: ReminderLogStatus;
  skip_reason?: ReminderSkipReason;
  already_logged: boolean;
}

import type { InvitationLifecycleRunSummary } from "@domain/attention.ts";

export interface ReminderRunSummary {
  as_of: string;
  lifecycle: InvitationLifecycleRunSummary | null;
  results: ReminderProcessResult[];
  counts: {
    sent: number;
    skipped: number;
    failed: number;
    already_logged: number;
  };
}

/** POST /api/v1/reminders/run — response body (inside success.data) */
export interface RunRemindersResponse {
  run: ReminderRunSummary;
}

/** GET /reminders/logs — one reminder history row (joined to member). */
export interface ReminderLogResource {
  invitation_uuid: string;
  email: string;
  reminder_type: ReminderDeliveryType;
  schedule_slot: ReminderScheduleSlot;
  status: ReminderLogStatus;
  scheduled_for: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

/** GET /reminders/logs — response body */
export interface ListReminderLogsResponse {
  logs: ReminderLogResource[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}
