/**
 * Analytics edge function — dashboard metrics (PRD §16).
 *
 * GET /analytics/overview — funnel totals
 * GET /analytics/funnel   — funnel counts bucketed by day/week/month
 */

import { requirePermission } from "@shared/auth/authorization.ts";
import { PERMISSIONS } from "@shared/auth/permissions.ts";
import {
  assertAdminListFiltersAllowed,
  resolveAdminScope,
} from "@shared/auth/admin-scope.ts";
import {
  getAnalyticsFunnel,
  getAnalyticsOverview,
} from "@shared/services/analytics.service.ts";
import type { AnalyticsQueryFilters } from "@shared/database/queries/analytics.query.ts";
import { createHonoApp } from "@shared/utils/hono.ts";
import type { Context } from "hono";
import { createLogger } from "@shared/utils/logger.ts";
import { success } from "@shared/utils/response.ts";
import { emptyToUndefined } from "@shared/validators/invitation.schema.ts";
import {
  analyticsFunnelQuerySchema,
  analyticsOverviewQuerySchema,
  parseSchema,
} from "@shared/validators/analytics.schema.ts";
import type {
  GetAnalyticsFunnelResponse,
  GetAnalyticsOverviewResponse,
} from "@domain/analytics.ts";

const FUNCTION_NAME = "analytics";

const app = createHonoApp().basePath(`/${FUNCTION_NAME}`);

/** Enforces admin client/program scope on the requested filters. */
function assertFiltersInScope(
  actor: Parameters<typeof resolveAdminScope>[0],
  filters: { client_id?: string; program_id?: string },
): AnalyticsQueryFilters {
  assertAdminListFiltersAllowed(resolveAdminScope(actor), filters);
  return {
    clientId: filters.client_id,
    programId: filters.program_id,
  };
}

async function handleOverview(c: Context) {
  const logger = createLogger(FUNCTION_NAME);

  const actor = await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.DASHBOARD_ANALYTICS_VIEW,
  );

  const input = parseSchema(analyticsOverviewQuerySchema, {
    client_id: emptyToUndefined(c.req.query("client_id")),
    program_id: emptyToUndefined(c.req.query("program_id")),
    date_from: emptyToUndefined(c.req.query("date_from")),
    date_to: emptyToUndefined(c.req.query("date_to")),
  });

  const filters = assertFiltersInScope(actor, input);
  filters.dateFrom = input.date_from;
  filters.dateTo = input.date_to;

  logger.info("Computing analytics overview", {
    role: actor.role,
    client_id: input.client_id,
    program_id: input.program_id,
  });

  const result = await getAnalyticsOverview(filters);
  const response: GetAnalyticsOverviewResponse = result;

  return success(response);
}

async function handleFunnel(c: Context) {
  const logger = createLogger(FUNCTION_NAME);

  const actor = await requirePermission(
    c.req.header("Authorization"),
    PERMISSIONS.DASHBOARD_ANALYTICS_VIEW,
  );

  const input = parseSchema(analyticsFunnelQuerySchema, {
    client_id: emptyToUndefined(c.req.query("client_id")),
    program_id: emptyToUndefined(c.req.query("program_id")),
    date_from: emptyToUndefined(c.req.query("date_from")),
    date_to: emptyToUndefined(c.req.query("date_to")),
    period: c.req.query("period") ?? undefined,
  });

  const filters = assertFiltersInScope(actor, input);
  filters.dateFrom = input.date_from;
  filters.dateTo = input.date_to;

  logger.info("Computing analytics funnel", {
    role: actor.role,
    period: input.period,
  });

  const result = await getAnalyticsFunnel(filters, input.period);
  const response: GetAnalyticsFunnelResponse = result;

  return success(response);
}

app.get("/overview", handleOverview);
app.get("/funnel", handleFunnel);

export default app;
