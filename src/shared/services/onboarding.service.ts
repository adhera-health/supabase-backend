/**
 * Onboarding service — complete-onboarding (account + program assignment).
 */

import { createPatientLicense } from "@integrations/license/license.service.ts";
import { getAnonAuthClient, getServiceClient } from "@shared/database/client.ts";
import { completeOnboardingTransactionally } from "@shared/database/queries/transactional-db-rpc.query.ts";
import { getLicenseByInvitationId } from "@shared/database/queries/license.query.ts";
import {
  findTokenByHash,
  getInvitationById,
  markInvitationActiveOnProgramUse,
  touchInvitationLastActivityAt,
} from "@shared/database/queries/invitations.query.ts";
import {
  getAssignmentByInvitationId,
  getAssignmentByUserClientProgram,
} from "@shared/database/queries/onboarding.query.ts";
import { resolveAttentionFlagsAfterPatientProgress } from "@shared/services/invitation-lifecycle.service.ts";
import {
  RESUMABLE_ONBOARDING_STATUSES,
} from "@shared/services/invitation-status-rules.ts";
import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "@shared/utils/errors.ts";
import {
  hashInvitationToken,
  resolveInvitationTokenState,
} from "@shared/utils/invitation-token.ts";
import {
  toSessionResource,
  toUserResource,
} from "@shared/utils/api-mappers.ts";
import { createLogger } from "@shared/utils/logger.ts";
import type { InvitationStatus, PatientInvitation } from "@domain/invitation.ts";
import type { CreatedLicense, LicenseSource } from "@domain/license.ts";
import type { OnboardingAssignment } from "@domain/onboarding.ts";
import type {
  CompleteOnboardingResponse,
  CompleteOnboardingResult,
  MarkInvitationActiveResponse,
} from "@domain/onboarding.ts";
import type { CompleteOnboardingPayload } from "@shared/validators/onboarding.schema.ts";

const logger = createLogger("onboarding-service");

const REGISTERABLE_INVITATION_STATUSES: InvitationStatus[] = [
  "invited_lt_24h",
  "invited_24_48h",
  "invited_gt_48h",
  "email_opened",
];

const BLOCKED_COMPLETE_ONBOARDING_STATUSES: InvitationStatus[] = [
  "active",
  "dropped_out_voluntary",
  "dropped_out_clinical",
  "dropped_out_technical",
  "dropped_out_other",
  "consent_withdrawn",
  "expired",
  "cancelled",
  "registered",
];

const TOKEN_STATE_MESSAGES: Record<string, string> = {
  expired: "Invitation token has expired",
  consumed: "Invitation token has already been used",
  superseded: "Invitation token is no longer valid",
  invalid: "Invitation token is invalid",
};

function isExistingUserError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("already been registered") ||
    normalized.includes("already exists") ||
    normalized.includes("user already registered")
  );
}

async function signInPatient(
  email: string,
  password: string,
): Promise<{ userId: string; session: { access_token: string; refresh_token: string; expires_in?: number; token_type?: string } }> {
  const anonClient = getAnonAuthClient();
  const { data: sessionData, error: signInError } = await anonClient.auth
    .signInWithPassword({ email, password });

  if (signInError || !sessionData.session || !sessionData.user) {
    throw new UnauthorizedError("Invalid email or password for this invitation");
  }

  const session = sessionData.session;

  if (!session.access_token || !session.refresh_token) {
    throw new UnauthorizedError("Unable to establish patient session");
  }

  return {
    userId: sessionData.user.id,
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      token_type: session.token_type,
    },
  };
}

/** Creates a new Supabase patient account or signs in an existing one. */
async function establishPatientSession(
  email: string,
  password: string,
): Promise<{ userId: string; session: { access_token: string; refresh_token: string; expires_in?: number; token_type?: string } }> {
  const serviceClient = getServiceClient();

  const { data: createdUser, error: createError } = await serviceClient.auth.admin
    .createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "patient" },
    });

  if (!createError && createdUser.user) {
    return signInPatient(email, password);
  }

  if (createError && isExistingUserError(createError.message)) {
    return signInPatient(email, password);
  }

  if (createError) {
    throw new AppError("Unable to create patient account", {
      statusCode: 400,
      code: "BAD_REQUEST",
      cause: { authMessage: createError.message },
    });
  }

  throw new AppError("Unable to create patient account", {
    statusCode: 500,
    code: "INTERNAL_ERROR",
  });
}

function buildCompleteOnboardingResponse(
  invitation: PatientInvitation,
  userId: string,
  email: string,
  session: { access_token: string; refresh_token: string; expires_in?: number; token_type?: string },
  assignment: Pick<OnboardingAssignment, "assigned_at">,
  status: InvitationStatus,
  registeredAt: string,
): CompleteOnboardingResponse {
  return {
    user: toUserResource(userId, email),
    session: toSessionResource(session),
    invitation: {
      invitation_uuid: invitation.uuid,
      client_id: invitation.client_id,
      program_id: invitation.program_id,
      status,
      registered_at: registeredAt,
    },
    onboarding: {
      assigned_at: assignment.assigned_at,
    },
  };
}

function requireInvitationLicenseSnapshot(invitation: PatientInvitation): {
  license_client_id: number;
  license_program_id: number;
  core_api_host: string;
} {
  const { license_client_id, license_program_id, core_api_host } = invitation;

  if (
    license_client_id == null ||
    license_program_id == null ||
    !core_api_host?.trim()
  ) {
    throw new AppError(
      "Invitation is missing license snapshot fields required to complete onboarding",
      { statusCode: 500, code: "INTERNAL_ERROR" },
    );
  }

  return {
    license_client_id,
    license_program_id,
    core_api_host: core_api_host.trim(),
  };
}

function isConcurrentCompleteConflict(error: unknown): boolean {
  if (!(error instanceof ConflictError)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("license already exists") ||
    message.includes("onboarding assignment already exists")
  );
}

async function registerInvitationAssignmentForPatient(
  userId: string,
  invitation: PatientInvitation,
  license: CreatedLicense,
): Promise<{
  registeredAt: string;
  assignedAt: string;
  status: InvitationStatus;
  license: {
    source: LicenseSource;
    license_client_id: number;
    license_program_id: number;
  };
}> {
  const now = new Date().toISOString();
  const licenseMeta = {
    source: license.source,
    license_client_id: license.license_client_id,
    license_program_id: license.license_program_id,
  };

  try {
    const result = await completeOnboardingTransactionally({
      user_id: userId,
      invitation_id: invitation.id,
      client_id: invitation.client_id,
      program_id: invitation.program_id,
      assigned_at: now,
      registered_at: now,
      license: {
        code: license.code,
        core_api_host: license.core_api_host,
        license_client_id: license.license_client_id,
        license_program_id: license.license_program_id,
        role: license.role,
        is_available: license.is_available,
        source: license.source,
      },
    });

    await resolveAttentionFlagsAfterPatientProgress(invitation.id, ["not_registered_24h"]);

    return {
      registeredAt: result.registered_at,
      assignedAt: result.assigned_at,
      status: "onboarding_completed",
      license: licenseMeta,
    };
  } catch (error) {
    // Concurrent complete: another request may have persisted license+assignment.
    if (!isConcurrentCompleteConflict(error)) {
      throw error;
    }

    const existingAssignment = await getAssignmentByInvitationId(invitation.id);
    const existingLicense = await getLicenseByInvitationId(invitation.id);

    if (
      existingAssignment &&
      existingLicense &&
      existingAssignment.user_id === userId
    ) {
      logger.warn("complete-onboarding recovered after concurrent license/assignment write", {
        invitation_id: invitation.id,
      });
      await resolveAttentionFlagsAfterPatientProgress(invitation.id, ["not_registered_24h"]);
      return {
        registeredAt: existingAssignment.assigned_at,
        assignedAt: existingAssignment.assigned_at,
        status: "onboarding_completed",
        license: {
          source: existingLicense.source,
          license_client_id: existingLicense.license_client_id,
          license_program_id: existingLicense.license_program_id,
        },
      };
    }

    throw error;
  }
}

/**
 * Validates invite token, creates/resumes patient session, binds program assignment.
 * Idempotent: safe to retry after onboarding_completed until invitation becomes active.
 * Does not return license codes to callers.
 */
export async function completeOnboarding(
  input: CompleteOnboardingPayload,
): Promise<CompleteOnboardingResult> {
  const tokenHash = await hashInvitationToken(input.token);
  const tokenRow = await findTokenByHash(tokenHash);

  if (!tokenRow) {
    throw new BadRequestError(TOKEN_STATE_MESSAGES.invalid);
  }

  const invitation = await getInvitationById(
    tokenRow.invitation_id,
    "Failed to load invitation for complete-onboarding",
  );

  if (!invitation) {
    throw new NotFoundError("Invitation not found");
  }

  if (BLOCKED_COMPLETE_ONBOARDING_STATUSES.includes(invitation.status)) {
    throw new BadRequestError(
      `Cannot complete onboarding for invitation with status: ${invitation.status}`,
    );
  }

  const tokenState = resolveInvitationTokenState(tokenRow);
  if (tokenState === "consumed") {
    throw new BadRequestError(TOKEN_STATE_MESSAGES.consumed);
  }

  if (tokenState !== "valid") {
    throw new BadRequestError(
      TOKEN_STATE_MESSAGES[tokenState] ?? "Invitation token is not valid",
    );
  }

  const email = invitation.email.trim().toLowerCase();
  const existingAssignment = await getAssignmentByInvitationId(invitation.id);

  if (RESUMABLE_ONBOARDING_STATUSES.includes(invitation.status)) {
    if (!existingAssignment) {
      throw new AppError("Onboarding assignment missing for completed invitation", {
        statusCode: 500,
        code: "INTERNAL_ERROR",
      });
    }

    const { userId, session } = await establishPatientSession(email, input.password);

    if (existingAssignment.user_id !== userId) {
      throw new ConflictError("This invitation is already registered to another user");
    }

    await resolveAttentionFlagsAfterPatientProgress(invitation.id, ["not_registered_24h"]);

    return {
      response: buildCompleteOnboardingResponse(
        invitation,
        userId,
        email,
        session,
        existingAssignment,
        invitation.status,
        invitation.registered_at ?? existingAssignment.assigned_at,
      ),
    };
  }

  if (!REGISTERABLE_INVITATION_STATUSES.includes(invitation.status)) {
    throw new BadRequestError(
      `Cannot complete onboarding for invitation with status: ${invitation.status}`,
    );
  }

  if (existingAssignment) {
    throw new ConflictError("An onboarding assignment already exists for this invitation");
  }

  // Guard: never create a second upstream license if one is already stored.
  const existingLicense = await getLicenseByInvitationId(invitation.id);
  if (existingLicense) {
    throw new ConflictError("A license already exists for this invitation");
  }

  const { userId, session } = await establishPatientSession(email, input.password);

  const snapshot = requireInvitationLicenseSnapshot(invitation);
  const license = await createPatientLicense(snapshot);

  logger.info("Created patient license for complete-onboarding", {
    invitation_id: invitation.id,
    license_source: license.source,
    license_client_id: license.license_client_id,
    license_program_id: license.license_program_id,
  });

  const { registeredAt, assignedAt, status, license: licenseMeta } =
    await registerInvitationAssignmentForPatient(userId, invitation, license);

  return {
    response: buildCompleteOnboardingResponse(
      invitation,
      userId,
      email,
      session,
      { assigned_at: assignedAt },
      status,
      registeredAt,
    ),
    license: licenseMeta,
  };
}

/**
 * Marks invitation active when patient first uses the program (PRD §7.3).
 * Consumes the invitation token on first transition to active.
 * Idempotent: updates last_activity_at if already active.
 */
export async function markInvitationActiveOnFirstProgramUse(
  userId: string,
  clientId: string,
  programId: string,
): Promise<MarkInvitationActiveResponse> {
  const assignment = await getAssignmentByUserClientProgram(
    userId,
    clientId,
    programId,
  );

  if (!assignment) {
    throw new NotFoundError("No onboarding assignment found for this client and program");
  }

  const invitation = await getInvitationById(
    assignment.invitation_id,
    "Failed to load invitation for mark-active",
  );

  if (!invitation) {
    throw new NotFoundError("Invitation not found");
  }

  const now = new Date().toISOString();

  if (invitation.status === "active") {
    await touchInvitationLastActivityAt(invitation.id, now);

    return {
      invitation: {
        invitation_uuid: invitation.uuid,
        client_id: invitation.client_id,
        program_id: invitation.program_id,
        status: "active",
        activated_at: invitation.activated_at ?? now,
        last_activity_at: now,
      },
    };
  }

  if (invitation.status !== "consent_completed_and_registered") {
    throw new BadRequestError(
      `Cannot mark invitation active with status: ${invitation.status}`,
    );
  }

  const updated = await markInvitationActiveOnProgramUse(invitation.id, now);

  return {
    invitation: {
      invitation_uuid: updated.uuid,
      client_id: updated.client_id,
      program_id: updated.program_id,
      status: updated.status,
      activated_at: updated.activated_at ?? now,
      last_activity_at: updated.last_activity_at ?? now,
    },
  };
}
