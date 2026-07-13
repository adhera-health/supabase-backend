/**
 * Invitation service layer (business rules + orchestration).
 */

import {
  createActiveTokenRow,
  createInvitationRow,
  deactivateAllActiveTokensForInvitation,
  findEnrollmentAssignmentByEmailProgramClient,
  findEnrolledInvitationByEmailProgramClient,
  findPipelineInvitationByEmailProgramClient,
  findTokenByHash,
  getInvitationById,
  getInvitationByUuid,
  getInvitationPreviewForValidToken,
  insertDropOutReasonRow,
  insertInvitationDropoutRow,
  listInvitations as listInvitationsQuery,
  updateInvitationDropOut,
  updateInvitationEmailOpenedIfUnset,
  updateInvitationLatestToken,
} from "@shared/database/queries/invitations.query.ts";
import { resendInvitationTokenTransactionally } from "@shared/database/queries/transactional-db-rpc.query.ts";
import {
  listActiveAttentionFlagsByInvitationId,
  listActiveAttentionFlagsByInvitationIds,
} from "@shared/database/queries/patient-attention-flag.query.ts";
import { resolveAttentionFlagsAfterPatientProgress } from "@shared/services/invitation-lifecycle.service.ts";
import { resolveInvitationLicenseSnapshot } from "@shared/services/invitation-license-snapshot.service.ts";
import { normalizeInvitationTenantIds } from "@shared/utils/normalize-invitation-tenant-ids.ts";
import type { ListInvitationsFilters } from "@shared/database/queries/invitations.query.ts";
import {
  applyAdminScopeToListFilters,
  assertAdminCanAccessClientProgram,
  resolveAdminScope,
  type AdminScope,
} from "@shared/auth/admin-scope.ts";
import { assertStaffInvitationAccess } from "@shared/auth/invitation-access.ts";
import { shouldScopeInvitationsToCreator } from "@shared/auth/rbac.ts";
import type { AuthenticatedUser } from "@shared/auth/request-auth.ts";
import { BadRequestError, ConflictError, NotFoundError } from "@shared/utils/errors.ts";
import type {
  DropOutInvitationResponse,
  DropOutReasonType,
  InvitationDropoutFailureStage,
  InvitationStatus,
  ListInvitationsResponse,
  CreateInvitationSendInput,
  CreatePatientInvitationInput,
  PatientInvitation,
  TokenValidationState,
  ValidateTokenResult,
} from "@domain/invitation.ts";
import type { GetInvitationAttentionReasonsResponse } from "@domain/attention.ts";
import type {
  DropOutInvitationBodyPayload,
  ListInvitationsQueryPayload,
} from "@shared/validators/invitation.schema.ts";
import {
  hashInvitationToken,
  resolveInvitationTokenState,
} from "@shared/utils/invitation-token.ts";
import {
  getDropOutBlockedMessage,
  getResendBlockedMessage,
  INVITED_STATUSES,
  isDropOutBlocked,
  isResendBlocked,
  resolveInvitationJourney,
  TOKEN_PREVIEW_STATUSES,
} from "@shared/services/invitation-status-rules.ts";

const TOKEN_TTL_HOURS = 72;

function assertDropOutAllowed(status: InvitationStatus): void {
  if (!isDropOutBlocked(status)) return;
  throw new BadRequestError(getDropOutBlockedMessage(status));
}

function assertResendAllowed(status: InvitationStatus): void {
  if (!isResendBlocked(status)) return;
  throw new BadRequestError(getResendBlockedMessage(status));
}

const AUTO_DROPOUT_FREE_TEXT: Record<
  Exclude<InvitationDropoutFailureStage, "staff_recorded">,
  string
> = {
  never_clicked:
    "Automatically dropped out: invitation link was not opened within 72 hours.",
  post_click_pre_register:
    "Automatically dropped out: onboarding was not completed after reminders.",
};

const REASON_TYPE_TO_STATUS: Record<DropOutReasonType, InvitationStatus> = {
  voluntary: "dropped_out_voluntary",
  clinical: "dropped_out_clinical",
  technical: "dropped_out_technical",
  other: "dropped_out_other",
};

export interface CreateInvitationResult {
  invitation: PatientInvitation;
  /** Plaintext token for the onboarding email — never stored in DB */
  token: string;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

/** Cryptographically secure token (OWASP). Only the hash is persisted. */
function generateSecureToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function insertActiveTokenForInvitation(
  invitationId: number,
): Promise<{ tokenRowId: number; plaintextToken: string }> {
  const plaintextToken = generateSecureToken();
  const tokenHash = await hashInvitationToken(plaintextToken);
  const expiresAt = addHours(new Date(), TOKEN_TTL_HOURS).toISOString();
  const tokenRow = await createActiveTokenRow(invitationId, tokenHash, expiresAt);

  return {
    tokenRowId: tokenRow.id,
    plaintextToken,
  };
}

export async function assertInvitationSendAllowed(
  email: string,
  clientId: string,
  programId: string,
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  const enrolledInvitation = await findEnrolledInvitationByEmailProgramClient(
    normalizedEmail,
    clientId,
    programId,
  );

  if (enrolledInvitation) {
    throw new ConflictError(
      "This patient is already registered for this program.",
      { invitation_uuid: enrolledInvitation.uuid, status: enrolledInvitation.status },
    );
  }

  const existingAssignment = await findEnrollmentAssignmentByEmailProgramClient(
    normalizedEmail,
    clientId,
    programId,
  );

  if (existingAssignment) {
    throw new ConflictError(
      "This patient is already registered for this program.",
      { invitation_uuid: existingAssignment.invitation_uuid },
    );
  }

  const pipelineInvitation = await findPipelineInvitationByEmailProgramClient(
    normalizedEmail,
    clientId,
    programId,
  );

  if (pipelineInvitation) {
    throw new ConflictError(
      "An active invitation already exists for this email, program, and client.",
      { invitation_uuid: pipelineInvitation.uuid, status: pipelineInvitation.status },
    );
  }
}

export async function createInvitationWithToken(
  input: CreateInvitationSendInput,
  adminScope?: AdminScope,
): Promise<CreateInvitationResult> {
  const normalized = normalizeInvitationTenantIds(input.client_id, input.program_id);

  const dbInput: CreatePatientInvitationInput = {
    email: input.email,
    client_id: normalized.client_id,
    program_id: normalized.program_id,
    invited_by_user_id: input.invited_by_user_id,
  };

  if (adminScope) {
    assertAdminCanAccessClientProgram(adminScope, dbInput.client_id, dbInput.program_id);
  }

  await assertInvitationSendAllowed(dbInput.email, dbInput.client_id, dbInput.program_id);

  const licenseSnapshot = normalized.licenseSnapshot ??
    await resolveInvitationLicenseSnapshot(dbInput.client_id, dbInput.program_id);

  const invitation = await createInvitationRow({
    ...dbInput,
    ...licenseSnapshot,
  });
  const { tokenRowId, plaintextToken } = await insertActiveTokenForInvitation(
    invitation.id,
  );
  const updatedInvitation = await updateInvitationLatestToken(invitation.id, tokenRowId);

  return {
    invitation: updatedInvitation,
    token: plaintextToken,
  };
}

export async function resendInvitationToken(
  invitationUuid: string,
  actor: AuthenticatedUser,
): Promise<CreateInvitationResult> {
  const invitation = await getInvitationByUuid(
    invitationUuid,
    "Failed to load invitation for resend",
  );

  if (!invitation) throw new NotFoundError("Invitation not found");

  assertStaffInvitationAccess(actor, invitation);
  assertResendAllowed(invitation.status);

  const plaintextToken = generateSecureToken();
  const tokenHash = await hashInvitationToken(plaintextToken);
  const expiresAt = addHours(new Date(), TOKEN_TTL_HOURS).toISOString();

  await resendInvitationTokenTransactionally(invitation.id, tokenHash, expiresAt);

  const updatedInvitation = await getInvitationByUuid(
    invitationUuid,
    "Failed to reload invitation after resend",
  );

  if (!updatedInvitation) throw new NotFoundError("Invitation not found");

  return {
    invitation: updatedInvitation,
    token: plaintextToken,
  };
}

function toValidateTokenInvitation(
  invitation: Pick<
    PatientInvitation,
    "uuid" | "email" | "client_id" | "program_id" | "status"
  >,
): NonNullable<ValidateTokenResult["invitation"]> {
  return {
    invitation_uuid: invitation.uuid,
    email: invitation.email,
    client_id: invitation.client_id,
    program_id: invitation.program_id,
    status: invitation.status,
  };
}

function attachJourneyToValidateTokenResult(
  result: Omit<ValidateTokenResult, "journey">,
  invitationStatus?: InvitationStatus,
): ValidateTokenResult {
  const tokenState: TokenValidationState = result.token.state;
  const resolvedStatus = invitationStatus ?? result.invitation?.status;

  return {
    ...result,
    journey: resolveInvitationJourney({
      tokenState,
      invitationStatus: resolvedStatus,
    }),
  };
}

async function resolveInvitationTokenValidation(plainToken: string): Promise<{
  result: ValidateTokenResult;
  invitationId?: number;
  emailOpenedAt?: string | null;
}> {
  const tokenHash = await hashInvitationToken(plainToken);
  const tokenRow = await findTokenByHash(tokenHash);

  if (!tokenRow) {
    return {
      result: attachJourneyToValidateTokenResult({ token: { state: "invalid" } }),
    };
  }

  const state = resolveInvitationTokenState(tokenRow);
  if (state !== "valid") {
    return {
      result: attachJourneyToValidateTokenResult({ token: { state } }),
    };
  }

  const invitation = await getInvitationPreviewForValidToken(tokenRow.invitation_id);

  if (!invitation) {
    return {
      result: attachJourneyToValidateTokenResult({ token: { state: "invalid" } }),
    };
  }

  if (!TOKEN_PREVIEW_STATUSES.includes(invitation.status)) {
    return {
      result: attachJourneyToValidateTokenResult(
        { token: { state: "invalid" } },
        invitation.status,
      ),
    };
  }

  return {
    result: attachJourneyToValidateTokenResult({
      token: { state: "valid" },
      invitation: toValidateTokenInvitation(invitation),
    }),
    invitationId: invitation.id,
    emailOpenedAt: invitation.email_opened_at,
  };
}

/** Read-only token preview for complete-onboarding (no email_opened side effects). */
export async function previewInvitationToken(
  plainToken: string,
): Promise<ValidateTokenResult> {
  const { result } = await resolveInvitationTokenValidation(plainToken);
  return result;
}

/**
 * GET validate-token — validates onboarding token and records email_opened on first success.
 */
export async function validateInvitationToken(
  plainToken: string,
): Promise<ValidateTokenResult> {
  const resolved = await resolveInvitationTokenValidation(plainToken);

  if (
    resolved.result.token.state !== "valid" ||
    !resolved.result.invitation ||
    resolved.invitationId === undefined
  ) {
    return resolved.result;
  }

  if (resolved.emailOpenedAt) {
    return resolved.result;
  }

  const emailOpenedAt = new Date().toISOString();
  const updated = await updateInvitationEmailOpenedIfUnset(
    resolved.invitationId,
    emailOpenedAt,
  );

  if (updated) {
    return attachJourneyToValidateTokenResult({
      token: { state: "valid" },
      invitation: toValidateTokenInvitation(updated),
      email_opened_recorded: true,
    });
  }

  const current = await getInvitationById(
    resolved.invitationId,
    "Failed to reload invitation after email opened",
  );

  if (!current || !TOKEN_PREVIEW_STATUSES.includes(current.status)) {
    return attachJourneyToValidateTokenResult(
      { token: { state: "invalid" } },
      current?.status,
    );
  }

  return attachJourneyToValidateTokenResult({
    token: { state: "valid" },
    invitation: toValidateTokenInvitation(current),
  });
}

/** Rotates the active onboarding token for reminder emails (never-clicked patients). */
export async function rotateOnboardingTokenForReminder(
  invitationId: number,
): Promise<string> {
  const plaintextToken = generateSecureToken();
  const tokenHash = await hashInvitationToken(plaintextToken);
  const expiresAt = addHours(new Date(), TOKEN_TTL_HOURS).toISOString();

  await resendInvitationTokenTransactionally(invitationId, tokenHash, expiresAt);

  return plaintextToken;
}

async function recordInvitationDropOut(input: {
  invitation: PatientInvitation;
  reasonType: DropOutReasonType;
  freeText: string | null;
  dropoutSource: "staff" | "auto";
  failureStage: InvitationDropoutFailureStage;
  recordedByUserId: string | null;
}): Promise<PatientInvitation> {
  const droppedOutAt = new Date().toISOString();
  const newStatus = REASON_TYPE_TO_STATUS[input.reasonType];

  const reasonRow = await insertDropOutReasonRow({
    invitationId: input.invitation.id,
    userId: input.recordedByUserId,
    reasonType: input.reasonType,
    freeText: input.freeText,
    dropoutSource: input.dropoutSource,
    failureStage: input.failureStage,
  });

  await insertInvitationDropoutRow({
    invitationId: input.invitation.id,
    dropOutReasonId: reasonRow.id,
    failureStage: input.failureStage,
    dropoutSource: input.dropoutSource,
  });

  const updatedInvitation = await updateInvitationDropOut(
    input.invitation.id,
    newStatus,
    droppedOutAt,
    reasonRow.id,
  );

  await deactivateAllActiveTokensForInvitation(input.invitation.id);
  await resolveAttentionFlagsAfterPatientProgress(input.invitation.id, [
    "not_registered_24h",
    "no_consent_24h",
  ]);

  return updatedInvitation;
}

/**
 * Auto drop-out from lifecycle cron — idempotent when already terminal.
 * Returns true when a new drop-out was recorded.
 */
export async function autoDropOutInvitation(
  invitationId: number,
  failureStage: Exclude<InvitationDropoutFailureStage, "staff_recorded">,
): Promise<boolean> {
  const invitation = await getInvitationById(
    invitationId,
    "Failed to load invitation for auto drop-out",
  );

  if (!invitation) return false;
  if (isDropOutBlocked(invitation.status)) return false;

  if (failureStage === "never_clicked") {
    if (!INVITED_STATUSES.includes(invitation.status)) return false;
    if (invitation.email_opened_at) return false;
  }

  if (failureStage === "post_click_pre_register") {
    if (invitation.status !== "email_opened") return false;
    if (invitation.registered_at) return false;
  }

  await recordInvitationDropOut({
    invitation,
    reasonType: "other",
    freeText: AUTO_DROPOUT_FREE_TEXT[failureStage],
    dropoutSource: "auto",
    failureStage,
    recordedByUserId: null,
  });

  return true;
}

export async function listInvitationsForAdmin(
  actor: AuthenticatedUser,
  filters: ListInvitationsQueryPayload,
): Promise<ListInvitationsResponse> {
  const scope = resolveAdminScope(actor);
  const scopedFilters = applyAdminScopeToListFilters(scope, filters) as ListInvitationsFilters;

  if (shouldScopeInvitationsToCreator(actor)) {
    scopedFilters.invitedByUserId = actor.id;
  }

  const queryResult = await listInvitationsQuery(scopedFilters);

  const invitationIds = [...queryResult.invitationIdsByUuid.values()];
  const flagsByInvitationId = await listActiveAttentionFlagsByInvitationIds(invitationIds);

  const invitations = queryResult.invitations.map((item) => {
    const invitationId = queryResult.invitationIdsByUuid.get(item.invitation_uuid);
    const attention_flags = invitationId
      ? flagsByInvitationId.get(invitationId) ?? []
      : [];

    return {
      ...item,
      attention_flags,
    };
  });

  return {
    invitations,
    pagination: queryResult.pagination,
  };
}

export async function getInvitationAttentionReasonsForAdmin(
  invitationUuid: string,
  actor: AuthenticatedUser,
): Promise<GetInvitationAttentionReasonsResponse> {
  const invitation = await getInvitationForAdminAction(invitationUuid, actor);
  const attention_flags = await listActiveAttentionFlagsByInvitationId(invitation.id);

  return {
    invitation_uuid: invitation.uuid,
    attention_flags,
  };
}

export async function getInvitationForAdminAction(
  invitationUuid: string,
  actor: AuthenticatedUser,
): Promise<PatientInvitation> {
  const invitation = await getInvitationByUuid(
    invitationUuid,
    "Failed to load invitation",
  );

  if (!invitation) throw new NotFoundError("Invitation not found");

  assertAdminCanAccessClientProgram(
    resolveAdminScope(actor),
    invitation.client_id,
    invitation.program_id,
  );

  return invitation;
}

export async function dropOutInvitation(
  invitationUuid: string,
  input: DropOutInvitationBodyPayload,
  recordedByUserId: string,
): Promise<DropOutInvitationResponse> {
  const invitation = await getInvitationByUuid(
    invitationUuid,
    "Failed to load invitation for drop-out",
  );

  if (!invitation) throw new NotFoundError("Invitation not found");
  assertDropOutAllowed(invitation.status);

  const updatedInvitation = await recordInvitationDropOut({
    invitation,
    reasonType: input.reason_type,
    freeText: input.free_text ?? null,
    dropoutSource: "staff",
    failureStage: "staff_recorded",
    recordedByUserId,
  });

  const droppedOutAt = updatedInvitation.dropped_out_at ?? new Date().toISOString();

  return {
    invitation: {
      invitation_uuid: updatedInvitation.uuid,
      status: updatedInvitation.status,
      dropped_out_at: droppedOutAt,
    },
    drop_out: {
      reason_type: input.reason_type,
    },
  };
}
