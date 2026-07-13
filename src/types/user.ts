/**
 * Dashboard staff user types — user management feature.
 */

export const DASHBOARD_STAFF_ROLES = [
  "admin",
  "recruiter",
  "manager",
] as const;

export type DashboardStaffRole = (typeof DASHBOARD_STAFF_ROLES)[number];

/** Roles an admin may assign when creating a user. */
export const ADMIN_CREATABLE_ROLES = [
  "recruiter",
  "manager",
] as const;

export type AdminCreatableRole = (typeof ADMIN_CREATABLE_ROLES)[number];

export const DASHBOARD_USER_STATUSES = ["active", "inactive"] as const;

export type DashboardUserStatus = (typeof DASHBOARD_USER_STATUSES)[number];

export interface DashboardUser {
  id: string;
  auth_user_id: string;
  client_id: string | null;
  license_client_id: number | null;
  email: string;
  role: DashboardStaffRole;
  status: DashboardUserStatus;
  created_by_auth_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Public dashboard user fields returned by list endpoints. */
export interface DashboardUserResource {
  auth_user_id: string;
  email: string;
  role: DashboardStaffRole;
  created_at: string;
  updated_at: string;
}

/** GET /users — response body */
export interface ListUsersResponse {
  users: DashboardUserResource[];
}

export interface CreateUserInput {
  email: string;
  role: AdminCreatableRole;
}

export interface CreateUserResponse {
  user: {
    auth_user_id: string;
    email: string;
    role: AdminCreatableRole;
    status: DashboardUserStatus;
  };
  email_sent: boolean;
}

/** DELETE /users/:auth_user_id — path param */
export interface DeleteUserParams {
  auth_user_id: string;
}

/** DELETE /users/:auth_user_id — response body */
export interface DeleteUserResponse {
  auth_user_id: string;
  email: string;
  role: AdminCreatableRole;
  deleted: true;
}

/** PATCH /users/:auth_user_id/role — path param */
export interface UpdateUserRoleParams {
  auth_user_id: string;
}

/** PATCH /users/:auth_user_id/role — request body */
export interface UpdateUserRoleInput {
  role: AdminCreatableRole;
}

/** PATCH /users/:auth_user_id/role — response body */
export interface UpdateUserRoleResponse {
  user: DashboardUserResource;
  previous_role: AdminCreatableRole;
}
