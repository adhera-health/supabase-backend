/**
 * Consent documents edge function — admin consent document management.
 *
 * POST /consent-documents/upload            — upload PDF + metadata (inactive)
 * POST /consent-documents/:id/activate      — set version active for client/program
 */

import { resolveAdminScope } from "@shared/auth/admin-scope.ts";
import { requirePermission } from "@shared/auth/authorization.ts";
import { PERMISSIONS } from "@shared/auth/permissions.ts";
import { logAuditEvent } from "@shared/services/audit.service.ts";
import {
  activateConsentDocument,
  uploadConsentDocument,
} from "@shared/services/consent-document.service.ts";
import { BadRequestError } from "@shared/utils/errors.ts";
import { createHonoApp } from "@shared/utils/hono.ts";
import type { Context } from "hono";
import { createLogger } from "@shared/utils/logger.ts";
import { assertAdminActionRateLimit } from "@shared/utils/rate-limit-presets.ts";
import { getClientIp } from "@shared/utils/request.ts";
import { success } from "@shared/utils/response.ts";
import {
  activateConsentDocumentParamsSchema,
  parseSchema,
  uploadConsentDocumentSchema,
  type UploadConsentDocumentPayload,
} from "@shared/validators/consent-document.schema.ts";
import type {
  ActivateConsentDocumentResponse,
  UploadConsentDocumentResponse,
} from "@domain/consent.ts";

const FUNCTION_NAME = "consent-documents";

const app = createHonoApp().basePath(`/${FUNCTION_NAME}`);

async function parseJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new BadRequestError("Invalid JSON body");
  }
}

async function handleUploadConsentDocument(c: Context) {
  const logger = createLogger("consent-documents");
  const admin = await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.CONSENT_DOCUMENTS_MANAGE,
  );
  assertAdminActionRateLimit(admin.id, "consent_document_upload");
  const scope = resolveAdminScope(admin);

  const input: UploadConsentDocumentPayload = parseSchema(
    uploadConsentDocumentSchema,
    await parseJsonBody(c),
  );

  logger.info("Uploading consent document", {
    admin_user_id: admin.id,
    client_id: input.client_id,
    program_id: input.program_id,
    version: input.version,
  });

  const result = await uploadConsentDocument(scope, input);

  await logAuditEvent({
    entity_type: "consent_document",
    entity_id: String(result.consent_document.consent_document_id),
    action: "consent_document_uploaded",
    actor_user_id: admin.id,
    actor_ip: getClientIp(c),
    metadata_json: {
      client_id: result.consent_document.client_id,
      program_id: result.consent_document.program_id,
      version: result.consent_document.version,
      is_active: result.consent_document.is_active,
    },
  });

  logger.info("Consent document uploaded", {
    consent_document_id: result.consent_document.consent_document_id,
    version: result.consent_document.version,
  });

  const response: UploadConsentDocumentResponse = result;

  return success(response, 201);
}

async function handleActivateConsentDocument(c: Context) {
  const logger = createLogger("consent-documents");
  const admin = await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.CONSENT_DOCUMENTS_MANAGE,
  );
  assertAdminActionRateLimit(admin.id, "consent_document_activate");
  const scope = resolveAdminScope(admin);

  const params = parseSchema(activateConsentDocumentParamsSchema, {
    id: c.req.param("id"),
  });

  logger.info("Activating consent document", {
    admin_user_id: admin.id,
    consent_document_id: params.id,
  });

  const result = await activateConsentDocument(scope, params.id);

  await logAuditEvent({
    entity_type: "consent_document",
    entity_id: String(result.consent_document.consent_document_id),
    action: "consent_document_activated",
    actor_user_id: admin.id,
    actor_ip: getClientIp(c),
    metadata_json: {
      client_id: result.consent_document.client_id,
      program_id: result.consent_document.program_id,
      version: result.consent_document.version,
      deactivated_document_ids: result.deactivated_document_ids,
    },
  });

  logger.info("Consent document activated", {
    consent_document_id: result.consent_document.consent_document_id,
    deactivated_count: result.deactivated_document_ids.length,
  });

  const response: ActivateConsentDocumentResponse = result;

  return success(response);
}

app.post("/upload", handleUploadConsentDocument);
app.post("/:id/activate", handleActivateConsentDocument);

export default app;
