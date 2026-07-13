/**
 * Consent types — get latest, accept, withdraw
 * Spec: onboarding-doc §4.1, §6.2
 */

import type { InvitationResource } from "@domain/api-response.ts";

/** GDPR rights info returned to the patient app */
export interface ConsentRightsInfo {
  access: string;
  rectification: string;
  erasure: string;
}

/** Row: consent_documents */
export interface ConsentDocument {
  id: number;
  client_id: string;
  program_id: string;
  version: string;
  document_url: string;
  document_hash: string;
  is_active: boolean;
  effective_from: string;
  privacy_notice_url: string;
  data_usage_summary: string;
  summary_bullets: string[];
  storage_duration: string | null;
  rights_info: ConsentRightsInfo;
  created_at: string;
  updated_at: string;
}

export type {
  GetLatestConsentQuery,
  LatestConsentQuery,
  MarkInvitationActiveQuery,
} from "@domain/client-program-query.ts";

/** GET /api/v1/consents/latest — response body */
export interface GetLatestConsentResponse {
  consent: {
    consent_document_id: number;
    version: string;
    document_url: string;
    document_hash: string;
    summary_bullets: string[];
    requires_reconsent: boolean;
    privacy_notice_url: string;
    data_usage_summary: string;
    storage_duration: string | null;
    rights_info: ConsentRightsInfo;
    effective_from: string;
  };
}

/** Row: user_consents */
export interface UserConsent {
  id: number;
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
  is_withdrawn: boolean;
  withdrawn_at: string | null;
  superseded_at: string | null;
  created_at: string;
  updated_at: string;
}

/** POST /api/v1/consents/accept — request body */
export interface AcceptConsentInput {
  consent_document_id: number;
  document_hash: string;
  read_and_understood_accepted: true;
  participation_and_data_processing_accepted: true;
}

/** POST /api/v1/consents/accept — response body */
export interface AcceptConsentResponse {
  invitation: Pick<InvitationResource, "invitation_uuid" | "status"> & {
    status: "consent_completed_and_registered";
  };
  consent: {
    consent_document_id: number;
    version: string;
    accepted_at: string;
  };
}

/** Row: consent_withdrawals */
export interface ConsentWithdrawal {
  id: number;
  user_id: string;
  invitation_id: number;
  user_consent_id: number;
  consent_document_id: number;
  withdrawn_at: string;
  ip_address: string | null;
  user_agent: string | null;
  reason: string | null;
  evidence_payload_json: Record<string, unknown>;
  created_at: string;
}

/** POST /api/v1/consents/withdraw — request body */
export interface WithdrawConsentInput {
  consent_document_id: number;
  reason?: string;
}

/** POST /api/v1/consents/withdraw — response body */
export interface WithdrawConsentResponse {
  invitation: Pick<InvitationResource, "invitation_uuid" | "status"> & {
    status: "consent_withdrawn";
  };
  consent: {
    consent_document_id: number;
    withdrawn_at: string;
  };
}

/** POST /consent-documents/upload — request body */
export interface UploadConsentDocumentInput {
  client_id: string;
  program_id: string;
  version: string;
  privacy_notice_url: string;
  data_usage_summary: string;
  summary_bullets: string[];
  storage_duration?: string;
  rights_info: ConsentRightsInfo;
  effective_from?: string;
  document_pdf_base64: string;
}

/** POST /consent-documents/upload — response */
export interface UploadConsentDocumentResponse {
  consent_document: {
    consent_document_id: number;
    client_id: string;
    program_id: string;
    version: string;
    document_url: string;
    document_hash: string;
    is_active: boolean;
    summary_bullets: string[];
    effective_from: string;
  };
}

/** POST /consent-documents/:id/activate — response */
export interface ActivateConsentDocumentResponse {
  consent_document: {
    consent_document_id: number;
    client_id: string;
    program_id: string;
    version: string;
    document_hash: string;
    is_active: boolean;
    effective_from: string;
  };
  deactivated_document_ids: number[];
}
