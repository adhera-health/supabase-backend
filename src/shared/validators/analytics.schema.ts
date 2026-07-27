/**
 * Analytics query validators (dashboard overview + funnel).
 */

import { z } from "zod";
import { parseSchema } from "@shared/validators/parse-schema.ts";
import { ANALYTICS_PERIODS } from "@domain/analytics.ts";

const uuidSchema = z.string().uuid("Must be a valid UUID");

/** UUID or positive-integer string (Adhera Core ids are integers). */
const tenantIdSchema = z
  .union([
    uuidSchema,
    z.string().regex(/^\d+$/, "Must be a UUID or positive integer"),
  ])
  .optional();

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
  .optional();

export const analyticsOverviewQuerySchema = z
  .object({
    client_id: tenantIdSchema,
    program_id: tenantIdSchema,
    date_from: dateSchema,
    date_to: dateSchema,
  })
  .refine(
    (data) => !data.date_from || !data.date_to || data.date_from <= data.date_to,
    { message: "date_from must be on or before date_to", path: ["date_to"] },
  );

export type AnalyticsOverviewQueryPayload = z.output<
  typeof analyticsOverviewQuerySchema
>;

export const analyticsFunnelQuerySchema = z
  .object({
    client_id: tenantIdSchema,
    program_id: tenantIdSchema,
    date_from: dateSchema,
    date_to: dateSchema,
    period: z.enum(ANALYTICS_PERIODS).default("daily"),
  })
  .refine(
    (data) => !data.date_from || !data.date_to || data.date_from <= data.date_to,
    { message: "date_from must be on or before date_to", path: ["date_to"] },
  );

export type AnalyticsFunnelQueryPayload = z.output<
  typeof analyticsFunnelQuerySchema
>;

export { parseSchema };
