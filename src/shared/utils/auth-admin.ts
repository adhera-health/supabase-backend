/**
 * Supabase Auth admin helpers shared by provisioning flows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export function isExistingAuthUserError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("already been registered") ||
    normalized.includes("already exists") ||
    normalized.includes("user already registered")
  );
}

export async function findAuthUserIdByEmail(
  client: SupabaseClient,
  email: string,
): Promise<string | null> {
  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (error) {
    throw new Error(`Failed to list auth users: ${error.message}`);
  }

  const match = data.users.find(
    (user) => user.email?.trim().toLowerCase() === normalizedEmail,
  );

  return match?.id ?? null;
}

export async function deleteAuthUserById(
  client: SupabaseClient,
  authUserId: string,
): Promise<void> {
  const { error } = await client.auth.admin.deleteUser(authUserId);

  if (error) {
    throw new Error(`Failed to delete auth user: ${error.message}`);
  }
}

export async function updateAuthUserAppRole(
  client: SupabaseClient,
  authUserId: string,
  role: string,
): Promise<void> {
  const { data: existing, error: fetchError } = await client.auth.admin.getUserById(
    authUserId,
  );

  if (fetchError || !existing.user) {
    throw new Error(
      `Failed to load auth user: ${fetchError?.message ?? "user not found"}`,
    );
  }

  const { error } = await client.auth.admin.updateUserById(authUserId, {
    app_metadata: {
      ...((existing.user.app_metadata ?? {}) as Record<string, unknown>),
      role,
    },
  });

  if (error) {
    throw new Error(`Failed to update auth user role: ${error.message}`);
  }
}
