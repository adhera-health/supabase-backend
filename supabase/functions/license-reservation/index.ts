import { requirePermission } from "@shared/auth/authorization.ts";
import { PERMISSIONS } from "@shared/auth/permissions.ts";
import { logAuditEvent } from "@shared/services/audit.service.ts";
import {
  createLicenseReservation,
} from "@shared/services/license-reservation.service.ts";
import { BadRequestError } from "@shared/utils/errors.ts";
import { createHonoApp } from "@shared/utils/hono.ts";
import type { Context } from "hono";
import { createLogger } from "@shared/utils/logger.ts";
import { getClientIp } from "@shared/utils/request.ts";
import { success } from "@shared/utils/response.ts";
import {
  createLicenseReservationSchema,
  getLicenseReservationByEmailSchema,
} from "@shared/validators/license-reservation.schema.ts";
import { parseSchema } from "@shared/validators/parse-schema.ts";


const FUNCTION_NAME = "license-reservation";

const app = createHonoApp().basePath(`/${FUNCTION_NAME}`);

async function parseJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new BadRequestError("Invalid JSON body");
  }
}

async function handleCreateLicenseReservation(c: Context) 
{
    const logger = createLogger("license-reservation");
    const actorIp = getClientIp(c) ?? "unknown";

    const input = parseSchema(createLicenseReservationSchema, await parseJsonBody(c));

    const actor = await requirePermission(
        c.req.header("Authorization"),
        PERMISSIONS.LICENSE_RESERVATIONS_CREATE,
    );

    logger.info("Creating license reservation");

    const result = await createLicenseReservation(input);

    /*await logAuditEvent({
        actor,
        action: "create_license_reservation",
        details: {
            user_email: input.user_email,
            license_code: input.license_code,
        },
        ip_address: actorIp,
    });*/

    await logAuditEvent({
        entity_type: "license_reservation",
        entity_id: String(result.id),
        action: "license_reserved",
        actor_user_id: actor.id,
        actor_ip: actorIp,
        metadata_json: {
            user_email: input.user_email,
            license_code: input.license_code,
        },
    });

    return success(result);

}

app.post("/", handleCreateLicenseReservation);

export default app;