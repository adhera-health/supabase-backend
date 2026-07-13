/**
 * Consent document admin service — upload + activate
 */

import { assertAdminCanAccessClientProgram } from "@shared/auth/admin-scope.ts";
import type { AdminScope } from "@shared/auth/admin-scope.ts";
import {
  getConsentDocumentById,
  insertConsentDocumentRow,
} from "@shared/database/queries/consent.query.ts";
import { activateConsentDocumentTransactionally } from "@shared/database/queries/transactional-db-rpc.query.ts";
import { NotFoundError } from "@shared/utils/errors.ts";
import {
  buildConsentDocumentPublicUrl,
  buildConsentDocumentStoragePath,
  decodeBase64Pdf,
  hashSha256Bytes,
  uploadConsentDocumentPdf,
} from "@shared/utils/consent-storage.ts";
import type {
  ActivateConsentDocumentResponse,
  UploadConsentDocumentResponse,
} from "@domain/consent.ts";
import type { UploadConsentDocumentPayload } from "@shared/validators/consent-document.schema.ts";

export async function uploadConsentDocument(
  scope: AdminScope,
  input: UploadConsentDocumentPayload,
): Promise<UploadConsentDocumentResponse> {
  assertAdminCanAccessClientProgram(
    scope,
    input.client_id,
    input.program_id,
  );

  const pdfBytes = decodeBase64Pdf(input.document_pdf_base64);
  const documentHash = await hashSha256Bytes(pdfBytes);
  const storagePath = buildConsentDocumentStoragePath(
    input.client_id,
    input.program_id,
    input.version,
  );

  await uploadConsentDocumentPdf(storagePath, pdfBytes);

  const documentUrl = buildConsentDocumentPublicUrl(storagePath);

  const document = await insertConsentDocumentRow({
    client_id: input.client_id,
    program_id: input.program_id,
    version: input.version,
    document_url: documentUrl,
    document_hash: documentHash,
    privacy_notice_url: input.privacy_notice_url,
    data_usage_summary: input.data_usage_summary,
    summary_bullets: input.summary_bullets,
    storage_duration: input.storage_duration ?? null,
    rights_info: input.rights_info,
    effective_from: input.effective_from,
    is_active: false,
  });

  return {
    consent_document: {
      consent_document_id: document.id,
      client_id: document.client_id,
      program_id: document.program_id,
      version: document.version,
      document_url: document.document_url,
      document_hash: document.document_hash,
      is_active: document.is_active,
      summary_bullets: document.summary_bullets,
      effective_from: document.effective_from,
    },
  };
}

export async function activateConsentDocument(
  scope: AdminScope,
  consentDocumentId: number,
): Promise<ActivateConsentDocumentResponse> {
  const document = await getConsentDocumentById(consentDocumentId);

  if (!document) {
    throw new NotFoundError("Consent document not found");
  }

  assertAdminCanAccessClientProgram(
    scope,
    document.client_id,
    document.program_id,
  );

  if (document.is_active) {
    return {
      consent_document: {
        consent_document_id: document.id,
        client_id: document.client_id,
        program_id: document.program_id,
        version: document.version,
        document_hash: document.document_hash,
        is_active: true,
        effective_from: document.effective_from,
      },
      deactivated_document_ids: [],
    };
  }

  const effectiveFrom = new Date().toISOString();
  const { deactivatedDocumentIds } = await activateConsentDocumentTransactionally(
    consentDocumentId,
    effectiveFrom,
  );

  const activated = await getConsentDocumentById(consentDocumentId);

  if (!activated) {
    throw new NotFoundError("Consent document not found after activation");
  }

  return {
    consent_document: {
      consent_document_id: activated.id,
      client_id: activated.client_id,
      program_id: activated.program_id,
      version: activated.version,
      document_hash: activated.document_hash,
      is_active: activated.is_active,
      effective_from: activated.effective_from,
    },
    deactivated_document_ids: deactivatedDocumentIds,
  };
}
