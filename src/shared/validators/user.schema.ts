/**
 * User management validators.
 */

import { z } from "zod";
import { ADMIN_CREATABLE_ROLES } from "@domain/user.ts";
import type {
  CreateUserInput,
  DeleteUserParams,
  UpdateMyProfileInput,
  UpdateUserRoleInput,
  UpdateUserRoleParams,
} from "@domain/user.ts";
import { parseSchema } from "@shared/validators/parse-schema.ts";

const uuidSchema = z.string().uuid("Must be a valid UUID");

const emailSchema = z
  .string()
  .trim()
  .email("Must be a valid email address")
  .transform((value: string) => value.toLowerCase());

const creatableRoleSchema = z.enum(ADMIN_CREATABLE_ROLES, {
  errorMap: () => ({
    message: "Role must be recruiter or manager",
  }),
});

/** POST /users/create */
export const createUserSchema = z.object({
  email: emailSchema,
  role: creatableRoleSchema,
}) satisfies z.ZodType<CreateUserInput>;

export type CreateUserPayload = z.infer<typeof createUserSchema>;

/** DELETE /users/:auth_user_id */
export const deleteUserParamsSchema = z.object({
  auth_user_id: uuidSchema,
}) satisfies z.ZodType<DeleteUserParams>;

export type DeleteUserParamsPayload = z.infer<typeof deleteUserParamsSchema>;

/** PATCH /users/:auth_user_id/role */
export const updateUserRoleParamsSchema = z.object({
  auth_user_id: uuidSchema,
}) satisfies z.ZodType<UpdateUserRoleParams>;

export type UpdateUserRoleParamsPayload = z.infer<typeof updateUserRoleParamsSchema>;

export const updateUserRoleBodySchema = z.object({
  role: creatableRoleSchema,
}) satisfies z.ZodType<UpdateUserRoleInput>;

export type UpdateUserRoleBodyPayload = z.infer<typeof updateUserRoleBodySchema>;

/** PATCH /users/me */
export const updateMyProfileBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
}) satisfies z.ZodType<UpdateMyProfileInput>;

export type UpdateMyProfileBodyPayload = z.infer<typeof updateMyProfileBodySchema>;

export { parseSchema };
