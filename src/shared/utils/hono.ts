/**
 * Shared Hono setup for Supabase Edge Functions.
 */

import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import {
  applyCorsToResponse,
  assertProductionCorsConfigured,
  buildCorsPreflightResponse,
} from "./cors.ts";
import {
  CORRELATION_ID_HEADER,
  getRequestCorrelationId,
  resolveCorrelationId,
  runWithCorrelationId,
} from "./correlation-context.ts";
import { errorResponse } from "./response.ts";

/**
 * Rewrites `/path/` → `/path` before routing (internal, no redirect).
 * Preserves method/body for POST/PATCH/DELETE. Root `/` is unchanged.
 */
function stripTrailingSlashMiddleware(app: Hono): MiddlewareHandler {
  return async (c, next) => {
    const url = new URL(c.req.url);
    const { pathname } = url;

    if (pathname.length > 1 && pathname.endsWith("/")) {
      url.pathname = pathname.replace(/\/+$/, "") || "/";

      const init: RequestInit = {
        method: c.req.method,
        headers: c.req.raw.headers,
      };

      if (c.req.method !== "GET" && c.req.method !== "HEAD") {
        init.body = c.req.raw.body;
        Object.assign(init, { duplex: "half" });
      }

      return app.fetch(new Request(url, init), c.env, c.executionCtx);
    }

    await next();
  };
}

function corsMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    assertProductionCorsConfigured();
    await next();

    if (c.res) {
      applyCorsToResponse(c.res, c.req.header("Origin"));
    }
  };
}

function correlationMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const correlationId = resolveCorrelationId(c.req.header(CORRELATION_ID_HEADER));

    await runWithCorrelationId(correlationId, async () => {
      await next();
    });

    if (c.res) {
      c.res.headers.set(CORRELATION_ID_HEADER, correlationId);
    }
  };
}

function applyCorrelationHeader(response: Response): void {
  const correlationId = getRequestCorrelationId();
  if (correlationId) {
    response.headers.set(CORRELATION_ID_HEADER, correlationId);
  }
}

/** Creates a Hono app with shared error handling and CORS. */
export function createHonoApp(): Hono {
  const app = new Hono();

  app.use("*", stripTrailingSlashMiddleware(app));
  app.use("*", correlationMiddleware());
  app.use("*", corsMiddleware());

  app.options("*", (c) => buildCorsPreflightResponse(c.req.header("Origin")));

  app.onError((error, c) => {
    const response = errorResponse(error);
    applyCorsToResponse(response, c.req.header("Origin"));
    applyCorrelationHeader(response);
    return response;
  });

  return app;
}
