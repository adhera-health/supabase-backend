/**
 * Invitation database queries (data-access layer only).
 */

import { getServiceClient } from "@shared/database/client.ts";
import { markInvitationActiveTransactionally } from "@shared/database/queries/transactional-db-rpc.query.ts";
import { AppError, ConflictError } from "@shared/utils/errors.ts";
import { raiseDbError } from "@shared/database/queries/db-error.ts";
import type { ListInvitationsQueryPayload } from "@shared/validators/invitation.schema.ts";
import type {
  DropOutReasonType,
  InvitationDropoutFailureStage,
  InvitationDropoutSource,
  InvitationListItem,
  InvitationStatus,
  ListInvitationsResponse,
  InsertPatientInvitationRow,
  PatientInvitation,
  PatientInvitationToken,
} from "@domain/invitation.ts";

export type InvitationTokenLookupRow = Pick<
  PatientInvitationToken,
  "id" | "invitation_id" | "expires_at" | "consumed_at" | "superseded_by_token_id" | "is_active"
>;

/** Escape `%` and `_` for safe ILIKE patterns. */
function escapeIlikePattern(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

function raiseInvitationDbError(
  context: string,
  error: { message: string; code?: string },
): never {
  return raiseDbError(context, error, {
    conflictMessage:
      "An active invitation already exists for this email, program, and client",
  });
}

export async function createInvitationRow(
  input: InsertPatientInvitationRow,
): Promise<PatientInvitation> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_invitations")
    .insert({
      email: input.email,
      client_id: input.client_id,
      program_id: input.program_id,
      license_client_id: input.license_client_id,
      license_program_id: input.license_program_id,
      core_api_host: input.core_api_host,
      invited_by_user_id: input.invited_by_user_id,
      status: input.status ?? "invited_lt_24h",
    })
    .select()
    .single();

  if (error) raiseInvitationDbError("Failed to create invitation", error);
  return data as PatientInvitation;
}

export async function createActiveTokenRow(
  invitationId: number,
  tokenHash: string,
  expiresAt: string,
): Promise<PatientInvitationToken> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_invitation_tokens")
    .insert({
      invitation_id: invitationId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      is_active: true,
    })
    .select()
    .single();

  if (error) raiseDbError("Failed to create invitation token", error);
  return data as PatientInvitationToken;
}

export async function updateInvitationLatestToken(
  invitationId: number,
  latestTokenId: number,
): Promise<PatientInvitation> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_invitations")
    .update({ latest_token_id: latestTokenId })
    .eq("id", invitationId)
    .select()
    .single();

  if (error) raiseDbError("Failed to link invitation token", error);
  return data as PatientInvitation;
}

export async function getInvitationByUuid(
  invitationUuid: string,
  context: string,
): Promise<PatientInvitation | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_invitations")
    .select()
    .eq("uuid", invitationUuid)
    .maybeSingle();

  if (error) raiseDbError(context, error);
  return data ? data as PatientInvitation : null;
}

export async function getActiveTokenByInvitationId(
  invitationId: number,
): Promise<Pick<PatientInvitationToken, "id"> | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_invitation_tokens")
    .select("id")
    .eq("invitation_id", invitationId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) raiseDbError("Failed to load active invitation token", error);
  return (data as Pick<PatientInvitationToken, "id"> | null) ?? null;
}

export async function deactivateTokenById(tokenId: number): Promise<void> {
  const db = getServiceClient();
  const { error } = await db
    .from("patient_invitation_tokens")
    .update({ is_active: false })
    .eq("id", tokenId);

  if (error) raiseDbError("Failed to deactivate previous invitation token", error);
}

export async function supersedeToken(oldTokenId: number, newTokenId: number): Promise<void> {
  const db = getServiceClient();
  const { error } = await db
    .from("patient_invitation_tokens")
    .update({ superseded_by_token_id: newTokenId })
    .eq("id", oldTokenId);

  if (error) raiseDbError("Failed to supersede previous invitation token", error);
}

export async function findTokenByHash(tokenHash: string): Promise<InvitationTokenLookupRow | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_invitation_tokens")
    .select(
      "id, invitation_id, expires_at, consumed_at, superseded_by_token_id, is_active",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) raiseDbError("Failed to validate invitation token", error);
  return (data as InvitationTokenLookupRow | null) ?? null;
}

export async function getInvitationPreviewForValidToken(
  invitationId: number,
): Promise<
  Pick<
    PatientInvitation,
    "id" | "uuid" | "email" | "client_id" | "program_id" | "status" | "email_opened_at"
  > | null
> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_invitations")
    .select("id, uuid, email, client_id, program_id, status, email_opened_at")
    .eq("id", invitationId)
    .maybeSingle();

  if (error) raiseDbError("Failed to load invitation preview for valid token", error);
  if (!data) return null;
  const mapped = data as PatientInvitation;
  return {
    id: mapped.id,
    uuid: mapped.uuid,
    email: mapped.email,
    client_id: mapped.client_id,
    program_id: mapped.program_id,
    status: mapped.status,
    email_opened_at: mapped.email_opened_at,
  };
}

export async function insertDropOutReasonRow(input: {
  invitationId: number;
  userId: string | null;
  reasonType: DropOutReasonType;
  freeText: string | null;
  dropoutSource: InvitationDropoutSource;
  failureStage: InvitationDropoutFailureStage | null;
}): Promise<{ id: number }> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("drop_out_reasons")
    .insert({
      invitation_id: input.invitationId,
      user_id: input.userId,
      reason_type: input.reasonType,
      free_text: input.freeText,
      dropout_source: input.dropoutSource,
      failure_stage: input.failureStage,
    })
    .select("id")
    .single();

  if (error) raiseDbError("Failed to record drop-out reason", error);
  return data as { id: number };
}

export async function insertInvitationDropoutRow(input: {
  invitationId: number;
  dropOutReasonId: number;
  failureStage: InvitationDropoutFailureStage;
  dropoutSource: InvitationDropoutSource;
}): Promise<void> {
  const db = getServiceClient();
  const { error } = await db.from("invitation_dropouts").insert({
    invitation_id: input.invitationId,
    drop_out_reason_id: input.dropOutReasonId,
    failure_stage: input.failureStage,
    dropout_source: input.dropoutSource,
  });

  if (error) raiseDbError("Failed to record invitation drop-out analytics", error);
}

export async function updateInvitationDropOut(
  invitationId: number,
  status: InvitationStatus,
  droppedOutAt: string,
  reasonId: number,
): Promise<PatientInvitation> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_invitations")
    .update({
      status,
      dropped_out_at: droppedOutAt,
      drop_out_reason_id: reasonId,
    })
    .eq("id", invitationId)
    .select()
    .single();

  if (error) raiseDbError("Failed to update invitation drop-out status", error);
  return data as PatientInvitation;
}

export async function updateInvitationEmailOpenedIfUnset(
  invitationId: number,
  emailOpenedAt: string,
): Promise<PatientInvitation | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_invitations")
    .update({
      status: "email_opened",
      email_opened_at: emailOpenedAt,
    })
    .eq("id", invitationId)
    .is("email_opened_at", null)
    .in("status", [
      "invited_lt_24h",
      "invited_24_48h",
      "invited_gt_48h",
      "email_opened",
    ])
    .select()
    .maybeSingle();

  if (error) raiseDbError("Failed to mark invitation email opened", error);
  return data ? data as PatientInvitation : null;
}

export async function deactivateAllActiveTokensForInvitation(invitationId: number): Promise<void> {
  const db = getServiceClient();
  const { error } = await db
    .from("patient_invitation_tokens")
    .update({ is_active: false })
    .eq("invitation_id", invitationId)
    .eq("is_active", true);

  if (error) raiseDbError("Failed to deactivate invitation tokens after drop-out", error);
}

export async function getInvitationById(
  invitationId: number,
  context: string,
): Promise<PatientInvitation | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_invitations")
    .select()
    .eq("id", invitationId)
    .maybeSingle();

  if (error) raiseDbError(context, error);
  return data ? data as PatientInvitation : null;
}

export async function consumeTokenById(
  tokenId: number,
  consumedAt: string,
): Promise<void> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_invitation_tokens")
    .update({
      consumed_at: consumedAt,
      is_active: false,
    })
    .eq("id", tokenId)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();

  if (error) raiseDbError("Failed to consume invitation token", error);

  if (!data) {
    throw new ConflictError("Invitation token has already been used");
  }
}

export async function updateInvitationOnboardingCompleted(
  invitationId: number,
  registeredAt: string,
): Promise<PatientInvitation> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_invitations")
    .update({
      status: "onboarding_completed",
      registered_at: registeredAt,
    })
    .eq("id", invitationId)
    .select()
    .single();

  if (error) raiseDbError("Failed to mark invitation onboarding completed", error);
  return data as PatientInvitation;
}

/** First GET consents/latest after onboarding — onboarding_completed → consent_viewed (idempotent). */
export async function updateInvitationConsentViewedIfUnset(
  invitationId: number,
): Promise<PatientInvitation | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_invitations")
    .update({ status: "consent_viewed" })
    .eq("id", invitationId)
    .eq("status", "onboarding_completed")
    .select()
    .maybeSingle();

  if (error) raiseDbError("Failed to mark invitation consent viewed", error);
  return data ? data as PatientInvitation : null;
}

export async function updateInvitationAgeStatus(
  invitationId: number,
  status: InvitationStatus,
): Promise<void> {
  const db = getServiceClient();
  const { error } = await db
    .from("patient_invitations")
    .update({ status })
    .eq("id", invitationId)
    .in("status", ["invited_lt_24h", "invited_24_48h", "invited_gt_48h"]);

  if (error) raiseDbError("Failed to update invitation age status", error);
}

export async function markInvitationActiveOnProgramUse(
  invitationId: number,
  activatedAt: string,
): Promise<PatientInvitation> {
  await markInvitationActiveTransactionally(invitationId, activatedAt);

  const invitation = await getInvitationById(
    invitationId,
    "Failed to load invitation after activation",
  );

  if (!invitation) {
    throw new AppError("Invitation not found after activation", {
      statusCode: 500,
      code: "INTERNAL_ERROR",
    });
  }

  return invitation;
}

export async function touchInvitationLastActivityAt(
  invitationId: number,
  lastActivityAt: string,
): Promise<void> {
  const db = getServiceClient();
  const { error } = await db
    .from("patient_invitations")
    .update({ last_activity_at: lastActivityAt })
    .eq("id", invitationId);

  if (error) raiseDbError("Failed to update invitation last activity", error);
}

export async function getInvitationIdsByUuids(
  invitationUuids: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  if (invitationUuids.length === 0) {
    return result;
  }

  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_invitations")
    .select("id, uuid")
    .in("uuid", invitationUuids);

  if (error) raiseDbError("Failed to load invitation ids by uuid", error);

  for (const row of data ?? []) {
    result.set(row.uuid as string, row.id as number);
  }

  return result;
}

export async function updateInvitationConsentCompleted(
  invitationId: number,
  consentCompletedAt: string,
): Promise<PatientInvitation> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_invitations")
    .update({
      status: "consent_completed_and_registered",
      consent_completed_at: consentCompletedAt,
    })
    .eq("id", invitationId)
    .select()
    .single();

  if (error) raiseDbError("Failed to mark invitation consent completed", error);
  return data as PatientInvitation;
}

export async function updateInvitationConsentWithdrawn(
  invitationId: number,
): Promise<PatientInvitation> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_invitations")
    .update({
      status: "consent_withdrawn",
    })
    .eq("id", invitationId)
    .select()
    .single();

  if (error) raiseDbError("Failed to mark invitation consent withdrawn", error);
  return data as PatientInvitation;
}

const LIST_SELECT_COLUMNS =
  "id, uuid, email, program_id, client_id, status, invited_at, email_opened_at, registered_at, last_activity_at";

type InvitationListDbRow = {
  id: number;
  uuid: string;
  email: string;
  program_id: string;
  client_id: string;
  status: InvitationStatus;
  invited_at: string;
  email_opened_at: string | null;
  registered_at: string | null;
  last_activity_at: string | null;
};

function toListItem(row: InvitationListDbRow): InvitationListItem {
  return {
    invitation_uuid: row.uuid,
    email: row.email,
    program_id: row.program_id,
    client_id: row.client_id,
    status: row.status,
    invited_at: row.invited_at,
    email_opened_at: row.email_opened_at,
    registered_at: row.registered_at,
    last_activity_at: row.last_activity_at,
    attention_flags: [],
  };
}

export interface ListInvitationsQueryResult {
  invitations: InvitationListItem[];
  invitationIdsByUuid: Map<string, number>;
  pagination: ListInvitationsResponse["pagination"];
}

function endOfDayUtc(date: string): string {
  return `${date}T23:59:59.999Z`;
}

const ENROLLED_INVITATION_STATUSES: InvitationStatus[] = [
  "onboarding_completed",
  "consent_viewed",
  "consent_completed_and_registered",
  "active",
];

const PIPELINE_INVITATION_STATUSES: InvitationStatus[] = [
  "invited_lt_24h",
  "invited_24_48h",
  "invited_gt_48h",
  "email_opened",
  "onboarding_completed",
  "consent_viewed",
  "consent_completed_and_registered",
];

export interface ListInvitationsScope {
  allowedClientIds?: string[];
  allowedProgramIds?: string[];
  /** When set, only invitations created by this staff user are returned. */
  invitedByUserId?: string;
}

export type ListInvitationsFilters = ListInvitationsQueryPayload & ListInvitationsScope;

/** Active pipeline invite for email + program + client (matches DB partial unique index). */
export async function findPipelineInvitationByEmailProgramClient(
  email: string,
  clientId: string,
  programId: string,
): Promise<Pick<PatientInvitation, "uuid" | "status"> | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_invitations")
    .select("uuid, status")
    .eq("email", email.trim().toLowerCase())
    .eq("client_id", clientId)
    .eq("program_id", programId)
    .in("status", PIPELINE_INVITATION_STATUSES)
    .maybeSingle();

  if (error) raiseDbError("Failed to check existing invitation", error);
  return (data as Pick<PatientInvitation, "uuid" | "status"> | null) ?? null;
}

/** Completed enrollment for email + program + client. */
export async function findEnrolledInvitationByEmailProgramClient(
  email: string,
  clientId: string,
  programId: string,
): Promise<Pick<PatientInvitation, "uuid" | "status"> | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("patient_invitations")
    .select("uuid, status")
    .eq("email", email.trim().toLowerCase())
    .eq("client_id", clientId)
    .eq("program_id", programId)
    .in("status", ENROLLED_INVITATION_STATUSES)
    .maybeSingle();

  if (error) raiseDbError("Failed to check enrolled invitation", error);
  return (data as Pick<PatientInvitation, "uuid" | "status"> | null) ?? null;
}

/** Active enrollment assignment for email + program + client (excludes withdrawn/dropped-out). */
export async function findEnrollmentAssignmentByEmailProgramClient(
  email: string,
  clientId: string,
  programId: string,
): Promise<{ invitation_uuid: string } | null> {
  const db = getServiceClient();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: invitation, error: invitationError } = await db
    .from("patient_invitations")
    .select("id, uuid, status")
    .eq("email", normalizedEmail)
    .eq("client_id", clientId)
    .eq("program_id", programId)
    .in("status", ENROLLED_INVITATION_STATUSES)
    .order("invited_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (invitationError) {
    raiseDbError("Failed to load invitation for enrollment check", invitationError);
  }

  if (!invitation) return null;

  const { data: assignment, error: assignmentError } = await db
    .from("onboarding_assignments")
    .select("id")
    .eq("invitation_id", invitation.id)
    .maybeSingle();

  if (assignmentError) {
    raiseDbError("Failed to check onboarding assignment for enrollment", assignmentError);
  }

  if (!assignment) return null;

  return { invitation_uuid: invitation.uuid as string };
}

export async function listInvitations(
  filters: ListInvitationsFilters,
): Promise<ListInvitationsQueryResult> {
  if (filters.allowedClientIds?.length === 0 || filters.allowedProgramIds?.length === 0) {
    return {
      invitations: [],
      invitationIdsByUuid: new Map(),
      pagination: {
        page: filters.page,
        per_page: filters.per_page,
        total: 0,
        total_pages: 0,
      },
    };
  }

  const db = getServiceClient();
  const offset = (filters.page - 1) * filters.per_page;
  const limit = offset + filters.per_page - 1;

  let query = db
    .from("patient_invitations")
    .select(LIST_SELECT_COLUMNS, { count: "exact" });

  if (filters.allowedClientIds?.length) {
    query = query.in("client_id", filters.allowedClientIds);
  }

  if (filters.allowedProgramIds?.length) {
    query = query.in("program_id", filters.allowedProgramIds);
  }

  if (filters.invitedByUserId) {
    query = query.eq("invited_by_user_id", filters.invitedByUserId);
  }

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.program_id) query = query.eq("program_id", filters.program_id);
  if (filters.client_id) query = query.eq("client_id", filters.client_id);
  if (filters.date_from) query = query.gte("invited_at", `${filters.date_from}T00:00:00.000Z`);
  if (filters.date_to) query = query.lte("invited_at", endOfDayUtc(filters.date_to));
  if (filters.search) query = query.ilike("email", `%${escapeIlikePattern(filters.search)}%`);

  const { data, error, count } = await query
    .order("invited_at", { ascending: false })
    .range(offset, limit);

  if (error) raiseDbError("Failed to list invitations", error);

  const total = count ?? 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / filters.per_page);

  const invitationIdsByUuid = new Map<string, number>();
  const invitations = (data ?? []).map((row) => {
    const dbRow = row as InvitationListDbRow;
    invitationIdsByUuid.set(dbRow.uuid, dbRow.id);
    return toListItem(dbRow);
  });

  return {
    invitations,
    invitationIdsByUuid,
    pagination: {
      page: filters.page,
      per_page: filters.per_page,
      total,
      total_pages: totalPages,
    },
  };
}
