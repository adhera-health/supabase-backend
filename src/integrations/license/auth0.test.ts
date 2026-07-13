import { assertEquals } from "@std/assert";
import { stub } from "@std/testing/mock";
import { clearTokenCache, getAccessToken } from "@integrations/license/auth0.ts";

function setLicenseAuth0Env(): void {
  Deno.env.set("LICENSE_SERVICE_BASE_URL", "https://license.example");
  Deno.env.set("LICENSE_AUTH0_DOMAIN", "auth.example.com");
  Deno.env.set("LICENSE_AUTH0_CLIENT_ID", "test-client-id");
  Deno.env.set("LICENSE_AUTH0_CLIENT_SECRET", "test-client-secret");
  Deno.env.set("LICENSE_AUTH0_AUDIENCE", "https://license.example/api");
}

function auth0SuccessResponse(): Response {
  return new Response(
    JSON.stringify({
      access_token: "test-m2m-token",
      expires_in: 3600,
      token_type: "Bearer",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

Deno.test("single-flight: concurrent callers share one Auth0 fetch", async () => {
  clearTokenCache();
  setLicenseAuth0Env();

  let fetchCount = 0;
  const fetchStub = stub(
    globalThis,
    "fetch",
    () => {
      fetchCount += 1;
      return Promise.resolve(auth0SuccessResponse());
    },
  );

  try {
    const [a, b, c] = await Promise.all([
      getAccessToken(),
      getAccessToken(),
      getAccessToken(),
    ]);

    assertEquals(fetchCount, 1);
    assertEquals(a, "test-m2m-token");
    assertEquals(b, "test-m2m-token");
    assertEquals(c, "test-m2m-token");
  } finally {
    fetchStub.restore();
    clearTokenCache();
  }
});

Deno.test("clearTokenCache forces a fresh Auth0 fetch on next getAccessToken", async () => {
  clearTokenCache();
  setLicenseAuth0Env();

  let fetchCount = 0;
  const fetchStub = stub(
    globalThis,
    "fetch",
    () => {
      fetchCount += 1;
      return Promise.resolve(auth0SuccessResponse());
    },
  );

  try {
    await getAccessToken();
    clearTokenCache();
    await getAccessToken();

    assertEquals(fetchCount, 2);
  } finally {
    fetchStub.restore();
    clearTokenCache();
  }
});

Deno.test("cached token is reused without additional Auth0 fetch", async () => {
  clearTokenCache();
  setLicenseAuth0Env();

  let fetchCount = 0;
  const fetchStub = stub(
    globalThis,
    "fetch",
    () => {
      fetchCount += 1;
      return Promise.resolve(auth0SuccessResponse());
    },
  );

  try {
    await getAccessToken();
    await getAccessToken();

    assertEquals(fetchCount, 1);
  } finally {
    fetchStub.restore();
    clearTokenCache();
  }
});
