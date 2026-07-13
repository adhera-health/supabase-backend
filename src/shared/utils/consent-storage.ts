/**
 * Consent document PDF storage helpers.
 */

import { getServiceClient } from "@shared/database/client.ts";
import { AppError, BadRequestError } from "@shared/utils/errors.ts";

export const CONSENT_DOCUMENTS_BUCKET = "consent-documents";

const MAX_PDF_BYTES = 10 * 1024 * 1024;

export async function hashSha256Bytes(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function decodeBase64Pdf(base64: string): Uint8Array {
  const normalized = base64.includes(",")
    ? base64.slice(base64.indexOf(",") + 1)
    : base64;

  let binary: string;
  try {
    binary = atob(normalized.trim());
  } catch {
    throw new BadRequestError("document_pdf_base64 is not valid base64");
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  if (bytes.length === 0) {
    throw new BadRequestError("document_pdf_base64 is empty");
  }

  if (bytes.length > MAX_PDF_BYTES) {
    throw new BadRequestError("Consent document PDF exceeds maximum allowed size (10MB)");
  }

  if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) {
    throw new BadRequestError("document_pdf_base64 must be a PDF file");
  }

  return bytes;
}

export function buildConsentDocumentStoragePath(
  clientId: string,
  programId: string,
  version: string,
): string {
  const safeVersion = version.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `${clientId}/${programId}/${safeVersion}.pdf`;
}

export function buildConsentDocumentPublicUrl(storagePath: string): string {
  const configuredBase = Deno.env.get("CONSENT_DOCUMENT_PUBLIC_BASE_URL")?.trim();

  if (configuredBase) {
    return `${configuredBase.replace(/\/$/, "")}/${storagePath}`;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  if (!supabaseUrl) {
    throw new AppError("SUPABASE_URL is required to build consent document URLs", {
      statusCode: 500,
      code: "INTERNAL_ERROR",
    });
  }

  const publicBase = supabaseUrl.replace(/^http:/i, "https:");
  return `${publicBase}/storage/v1/object/public/${CONSENT_DOCUMENTS_BUCKET}/${storagePath}`;
}

export async function uploadConsentDocumentPdf(
  storagePath: string,
  pdfBytes: Uint8Array,
): Promise<void> {
  const db = getServiceClient();
  const { error } = await db.storage
    .from(CONSENT_DOCUMENTS_BUCKET)
    .upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (error) {
    if (error.message.toLowerCase().includes("already exists")) {
      throw new BadRequestError("A consent document file already exists for this version");
    }

    throw new AppError("Failed to upload consent document", {
      statusCode: 500,
      code: "INTERNAL_ERROR",
      cause: { storageMessage: error.message },
    });
  }
}
