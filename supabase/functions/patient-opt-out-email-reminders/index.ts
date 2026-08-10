/**
 * Patient opt-out of onboarding email reminders (GDPR / PRD §12).
 *
 * POST /patient-opt-out-email-reminders/opt-out
 */

import { logAuditEvent } from "@shared/services/audit.service.ts";
import { recordCommunicationOptOut } from "@shared/services/communication.service.ts";
import { BadRequestError } from "@shared/utils/errors.ts";
import { createHonoApp } from "@shared/utils/hono.ts";
import type { Context } from "hono";
import { createLogger } from "@shared/utils/logger.ts";
import { assertOptOutRateLimit } from "@shared/utils/rate-limit-presets.ts";
import { getClientIp } from "@shared/utils/request.ts";
import { success } from "@shared/utils/response.ts";
import {
  optOutCommunicationSchema,
  parseSchema,
} from "@shared/validators/communication.schema.ts";
import type { OptOutCommunicationResponse } from "@domain/reminder.ts";

const FUNCTION_NAME = "patient-opt-out-email-reminders";

const app = createHonoApp().basePath(`/${FUNCTION_NAME}`);

async function handleRecordEmailReminderOptOut(c: Context) {
  const logger = createLogger("patient-opt-out-email-reminders");
  const actorIp = getClientIp(c) ?? "unknown";

  await assertOptOutRateLimit(actorIp);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new BadRequestError("Invalid JSON body");
  }

  const input = parseSchema(optOutCommunicationSchema, body);

  logger.info("Recording patient email reminder opt-out", {
    channel: input.channel,
    has_invitation_id: Boolean(input.invitation_id),
    has_user_id: Boolean(input.user_id),
  });

  const result = await recordCommunicationOptOut(input);

  if (result.audit_required) {
    await logAuditEvent({
      entity_type: "invitation",
      entity_id: result.invitation_uuid,
      action: "communication_opt_out",
      actor_ip: actorIp,
      metadata_json: {
        channel: input.channel,
        user_id: input.user_id ?? null,
      },
    });
  }

  logger.info("Patient email reminder opt-out recorded", {
    invitation_uuid: result.opt_out.invitation_uuid,
    channel: result.opt_out.channel,
    already_recorded: result.opt_out.already_recorded,
  });

  const response: OptOutCommunicationResponse = {
    opt_out: result.opt_out,
  };

  return success(response, result.opt_out.already_recorded ? 200 : 201);
}

app.post("/opt-out", handleRecordEmailReminderOptOut);

export default app;
