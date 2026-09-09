import {
  inferICustomsStatus,
  providerReference,
} from "../_shared/icustoms.ts";

export const MAX_WEBHOOK_BYTES = 50 * 1024 * 1024;
export const MAX_CAPTURE_JSON_BYTES = 256 * 1024;

export type Json = Record<string, unknown>;
export type ParsedICustomsWebhook = {
  bodyHash: string;
  bodySize: number;
  contentType: string;
  eventId: string;
  eventType: string;
  correlationId: string;
  providerStatus: string;
  mrn: string;
  lrn: string;
  eventCode: string;
  eventMessage: string;
  documentBytes: Uint8Array | null;
  documentUrl: string;
  documentFileName: string;
  sanitizedPayload: Json;
  rawJson: Json | null;
};

const encoder = new TextEncoder();

export function safeText(value: unknown, maximum = 240) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export async function sha256(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function constantTimeEqual(left: string, right: string) {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export async function readBoundedBody(request: Request) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BYTES) {
    throw new WebhookInputError(413, "Webhook body is too large.");
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_WEBHOOK_BYTES) {
      await reader.cancel();
      throw new WebhookInputError(413, "Webhook body is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export class WebhookInputError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function base64Bytes(value: string) {
  const candidate = value.replace(/^data:application\/pdf;base64,/i, "")
    .replace(/\s+/g, "");
  if (!candidate || candidate.length > Math.ceil(MAX_WEBHOOK_BYTES * 4 / 3) + 8) {
    return null;
  }
  try {
    const binary = atob(candidate);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function decodedBase64Text(value: unknown) {
  if (typeof value !== "string") return "";
  const bytes = base64Bytes(value);
  if (!bytes || isBoundedPdf(bytes)) return "";
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
    return decoded.startsWith("<") && decoded.endsWith(">") ? decoded : "";
  } catch {
    return "";
  }
}

function xmlElementValue(xml: string, localName: string, maximum = 240) {
  if (!xml) return "";
  const escapedName = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(
    `<(?:[A-Za-z0-9_.-]+:)?${escapedName}(?:\\s[^>]*)?>([^<]*)<\\/(?:[A-Za-z0-9_.-]+:)?${escapedName}>`,
    "i",
  ));
  return safeText(match?.[1], maximum);
}

function lifecycleFromHmrcNotification(xml: string) {
  const functionCode = xmlElementValue(xml, "FunctionCode", 8);
  if (functionCode === "01") return "accepted";
  if (functionCode === "02") return "acknowledged";
  if (functionCode === "03") return "rejected";
  return "";
}

export function isBoundedPdf(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_WEBHOOK_BYTES) return false;
  const prefix = new TextDecoder().decode(bytes.slice(0, 5));
  const suffix = new TextDecoder().decode(bytes.slice(Math.max(0, bytes.length - 2048)));
  return prefix === "%PDF-" && suffix.includes("%%EOF");
}

function firstValue(value: unknown, names: string[]) {
  return providerReference(value, names);
}

function findDocumentCandidate(value: unknown): Uint8Array | null {
  const wanted = new Set([
    "document",
    "document_base64",
    "documentbase64",
    "pdf",
    "pdf_base64",
    "pdfbase64",
    "declaration_document",
    "declarationdocument",
    "declaration_pdf",
    "declarationpdf",
    "file_content",
    "filecontent",
    "content",
    "payload",
  ]);
  const visit = (input: unknown): Uint8Array | null => {
    if (Array.isArray(input)) {
      for (const entry of input) {
        const found = visit(entry);
        if (found) return found;
      }
      return null;
    }
    if (!input || typeof input !== "object") return null;
    for (const [key, entry] of Object.entries(input as Json)) {
      const normalized = key.toLowerCase().replace(/[-\s]/g, "_");
      if (wanted.has(normalized) && typeof entry === "string") {
        const bytes = base64Bytes(entry);
        if (bytes && isBoundedPdf(bytes)) return bytes;
      }
      const nested = visit(entry);
      if (nested) return nested;
    }
    return null;
  };
  return visit(value);
}

function findDocumentUrl(value: unknown) {
  const wanted = new Set([
    "pdf",
    "pdf_url",
    "pdfurl",
    "document_url",
    "documenturl",
    "declaration_pdf_url",
    "declarationpdfurl",
  ]);
  const visit = (input: unknown): string => {
    if (Array.isArray(input)) {
      for (const entry of input) {
        const found = visit(entry);
        if (found) return found;
      }
      return "";
    }
    if (!input || typeof input !== "object") return "";
    for (const [key, entry] of Object.entries(input as Json)) {
      const normalized = key.toLowerCase().replace(/[-\s]/g, "_");
      if (wanted.has(normalized) && typeof entry === "string") {
        const candidate = entry.trim();
        if (candidate.length <= 4096) {
          try {
            const url = new URL(candidate);
            if (url.protocol === "https:") return candidate;
          } catch {
            // Inline Base64 is handled by findDocumentCandidate.
          }
        }
      }
      const nested = visit(entry);
      if (nested) return nested;
    }
    return "";
  };
  return visit(value);
}

function redactPayload(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[depth-redacted]";
  if (Array.isArray(value)) return value.slice(0, 200).map((entry) => redactPayload(entry, depth + 1));
  if (!value || typeof value !== "object") {
    if (typeof value !== "string") return value;
    if (value.length > 4096) return `[large-string-redacted:${value.length}]`;
    return value;
  }
  const result: Json = {};
  for (const [key, entry] of Object.entries(value as Json).slice(0, 500)) {
    if (/secret|token|signature|authorization|password|document|pdf|file.?content|signed.?url|^payload$/i.test(key)) {
      result[key] = typeof entry === "string"
        ? `[redacted:${entry.length}]`
        : "[redacted]";
    } else {
      result[key] = redactPayload(entry, depth + 1);
    }
  }
  return result;
}

function safeFileName(value: string, mrn: string) {
  const supplied = value.split(/[\\/]/).pop()?.replace(/[^A-Za-z0-9._ -]/g, "").trim();
  if (supplied && supplied.toLowerCase().endsWith(".pdf")) return supplied.slice(0, 180);
  const reference = mrn.replace(/[^A-Za-z0-9]/g, "").slice(0, 60) || "declaration";
  return `CDS-Declaration-${reference}.pdf`;
}

export async function parseWebhook(
  bytes: Uint8Array,
  contentTypeHeader: string,
  headers: Headers,
): Promise<ParsedICustomsWebhook> {
  if (!bytes.length) throw new WebhookInputError(400, "Webhook body is empty.");
  const contentType = safeText(contentTypeHeader.split(";")[0].toLowerCase(), 160) ||
    "application/octet-stream";
  const bodyHash = await sha256(bytes);
  let rawJson: Json | null = null;
  let documentBytes: Uint8Array | null = null;
  let documentUrl = "";

  if (contentType === "application/pdf") {
    if (!isBoundedPdf(bytes)) throw new WebhookInputError(422, "Webhook PDF is invalid.");
    documentBytes = bytes;
  } else {
    if (bytes.byteLength > MAX_CAPTURE_JSON_BYTES && !contentType.includes("json")) {
      throw new WebhookInputError(415, "Webhook content type is not supported.");
    }
    try {
      const parsed = JSON.parse(new TextDecoder().decode(bytes));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Expected an object");
      }
      rawJson = parsed as Json;
    } catch {
      throw new WebhookInputError(400, "Webhook body is not valid JSON.");
    }
    documentBytes = findDocumentCandidate(rawJson);
    documentUrl = findDocumentUrl(rawJson);
  }

  const evidence = rawJson ?? {};
  const correlationId = firstValue(evidence, [
    "co_relation_id",
    "co_relation",
    "correlation_id",
    "correlationId",
  ]) || safeText(headers.get("x-correlation-id"), 160);
  const providerEventId = firstValue(evidence, [
    "event_id",
    "eventId",
    "notification_id",
    "notificationId",
  ]) || safeText(headers.get("x-event-id"), 160);
  const providerNotificationId = firstValue(evidence, [
    "notification_ID",
    "notification_id",
    "notificationId",
  ]);
  const eventType = firstValue(evidence, [
    "event_type",
    "eventType",
    "notification_type",
    "notificationType",
  ]) || (documentBytes || documentUrl
    ? "declaration_document"
    : providerNotificationId
    ? "hmrc_notification"
    : "submission_status");
  const notificationXml = decodedBase64Text(evidence.payload);
  const providerStatus = lifecycleFromHmrcNotification(notificationXml) ||
    firstValue(evidence, ["submission_status"]) ||
    (rawJson ? inferICustomsStatus(rawJson, "") : "");
  const mrn = firstValue(evidence, ["mrn", "master_reference_number", "masterReferenceNumber"]);
  const lrn = firstValue(evidence, ["lrn", "local_reference_number", "localReferenceNumber"]);
  const eventCode = firstValue(evidence, ["code", "notification_code", "notificationCode"]) ||
    xmlElementValue(notificationXml, "ValidationCode", 120);
  const eventMessage = firstValue(evidence, ["message", "description", "notification_message", "notificationMessage"]) ||
    (providerStatus === "rejected"
      ? `HMRC rejected the declaration${eventCode ? ` (${eventCode})` : ""}.`
      : "");
  const suppliedFileName = firstValue(evidence, ["file_name", "fileName", "filename", "document_name", "documentName"]);

  return {
    bodyHash,
    bodySize: bytes.byteLength,
    contentType,
    eventId: providerEventId || bodyHash,
    eventType: safeText(eventType, 120) || "notification",
    correlationId,
    providerStatus,
    mrn,
    lrn,
    eventCode,
    eventMessage,
    documentBytes,
    documentUrl,
    documentFileName: safeFileName(suppliedFileName, mrn),
    sanitizedPayload: redactPayload(evidence) as Json,
    rawJson,
  };
}

export function normalizedLifecycle(providerStatus: string) {
  if (["released", "cleared"].includes(providerStatus)) return "accepted";
  if (["submitted", "acknowledged", "accepted", "rejected", "error"].includes(providerStatus)) {
    return providerStatus;
  }
  return "";
}

export function canApplyStatus(current: string, incoming: string) {
  if (!incoming || current === incoming) return Boolean(incoming);
  const rank: Record<string, number> = {
    queued: 0,
    draft: 1,
    acknowledged: 2,
    submitted: 3,
    accepted: 4,
    rejected: 4,
    error: 4,
  };
  return (rank[incoming] ?? -1) >= (rank[current] ?? -1);
}
