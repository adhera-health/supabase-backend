/**
 * Dashboard users database queries.
 */

import { getServiceClient } from "@shared/database/client.ts";
import { raiseDbError } from "@shared/database/queries/db-error.ts";
import type {
  AdminCreatableRole,
  DashboardStaffRole,
  DashboardUser,
  DashboardUserResource,
  DashboardUserStatus,
} from "@domain/user.ts";

const USER_COLUMNS =
  "id, auth_user_id, client_id, license_client_id, email, name, role, status, created_by_auth_user_id, created_at, updated_at";

const USER_LIST_COLUMNS =
  "auth_user_id, email, name, role, created_at, updated_at";

function mapUserRow(row: Record<string, unknown>): DashboardUser {
  return {
    id: row.id as string,
    auth_user_id: row.auth_user_id as string,
    client_id: (row.client_id as string | null) ?? null,
    license_client_id: (row.license_client_id as number | null) ?? null,
    email: row.email as string,
    name: (row.name as string | null) ?? null,
    role: row.role as DashboardStaffRole,
    status: row.status as DashboardUserStatus,
    created_by_auth_user_id: (row.created_by_auth_user_id as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function findUserByAuthUserId(
  authUserId: string,
): Promise<DashboardUser | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("users")
    .select(USER_COLUMNS)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) raiseDbError("Failed to load user", error);

  return data ? mapUserRow(data) : null;
}

function mapUserListRow(row: Record<string, unknown>): DashboardUserResource {
  return {
    auth_user_id: row.auth_user_id as string,
    email: row.email as string,
    name: (row.name as string | null) ?? null,
    role: row.role as DashboardStaffRole,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function listDashboardUserRows(): Promise<DashboardUserResource[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("users")
    .select(USER_LIST_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) raiseDbError("Failed to list users", error);

  return (data ?? []).map(mapUserListRow);
}

export async function findUserByEmail(email: string): Promise<DashboardUser | null> {
  const db = getServiceClient();
  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await db
    .from("users")
    .select(USER_COLUMNS)
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) raiseDbError("Failed to look up user by email", error);

  return data ? mapUserRow(data) : null;
}

export interface InsertDashboardUserInput {
  auth_user_id: string;
  email: string;
  role: DashboardStaffRole | AdminCreatableRole;
  created_by_auth_user_id: string;
}

export async function insertDashboardUserRow(
  input: InsertDashboardUserInput,
): Promise<DashboardUser> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("users")
    .insert({
      auth_user_id: input.auth_user_id,
      email: input.email.trim().toLowerCase(),
      role: input.role,
      status: "active",
      created_by_auth_user_id: input.created_by_auth_user_id,
    })
    .select(USER_COLUMNS)
    .single();

  if (error) {
    raiseDbError("Failed to create user record", error, {
      conflictMessage: "A user with this email already exists.",
    });
  }

  return mapUserRow(data);
}

export interface UpsertDashboardUserInput {
  auth_user_id: string;
  client_id: string;
  license_client_id: number | null;
  email: string;
  role: DashboardStaffRole;
}

/** Idempotent provision for seeded admin — updates role/client on re-run. */
export async function upsertDashboardUserRow(
  input: UpsertDashboardUserInput,
): Promise<DashboardUser> {
  const db = getServiceClient();
  const normalizedEmail = input.email.trim().toLowerCase();

  const { data, error } = await db
    .from("users")
    .upsert(
      {
        auth_user_id: input.auth_user_id,
        client_id: input.client_id,
        license_client_id: input.license_client_id,
        email: normalizedEmail,
        role: input.role,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "auth_user_id" },
    )
    .select(USER_COLUMNS)
    .single();

  if (error) raiseDbError("Failed to upsert user record", error);

  return mapUserRow(data);
}

export async function updateDashboardUserRoleByAuthUserId(
  authUserId: string,
  role: AdminCreatableRole,
): Promise<DashboardUser> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("users")
    .update({
      role,
      updated_at: new Date().toISOString(),
    })
    .eq("auth_user_id", authUserId)
    .select(USER_COLUMNS)
    .single();

  if (error) raiseDbError("Failed to update user role", error);

  return mapUserRow(data);
}

export async function updateDashboardUserNameByAuthUserId(
  authUserId: string,
  name: string,
): Promise<DashboardUser> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("users")
    .update({
      name,
      updated_at: new Date().toISOString(),
    })
    .eq("auth_user_id", authUserId)
    .select(USER_COLUMNS)
    .single();

  if (error) raiseDbError("Failed to update user name", error);

  return mapUserRow(data);
}

export async function deleteDashboardUserByAuthUserId(
  authUserId: string,
): Promise<void> {
  const db = getServiceClient();
  const { error } = await db.from("users").delete().eq("auth_user_id", authUserId);

  if (error) raiseDbError("Failed to delete user record", error);
}
