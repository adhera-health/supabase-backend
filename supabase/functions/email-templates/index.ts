/**
 * Email templates edge function — admin invitation template CRUD.
 *
 * GET    /email-templates              — list templates (optional ?template_type=invitation)
 * GET    /email-templates/default      — get default template (?template_type=invitation)
 * GET    /email-templates/:template_uuid
 * POST   /email-templates              — create template
 * PATCH  /email-templates/:template_uuid — update template
 * DELETE /email-templates/:template_uuid
 */

import { requirePermission } from "@shared/auth/authorization.ts";
import { PERMISSIONS } from "@shared/auth/permissions.ts";
import { logAuditEvent } from "@shared/services/audit.service.ts";
import {
  createEmailTemplate,
  deleteEmailTemplate,
  getDefaultEmailTemplate,
  getEmailTemplate,
  listEmailTemplates,
  updateEmailTemplate,
} from "@shared/services/email-template.service.ts";
import { BadRequestError } from "@shared/utils/errors.ts";
import { createHonoApp } from "@shared/utils/hono.ts";
import type { Context } from "hono";
import { createLogger } from "@shared/utils/logger.ts";
import { assertAdminActionRateLimit } from "@shared/utils/rate-limit-presets.ts";
import { getClientIp } from "@shared/utils/request.ts";
import { success } from "@shared/utils/response.ts";
import {
  createEmailTemplateSchema,
  emailTemplateUuidParamsSchema,
  getDefaultEmailTemplateQuerySchema,
  listEmailTemplatesQuerySchema,
  parseSchema,
  updateEmailTemplateSchema,
} from "@shared/validators/email-template.schema.ts";
import type {
  CreateEmailTemplateResponse,
  DeleteEmailTemplateResponse,
  GetEmailTemplateResponse,
  ListEmailTemplatesResponse,
} from "@domain/email-template.ts";

const FUNCTION_NAME = "email-templates";

const app = createHonoApp().basePath(`/${FUNCTION_NAME}`);

async function parseJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new BadRequestError("Invalid JSON body");
  }
}

async function handleListEmailTemplates(c: Context) {
  await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.EMAIL_TEMPLATES_MANAGE,
  );
  const query = parseSchema(listEmailTemplatesQuerySchema, {
    template_type: c.req.query("template_type") || undefined,
  });

  const result = await listEmailTemplates(query.template_type);
  const response: ListEmailTemplatesResponse = result;

  return success(response);
}

async function handleGetDefaultEmailTemplate(c: Context) {
  await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.EMAIL_TEMPLATES_MANAGE,
  );
  const query = parseSchema(getDefaultEmailTemplateQuerySchema, {
    template_type: c.req.query("template_type") ?? "invitation",
  });

  const result = await getDefaultEmailTemplate(query.template_type);
  const response: GetEmailTemplateResponse = result;

  return success(response);
}

async function handleGetEmailTemplate(c: Context) {
  await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.EMAIL_TEMPLATES_MANAGE,
  );
  const params = parseSchema(emailTemplateUuidParamsSchema, {
    template_uuid: c.req.param("template_uuid"),
  });

  const result = await getEmailTemplate(params.template_uuid);
  const response: GetEmailTemplateResponse = result;

  return success(response);
}

async function handleCreateEmailTemplate(c: Context) {
  const logger = createLogger("email-templates");
  const admin = await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.EMAIL_TEMPLATES_MANAGE,
  );
  await assertAdminActionRateLimit(admin.id, "email_template_create");

  const input = parseSchema(createEmailTemplateSchema, await parseJsonBody(c));

  logger.info("Creating email template", {
    admin_user_id: admin.id,
    name: input.name,
    template_type: input.template_type,
    is_default: input.is_default ?? false,
  });

  const result = await createEmailTemplate(input);

  await logAuditEvent({
    entity_type: "email_template",
    entity_id: result.template.template_uuid,
    action: "email_template_created",
    actor_user_id: admin.id,
    actor_ip: getClientIp(c),
    metadata_json: {
      name: result.template.name,
      template_type: result.template.template_type,
      is_default: result.template.is_default,
    },
  });

  const response: CreateEmailTemplateResponse = result;

  return success(response, 201);
}

async function handleUpdateEmailTemplate(c: Context) {
  const logger = createLogger("email-templates");
  const admin = await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.EMAIL_TEMPLATES_MANAGE,
  );
  await assertAdminActionRateLimit(admin.id, "email_template_update");

  const params = parseSchema(emailTemplateUuidParamsSchema, {
    template_uuid: c.req.param("template_uuid"),
  });
  const input = parseSchema(updateEmailTemplateSchema, await parseJsonBody(c));

  logger.info("Updating email template", {
    admin_user_id: admin.id,
    template_uuid: params.template_uuid,
  });

  const result = await updateEmailTemplate(params.template_uuid, input);

  await logAuditEvent({
    entity_type: "email_template",
    entity_id: result.template.template_uuid,
    action: "email_template_updated",
    actor_user_id: admin.id,
    actor_ip: getClientIp(c),
    metadata_json: {
      is_default: result.template.is_default,
      updated_fields: Object.keys(input),
    },
  });

  const response: GetEmailTemplateResponse = result;

  return success(response);
}

async function handleDeleteEmailTemplate(c: Context) {
  const logger = createLogger("email-templates");
  const admin = await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.EMAIL_TEMPLATES_MANAGE,
  );
  await assertAdminActionRateLimit(admin.id, "email_template_delete");

  const params = parseSchema(emailTemplateUuidParamsSchema, {
    template_uuid: c.req.param("template_uuid"),
  });

  logger.info("Deleting email template", {
    admin_user_id: admin.id,
    template_uuid: params.template_uuid,
  });

  const result = await deleteEmailTemplate(params.template_uuid);

  await logAuditEvent({
    entity_type: "email_template",
    entity_id: result.template_uuid,
    action: "email_template_deleted",
    actor_user_id: admin.id,
    actor_ip: getClientIp(c),
  });

  const response: DeleteEmailTemplateResponse = result;

  return success(response);
}

// Static routes before :template_uuid param routes.
app.get("/", handleListEmailTemplates);
app.get("/default", handleGetDefaultEmailTemplate);
app.get("/:template_uuid", handleGetEmailTemplate);
app.post("/", handleCreateEmailTemplate);
app.patch("/:template_uuid", handleUpdateEmailTemplate);
app.delete("/:template_uuid", handleDeleteEmailTemplate);

export default app;
