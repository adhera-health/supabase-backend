/**
 * Consent service — latest, accept, withdraw
 */

import {
  getActiveConsentDocument,
  getConsentDocumentById,
  getConsentWithdrawalByInvitationId,
  getCurrentUserConsentByInvitationId,
  getUserConsentByInvitationId,
  insertConsentWithdrawalRow,
  markUserConsentWithdrawn,
} from "@shared/database/queries/consent.query.ts";
import { acceptUserConsentTransactionally } from "@shared/database/queries/transactional-db-rpc.query.ts";
import { resolveAttentionFlagsAfterPatientProgress } from "@shared/services/invitation-lifecycle.service.ts";
import {
  getInvitationById,
  updateInvitationConsentCompleted,
  updateInvitationConsentViewedIfUnset,
  updateInvitationConsentWithdrawn,
} from "@shared/database/queries/invitations.query.ts";
import { getAssignmentByUserClientProgram } from "@shared/database/queries/onboarding.query.ts";
import { PRE_CONSENT_ACCEPT_STATUSES } from "@shared/services/invitation-status-rules.ts";
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@shared/utils/errors.ts";
import type {
  AcceptConsentResponse,
  ConsentDocument,
  ConsentRightsInfo,
  GetLatestConsentResponse,
  UserConsent,
  WithdrawConsentResponse,
} from "@domain/consent.ts";
import type { InvitationStatus, PatientInvitation } from "@domain/invitation.ts";
import type {
  AcceptConsentPayload,
  WithdrawConsentPayload,
} from "@shared/validators/consent.schema.ts";

const CONSENT_ELIGIBLE_STATUSES: InvitationStatus[] = [
  ...PRE_CONSENT_ACCEPT_STATUSES,
  "consent_completed_and_registered",
];

const FIRST_ACCEPT_ELIGIBLE_STATUSES: InvitationStatus[] = [
  ...PRE_CONSENT_ACCEPT_STATUSES,
];

const WITHDRAW_ELIGIBLE_STATUSES: InvitationStatus[] = [
  "consent_completed_and_registered",
  "active",
];

const DOCUMENT_HASH_REGEX = /^[a-f0-9]{64}$/;
const HTTPS_URL_REGEX = /^https:\/\/.+/i;

function toLatestConsentResponse(
  document: ConsentDocument,
  requiresReconsent: boolean,
): GetLatestConsentResponse {
  return {
    consent: {
      consent_document_id: document.id,
      version: document.version,
      document_url: document.document_url,
      document_hash: document.document_hash,
      summary_bullets: document.summary_bullets,
      requires_reconsent: requiresReconsent,
      privacy_notice_url: document.privacy_notice_url,
      data_usage_summary: document.data_usage_summary,
      storage_duration: document.storage_duration,
      rights_info: document.rights_info,
      effective_from: document.effective_from,
    },
  };
}

function assertRightsInfoComplete(rightsInfo: ConsentRightsInfo): void {
  const missingFields = (Object.keys(rightsInfo) as (keyof ConsentRightsInfo)[])
    .filter((field) => rightsInfo[field].trim().length === 0);

  if (missingFields.length > 0) {
    throw new AppError("An internal error occurred", {
      statusCode: 500,
      code: "INTERNAL_ERROR",
      cause: {
        context: "Active consent document has incomplete rights_info",
        missingFields,
      },
    });
  }
}

function assertSummaryBullets(document: ConsentDocument): void {
  if (document.summary_bullets.length < 3 || document.summary_bullets.length > 5) {
    throw new AppError("An internal error occurred", {
      statusCode: 500,
      code: "INTERNAL_ERROR",
      cause: { context: "Active consent document has invalid summary_bullets" },
    });
  }
}

function assertActiveConsentDocumentIntegrity(document: ConsentDocument): void {
  if (!DOCUMENT_HASH_REGEX.test(document.document_hash)) {
    throw new AppError("An internal error occurred", {
      statusCode: 500,
      code: "INTERNAL_ERROR",
      cause: { context: "Active consent document has invalid document_hash" },
    });
  }

  if (!HTTPS_URL_REGEX.test(document.document_url)) {
    throw new AppError("An internal error occurred", {
      statusCode: 500,
      code: "INTERNAL_ERROR",
      cause: { context: "Active consent document has invalid document_url" },
    });
  }

  if (!HTTPS_URL_REGEX.test(document.privacy_notice_url)) {
    throw new AppError("An internal error occurred", {
      statusCode: 500,
      code: "INTERNAL_ERROR",
      cause: { context: "Active consent document has invalid privacy_notice_url" },
    });
  }

  if (document.data_usage_summary.trim().length === 0) {
    throw new AppError("An internal error occurred", {
      statusCode: 500,
      code: "INTERNAL_ERROR",
      cause: { context: "Active consent document has empty data_usage_summary" },
    });
  }

  if (new Date(document.effective_from) > new Date()) {
    throw new BadRequestError("Consent document is not yet effective");
  }

  assertRightsInfoComplete(document.rights_info);
  assertSummaryBullets(document);
}

function userRequiresReconsent(
  currentConsent: UserConsent | null,
  activeDocumentId: number,
): boolean {
  if (!currentConsent) return false;
  return currentConsent.consent_document_id !== activeDocumentId;
}

export async function getLatestConsent(
  userId: string,
  clientId: string,
  programId: string,
): Promise<GetLatestConsentResponse> {
  const assignment = await getAssignmentByUserClientProgram(
    userId,
    clientId,
    programId,
  );

  if (!assignment) {
    throw new ForbiddenError(
      "You do not have access to consent for this client and program",
    );
  }

  const invitation = await getInvitationById(
    assignment.invitation_id,
    "Failed to load invitation for consent access",
  );

  if (!invitation) {
    throw new NotFoundError("Invitation not found");
  }

  if (!CONSENT_ELIGIBLE_STATUSES.includes(invitation.status)) {
    throw new BadRequestError(
      `Cannot access consent for invitation with status: ${invitation.status}`,
    );
  }

  const document = await getActiveConsentDocument(clientId, programId);

  if (!document) {
    throw new NotFoundError(
      "No active consent document found for this client and program",
    );
  }

  assertActiveConsentDocumentIntegrity(document);

  const currentConsent = await getCurrentUserConsentByInvitationId(invitation.id);
  const requiresReconsent = userRequiresReconsent(currentConsent, document.id);

  if (invitation.status === "onboarding_completed") {
    await updateInvitationConsentViewedIfUnset(invitation.id);
  }

  return toLatestConsentResponse(document, requiresReconsent);
}

function toAcceptConsentResponse(
  invitation: PatientInvitation,
  consentDocumentId: number,
  version: string,
  acceptedAt: string,
): AcceptConsentResponse {
  return {
    invitation: {
      invitation_uuid: invitation.uuid,
      status: "consent_completed_and_registered",
    },
    consent: {
      consent_document_id: consentDocumentId,
      version,
      accepted_at: acceptedAt,
    },
  };
}

export interface AcceptConsentContext {
  ip_address: string | null;
  user_agent: string | null;
  user_email: string;
}

export async function acceptConsent(
  userId: string,
  input: AcceptConsentPayload,
  context: AcceptConsentContext,
): Promise<AcceptConsentResponse> {
  if (!context.user_email.trim()) {
    throw new BadRequestError("Authenticated user email is required to accept consent");
  }

  const document = await getConsentDocumentById(input.consent_document_id);

  if (!document) {
    throw new NotFoundError("Consent document not found");
  }

  if (!document.is_active) {
    throw new BadRequestError("Consent document is not active");
  }

  assertActiveConsentDocumentIntegrity(document);

  if (input.document_hash !== document.document_hash) {
    throw new BadRequestError(
      "document_hash does not match the active consent document",
    );
  }

  const assignment = await getAssignmentByUserClientProgram(
    userId,
    document.client_id,
    document.program_id,
  );

  if (!assignment) {
    throw new ForbiddenError(
      "You do not have access to accept consent for this client and program",
    );
  }

  const invitation = await getInvitationById(
    assignment.invitation_id,
    "Failed to load invitation for consent accept",
  );

  if (!invitation) {
    throw new NotFoundError("Invitation not found");
  }

  const activeDocument = await getActiveConsentDocument(
    document.client_id,
    document.program_id,
  );

  if (!activeDocument || activeDocument.id !== document.id) {
    throw new BadRequestError("Consent document is no longer the active version");
  }

  const currentConsent = await getCurrentUserConsentByInvitationId(invitation.id);
  const isReconsent = userRequiresReconsent(currentConsent, document.id);

  if (currentConsent) {
    if (currentConsent.user_id !== userId) {
      throw new ConflictError("Consent has already been accepted for this invitation");
    }

    if (!isReconsent) {
      return toAcceptConsentResponse(
        invitation,
        currentConsent.consent_document_id,
        currentConsent.consent_version,
        invitation.consent_completed_at ?? currentConsent.accepted_at,
      );
    }
  } else if (invitation.status === "consent_completed_and_registered") {
    throw new BadRequestError(
      "Invitation is marked consent completed but no current consent record exists",
    );
  }

  if (!isReconsent && !FIRST_ACCEPT_ELIGIBLE_STATUSES.includes(invitation.status)) {
    throw new BadRequestError(
      `Cannot accept consent for invitation with status: ${invitation.status}`,
    );
  }

  if (isReconsent && !CONSENT_ELIGIBLE_STATUSES.includes(invitation.status)) {
    throw new BadRequestError(
      `Cannot re-accept consent for invitation with status: ${invitation.status}`,
    );
  }

  const acceptedAt = new Date().toISOString();
  const normalizedEmail = context.user_email.trim().toLowerCase();

  const evidencePayload = {
    user_id: userId,
    email: normalizedEmail,
    consent_version: document.version,
    document_hash: document.document_hash,
    privacy_notice_url: document.privacy_notice_url,
    read_and_understood_accepted: true,
    participation_and_data_processing_accepted: true,
    accepted_at: acceptedAt,
    ip_address: context.ip_address,
    user_agent: context.user_agent,
    is_reconsent: isReconsent,
  };

  try {
    await acceptUserConsentTransactionally(
      isReconsent && currentConsent ? currentConsent.id : null,
      isReconsent && currentConsent ? acceptedAt : null,
      {
        user_id: userId,
        email: normalizedEmail,
        invitation_id: invitation.id,
        program_id: document.program_id,
        consent_document_id: document.id,
        consent_version: document.version,
        document_hash: document.document_hash,
        accepted: true,
        accepted_at: acceptedAt,
        ip_address: context.ip_address,
        user_agent: context.user_agent,
        evidence_payload_json: evidencePayload,
      },
    );
  } catch (error) {
    if (error instanceof ConflictError) {
      const existing = await getCurrentUserConsentByInvitationId(invitation.id);
      if (existing?.user_id === userId && existing.consent_document_id === document.id) {
        return toAcceptConsentResponse(
          invitation,
          existing.consent_document_id,
          existing.consent_version,
          invitation.consent_completed_at ?? existing.accepted_at,
        );
      }
    }
    throw error;
  }

  const updatedInvitation = await updateInvitationConsentCompleted(
    invitation.id,
    acceptedAt,
  );

  await resolveAttentionFlagsAfterPatientProgress(invitation.id, ["no_consent_24h"]);

  return toAcceptConsentResponse(
    updatedInvitation,
    document.id,
    document.version,
    updatedInvitation.consent_completed_at ?? acceptedAt,
  );
}

function toWithdrawConsentResponse(
  invitation: PatientInvitation,
  consentDocumentId: number,
  withdrawnAt: string,
): WithdrawConsentResponse {
  return {
    invitation: {
      invitation_uuid: invitation.uuid,
      status: "consent_withdrawn",
    },
    consent: {
      consent_document_id: consentDocumentId,
      withdrawn_at: withdrawnAt,
    },
  };
}

export interface WithdrawConsentContext {
  ip_address: string | null;
  user_agent: string | null;
}

export async function withdrawConsent(
  userId: string,
  input: WithdrawConsentPayload,
  context: WithdrawConsentContext,
): Promise<WithdrawConsentResponse> {
  const document = await getConsentDocumentById(input.consent_document_id);

  if (!document) {
    throw new NotFoundError("Consent document not found");
  }

  const assignment = await getAssignmentByUserClientProgram(
    userId,
    document.client_id,
    document.program_id,
  );

  if (!assignment) {
    throw new ForbiddenError(
      "You do not have access to withdraw consent for this client and program",
    );
  }

  const invitation = await getInvitationById(
    assignment.invitation_id,
    "Failed to load invitation for consent withdrawal",
  );

  if (!invitation) {
    throw new NotFoundError("Invitation not found");
  }

  const existingWithdrawal = await getConsentWithdrawalByInvitationId(invitation.id);

  if (existingWithdrawal) {
    if (existingWithdrawal.user_id !== userId) {
      throw new ConflictError("Consent has already been withdrawn for this invitation");
    }

    if (existingWithdrawal.consent_document_id !== input.consent_document_id) {
      throw new BadRequestError(
        "consent_document_id does not match the withdrawn consent record",
      );
    }

    return toWithdrawConsentResponse(
      invitation,
      existingWithdrawal.consent_document_id,
      existingWithdrawal.withdrawn_at,
    );
  }

  if (invitation.status === "consent_withdrawn") {
    const withdrawnConsent = await getUserConsentByInvitationId(invitation.id);

    if (
      withdrawnConsent?.is_withdrawn &&
      withdrawnConsent.consent_document_id === input.consent_document_id
    ) {
      return toWithdrawConsentResponse(
        invitation,
        withdrawnConsent.consent_document_id,
        withdrawnConsent.withdrawn_at ?? new Date().toISOString(),
      );
    }

    throw new BadRequestError("No active consent found to withdraw");
  }

  if (!WITHDRAW_ELIGIBLE_STATUSES.includes(invitation.status)) {
    throw new BadRequestError(
      `Cannot withdraw consent for invitation with status: ${invitation.status}`,
    );
  }

  const currentConsent = await getCurrentUserConsentByInvitationId(invitation.id);

  if (!currentConsent) {
    throw new BadRequestError("No active consent found to withdraw");
  }

  if (currentConsent.user_id !== userId) {
    throw new ForbiddenError("You do not have access to withdraw this consent");
  }

  if (currentConsent.consent_document_id !== input.consent_document_id) {
    throw new BadRequestError(
      "consent_document_id does not match the accepted consent record",
    );
  }

  const withdrawnAt = new Date().toISOString();

  const evidencePayload = {
    user_id: userId,
    email: currentConsent.email,
    consent_document_id: document.id,
    consent_version: document.version,
    withdrawn_at: withdrawnAt,
    ip_address: context.ip_address,
    user_agent: context.user_agent,
    reason: input.reason ?? null,
  };

  try {
    await insertConsentWithdrawalRow({
      user_id: userId,
      invitation_id: invitation.id,
      user_consent_id: currentConsent.id,
      consent_document_id: document.id,
      withdrawn_at: withdrawnAt,
      ip_address: context.ip_address,
      user_agent: context.user_agent,
      reason: input.reason ?? null,
      evidence_payload_json: evidencePayload,
    });
  } catch (error) {
    if (error instanceof ConflictError) {
      const withdrawal = await getConsentWithdrawalByInvitationId(invitation.id);
      if (withdrawal?.user_id === userId) {
        return toWithdrawConsentResponse(
          invitation,
          withdrawal.consent_document_id,
          withdrawal.withdrawn_at,
        );
      }
    }
    throw error;
  }

  await markUserConsentWithdrawn(currentConsent.id, withdrawnAt);

  const updatedInvitation = await updateInvitationConsentWithdrawn(invitation.id);

  return toWithdrawConsentResponse(
    updatedInvitation,
    document.id,
    withdrawnAt,
  );
}
