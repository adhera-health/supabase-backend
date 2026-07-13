/**
 * Dashboard user management service.
 */

import type { AuthenticatedUser } from "@shared/auth/request-auth.ts";
import { ADMIN_ROLE } from "@shared/auth/request-auth.ts";
import { PERMISSIONS, type Permission } from "@shared/auth/permissions.ts";
import { assertPermission } from "@shared/auth/rbac.ts";
import {
  deleteDashboardUserByAuthUserId,
  findUserByAuthUserId,
  findUserByEmail,
  insertDashboardUserRow,
  listDashboardUserRows,
  updateDashboardUserRoleByAuthUserId,
} from "@shared/database/queries/users.query.ts";
import { getServiceClient } from "@shared/database/client.ts";
import { sendUserCredentialsEmail } from "@shared/services/user-credentials-email.service.ts";
import {
  ADMIN_CREATABLE_ROLES,
  type AdminCreatableRole,
  type CreateUserInput,
  type CreateUserResponse,
  type DeleteUserResponse,
  type DashboardStaffRole,
  type ListUsersResponse,
  type UpdateUserRoleInput,
  type UpdateUserRoleResponse,
} from "@domain/user.ts";
import {
  deleteAuthUserById,
  findAuthUserIdByEmail,
  isExistingAuthUserError,
  updateAuthUserAppRole,
} from "@shared/utils/auth-admin.ts";
import { generateSecurePassword } from "@shared/utils/generate-password.ts";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@shared/utils/errors.ts";
import { createLogger } from "@shared/utils/logger.ts";

const logger = createLogger("user-service");

const DELETABLE_ROLES: readonly DashboardStaffRole[] = ADMIN_CREATABLE_ROLES;

function isAssignableStaffRole(role: DashboardStaffRole): role is AdminCreatableRole {
  return DELETABLE_ROLES.includes(role as AdminCreatableRole);
}

function isDeletableRole(role: DashboardStaffRole): role is AdminCreatableRole {
  return isAssignableStaffRole(role);
}

function assertCallerCanManageUsers(actor: AuthenticatedUser, permission: Permission): void {
  assertPermission(actor, permission);
}

async function assertEmailAvailable(email: string): Promise<void> {
  const existingRow = await findUserByEmail(email);
  if (existingRow) {
    throw new ConflictError("A user with this email already exists.");
  }

  const serviceClient = getServiceClient();
  const existingAuthUserId = await findAuthUserIdByEmail(serviceClient, email);

  if (existingAuthUserId) {
    throw new ConflictError("A user with this email already exists.");
  }
}

async function assertActiveAdminActor(actor: AuthenticatedUser): Promise<void> {
  const adminRow = await findUserByAuthUserId(actor.id);

  if (!adminRow) {
    throw new NotFoundError(
      "Admin user record was not found. Run seed:admin to provision the admin user.",
    );
  }

  if (adminRow.role !== ADMIN_ROLE) {
    throw new ForbiddenError("Only an admin can perform this action.");
  }

  if (adminRow.status !== "active") {
    throw new ForbiddenError("Your account is not active.");
  }
}

export async function listDashboardUsers(
  actor: AuthenticatedUser,
): Promise<ListUsersResponse> {
  assertCallerCanManageUsers(actor, PERMISSIONS.USERS_VIEW);
  await assertActiveAdminActor(actor);

  const users = await listDashboardUserRows();

  logger.info("Dashboard users listed", {
    count: users.length,
    listed_by_auth_user_id: actor.id,
  });

  return { users };
}

export async function createDashboardUser(
  input: CreateUserInput,
  actor: AuthenticatedUser,
): Promise<CreateUserResponse> {
  assertCallerCanManageUsers(actor, PERMISSIONS.USERS_CREATE);
  await assertEmailAvailable(input.email);
  await assertActiveAdminActor(actor);

  const password = generateSecurePassword();
  const serviceClient = getServiceClient();

  const { data: createdAuthUser, error: createError } = await serviceClient.auth.admin
    .createUser({
      email: input.email,
      password,
      email_confirm: true,
      app_metadata: {
        role: input.role,
      },
    });

  if (createError) {
    if (isExistingAuthUserError(createError.message)) {
      throw new ConflictError("A user with this email already exists.");
    }

    logger.error("Supabase Auth user creation failed", {
      email: input.email,
      role: input.role,
      error: createError.message,
    });

    throw new AppError("Unable to create user account.", {
      statusCode: 500,
      code: "INTERNAL_ERROR",
      cause: { authMessage: createError.message },
    });
  }

  const authUserId = createdAuthUser.user?.id;

  if (!authUserId) {
    throw new AppError("Unable to create user account.", {
      statusCode: 500,
      code: "INTERNAL_ERROR",
    });
  }

  let dashboardUser;

  try {
    dashboardUser = await insertDashboardUserRow({
      auth_user_id: authUserId,
      email: input.email,
      role: input.role,
      created_by_auth_user_id: actor.id,
    });
  } catch (error) {
    try {
      await deleteAuthUserById(serviceClient, authUserId);
    } catch (rollbackError) {
      logger.error("Failed to roll back auth user after DB insert failure", {
        auth_user_id: authUserId,
        error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      });
    }

    throw error;
  }

  let emailSent = false;

  try {
    const emailResult = await sendUserCredentialsEmail({
      to: input.email,
      password,
      role: input.role,
    });
    emailSent = emailResult.sent;
  } catch (error) {
    try {
      await deleteDashboardUserByAuthUserId(authUserId);
      await deleteAuthUserById(serviceClient, authUserId);
    } catch (rollbackError) {
      logger.error("Failed to roll back user after email failure", {
        auth_user_id: authUserId,
        error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      });
    }

    throw error;
  }

  logger.info("Dashboard user created", {
    auth_user_id: authUserId,
    email: input.email,
    role: input.role,
    created_by_auth_user_id: actor.id,
    email_sent: emailSent,
  });

  return {
    user: {
      auth_user_id: dashboardUser.auth_user_id,
      email: dashboardUser.email,
      role: input.role,
      status: dashboardUser.status,
    },
    email_sent: emailSent,
  };
}

export async function deleteDashboardUser(
  authUserId: string,
  actor: AuthenticatedUser,
): Promise<DeleteUserResponse> {
  assertCallerCanManageUsers(actor, PERMISSIONS.USERS_DELETE);
  await assertActiveAdminActor(actor);

  if (authUserId === actor.id) {
    throw new ForbiddenError("You cannot delete your own account.");
  }

  const targetUser = await findUserByAuthUserId(authUserId);

  if (!targetUser) {
    throw new NotFoundError("User not found.");
  }

  if (targetUser.role === ADMIN_ROLE) {
    throw new ForbiddenError("Admin users cannot be deleted.");
  }

  if (!isDeletableRole(targetUser.role)) {
    throw new ForbiddenError(
      "Only recruiter and manager users can be deleted.",
    );
  }

  const serviceClient = getServiceClient();

  try {
    await deleteAuthUserById(serviceClient, authUserId);
  } catch (error) {
    logger.error("Supabase Auth user deletion failed", {
      auth_user_id: authUserId,
      error: error instanceof Error ? error.message : String(error),
    });

    throw new AppError("Unable to delete user account.", {
      statusCode: 500,
      code: "INTERNAL_ERROR",
      cause: {
        authMessage: error instanceof Error ? error.message : String(error),
      },
    });
  }

  try {
    await deleteDashboardUserByAuthUserId(authUserId);
  } catch (error) {
    logger.error("Failed to delete user record after auth deletion succeeded", {
      auth_user_id: authUserId,
      email: targetUser.email,
      role: targetUser.role,
      error: error instanceof Error ? error.message : String(error),
    });

    throw new AppError(
      "User was removed from authentication but the dashboard record could not be deleted. Retry or contact support.",
      {
        statusCode: 500,
        code: "INTERNAL_ERROR",
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }

  logger.info("Dashboard user deleted", {
    auth_user_id: authUserId,
    email: targetUser.email,
    role: targetUser.role,
    deleted_by_auth_user_id: actor.id,
  });

  return {
    auth_user_id: authUserId,
    email: targetUser.email,
    role: targetUser.role,
    deleted: true,
  };
}

export async function updateDashboardUserRole(
  authUserId: string,
  input: UpdateUserRoleInput,
  actor: AuthenticatedUser,
): Promise<UpdateUserRoleResponse> {
  assertCallerCanManageUsers(actor, PERMISSIONS.USERS_UPDATE_ROLE);
  await assertActiveAdminActor(actor);

  if (authUserId === actor.id) {
    throw new ForbiddenError("You cannot change your own role.");
  }

  const targetUser = await findUserByAuthUserId(authUserId);

  if (!targetUser) {
    throw new NotFoundError("User not found.");
  }

  if (targetUser.role === ADMIN_ROLE) {
    throw new ForbiddenError("Admin user roles cannot be changed.");
  }

  if (!isAssignableStaffRole(targetUser.role)) {
    throw new ForbiddenError(
      "Only recruiter and manager user roles can be changed.",
    );
  }

  const previousRole = targetUser.role;

  if (previousRole === input.role) {
    throw new ConflictError("The user already has this role.");
  }

  const serviceClient = getServiceClient();
  let updatedUser;

  try {
    updatedUser = await updateDashboardUserRoleByAuthUserId(authUserId, input.role);
  } catch (error) {
    logger.error("Failed to update user role in database", {
      auth_user_id: authUserId,
      previous_role: previousRole,
      new_role: input.role,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }

  try {
    await updateAuthUserAppRole(serviceClient, authUserId, input.role);
  } catch (error) {
    try {
      await updateDashboardUserRoleByAuthUserId(authUserId, previousRole);
    } catch (rollbackError) {
      logger.error("Failed to roll back user role after auth update failure", {
        auth_user_id: authUserId,
        previous_role: previousRole,
        new_role: input.role,
        error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      });
    }

    logger.error("Supabase Auth role update failed", {
      auth_user_id: authUserId,
      previous_role: previousRole,
      new_role: input.role,
      error: error instanceof Error ? error.message : String(error),
    });

    throw new AppError("Unable to update user role.", {
      statusCode: 500,
      code: "INTERNAL_ERROR",
      cause: {
        authMessage: error instanceof Error ? error.message : String(error),
      },
    });
  }

  logger.info("Dashboard user role updated", {
    auth_user_id: authUserId,
    email: targetUser.email,
    previous_role: previousRole,
    new_role: input.role,
    updated_by_auth_user_id: actor.id,
  });

  return {
    user: {
      auth_user_id: updatedUser.auth_user_id,
      email: updatedUser.email,
      role: input.role,
      created_at: updatedUser.created_at,
      updated_at: updatedUser.updated_at,
    },
    previous_role: previousRole,
  };
}
