import { 
    requirePermission,
    assertLicenseReservationSecret 
} from "@shared/auth/authorization.ts";
import { PERMISSIONS } from "@shared/auth/permissions.ts";
import { logAuditEvent } from "@shared/services/audit.service.ts";
import {
  createLicenseReservation,
  getLicenseReservationByEmail
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

/**
 * POST / : Save license reservation in DB
 * @param c 
 * @returns 
 */
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

    await logAuditEvent({
        entity_type: "license_reservation",
        entity_id: String(result.id),
        action: "license_reserved",
        actor_user_id: actor.id,
        actor_ip: actorIp,
        metadata_json: {
            user_email: input.user_email,
            license_code: input.license_code,
            is_european: result.is_european
        },
    });

    return success(result);
}

/**
 *  POST /get-by-email : Get a license reservation by the user email
 * @param c 
 * @returns 
 */
async function handleGetLicenseReservationByEmail(c: Context) 
{
    assertLicenseReservationSecret(c);
    
    const logger = createLogger("license-reservation");
    const actorIp = getClientIp(c) ?? "unknown";

    const input = parseSchema(getLicenseReservationByEmailSchema, await parseJsonBody(c));

    logger.info("Getting license reservation");

    const result = await getLicenseReservationByEmail(input);

    await logAuditEvent({
        entity_type: "license_reservation",
        entity_id: String(result.id),
        action: "license_reservation_obtained",
        actor_user_id: null,
        actor_ip: actorIp,
        metadata_json: {
            user_email: result.user_email,
            license_code: result.license_code,
            is_european: result.is_european
        },
    });

    return success(result);
}

app.post("/", handleCreateLicenseReservation);
app.post("/get-by-email", handleGetLicenseReservationByEmail);

export default app;
