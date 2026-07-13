/**
 * Idempotent local dev bootstrap: create or update admin user with app_metadata.role = admin.
 *
 * Usage:
 *   deno task seed:admin
 *
 * Requires: supabase start, .env with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ADMIN_EMAIL = (Deno.env.get("DEV_ADMIN_EMAIL") ?? "admin@adhera.dev").trim()
  .toLowerCase();
const ADMIN_PASSWORD = Deno.env.get("DEV_ADMIN_PASSWORD") ?? "AdminPass123";

const DEV_ADMIN_CLIENT_ID = (
  Deno.env.get("DEV_ADMIN_CLIENT_ID") ?? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
).trim();
const DEV_ADMIN_PROGRAM_ID = (
  Deno.env.get("DEV_ADMIN_PROGRAM_ID") ?? "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
).trim();
const DEV_ADMIN_LICENSE_CLIENT_ID = parseOptionalInt(
  Deno.env.get("DEV_ADMIN_LICENSE_CLIENT_ID"),
);

function requireEnv(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    console.error(`Missing ${name}. Set it in .env or pass --env-file=.env`);
    Deno.exit(1);
  }
  return value.trim();
}

function parseOptionalInt(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isExistingUserError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("already been registered") ||
    normalized.includes("already exists") ||
    normalized.includes("user already registered")
  );
}

async function findUserIdByEmail(
  client: SupabaseClient,
  email: string,
): Promise<string | null> {
  const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (error) {
    throw new Error(`Failed to list users: ${error.message}`);
  }

  const match = data.users.find(
    (user) => user.email?.trim().toLowerCase() === email,
  );

  return match?.id ?? null;
}

async function upsertAdminUsersRow(
  client: SupabaseClient,
  authUserId: string,
): Promise<void> {
  const { error } = await client.from("users").upsert(
    {
      auth_user_id: authUserId,
      client_id: DEV_ADMIN_CLIENT_ID,
      license_client_id: DEV_ADMIN_LICENSE_CLIENT_ID,
      email: ADMIN_EMAIL,
      role: "admin",
      status: "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "auth_user_id" },
  );

  if (error) {
    throw new Error(`Failed to upsert users row: ${error.message}`);
  }
}

async function main(): Promise<void> {
  const supabaseUrl = requireEnv("SUPABASE_URL", SUPABASE_URL);
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY);

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const appMetadata = {
    role: "admin",
    client_ids: [DEV_ADMIN_CLIENT_ID],
    program_ids: [DEV_ADMIN_PROGRAM_ID],
  };

  const { data: created, error: createError } = await client.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    app_metadata: appMetadata,
  });

  if (!createError && created.user) {
    await upsertAdminUsersRow(client, created.user.id);
    console.log("Created dev admin user.");
    console.log(`  user_id:   ${created.user.id}`);
    console.log(`  email:     ${ADMIN_EMAIL}`);
    console.log(`  client_id: ${DEV_ADMIN_CLIENT_ID}`);
    console.log(`  license_client_id: ${DEV_ADMIN_LICENSE_CLIENT_ID}`);
    printLoginHint(supabaseUrl);
    return;
  }

  if (!createError) {
    console.error("createUser succeeded but returned no user.");
    Deno.exit(1);
  }

  if (!isExistingUserError(createError.message)) {
    console.error(`Failed to create admin: ${createError.message}`);
    Deno.exit(1);
  }

  const userId = await findUserIdByEmail(client, ADMIN_EMAIL);

  if (!userId) {
    console.error("User exists but could not be found by email for metadata update.");
    Deno.exit(1);
  }

  const { data: updated, error: updateError } = await client.auth.admin.updateUserById(
    userId,
    {
      password: ADMIN_PASSWORD,
      email_confirm: true,
      app_metadata: appMetadata,
    },
  );

  if (updateError || !updated.user) {
    console.error(`Failed to update admin: ${updateError?.message ?? "unknown error"}`);
    Deno.exit(1);
  }

  await upsertAdminUsersRow(client, updated.user.id);

  console.log("Updated existing dev admin user (role + password synced).");
  console.log(`  user_id:   ${updated.user.id}`);
  console.log(`  email:     ${ADMIN_EMAIL}`);
  console.log(`  client_id: ${DEV_ADMIN_CLIENT_ID}`);
  console.log(`  license_client_id: ${DEV_ADMIN_LICENSE_CLIENT_ID}`);
  printLoginHint(supabaseUrl);
}

function printLoginHint(supabaseUrl: string): void {
  console.log("");
  console.log("Login (Postman or curl) for admin JWT:");
  console.log(`  POST ${supabaseUrl}/auth/v1/token?grant_type=password`);
  console.log("  Headers: apikey: <SUPABASE_ANON_KEY>, Content-Type: application/json");
  console.log(`  Body: { "email": "${ADMIN_EMAIL}", "password": "<DEV_ADMIN_PASSWORD>" }`);
  console.log("");
  console.log("Default password is AdminPass123 unless DEV_ADMIN_PASSWORD is set in .env");
}

if (import.meta.main) {
  await main();
}
