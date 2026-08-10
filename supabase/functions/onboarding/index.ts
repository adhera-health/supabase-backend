/**
 * Onboarding edge function — patient onboarding routes.
 *
 * POST /onboarding/complete-onboarding — create account + bind invitation (Feature 1)
 * GET  /onboarding/consents/latest     — active consent document (Feature 2)
 * POST /onboarding/consents/accept     — accept consent via checkboxes (Feature 3)
 * POST /onboarding/consents/withdraw   — withdraw consent (Feature 4)
 * POST /onboarding/mark-active            — mark patient active in program (Phase A)
 */

import { requirePermission } from "@shared/auth/authorization.ts";
import { PERMISSIONS } from "@shared/auth/permissions.ts";
import { logAuditEvent } from "@shared/services/audit.service.ts";
import {
  acceptConsent,
  getLatestConsent,
  withdrawConsent,
} from "@shared/services/consent.service.ts";
import {
  completeOnboarding,
  markInvitationActiveOnFirstProgramUse,
} from "@shared/services/onboarding.service.ts";
import { BadRequestError } from "@shared/utils/errors.ts";
import { createHonoApp } from "@shared/utils/hono.ts";
import type { Context } from "hono";
import { createLogger } from "@shared/utils/logger.ts";
import { assertCompleteOnboardingRateLimit } from "@shared/utils/rate-limit-presets.ts";
import { getClientIp } from "@shared/utils/request.ts";
import { success } from "@shared/utils/response.ts";
import {
  acceptConsentSchema,
  getLatestConsentQuerySchema,
  parseSchema as parseConsentSchema,
  withdrawConsentSchema,
} from "@shared/validators/consent.schema.ts";
import {
  completeOnboardingSchema,
  markInvitationActiveQuerySchema,
  parseSchema,
  type MarkInvitationActiveQueryPayload,
} from "@shared/validators/onboarding.schema.ts";
import type { LatestConsentQuery } from "@domain/client-program-query.ts";
import type {
  AcceptConsentResponse,
  GetLatestConsentResponse,
  WithdrawConsentResponse,
} from "@domain/consent.ts";
import type {
  CompleteOnboardingResponse,
  MarkInvitationActiveResponse,
} from "@domain/onboarding.ts";
import { emptyToUndefined } from "@shared/validators/invitation.schema.ts";

const FUNCTION_NAME = "onboarding";

const app = createHonoApp().basePath(`/${FUNCTION_NAME}`);

async function parseJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new BadRequestError("Invalid JSON body");
  }
}

async function handleCompleteOnboarding(c: Context) {
  const logger = createLogger("onboarding");
  const actorIp = getClientIp(c) ?? "unknown";

  await assertCompleteOnboardingRateLimit(actorIp);

  const input = parseSchema(completeOnboardingSchema, await parseJsonBody(c));

  logger.info("Completing onboarding from invitation");

  const result = await completeOnboarding(input);
  const response: CompleteOnboardingResponse = result.response;

  logger.info("Onboarding completed", {
    user_id: response.user.user_id,
    invitation_uuid: response.invitation.invitation_uuid,
    status: response.invitation.status,
    license_created: Boolean(result.license),
  });

  if (result.license) {
    await logAuditEvent({
      entity_type: "invitation",
      entity_id: response.invitation.invitation_uuid,
      action: "license_created",
      actor_user_id: response.user.user_id,
      actor_ip: actorIp,
      metadata_json: {
        client_id: response.invitation.client_id,
        program_id: response.invitation.program_id,
        license_source: result.license.source,
        license_client_id: result.license.license_client_id,
        license_program_id: result.license.license_program_id,
      },
    });
  }

  await logAuditEvent({
    entity_type: "invitation",
    entity_id: response.invitation.invitation_uuid,
    action: "registration_completed",
    actor_user_id: response.user.user_id,
    actor_ip: actorIp,
    metadata_json: {
      client_id: response.invitation.client_id,
      program_id: response.invitation.program_id,
      status: response.invitation.status,
      ...(result.license
        ? {
          license_source: result.license.source,
          license_client_id: result.license.license_client_id,
          license_program_id: result.license.license_program_id,
        }
        : { resumed: true }),
    },
  });

  return success(response, 201);
}

async function handleGetLatestConsent(c: Context) {
  const logger = createLogger("onboarding");

  const patient = await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.CONSENTS_VIEW,
  );

  const input: LatestConsentQuery = parseConsentSchema(
    getLatestConsentQuerySchema,
    {
      client_id: emptyToUndefined(c.req.query("client_id")),
      program_id: emptyToUndefined(c.req.query("program_id")),
    },
  );

  logger.info("Fetching latest consent", {
    user_id: patient.id,
    client_id: input.client_id,
    program_id: input.program_id,
  });

  const result = await getLatestConsent(
    patient.id,
    input.client_id,
    input.program_id,
  );

  logger.info("Latest consent loaded", {
    user_id: patient.id,
    version: result.consent.version,
    requires_reconsent: result.consent.requires_reconsent,
  });

  await logAuditEvent({
    entity_type: "consent_document",
    entity_id: String(result.consent.consent_document_id),
    action: "consent_document_viewed",
    actor_user_id: patient.id,
    actor_ip: getClientIp(c),
    metadata_json: {
      client_id: input.client_id,
      program_id: input.program_id,
      version: result.consent.version,
      requires_reconsent: result.consent.requires_reconsent,
    },
  });

  const response: GetLatestConsentResponse = result;

  return success(response);
}

async function handleAcceptConsent(c: Context) {
  const logger = createLogger("onboarding");

  const input = parseConsentSchema(acceptConsentSchema, await parseJsonBody(c));
  const patient = await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.CONSENTS_ACCEPT,
  );

  if (!patient.email) {
    throw new BadRequestError("Authenticated user email is required to accept consent");
  }

  logger.info("Accepting consent", {
    user_id: patient.id,
    consent_document_id: input.consent_document_id,
  });

  const result = await acceptConsent(patient.id, input, {
    ip_address: getClientIp(c),
    user_agent: c.req.header("user-agent") ?? null,
    user_email: patient.email,
  });

  logger.info("Consent accepted", {
    user_id: patient.id,
    invitation_uuid: result.invitation.invitation_uuid,
    status: result.invitation.status,
  });

  await logAuditEvent({
    entity_type: "invitation",
    entity_id: result.invitation.invitation_uuid,
    action: "consent_completed",
    actor_user_id: patient.id,
    actor_ip: getClientIp(c),
    metadata_json: {
      consent_document_id: result.consent.consent_document_id,
      version: result.consent.version,
      status: result.invitation.status,
    },
  });

  const response: AcceptConsentResponse = result;

  return success(response, 201);
}

async function handleWithdrawConsent(c: Context) {
  const logger = createLogger("onboarding");

  const input = parseConsentSchema(withdrawConsentSchema, await parseJsonBody(c));
  const patient = await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.CONSENTS_WITHDRAW,
  );

  logger.info("Withdrawing consent", {
    user_id: patient.id,
    consent_document_id: input.consent_document_id,
  });

  const result = await withdrawConsent(patient.id, input, {
    ip_address: getClientIp(c),
    user_agent: c.req.header("user-agent") ?? null,
  });

  logger.info("Consent withdrawn", {
    user_id: patient.id,
    invitation_uuid: result.invitation.invitation_uuid,
    status: result.invitation.status,
  });

  await logAuditEvent({
    entity_type: "invitation",
    entity_id: result.invitation.invitation_uuid,
    action: "consent_withdrawn",
    actor_user_id: patient.id,
    actor_ip: getClientIp(c),
    metadata_json: {
      consent_document_id: result.consent.consent_document_id,
      status: result.invitation.status,
      reason: input.reason ?? null,
    },
  });

  const response: WithdrawConsentResponse = result;

  return success(response);
}

async function handleMarkInvitationActive(c: Context) {
  const logger = createLogger("onboarding");

  const patient = await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.ONBOARDING_MARK_ACTIVE,
  );
  const input: MarkInvitationActiveQueryPayload = parseSchema(
    markInvitationActiveQuerySchema,
    {
      client_id: emptyToUndefined(c.req.query("client_id")),
      program_id: emptyToUndefined(c.req.query("program_id")),
    },
  );

  logger.info("Marking invitation active on first program use", {
    user_id: patient.id,
    client_id: input.client_id,
    program_id: input.program_id,
  });

  const result = await markInvitationActiveOnFirstProgramUse(
    patient.id,
    input.client_id,
    input.program_id,
  );

  await logAuditEvent({
    entity_type: "invitation",
    entity_id: result.invitation.invitation_uuid,
    action: "invitation_activated",
    actor_user_id: patient.id,
    actor_ip: getClientIp(c),
    metadata_json: {
      client_id: input.client_id,
      program_id: input.program_id,
      status: result.invitation.status,
    },
  });

  const response: MarkInvitationActiveResponse = result;

  return success(response);
}

app.post("/complete-onboarding", handleCompleteOnboarding);
app.post("/mark-active", handleMarkInvitationActive);
app.get("/consents/latest", handleGetLatestConsent);
app.post("/consents/accept", handleAcceptConsent);
app.post("/consents/withdraw", handleWithdrawConsent);

export default app;
