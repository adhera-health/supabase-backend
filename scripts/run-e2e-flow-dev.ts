/**
 * Local E2E: invite → validate → onboard → latest consent → accept
 *
 * Usage: deno task test:e2e
 */

import { createClient } from "@supabase/supabase-js";
import { createInvitationWithToken } from "@shared/services/invitation.service.ts";

const BASE = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") ?? "http://127.0.0.1:54321";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const CLIENT = Deno.env.get("DEV_ADMIN_CLIENT_ID") ??
  "36";
const PROGRAM = Deno.env.get("DEV_ADMIN_PROGRAM_ID") ??
  "42";
const ADMIN_EMAIL = Deno.env.get("DEV_ADMIN_EMAIL") ?? "admin@adhera.dev";
const ADMIN_PASSWORD = Deno.env.get("DEV_ADMIN_PASSWORD") ?? "AdminPass123";

function requireEnv(name: string, value: string): string {
  if (!value.trim()) {
    console.error(`Missing ${name}`);
    Deno.exit(1);
  }
  return value;
}

async function jsonFetch(
  url: string,
  init: RequestInit & { label: string },
): Promise<Record<string, unknown>> {
  const res = await fetch(url, init);
  const body = await res.json();
  if (!res.ok || body.success === false) {
    console.error(`FAIL ${init.label} (${res.status})`, JSON.stringify(body, null, 2));
    Deno.exit(1);
  }
  console.log(`OK   ${init.label}`);
  return body as Record<string, unknown>;
}

async function main(): Promise<void> {
  requireEnv("SUPABASE_ANON_KEY", ANON);

  const patientEmail = `patient.e2e.${Date.now()}@example.com`;
  const patientPassword = "PatientPass123";

  console.log("\n=== 1. Admin login ===");
  const authClient = createClient(BASE, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: adminSession, error: adminError } = await authClient.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  if (adminError || !adminSession.session?.access_token) {
    console.error("Admin login failed:", adminError?.message ?? "no session");
    console.error("Run: deno task seed:admin");
    Deno.exit(1);
  }
  const adminJwt = adminSession.session.access_token;
  console.log("OK   admin login");

  console.log("\n=== 2. Create invitation (service — token for dev) ===");
  const { invitation, token } = await createInvitationWithToken(
    {
      email: patientEmail,
      client_id: CLIENT,
      program_id: PROGRAM,
      invited_by_user_id: adminSession.user!.id,
    },
    { clientIds: [CLIENT], programIds: [PROGRAM] },
  );
  console.log(`OK   invitation ${invitation.uuid}`);

  const headers = {
    apikey: ANON,
    Authorization: `Bearer ${ANON}`,
    "Content-Type": "application/json",
  };

  console.log("\n=== 3. Validate token (GET — validate + email_opened) ===");
  const validated = await jsonFetch(
    `${BASE}/functions/v1/invitations/validate-token?token=${encodeURIComponent(token)}`,
    { label: "validate-token", headers, method: "GET" },
  );
  const validateStatus = (validated.data as { invitation: { status: string } }).invitation.status;
  if (validateStatus !== "email_opened") {
    console.error("Expected email_opened after validate-token");
    Deno.exit(1);
  }
  const validateJourney = (validated.data as { journey: { next_step: string } }).journey.next_step;
  if (validateJourney !== "create_account") {
    console.error("Expected journey next_step create_account after first validate-token");
    Deno.exit(1);
  }

  console.log("\n=== 4. Complete onboarding ===");
  const onboard = await jsonFetch(`${BASE}/functions/v1/onboarding/complete-onboarding`, {
    label: "complete-onboarding",
    method: "POST",
    headers,
    body: JSON.stringify({
      token,
      password: patientPassword,
      confirm_password: patientPassword,
    }),
  });
  const patientJwt = (onboard.data as { session: { access_token: string } }).session.access_token;

  console.log("\n=== 4b. Repeat complete-onboarding (expect idempotent success) ===");
  const resume = await jsonFetch(`${BASE}/functions/v1/onboarding/complete-onboarding`, {
    label: "complete-onboarding repeat",
    method: "POST",
    headers,
    body: JSON.stringify({
      token,
      password: patientPassword,
      confirm_password: patientPassword,
    }),
  });
  const resumeStatus = (resume.data as { invitation: { status: string } }).invitation.status;
  if (resumeStatus !== "onboarding_completed") {
    console.error("Expected onboarding_completed on idempotent complete-onboarding repeat");
    Deno.exit(1);
  }

  console.log("\n=== 4c. Validate token after onboarding (expect valid resume preview) ===");
  const revalidated = await jsonFetch(
    `${BASE}/functions/v1/invitations/validate-token?token=${encodeURIComponent(token)}`,
    { label: "validate-token after onboarding", headers, method: "GET" },
  );
  const revalidateStatus = (revalidated.data as { invitation: { status: string } }).invitation.status;
  if (revalidateStatus !== "onboarding_completed") {
    console.error("Expected onboarding_completed on validate-token after onboarding");
    Deno.exit(1);
  }
  const revalidateJourney = (revalidated.data as { journey: { next_step: string } }).journey.next_step;
  if (revalidateJourney !== "consent") {
    console.error("Expected journey next_step consent after onboarding");
    Deno.exit(1);
  }

  console.log("\n=== 5. Latest consent ===");
  const latest = await jsonFetch(
    `${BASE}/functions/v1/onboarding/consents/latest?client_id=${CLIENT}&program_id=${PROGRAM}`,
    {
      label: "consents/latest",
      method: "GET",
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${patientJwt}`,
      },
    },
  );
  const consent = (latest.data as {
    consent: {
      consent_document_id: number;
      document_hash: string;
      summary_bullets: string[];
      requires_reconsent: boolean;
    };
  }).consent;
  console.log(`     bullets: ${consent.summary_bullets.length}, reconsent: ${consent.requires_reconsent}`);

  console.log("\n=== 5b. Validate token after consent viewed ===");
  const afterView = await jsonFetch(
    `${BASE}/functions/v1/invitations/validate-token?token=${encodeURIComponent(token)}`,
    { label: "validate-token after consent viewed", headers, method: "GET" },
  );
  const afterViewStatus = (afterView.data as { invitation: { status: string } }).invitation.status;
  if (afterViewStatus !== "consent_viewed") {
    console.error("Expected consent_viewed after consents/latest");
    Deno.exit(1);
  }
  const afterViewJourney = (afterView.data as { journey: { next_step: string } }).journey.next_step;
  if (afterViewJourney !== "consent") {
    console.error("Expected journey next_step consent after consent viewed");
    Deno.exit(1);
  }

  console.log("\n=== 6. Accept consent ===");
  const accepted = await jsonFetch(`${BASE}/functions/v1/onboarding/consents/accept`, {
    label: "consents/accept",
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${patientJwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      consent_document_id: consent.consent_document_id,
      document_hash: consent.document_hash,
      read_and_understood_accepted: true,
      participation_and_data_processing_accepted: true,
    }),
  });
  const invStatus = (accepted.data as { invitation: { status: string } }).invitation.status;
  console.log(`     invitation status: ${invStatus}`);

  if (invStatus !== "consent_completed_and_registered") {
    console.error("Expected consent_completed_and_registered after consent accept");
    Deno.exit(1);
  }

  console.log("\n=== E2E PASSED ===\n");
}

if (import.meta.main) {
  await main();
}
