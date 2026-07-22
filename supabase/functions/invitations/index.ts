/**
 * Invitations edge function.
 */

import { resolveAdminScope } from "@shared/auth/admin-scope.ts";
import { requireAnyPermission, requirePermission } from "@shared/auth/authorization.ts";
import { PERMISSIONS } from "@shared/auth/permissions.ts";
import { listActiveClients } from "@integrations/adhera-core/client.service.ts";
import { listProgramsForClient } from "@integrations/adhera-core/program.service.ts";
import type {
  ListClientProgramsResponse,
  ListClientsResponse,
} from "@domain/adhera-core.ts";
import { logAuditEvent } from "@shared/services/audit.service.ts";
import { sendInvitationEmail } from "@shared/services/invitation-email.service.ts";
import type { SendInvitationEmailInput } from "@shared/services/invitation-email.service.ts";
import { resolveInvitationEmailContent } from "@shared/services/email-template.service.ts";
import {
  createInvitationWithToken,
  dropOutInvitation,
  getInvitationAttentionReasonsForAdmin,
  getInvitationDetailForAdmin,
  getInvitationForAdminAction,
  listInvitationsForAdmin,
  validateInvitationToken,
  resendInvitationToken,
} from "@shared/services/invitation.service.ts";
import { BadRequestError } from "@shared/utils/errors.ts";
import { createHonoApp } from "@shared/utils/hono.ts";
import type { Context } from "hono";
import { createLogger } from "@shared/utils/logger.ts";
import {
  assertAdminActionRateLimit,
  assertValidateTokenRateLimit,
} from "@shared/utils/rate-limit-presets.ts";
import { getClientIp } from "@shared/utils/request.ts";
import { success } from "@shared/utils/response.ts";
import {
  createInvitationSchema,
  dropOutInvitationBodySchema,
  dropOutInvitationParamsSchema,
  emptyToUndefined,
  getInvitationAttentionReasonsParamsSchema,
  getInvitationParamsSchema,
  listClientProgramsParamsSchema,
  listInvitationsQuerySchema,
  parseSchema,
  resendInvitationParamsSchema,
  resendInvitationBodySchema,
  validateTokenQuerySchema,
} from "@shared/validators/invitation.schema.ts";
import { toInvitationCreatedResource } from "@shared/utils/api-mappers.ts";
import type {
  CreateInvitationResponse,
  DropOutInvitationResponse,
  GetInvitationResponse,
  ResendInvitationResponse,
} from "@domain/invitation.ts";
import type { GetInvitationAttentionReasonsResponse } from "@domain/attention.ts";
import type { InvitationEmailOverride } from "@domain/email-template.ts";

const FUNCTION_NAME = "invitations";

const app = createHonoApp().basePath(`/${FUNCTION_NAME}`);

function buildContentOverride(
  emailOverride?: InvitationEmailOverride,
) {
  return emailOverride ? { email_override: emailOverride } : undefined;
}

async function assertSelectedClientProgramValid(
  input: { client_id: string | number; program_id: string | number },
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  const isNumericClient = typeof input.client_id === "number";
  const isNumericProgram = typeof input.program_id === "number";

  if (!isNumericClient && !isNumericProgram) return;

  if (isNumericClient !== isNumericProgram) {
    throw new BadRequestError("client_id and program_id must both be UUIDs or both be integers.");
  }

  const clientId = input.client_id as number;
  const programId = input.program_id as number;

  const clients = await listActiveClients();
  const hasClient = clients.some((client) => client.id === clientId);
  if (!hasClient) {
    logger.warn("Rejected invitation: selected client_id not in active clients", {
      client_id: clientId,
      program_id: programId,
    });
    throw new BadRequestError("Selected client_id is not available.");
  }

  const programs = await listProgramsForClient(clientId);
  const hasProgram = programs.some((program) => program.id === programId);
  if (!hasProgram) {
    logger.warn("Rejected invitation: selected program_id not mapped to client", {
      client_id: clientId,
      program_id: programId,
    });
    throw new BadRequestError("Selected program_id is not available for the selected client.");
  }
}

/** Logs plaintext onboarding token in development only (never in production responses). */
function logOnboardingTokenInDevelopmentOnly(
  logger: ReturnType<typeof createLogger>,
  message: string,
  invitationUuid: string,
  onboardingToken: string,
): void {
  logger.info(message, {
    invitation_uuid: invitationUuid,
    token_expires_in_hours: 72,
    ...(Deno.env.get("ENVIRONMENT") === "development" && {
      onboarding_token: onboardingToken,
    }),
  });
}

/** GET /clients — hospital dropdown via Adhera Core Active Clients API. */
async function handleListClients(c: Context) {
  const logger = createLogger("invitations");
  const actor = await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.INVITATIONS_CLIENTS_LIST,
  );
  assertAdminActionRateLimit(actor.id, "invitation_clients_list");

  logger.info("Listing active clients for invitation dropdown", {
    role: actor.role,
    actor_user_id: actor.id,
  });

  const clients = await listActiveClients();
  const response: ListClientsResponse = { clients };
  return success(response);
}

/** GET /clients/:clientId/programs — program dropdown after hospital select. */
async function handleListClientPrograms(c: Context) {
  const logger = createLogger("invitations");
  const params = parseSchema(listClientProgramsParamsSchema, {
    clientId: c.req.param("clientId"),
  });
  const actor = await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.INVITATIONS_CLIENTS_LIST,
  );
  assertAdminActionRateLimit(actor.id, "invitation_client_programs_list");

  logger.info("Listing programs for invitation dropdown", {
    role: actor.role,
    actor_user_id: actor.id,
    client_id: params.clientId,
  });

  const programs = await listProgramsForClient(params.clientId);
  const response: ListClientProgramsResponse = { programs };
  return success(response);
}

async function handleSendInvitation(c: Context) {
  const logger = createLogger("invitations");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new BadRequestError("Invalid JSON body");
  }

  const input = parseSchema(createInvitationSchema, body);
  const actor = await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.INVITATIONS_SEND,
  );
  assertAdminActionRateLimit(actor.id, "invitation_send");
  const adminScope = resolveAdminScope(actor);
  const invitedByUserId = actor.id;
  const actorIp = getClientIp(c);

  logger.info("Creating invitation", {
    email: input.email,
    program_id: input.program_id,
    client_id: input.client_id,
    invited_by_user_id: invitedByUserId,
    role: actor.role,
    has_email_override: Boolean(input.email_override),
  });

  const contentOverride = buildContentOverride(input.email_override);
  // Fail before DB writes when default template is missing or override HTML is invalid.
  await resolveInvitationEmailContent(contentOverride);
  await assertSelectedClientProgramValid(input, logger);

  const { invitation, token: onboardingToken } = await createInvitationWithToken(
    {
      email: input.email,
      client_id: input.client_id,
      program_id: input.program_id,
      invited_by_user_id: invitedByUserId,
    },
    adminScope,
  );

  const emailInput: SendInvitationEmailInput = {
    to: invitation.email,
    onboardingToken,
    clientId: invitation.client_id,
    programId: invitation.program_id,
    contentOverride,
  };
  const emailResult = await sendInvitationEmail(emailInput);

  if (!emailResult.sent) {
    logOnboardingTokenInDevelopmentOnly(logger, "Invitation created (email not sent)", invitation.uuid, onboardingToken);
    if (emailResult.dev_hint) {
      logger.warn("Invitation email not delivered", { dev_hint: emailResult.dev_hint });
    }
  } else {
    logOnboardingTokenInDevelopmentOnly(logger, "Invitation created", invitation.uuid, onboardingToken);
  }

  await logAuditEvent({
    entity_type: "invitation",
    entity_id: invitation.uuid,
    action: "invitation_sent",
    actor_user_id: invitedByUserId,
    actor_ip: actorIp,
    metadata_json: {
      email: invitation.email,
      client_id: invitation.client_id,
      program_id: invitation.program_id,
      used_email_override: Boolean(input.email_override),
    },
  });

  const response: CreateInvitationResponse = {
    invitation: toInvitationCreatedResource(invitation),
  };

  return success(response, 201);
}

async function handleValidateToken(c: Context) {
  const logger = createLogger("invitations");
  const actorIp = getClientIp(c) ?? "unknown";

  assertValidateTokenRateLimit(actorIp);

  const input = parseSchema(validateTokenQuerySchema, {
    token: c.req.query("token"),
  });

  logger.info("Validating invitation token");

  const result = await validateInvitationToken(input.token);

  if (result.email_opened_recorded && result.invitation) {
    await logAuditEvent({
      entity_type: "invitation",
      entity_id: result.invitation.invitation_uuid,
      action: "email_opened",
      actor_ip: actorIp,
      metadata_json: {
        status: result.invitation.status,
        source: "validate_token",
      },
    });
  }

  logger.info("Token validation complete", { state: result.token.state });

  return success(result);
}

async function handleResendInvitation(c: Context) {
  const logger = createLogger("invitations");

  const params = parseSchema(resendInvitationParamsSchema, {
    invitation_id: c.req.param("invitation_id"),
  });

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = undefined;
  }

  const parsedBody = body !== undefined
    ? parseSchema(resendInvitationBodySchema, body)
    : undefined;

  const actor = await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.INVITATIONS_RESEND,
  );
  assertAdminActionRateLimit(actor.id, "invitation_resend");
  const actorIp = getClientIp(c);

  logger.info("Resending invitation", {
    invitation_id: params.invitation_id,
    role: actor.role,
    has_email_override: Boolean(parsedBody?.email_override),
  });

  const contentOverride = buildContentOverride(parsedBody?.email_override);
  await resolveInvitationEmailContent(contentOverride);

  const { invitation, token: onboardingToken } = await resendInvitationToken(
    params.invitation_id,
    actor,
  );

  const emailInput: SendInvitationEmailInput = {
    to: invitation.email,
    onboardingToken,
    clientId: invitation.client_id,
    programId: invitation.program_id,
    contentOverride,
  };
  const emailResult = await sendInvitationEmail(emailInput);

  if (!emailResult.sent) {
    logOnboardingTokenInDevelopmentOnly(logger, "Invitation resent (email not sent)", invitation.uuid, onboardingToken);
    if (emailResult.dev_hint) {
      logger.warn("Invitation email not delivered", { dev_hint: emailResult.dev_hint });
    }
  } else {
    logOnboardingTokenInDevelopmentOnly(logger, "Invitation resent", invitation.uuid, onboardingToken);
  }

  await logAuditEvent({
    entity_type: "invitation",
    entity_id: invitation.uuid,
    action: "invitation_resent",
    actor_user_id: actor.id,
    actor_ip: actorIp,
    metadata_json: {
      email: invitation.email,
      client_id: invitation.client_id,
      program_id: invitation.program_id,
      used_email_override: Boolean(parsedBody?.email_override),
    },
  });

  const response: ResendInvitationResponse = {
    invitation: toInvitationCreatedResource(invitation),
  };

  return success(response);
}

async function handleListInvitations(c: Context) {
  const logger = createLogger("invitations");

  const actor = await requireAnyPermission(c.req.header("Authorization"), [
    PERMISSIONS.INVITATIONS_VIEW_ALL,
    PERMISSIONS.INVITATIONS_VIEW_OWN,
  ]);

  const input = parseSchema(listInvitationsQuerySchema, {
    status: emptyToUndefined(c.req.query("status")),
    program_id: emptyToUndefined(c.req.query("program_id")),
    client_id: emptyToUndefined(c.req.query("client_id")),
    date_from: emptyToUndefined(c.req.query("date_from")),
    date_to: emptyToUndefined(c.req.query("date_to")),
    search: emptyToUndefined(c.req.query("search")),
    page: c.req.query("page"),
    per_page: c.req.query("per_page"),
  });

  logger.info("Listing invitations", {
    status: input.status,
    program_id: input.program_id,
    client_id: input.client_id,
    page: input.page,
    per_page: input.per_page,
    has_search: Boolean(input.search),
    role: actor.role,
  });

  const result = await listInvitationsForAdmin(actor, input);

  logger.info("Invitations listed", {
    count: result.invitations.length,
    total: result.pagination.total,
  });

  return success(result);
}

async function handleDropOutInvitation(c: Context) {
  const logger = createLogger("invitations");

  const params = parseSchema(dropOutInvitationParamsSchema, {
    invitation_id: c.req.param("invitation_id"),
  });

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new BadRequestError("Invalid JSON body");
  }

  const input = parseSchema(dropOutInvitationBodySchema, body);
  const actor = await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.INVITATIONS_DROP_OUT,
  );
  assertAdminActionRateLimit(actor.id, "invitation_drop_out");
  const recordedByUserId = actor.id;
  const actorIp = getClientIp(c);

  await getInvitationForAdminAction(params.invitation_id, actor);

  logger.info("Recording invitation drop-out", {
    invitation_id: params.invitation_id,
    reason_type: input.reason_type,
    recorded_by_user_id: recordedByUserId,
    role: actor.role,
  });

  const result = await dropOutInvitation(
    params.invitation_id,
    input,
    recordedByUserId,
  );

  await logAuditEvent({
    entity_type: "invitation",
    entity_id: result.invitation.invitation_uuid,
    action: "drop_out_recorded",
    actor_user_id: recordedByUserId,
    actor_ip: actorIp,
    metadata_json: {
      reason_type: result.drop_out.reason_type,
      status: result.invitation.status,
      dropout_source: "staff",
    },
  });

  logger.info("Invitation drop-out recorded", {
    invitation_uuid: result.invitation.invitation_uuid,
    status: result.invitation.status,
  });

  const response: DropOutInvitationResponse = result;

  return success(response);
}

async function handleGetInvitation(c: Context) {
  const logger = createLogger("invitations");

  const params = parseSchema(getInvitationParamsSchema, {
    invitation_id: c.req.param("invitation_id"),
  });

  const actor = await requireAnyPermission(c.req.header("Authorization"), [
    PERMISSIONS.INVITATIONS_VIEW_ALL,
    PERMISSIONS.INVITATIONS_VIEW_OWN,
  ]);

  logger.info("Loading invitation detail", {
    invitation_id: params.invitation_id,
    role: actor.role,
  });

  const result = await getInvitationDetailForAdmin(params.invitation_id, actor);

  const response: GetInvitationResponse = result;

  return success(response);
}

async function handleGetInvitationAttentionReasons(c: Context) {
  const logger = createLogger("invitations");

  const params = parseSchema(getInvitationAttentionReasonsParamsSchema, {
    invitation_id: c.req.param("invitation_id"),
  });

  const actor = await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.INVITATIONS_ATTENTION_REASONS_VIEW,
  );

  logger.info("Loading invitation attention reasons", {
    invitation_id: params.invitation_id,
    role: actor.role,
  });

  const result = await getInvitationAttentionReasonsForAdmin(
    params.invitation_id,
    actor,
  );

  const response: GetInvitationAttentionReasonsResponse = result;

  return success(response);
}

app.get("/", handleListInvitations);
app.get("", handleListInvitations);
app.get("/clients", handleListClients);
app.get("/clients/:clientId/programs", handleListClientPrograms);
app.post("/send", handleSendInvitation);
app.get("/validate-token", handleValidateToken);
app.post("/:invitation_id/resend", handleResendInvitation);
app.get("/:invitation_id/attention-reasons", handleGetInvitationAttentionReasons);
app.get("/:invitation_id", handleGetInvitation);
app.post("/:invitation_id/drop-out", handleDropOutInvitation);

export default app;
