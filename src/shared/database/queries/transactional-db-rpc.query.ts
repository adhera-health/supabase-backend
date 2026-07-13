/**
 * Transactional Postgres RPC wrappers.
 * Multi-step writes that must succeed or roll back together (resend token,
 * complete onboarding, consent accept, consent document activate).
 */

import { getServiceClient } from "@shared/database/client.ts";
import type { UserConsent } from "@domain/consent.ts";
import { raiseRpcError } from "@shared/database/queries/db-error.ts";
import type { NewUserConsent } from "@shared/database/queries/consent.query.ts";

export async function resendInvitationTokenTransactionally(
  invitationId: number,
  tokenHash: string,
  expiresAt: string,
): Promise<{ tokenRowId: number }> {
  const db = getServiceClient();
  const { data, error } = await db.rpc("atomic_resend_invitation_token", {
    p_invitation_id: invitationId,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  });

  if (error) {
    raiseRpcError("Failed to resend invitation token in transaction", error, {});
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    raiseRpcError("Failed to resend invitation token in transaction", {
      message: "empty response",
    }, {});
  }

  return {
    tokenRowId: row.token_id as number,
  };
}

export interface CompleteOnboardingTransactionInput {
  user_id: string;
  invitation_id: number;
  client_id: string;
  program_id: string;
  assigned_at: string;
  registered_at: string;
  license: {
    code: string;
    core_api_host: string;
    license_client_id: number;
    license_program_id: number;
    role: string;
    is_available: boolean;
    source: string;
  };
}

export async function completeOnboardingTransactionally(
  input: CompleteOnboardingTransactionInput,
): Promise<{ assigned_at: string; registered_at: string; license_id: number }> {
  const db = getServiceClient();
  const { data, error } = await db.rpc("atomic_complete_onboarding", {
    p_user_id: input.user_id,
    p_invitation_id: input.invitation_id,
    p_client_id: input.client_id,
    p_program_id: input.program_id,
    p_assigned_at: input.assigned_at,
    p_registered_at: input.registered_at,
    p_license_code: input.license.code,
    p_license_core_api_host: input.license.core_api_host,
    p_license_client_id: input.license.license_client_id,
    p_license_program_id: input.license.license_program_id,
    p_license_role: input.license.role,
    p_license_is_available: input.license.is_available,
    p_license_source: input.license.source,
  });

  if (error) {
    raiseRpcError("Failed to complete onboarding in transaction", error, {
      "onboarding assignment already exists":
        "An onboarding assignment already exists for this invitation",
      "license already exists":
        "A license already exists for this invitation",
      "licenses_invitation_id":
        "A license already exists for this invitation",
    });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    raiseRpcError("Failed to complete onboarding in transaction", {
      message: "empty response",
    }, {});
  }

  return {
    assigned_at: row.assigned_at as string,
    registered_at: row.registered_at as string,
    license_id: row.license_id as number,
  };
}

export async function markInvitationActiveTransactionally(
  invitationId: number,
  activatedAt: string,
): Promise<{
  uuid: string;
  client_id: string;
  program_id: string;
  status: string;
  activated_at: string;
  last_activity_at: string;
}> {
  const db = getServiceClient();
  const { data, error } = await db.rpc("atomic_mark_invitation_active", {
    p_invitation_id: invitationId,
    p_activated_at: activatedAt,
  });

  if (error) {
    raiseRpcError("Failed to mark invitation active in transaction", error, {
      "invitation is not eligible for activation":
        "Cannot mark invitation active with current status",
      "invitation not found": "Invitation not found",
    });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    raiseRpcError("Failed to mark invitation active in transaction", {
      message: "empty response",
    }, {});
  }

  const typed = row as Record<string, unknown>;
  return {
    uuid: typed.uuid as string,
    client_id: typed.client_id as string,
    program_id: typed.program_id as string,
    status: typed.status as string,
    activated_at: typed.activated_at as string,
    last_activity_at: typed.last_activity_at as string,
  };
}

export async function acceptUserConsentTransactionally(
  supersedeConsentId: number | null,
  supersededAt: string | null,
  input: NewUserConsent,
): Promise<UserConsent> {
  const db = getServiceClient();
  const { data, error } = await db.rpc("atomic_accept_user_consent", {
    p_supersede_consent_id: supersedeConsentId,
    p_superseded_at: supersededAt,
    p_user_id: input.user_id,
    p_email: input.email,
    p_invitation_id: input.invitation_id,
    p_program_id: input.program_id,
    p_consent_document_id: input.consent_document_id,
    p_consent_version: input.consent_version,
    p_document_hash: input.document_hash,
    p_accepted_at: input.accepted_at,
    p_ip_address: input.ip_address,
    p_user_agent: input.user_agent,
    p_evidence_payload_json: input.evidence_payload_json,
  });

  if (error) {
    raiseRpcError("Failed to accept consent in transaction", error, {
      "consent record to supersede":
        "Consent has already been accepted for this invitation",
    });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    raiseRpcError("Failed to accept consent in transaction", {
      message: "empty response",
    }, {});
  }

  return row as UserConsent;
}

export async function activateConsentDocumentTransactionally(
  consentDocumentId: number,
  effectiveFrom: string,
): Promise<{ deactivatedDocumentIds: number[] }> {
  const db = getServiceClient();
  const { data, error } = await db.rpc("atomic_activate_consent_document", {
    p_consent_document_id: consentDocumentId,
    p_effective_from: effectiveFrom,
  });

  if (error) {
    raiseRpcError("Failed to activate consent document in transaction", error, {
      "consent document not found": "Consent document not found",
    });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    raiseRpcError("Failed to activate consent document in transaction", {
      message: "empty response",
    }, {});
  }

  return {
    deactivatedDocumentIds: (row.deactivated_document_ids as number[]) ?? [],
  };
}
