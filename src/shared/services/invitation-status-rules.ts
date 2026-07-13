/**
 * Invitation action rules — shared status sets and user-facing block messages.
 */

import type { InvitationStatus } from "@domain/invitation.ts";
import type {
  InvitationJourney,
  InvitationJourneyNextStep,
  TokenValidationState,
} from "@domain/invitation.ts";

const TERMINAL_OR_POST_PIPELINE_STATUSES: InvitationStatus[] = [
  "onboarding_completed",
  "consent_viewed",
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

export const INVITED_STATUSES: InvitationStatus[] = [
  "invited_lt_24h",
  "invited_24_48h",
  "invited_gt_48h",
];

/** Invitation statuses where a non-consumed invite token may still be used (validate-token + resume). */
export const TOKEN_PREVIEW_STATUSES: InvitationStatus[] = [
  ...INVITED_STATUSES,
  "email_opened",
  "onboarding_completed",
  "consent_viewed",
  "consent_completed_and_registered",
];

/** Account created; consent not yet accepted (may or may not have viewed the document). */
export const PRE_CONSENT_ACCEPT_STATUSES: InvitationStatus[] = [
  "onboarding_completed",
  "consent_viewed",
];

/** Account step already done — complete-onboarding returns existing resources (idempotent). */
export const RESUMABLE_ONBOARDING_STATUSES: InvitationStatus[] = [
  "onboarding_completed",
  "consent_viewed",
  "consent_completed_and_registered",
];

/** Statuses eligible for automatic never-clicked drop-out (72h, no email_opened_at). */
export const AUTO_DROPOUT_NEVER_CLICKED_STATUSES: InvitationStatus[] = [
  ...INVITED_STATUSES,
];

export const NON_RESENDABLE_STATUSES = TERMINAL_OR_POST_PIPELINE_STATUSES;

export const NON_DROPPABLE_STATUSES: InvitationStatus[] = [
  "onboarding_completed",
  "consent_viewed",
  "consent_completed_and_registered",
  ...TERMINAL_OR_POST_PIPELINE_STATUSES.filter(
    (status) =>
      status !== "onboarding_completed" &&
      status !== "consent_viewed" &&
      status !== "consent_completed_and_registered",
  ),
];

type InvitationAction = "drop_out" | "resend";

const ACTION_VERB: Record<InvitationAction, string> = {
  drop_out: "drop out this invitation",
  resend: "resend invitation",
};

const STATUS_CONTEXT: Partial<Record<InvitationStatus, string>> = {
  onboarding_completed: "the patient has already completed onboarding",
  consent_viewed: "the patient has already viewed the consent document",
  consent_completed_and_registered: "the patient has already completed consent and is registered for the program",
  active: "the patient is active in the program",
  consent_withdrawn: "the patient has withdrawn consent",
  dropped_out_voluntary: "the patient has dropped out",
  dropped_out_clinical: "the patient has dropped out",
  dropped_out_technical: "the patient has dropped out",
  dropped_out_other: "the patient has dropped out",
  expired: "the invitation has expired",
  cancelled: "the invitation has been cancelled",
};

const DROP_OUT_EXTRA: Partial<Record<InvitationStatus, string>> = {
  dropped_out_voluntary: "This invitation has already been marked as dropped out.",
  dropped_out_clinical: "This invitation has already been marked as dropped out.",
  dropped_out_technical: "This invitation has already been marked as dropped out.",
  dropped_out_other: "This invitation has already been marked as dropped out.",
};

function blockedMessage(
  action: InvitationAction,
  status: InvitationStatus,
): string {
  if (action === "drop_out" && DROP_OUT_EXTRA[status]) {
    return DROP_OUT_EXTRA[status]!;
  }

  const context = STATUS_CONTEXT[status];
  if (context) {
    return `Cannot ${ACTION_VERB[action]}: ${context}.`;
  }

  return `Cannot ${ACTION_VERB[action]} with status: ${status}`;
}

export function getDropOutBlockedMessage(status: InvitationStatus): string {
  return blockedMessage("drop_out", status);
}

export function getResendBlockedMessage(status: InvitationStatus): string {
  return blockedMessage("resend", status);
}

export function isDropOutBlocked(status: InvitationStatus): boolean {
  return NON_DROPPABLE_STATUSES.includes(status);
}

export function isResendBlocked(status: InvitationStatus): boolean {
  return NON_RESENDABLE_STATUSES.includes(status);
}

const BLOCKED_JOURNEY_STATUSES: InvitationStatus[] = [
  "dropped_out_voluntary",
  "dropped_out_clinical",
  "dropped_out_technical",
  "dropped_out_other",
  "consent_withdrawn",
  "expired",
  "cancelled",
  "registered",
];

export interface ResolveInvitationJourneyInput {
  invitationStatus?: InvitationStatus;
  tokenState: TokenValidationState;
}

/** Maps invitation checkpoint + token state to the patient's next business step. Pure — no I/O. */
export function resolveInvitationJourney(
  input: ResolveInvitationJourneyInput,
): InvitationJourney {
  const { invitationStatus, tokenState } = input;

  if (tokenState === "consumed") {
    return { next_step: "journey_complete" };
  }

  if (tokenState !== "valid") {
    return { next_step: "blocked" };
  }

  if (!invitationStatus) {
    return { next_step: "blocked" };
  }

  if (INVITED_STATUSES.includes(invitationStatus)) {
    return { next_step: "welcome" };
  }

  const statusToNextStep: Partial<Record<InvitationStatus, InvitationJourneyNextStep>> = {
    email_opened: "create_account",
    onboarding_completed: "consent",
    consent_viewed: "consent",
    consent_completed_and_registered: "program_entry",
    active: "journey_complete",
  };

  const nextStep = statusToNextStep[invitationStatus];
  if (nextStep) {
    return { next_step: nextStep };
  }

  if (BLOCKED_JOURNEY_STATUSES.includes(invitationStatus)) {
    return { next_step: "blocked" };
  }

  return { next_step: "blocked" };
}
