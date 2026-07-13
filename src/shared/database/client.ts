/**
 * Supabase database client for Edge Functions.
 * Service client → bypasses RLS
 * User client → respects RLS
 */

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import {
  AppError,
} from "@shared/utils/errors.ts";

/**
 * Read and validate env variables once.
 */
function requireEnv(
  name: string,
): string {
  const value =
    Deno.env.get(name);

  if (!value) {
    throw new AppError(
      `Missing required environment variable: ${name}`,
      {
        statusCode: 500,
        code: "INTERNAL_ERROR",
      },
    );
  }

  return value;
}

/**
 * Cached environment values.
 */
const SUPABASE_URL =
  requireEnv(
    "SUPABASE_URL",
  );

const SUPABASE_ANON_KEY =
  requireEnv(
    "SUPABASE_ANON_KEY",
  );

const SUPABASE_SERVICE_ROLE_KEY =
  requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
  );

/**
 * Shared client configuration.
 */
const CLIENT_OPTIONS =
  Object.freeze({
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

/**
 * Singleton service client.
 */
let serviceClient:
  | SupabaseClient
  | null =
  null;

/**
 * Server-side client.
 * Full access (bypasses RLS).
 */
export function getServiceClient():
  SupabaseClient {
  if (
    serviceClient ===
    null
  ) {
    serviceClient =
      createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        CLIENT_OPTIONS,
      );
  }

  return serviceClient;
}

/**
 * User-scoped client.
 * Applies RLS rules.
 */
export function getUserClient(
  accessToken: string,
): SupabaseClient {
  return createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      ...CLIENT_OPTIONS,

      global: {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      },
    },
  );
}

/**
 * Anonymous auth client for password sign-in (e.g. after patient registration).
 */
export function getAnonAuthClient(): SupabaseClient {
  return createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    CLIENT_OPTIONS,
  );
}