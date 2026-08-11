/**
 * Signed opt-out tokens for reminder emails — prevents bare invitation UUID abuse.
 */

import { BadRequestError } from "@shared/utils/errors.ts";

const DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function getSigningKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("OPT_OUT_TOKEN_SECRET")?.trim() ??
    Deno.env.get("CRON_SECRET")?.trim();

  if (!secret) {
    throw new Error("OPT_OUT_TOKEN_SECRET or CRON_SECRET is required for opt-out tokens");
  }

  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Issues a signed token embedded in reminder opt-out links. */
export async function createOptOutToken(
  invitationUuid: string,
  expiresAtMs: number = Date.now() + DEFAULT_TTL_MS,
): Promise<string> {
  const payload = `${invitationUuid}.${expiresAtMs}`;
  const key = await getSigningKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  return `${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** Verifies signed opt-out token; returns invitation UUID when valid. */
export async function verifyOptOutToken(token: string): Promise<string> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new BadRequestError("Invalid opt-out token");
  }

  const [invitationUuid, expiresAtRaw, signaturePart] = parts;
  const expiresAtMs = Number.parseInt(expiresAtRaw, 10);

  if (!invitationUuid || !Number.isFinite(expiresAtMs)) {
    throw new BadRequestError("Invalid opt-out token");
  }

  if (Date.now() > expiresAtMs) {
    throw new BadRequestError("Opt-out token has expired");
  }

  const payload = `${invitationUuid}.${expiresAtMs}`;
  const key = await getSigningKey();
  const signature = base64UrlDecode(signaturePart);
  const signatureBytes = new Uint8Array(signature);

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    new TextEncoder().encode(payload),
  );

  if (!valid) {
    throw new BadRequestError("Invalid opt-out token");
  }

  return invitationUuid;
}
