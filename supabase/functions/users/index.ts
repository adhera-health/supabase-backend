/**
 * User Management edge function — dashboard staff provisioning.
 *
 * POST /users/create — create recruiter or manager (admin only)
 * GET /users — list all dashboard staff users (admin only)
 * PATCH /users/:auth_user_id/role — update staff user role (admin only)
 * DELETE /users/:auth_user_id — delete staff user by Supabase Auth user id (admin only)
 */

import { requirePermission } from "@shared/auth/authorization.ts";
import { PERMISSIONS } from "@shared/auth/permissions.ts";
import {
  extractBearerToken,
  getAuthenticatedSupabaseUser,
} from "@shared/auth/request-auth.ts";
import { logAuditEvent } from "@shared/services/audit.service.ts";
import {
  createDashboardUser,
  deleteDashboardUser,
  getOwnProfile,
  listDashboardUsers,
  updateDashboardUserRole,
  updateOwnProfile,
} from "@shared/services/user.service.ts";
import { BadRequestError } from "@shared/utils/errors.ts";
import { createHonoApp } from "@shared/utils/hono.ts";
import type { Context } from "hono";
import { createLogger } from "@shared/utils/logger.ts";
import { assertAdminActionRateLimit } from "@shared/utils/rate-limit-presets.ts";
import { getClientIp } from "@shared/utils/request.ts";
import { success } from "@shared/utils/response.ts";
import {
  createUserSchema,
  deleteUserParamsSchema,
  parseSchema,
  updateMyProfileBodySchema,
  updateUserRoleBodySchema,
  updateUserRoleParamsSchema,
} from "@shared/validators/user.schema.ts";
import type {
  CreateUserResponse,
  DeleteUserResponse,
  GetMyProfileResponse,
  ListUsersResponse,
  UpdateMyProfileResponse,
  UpdateUserRoleResponse,
} from "@domain/user.ts";

const FUNCTION_NAME = "users";

const app = createHonoApp().basePath(`/${FUNCTION_NAME}`);

async function handleGetMyProfile(c: Context) {
  const token = extractBearerToken(c.req.header("Authorization"));
  const actor = await getAuthenticatedSupabaseUser(token);

  const result = await getOwnProfile(actor);
  const response: GetMyProfileResponse = result;

  return success(response);
}

async function handleUpdateMyProfile(c: Context) {
  const token = extractBearerToken(c.req.header("Authorization"));
  const actor = await getAuthenticatedSupabaseUser(token);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new BadRequestError("Invalid JSON body");
  }

  const input = parseSchema(updateMyProfileBodySchema, body);
  const result = await updateOwnProfile(actor, input);
  const response: UpdateMyProfileResponse = result;

  return success(response);
}

async function handleListUsers(c: Context) {
  const logger = createLogger(FUNCTION_NAME);

  const admin = await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.USERS_VIEW,
  );

  logger.info("Listing dashboard users", {
    listed_by_auth_user_id: admin.id,
  });

  const result = await listDashboardUsers(admin);

  logger.info("Dashboard users listed", {
    count: result.users.length,
    listed_by_auth_user_id: admin.id,
  });

  const response: ListUsersResponse = result;

  return success(response);
}

async function handleCreateUser(c: Context) {
  const logger = createLogger(FUNCTION_NAME);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new BadRequestError("Invalid JSON body");
  }

  const input = parseSchema(createUserSchema, body);
  const admin = await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.USERS_CREATE,
  );
  assertAdminActionRateLimit(admin.id, "user_create");
  const actorIp = getClientIp(c);

  logger.info("Creating dashboard user", {
    email: input.email,
    role: input.role,
    created_by_auth_user_id: admin.id,
  });

  const result = await createDashboardUser(input, admin);

  await logAuditEvent({
    entity_type: "user",
    entity_id: result.user.auth_user_id,
    action: "user_created",
    actor_user_id: admin.id,
    actor_ip: actorIp,
    metadata_json: {
      email: result.user.email,
      role: result.user.role,
      email_sent: result.email_sent,
    },
  });

  const response: CreateUserResponse = result;

  return success(response, 201);
}

async function handleUpdateUserRole(c: Context) {
  const logger = createLogger(FUNCTION_NAME);

  const admin = await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.USERS_UPDATE_ROLE,
  );
  assertAdminActionRateLimit(admin.id, "user_role_update");

  const params = parseSchema(updateUserRoleParamsSchema, {
    auth_user_id: c.req.param("auth_user_id"),
  });

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new BadRequestError("Invalid JSON body");
  }

  const input = parseSchema(updateUserRoleBodySchema, body);
  const actorIp = getClientIp(c);

  logger.info("Updating dashboard user role", {
    auth_user_id: params.auth_user_id,
    new_role: input.role,
    updated_by_auth_user_id: admin.id,
  });

  const result = await updateDashboardUserRole(params.auth_user_id, input, admin);

  await logAuditEvent({
    entity_type: "user",
    entity_id: result.user.auth_user_id,
    action: "user_role_updated",
    actor_user_id: admin.id,
    actor_ip: actorIp,
    metadata_json: {
      email: result.user.email,
      previous_role: result.previous_role,
      new_role: result.user.role,
    },
  });

  const response: UpdateUserRoleResponse = result;

  return success(response);
}

async function handleDeleteUser(c: Context) {
  const logger = createLogger(FUNCTION_NAME);

  const admin = await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.USERS_DELETE,
  );
  assertAdminActionRateLimit(admin.id, "user_delete");

  const params = parseSchema(deleteUserParamsSchema, {
    auth_user_id: c.req.param("auth_user_id"),
  });

  const actorIp = getClientIp(c);

  logger.info("Deleting dashboard user", {
    auth_user_id: params.auth_user_id,
    deleted_by_auth_user_id: admin.id,
  });

  const result = await deleteDashboardUser(params.auth_user_id, admin);

  await logAuditEvent({
    entity_type: "user",
    entity_id: result.auth_user_id,
    action: "user_deleted",
    actor_user_id: admin.id,
    actor_ip: actorIp,
    metadata_json: {
      auth_user_id: result.auth_user_id,
      email: result.email,
      role: result.role,
    },
  });

  const response: DeleteUserResponse = result;

  return success(response);
}

app.get("/", handleListUsers);
app.get("/me", handleGetMyProfile);
app.post("/create", handleCreateUser);
app.patch("/me", handleUpdateMyProfile);
app.patch("/:auth_user_id/role", handleUpdateUserRole);
app.delete("/:auth_user_id", handleDeleteUser);

export default app;
