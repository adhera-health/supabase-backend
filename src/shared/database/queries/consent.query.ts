/**
 * Consent database queries — latest, accept, withdraw, document admin
 */

import { getServiceClient } from "@shared/database/client.ts";
import { ConflictError } from "@shared/utils/errors.ts";
import {
  isUniqueViolation,
  raiseDbError,
} from "@shared/database/queries/db-error.ts";
import type {
  ConsentDocument,
  ConsentRightsInfo,
  ConsentWithdrawal,
  UserConsent,
} from "@domain/consent.ts";

const CONSENT_DOCUMENT_COLUMNS =
  "id, client_id, program_id, version, document_url, document_hash, is_active, effective_from, privacy_notice_url, data_usage_summary, summary_bullets, storage_duration, rights_info, created_at, updated_at";

function raiseConsentDbError(
  context: string,
  error: { message: string; code?: string },
): never {
  return raiseDbError(context, error, {
    conflictMessage: "Consent has already been accepted for this invitation",
  });
}

function parseRightsInfo(value: unknown): ConsentRightsInfo {
  const record = value as Partial<ConsentRightsInfo>;
  return {
    access: record.access ?? "",
    rectification: record.rectification ?? "",
    erasure: record.erasure ?? "",
  };
}

function parseSummaryBullets(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function toConsentDocument(row: Record<string, unknown>): ConsentDocument {
  return {
    id: row.id as number,
    client_id: row.client_id as string,
    program_id: row.program_id as string,
    version: row.version as string,
    document_url: row.document_url as string,
    document_hash: row.document_hash as string,
    is_active: row.is_active as boolean,
    effective_from: row.effective_from as string,
    privacy_notice_url: row.privacy_notice_url as string,
    data_usage_summary: row.data_usage_summary as string,
    summary_bullets: parseSummaryBullets(row.summary_bullets),
    storage_duration: (row.storage_duration as string | null) ?? null,
    rights_info: parseRightsInfo(row.rights_info),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function toUserConsent(row: Record<string, unknown>): UserConsent {
  return row as unknown as UserConsent;
}

export async function getActiveConsentDocument(
  clientId: string,
  programId: string,
): Promise<ConsentDocument | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("consent_documents")
    .select(CONSENT_DOCUMENT_COLUMNS)
    .eq("client_id", clientId)
    .eq("program_id", programId)
    .eq("is_active", true)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) raiseConsentDbError("Failed to load active consent document", error);
  if (!data) return null;

  return toConsentDocument(data as Record<string, unknown>);
}

export async function getConsentDocumentById(
  consentDocumentId: number,
): Promise<ConsentDocument | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("consent_documents")
    .select(CONSENT_DOCUMENT_COLUMNS)
    .eq("id", consentDocumentId)
    .maybeSingle();

  if (error) raiseConsentDbError("Failed to load consent document", error);
  if (!data) return null;

  return toConsentDocument(data as Record<string, unknown>);
}

export async function getCurrentUserConsentByInvitationId(
  invitationId: number,
): Promise<UserConsent | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("user_consents")
    .select()
    .eq("invitation_id", invitationId)
    .eq("is_withdrawn", false)
    .is("superseded_at", null)
    .maybeSingle();

  if (error) raiseConsentDbError("Failed to load user consent", error);
  if (!data) return null;

  return toUserConsent(data as Record<string, unknown>);
}

export interface NewUserConsent {
  user_id: string;
  email: string;
  invitation_id: number;
  program_id: string;
  consent_document_id: number;
  consent_version: string;
  document_hash: string;
  accepted: boolean;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
  evidence_payload_json: Record<string, unknown>;
}

export async function insertUserConsentRow(input: NewUserConsent): Promise<UserConsent> {
  const db = getServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("user_consents")
    .insert({
      user_id: input.user_id,
      email: input.email,
      invitation_id: input.invitation_id,
      program_id: input.program_id,
      consent_document_id: input.consent_document_id,
      consent_version: input.consent_version,
      document_hash: input.document_hash,
      accepted: input.accepted,
      accepted_at: input.accepted_at,
      ip_address: input.ip_address,
      user_agent: input.user_agent,
      evidence_payload_json: input.evidence_payload_json,
      updated_at: now,
    })
    .select()
    .single();

  if (error) raiseConsentDbError("Failed to store user consent", error);
  return toUserConsent(data as Record<string, unknown>);
}

export async function supersedeUserConsent(
  userConsentId: number,
  supersededAt: string,
): Promise<UserConsent> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("user_consents")
    .update({
      superseded_at: supersededAt,
      updated_at: supersededAt,
    })
    .eq("id", userConsentId)
    .is("superseded_at", null)
    .eq("is_withdrawn", false)
    .select()
    .single();

  if (error) raiseConsentDbError("Failed to supersede user consent", error);
  return toUserConsent(data as Record<string, unknown>);
}

export async function getUserConsentByInvitationId(
  invitationId: number,
): Promise<UserConsent | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("user_consents")
    .select()
    .eq("invitation_id", invitationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) raiseConsentDbError("Failed to load user consent", error);
  if (!data) return null;

  return toUserConsent(data as Record<string, unknown>);
}

export async function getConsentWithdrawalByInvitationId(
  invitationId: number,
): Promise<ConsentWithdrawal | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("consent_withdrawals")
    .select()
    .eq("invitation_id", invitationId)
    .maybeSingle();

  if (error) raiseConsentDbError("Failed to load consent withdrawal", error);
  return (data as ConsentWithdrawal | null) ?? null;
}

export async function markUserConsentWithdrawn(
  userConsentId: number,
  withdrawnAt: string,
): Promise<UserConsent> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("user_consents")
    .update({
      is_withdrawn: true,
      withdrawn_at: withdrawnAt,
      updated_at: withdrawnAt,
    })
    .eq("id", userConsentId)
    .eq("is_withdrawn", false)
    .select()
    .single();

  if (error) raiseConsentDbError("Failed to mark user consent withdrawn", error);
  return toUserConsent(data as Record<string, unknown>);
}

export interface NewConsentWithdrawal {
  user_id: string;
  invitation_id: number;
  user_consent_id: number;
  consent_document_id: number;
  withdrawn_at: string;
  ip_address: string | null;
  user_agent: string | null;
  reason: string | null;
  evidence_payload_json: Record<string, unknown>;
}

export async function insertConsentWithdrawalRow(
  input: NewConsentWithdrawal,
): Promise<ConsentWithdrawal> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("consent_withdrawals")
    .insert({
      user_id: input.user_id,
      invitation_id: input.invitation_id,
      user_consent_id: input.user_consent_id,
      consent_document_id: input.consent_document_id,
      withdrawn_at: input.withdrawn_at,
      ip_address: input.ip_address,
      user_agent: input.user_agent,
      reason: input.reason,
      evidence_payload_json: input.evidence_payload_json,
    })
    .select()
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("Consent has already been withdrawn for this invitation");
    }
    raiseConsentDbError("Failed to store consent withdrawal", error);
  }

  return data as ConsentWithdrawal;
}

export interface InsertConsentDocumentInput {
  client_id: string;
  program_id: string;
  version: string;
  document_url: string;
  document_hash: string;
  privacy_notice_url: string;
  data_usage_summary: string;
  summary_bullets: string[];
  storage_duration?: string | null;
  rights_info: ConsentRightsInfo;
  effective_from?: string;
  is_active?: boolean;
}

export async function insertConsentDocumentRow(
  input: InsertConsentDocumentInput,
): Promise<ConsentDocument> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("consent_documents")
    .insert({
      client_id: input.client_id,
      program_id: input.program_id,
      version: input.version,
      document_url: input.document_url,
      document_hash: input.document_hash,
      privacy_notice_url: input.privacy_notice_url,
      data_usage_summary: input.data_usage_summary,
      summary_bullets: input.summary_bullets,
      storage_duration: input.storage_duration ?? null,
      rights_info: input.rights_info,
      effective_from: input.effective_from ?? new Date().toISOString(),
      is_active: input.is_active ?? false,
    })
    .select(CONSENT_DOCUMENT_COLUMNS)
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        "An active consent document already exists for this client and program",
      );
    }
    raiseConsentDbError("Failed to insert consent document", error);
  }

  return toConsentDocument(data as Record<string, unknown>);
}

export async function deactivateActiveConsentDocuments(
  clientId: string,
  programId: string,
): Promise<number[]> {
  const db = getServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("consent_documents")
    .update({ is_active: false, updated_at: now })
    .eq("client_id", clientId)
    .eq("program_id", programId)
    .eq("is_active", true)
    .select("id");

  if (error) raiseConsentDbError("Failed to deactivate consent documents", error);
  return (data ?? []).map((row) => row.id as number);
}

export async function activateConsentDocumentRow(
  consentDocumentId: number,
  effectiveFrom: string,
): Promise<ConsentDocument> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("consent_documents")
    .update({
      is_active: true,
      effective_from: effectiveFrom,
      updated_at: effectiveFrom,
    })
    .eq("id", consentDocumentId)
    .select(CONSENT_DOCUMENT_COLUMNS)
    .single();

  if (error) raiseConsentDbError("Failed to activate consent document", error);
  return toConsentDocument(data as Record<string, unknown>);
}
