import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2";
import {
  adminClient,
  authenticate,
  corsHeaders,
  currentInternalUser,
  HttpError,
  readAllowedAppOrigins,
} from "../_shared/backend.ts";
import { generatedDocumentsBucket } from "../_shared/document-functions.ts";
import {
  canApplyStatus,
  constantTimeEqual,
  isBoundedPdf,
  MAX_WEBHOOK_BYTES,
  normalizedLifecycle,
  parseWebhook,
  readBoundedBody,
  safeText,
  sha256,
  type Json,
  type ParsedICustomsWebhook,
  WebhookInputError,
} from "./core.ts";

const SANDBOX_CONNECTION_ID = "c96a43a9-866a-4d27-ace1-5a6b82085dcb";
const WEBHOOK_CAPTURE_BUCKET = "icustoms-webhook-captures";
const DOCUMENT_DOWNLOAD_TIMEOUT_MS = 20_000;
const DOCUMENT_REDIRECT_LIMIT = 3;

function response(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function recoveryResponse(request: Request, body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function recoveryDeliveryId(request: Request) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const index = parts.lastIndexOf("icustoms-webhook");
  if (index < 0 || parts[index + 1] !== "replay") return "";
  const value = parts[index + 2] ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : "";
}

function routeSecret(request: Request) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const index = parts.lastIndexOf("icustoms-webhook");
  return index >= 0 ? decodeURIComponent(parts[index + 1] ?? "") : "";
}

function configuredSecret() {
  return Deno.env.get("ICUSTOMS_WEBHOOK_SECRET")?.trim() ?? "";
}

function captureMode() {
  // The sandbox contract was captured and bound on 2026-08-21. Processing is
  // now the safe default; capture-only mode requires an explicit emergency
  // override rather than an old rollout value of "true".
  return Deno.env.get("ICUSTOMS_WEBHOOK_CAPTURE_MODE")?.trim().toLowerCase() === "force";
}

function deploymentEnvironment() {
  return (Deno.env.get("MULTIDECK_ENVIRONMENT")?.trim() || "production")
    .replace(/[^a-z0-9_-]/gi, "-");
}

function safeHeaders(headers: Headers) {
  const result: Json = {};
  for (const name of ["content-type", "content-length", "user-agent", "x-event-id", "x-correlation-id"]) {
    const value = safeText(headers.get(name), 500);
    if (value) result[name] = value;
  }
  return result;
}

function capturePath(environment: string, hash: string, contentType: string) {
  const day = new Date().toISOString().slice(0, 10);
  const extension = contentType.includes("json") ? "json" : contentType === "application/pdf" ? "pdf" : "bin";
  return `v2/${deploymentEnvironment()}/${environment}/icustoms-webhooks/${day}/${hash}.${extension}`;
}

async function activeConnection(admin: SupabaseClient) {
  const connectionId = Deno.env.get("ICUSTOMS_CONNECTION_ID")?.trim() || SANDBOX_CONNECTION_ID;
  const { data, error } = await admin.from("ICUS_ApiConnections")
    .select("ICUSC_id, ICUSC_Environment, ICUSC_IsActive")
    .eq("ICUSC_id", connectionId)
    .eq("ICUSC_IsActive", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The configured iCustoms connection is not active.");
  return data as Json;
}

async function existingDelivery(admin: SupabaseClient, connectionId: string, eventId: string) {
  const { data, error } = await admin.from("ICUS_WebhookEvents")
    .select("*")
    .eq("ICUSWH_ApiConnectionID", connectionId)
    .eq("ICUSWH_EventID", eventId)
    .maybeSingle();
  if (error) throw error;
  return data as Json | null;
}

async function createDelivery(
  admin: SupabaseClient,
  connectionId: string,
  parsed: ParsedICustomsWebhook,
  request: Request,
) {
  const id = crypto.randomUUID();
  const { data, error } = await admin.from("ICUS_WebhookEvents").insert({
    ICUSWH_id: id,
    ICUSWH_ApiConnectionID: connectionId,
    ICUSWH_EventID: parsed.eventId,
    ICUSWH_EventType: parsed.eventType,
    ICUSWH_CorrelationID: parsed.correlationId || null,
    ICUSWH_BodySHA256: parsed.bodyHash,
    ICUSWH_ContentType: parsed.contentType,
    ICUSWH_BodySizeBytes: parsed.bodySize,
    ICUSWH_SignatureVerified: true,
    ICUSWH_RawHeadersJSON: safeHeaders(request.headers),
    ICUSWH_RawPayloadJSON: parsed.sanitizedPayload,
    ICUSWH_ProcessStatus: "received",
  }).select("*").single();
  if (!error) return { delivery: data as Json, duplicate: false };
  if (error.code !== "23505") throw error;
  const existing = await existingDelivery(admin, connectionId, parsed.eventId);
  if (!existing) throw error;
  return { delivery: existing, duplicate: true };
}

async function updateDelivery(admin: SupabaseClient, deliveryId: string, values: Json) {
  const { error } = await admin.from("ICUS_WebhookEvents").update(values).eq("ICUSWH_id", deliveryId);
  if (error) throw error;
}

async function storeCapture(
  admin: SupabaseClient,
  parsed: ParsedICustomsWebhook,
  bytes: Uint8Array,
  providerEnvironment: string,
) {
  const path = capturePath(providerEnvironment, parsed.bodyHash, parsed.contentType);
  const { error } = await admin.storage.from(WEBHOOK_CAPTURE_BUCKET).upload(path, bytes, {
    contentType: parsed.contentType,
    upsert: true,
  });
  if (error) throw error;
  return { bucket: WEBHOOK_CAPTURE_BUCKET, path };
}

function allowedDocumentHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "customscloud.co" ||
    host.endsWith(".customscloud.co") ||
    host === "amazonaws.com" ||
    host.endsWith(".amazonaws.com");
}

async function responseBytes(responseValue: Response) {
  const declared = Number(responseValue.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BYTES) {
    throw new WebhookInputError(422, "iCustoms document is too large.");
  }
  if (!responseValue.body) throw new WebhookInputError(502, "iCustoms document response was empty.");
  const reader = responseValue.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_WEBHOOK_BYTES) {
      await reader.cancel();
      throw new WebhookInputError(422, "iCustoms document is too large.");
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

async function downloadDocument(urlValue: string) {
  let current: URL;
  try {
    current = new URL(urlValue);
  } catch {
    throw new WebhookInputError(422, "iCustoms document URL is invalid.");
  }
  for (let redirect = 0; redirect <= DOCUMENT_REDIRECT_LIMIT; redirect += 1) {
    if (current.protocol !== "https:" || !allowedDocumentHost(current.hostname)) {
      throw new WebhookInputError(422, "iCustoms document host is not approved.");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOCUMENT_DOWNLOAD_TIMEOUT_MS);
    let downloaded: Response;
    try {
      downloaded = await fetch(current, { redirect: "manual", signal: controller.signal });
    } catch {
      throw new WebhookInputError(502, "iCustoms document download failed.");
    } finally {
      clearTimeout(timeout);
    }
    if ([301, 302, 303, 307, 308].includes(downloaded.status)) {
      const location = downloaded.headers.get("location");
      if (!location || redirect === DOCUMENT_REDIRECT_LIMIT) {
        throw new WebhookInputError(502, "iCustoms document redirect could not be followed.");
      }
      current = new URL(location, current);
      continue;
    }
    if (!downloaded.ok) {
      throw new WebhookInputError(502, `iCustoms document download returned ${downloaded.status}.`);
    }
    const bytes = await responseBytes(downloaded);
    if (!isBoundedPdf(bytes)) throw new WebhookInputError(422, "iCustoms document is not a valid PDF.");
    return bytes;
  }
  throw new WebhookInputError(502, "iCustoms document download failed.");
}

async function materializeDocument(parsed: ParsedICustomsWebhook) {
  if (parsed.documentBytes || !parsed.documentUrl) return parsed;
  return { ...parsed, documentBytes: await downloadDocument(parsed.documentUrl) };
}

async function submissionForCorrelation(
  admin: SupabaseClient,
  connectionId: string,
  correlationId: string,
) {
  const { data, error } = await admin.from("ICUS_Submissions")
    .select("*")
    .eq("ICUSS_ApiConnectionID", connectionId)
    .eq("ICUSS_iCustomsDeclarationID", correlationId)
    .order("ICUSS_CreatedAt", { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows = (data ?? []) as Json[];
  const declarationIds = new Set(
    rows.map((row) => safeText(row.ICUSS_CustomsID, 36)).filter(Boolean),
  );
  // A declaration normally has one immutable row for its provider draft and
  // another for the actual submission. Correlation safety is therefore about
  // resolving one declaration, not requiring one lifecycle row. The newest
  // row is the correct event target once every matched row agrees on it.
  if (rows.length === 0 || declarationIds.size !== 1) return null;
  return rows[0];
}

function declarationRoute(declaration: Json, review = false) {
  const scope = declaration.CUST_JobID ? "job-related" : "standalone";
  const route = `/customs/${scope}/${declaration.CUST_Direction}/${declaration.CUST_id}`;
  return review ? `${route}?tab=review` : route;
}

async function recipientForDeclaration(admin: SupabaseClient, declaration: Json) {
  const assigned = safeText(declaration.CUST_AssignedUserID, 36);
  if (assigned) return assigned;
  const createdBy = safeText(declaration.CUST_CreatedBy, 36);
  if (!createdBy) return "";
  const { data, error } = await admin.from("cmp_Users")
    .select("User_ID")
    .eq("Auth_User_ID", createdBy)
    .eq("User_AccessStatus", "active")
    .maybeSingle();
  if (error) throw error;
  return safeText(data?.User_ID, 36);
}

function statusUpdate(current: Json, parsed: ParsedICustomsWebhook, now: string) {
  const incoming = normalizedLifecycle(parsed.providerStatus);
  if (!incoming || !canApplyStatus(safeText(current.ICUSS_Status, 40), incoming)) return null;
  const values: Json = {
    ICUSS_Status: incoming,
    ICUSS_ProviderStatus: parsed.providerStatus,
    ICUSS_MRN: parsed.mrn || current.ICUSS_MRN || null,
    ICUSS_LRN: parsed.lrn || current.ICUSS_LRN || null,
    ICUSS_ErrorCode: ["rejected", "error"].includes(incoming) ? parsed.eventCode || null : null,
    ICUSS_ErrorMessage: ["rejected", "error"].includes(incoming) ? parsed.eventMessage || null : null,
    ICUSS_UpdatedAt: now,
  };
  if (["submitted", "accepted", "rejected"].includes(incoming)) {
    values.ICUSS_SubmittedAt = current.ICUSS_SubmittedAt || now;
  }
  if (["accepted", "rejected", "error"].includes(incoming)) values.ICUSS_CompletedAt = now;
  if (incoming === "acknowledged") values.ICUSS_AcknowledgedAt = current.ICUSS_AcknowledgedAt || now;
  return values;
}

async function storeDocument(
  admin: SupabaseClient,
  parsed: ParsedICustomsWebhook,
  declaration: Json,
  providerEnvironment: string,
  now: string,
) {
  const bytes = parsed.documentBytes;
  if (!bytes) return null;
  if (!isBoundedPdf(bytes)) throw new WebhookInputError(422, "Webhook PDF is invalid.");
  const fileHash = await sha256(bytes);
  const path = `v2/${deploymentEnvironment()}/${providerEnvironment}/customs/${declaration.CUST_id}/icustoms/${fileHash}.pdf`;
  const { error: uploadError } = await admin.storage.from(generatedDocumentsBucket).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) throw uploadError;

  const retainUntil = new Date(now);
  retainUntil.setUTCFullYear(retainUntil.getUTCFullYear() + 7);
  const documentId = crypto.randomUUID();
  const values = {
    CUSTD_ID: documentId,
    CUSTD_CustomsID: declaration.CUST_id,
    CUSTD_Direction: declaration.CUST_Direction,
    CUSTD_SourceSHA256: parsed.bodyHash,
    CUSTD_SourceCode: "icustoms_webhook",
    CUSTD_ProviderEventID: parsed.eventId,
    CUSTD_ProviderEnvironment: providerEnvironment,
    CUSTD_IsOfficial: providerEnvironment === "production",
    CUSTD_ProviderStatus: parsed.providerStatus || null,
    CUSTD_MRN: parsed.mrn || declaration.CUST_MasterReferenceNumber || null,
    CUSTD_FileName: parsed.documentFileName,
    CUSTD_StorageBucket: generatedDocumentsBucket,
    CUSTD_StoragePath: path,
    CUSTD_MimeType: "application/pdf",
    CUSTD_FileSizeBytes: bytes.byteLength,
    CUSTD_FileSHA256: fileHash,
    CUSTD_RetainUntil: retainUntil.toISOString(),
    CUSTD_ReceivedAt: now,
    CUSTD_CreatedAt: now,
    CUSTD_CreatedBy: declaration.CUST_CreatedBy,
  };
  const { data, error } = await admin.from("Customs_DeclarationDocuments")
    .insert(values).select("*").single();
  if (!error) return data as Json;
  if (error.code !== "23505") throw error;
  const { data: existing, error: existingError } = await admin.from("Customs_DeclarationDocuments")
    .select("*")
    .eq("CUSTD_CustomsID", declaration.CUST_id)
    .eq("CUSTD_SourceSHA256", parsed.bodyHash)
    .maybeSingle();
  if (existingError || !existing) throw existingError ?? error;
  return existing as Json;
}

function notificationCopy(status: string, statusChanged: boolean, documentCreated: boolean) {
  if (status === "accepted" && statusChanged && documentCreated) {
    return {
      title: "Declaration accepted — document ready",
      body: "iCustoms accepted the declaration and returned its declaration document.",
      key: "customs.declaration_accepted_document_ready",
      priority: "normal",
      review: false,
    };
  }
  if (documentCreated) {
    return {
      title: "Declaration document ready",
      body: "The declaration document from iCustoms is ready to view or download.",
      key: "customs.declaration_document_ready",
      priority: "normal",
      review: false,
    };
  }
  if (status === "accepted" && statusChanged) {
    return {
      title: "Declaration accepted",
      body: "iCustoms accepted the declaration. Its declaration document will appear when delivered.",
      key: "customs.declaration_accepted",
      priority: "normal",
      review: false,
    };
  }
  if (["rejected", "error"].includes(status) && statusChanged) {
    return {
      title: status === "rejected" ? "Declaration rejected" : "Declaration needs attention",
      body: "iCustoms returned an issue. Open Review to see the provider evidence and correct the declaration.",
      key: status === "rejected" ? "customs.declaration_rejected" : "customs.declaration_error",
      priority: "high",
      review: true,
    };
  }
  return null;
}

async function createNotification(
  admin: SupabaseClient,
  parsed: ParsedICustomsWebhook,
  declaration: Json,
  status: string,
  statusChanged: boolean,
  documentCreated: boolean,
) {
  const copy = notificationCopy(status, statusChanged, documentCreated);
  if (!copy) return null;
  const recipient = await recipientForDeclaration(admin, declaration);
  if (!recipient) return null;
  const actionUrl = declarationRoute(declaration, copy.review);
  const values = {
    CommNotif_UserID: recipient,
    CommNotif_PriorityCode: copy.priority,
    CommNotif_Title: copy.title,
    CommNotif_Body: copy.body,
    CommNotif_TargetTable: "Customs_Declarations",
    CommNotif_TargetID: declaration.CUST_id,
    CommNotif_LinkTypeCode: "customs",
    CommNotif_MetadataJSON: {
      event_type: "icustoms_webhook",
      provider_event_id: parsed.eventId,
      i18n_key: copy.key,
      action_url: actionUrl,
      action_label: copy.review ? "Open Review" : "Open declaration",
      declaration_id: declaration.CUST_id,
      document_ready: documentCreated,
      provider_status: parsed.providerStatus || null,
    },
    CommNotif_CreatedBy: null,
  };
  const { data, error } = await admin.from("Comm_Notifications").insert(values)
    .select("CommNotif_ID").single();
  if (!error) return safeText(data.CommNotif_ID, 36);
  if (error.code !== "23505") throw error;
  const { data: existing, error: existingError } = await admin.from("Comm_Notifications")
    .select("CommNotif_ID")
    .eq("CommNotif_LinkTypeCode", "customs")
    .eq("CommNotif_MetadataJSON->>provider_event_id", parsed.eventId)
    .maybeSingle();
  if (existingError) throw existingError;
  return safeText(existing?.CommNotif_ID, 36) || null;
}

async function processDelivery(
  admin: SupabaseClient,
  parsed: ParsedICustomsWebhook,
  delivery: Json,
  connection: Json,
) {
  if (!parsed.correlationId) {
    await updateDelivery(admin, String(delivery.ICUSWH_id), {
      ICUSWH_ProcessStatus: "quarantined",
      ICUSWH_ProcessError: "No supported correlation field was present in the captured contract.",
      ICUSWH_ProcessedAt: new Date().toISOString(),
    });
    return { status: "quarantined", reason: "correlation_missing" };
  }
  const submission = await submissionForCorrelation(
    admin,
    String(connection.ICUSC_id),
    parsed.correlationId,
  );
  if (!submission || !submission.ICUSS_CustomsID) {
    await updateDelivery(admin, String(delivery.ICUSWH_id), {
      ICUSWH_ProcessStatus: "quarantined",
      ICUSWH_ProcessError: "Correlation did not match exactly one iCustoms declaration.",
      ICUSWH_ProcessedAt: new Date().toISOString(),
    });
    return { status: "quarantined", reason: "correlation_unmatched" };
  }
  const { data: declaration, error: declarationError } = await admin.from("Customs_Declarations")
    .select("*").eq("CUST_id", submission.ICUSS_CustomsID).eq("CUST_IsDeleted", false).maybeSingle();
  if (declarationError) throw declarationError;
  if (!declaration) throw new Error("The correlated declaration no longer exists.");

  parsed = await materializeDocument(parsed);

  const now = new Date().toISOString();
  const incomingLifecycle = normalizedLifecycle(parsed.providerStatus);
  const submissionValues = statusUpdate(submission, parsed, now);
  const statusChanged = Boolean(
    submissionValues && (
      submissionValues.ICUSS_Status !== submission.ICUSS_Status ||
      parsed.providerStatus !== submission.ICUSS_ProviderStatus
    ),
  );
  if (submissionValues) {
    const { error } = await admin.from("ICUS_Submissions").update(submissionValues)
      .eq("ICUSS_id", submission.ICUSS_id);
    if (error) throw error;
  }

  const providerEnvironment = connection.ICUSC_Environment === "production" ? "production" : "sandbox";
  const document = await storeDocument(admin, parsed, declaration as Json, providerEnvironment, now);
  const declarationValues: Json = { CUST_UpdatedAt: now };
  if (statusChanged) {
    declarationValues.CUST_Status = parsed.providerStatus === "released" || parsed.providerStatus === "cleared"
      ? parsed.providerStatus
      : incomingLifecycle;
    declarationValues.CUST_iCustomsStatusSnapshot = parsed.providerStatus;
    if (parsed.mrn) {
      declarationValues.CUST_CustomsReferenceNumber = parsed.mrn;
      declarationValues.CUST_MasterReferenceNumber = parsed.mrn;
    }
  }
  if (document) {
    declarationValues.CUST_DeclarationDocumentID = document.CUSTD_ID;
    declarationValues.CUST_DeclarationDocumentFileName = document.CUSTD_FileName;
    declarationValues.CUST_DeclarationDocumentMimeType = document.CUSTD_MimeType;
    declarationValues.CUST_DeclarationDocumentReceivedAt = document.CUSTD_ReceivedAt;
  }
  const { data: savedDeclaration, error: updateDeclarationError } = await admin
    .from("Customs_Declarations").update(declarationValues).eq("CUST_id", declaration.CUST_id)
    .select("*").single();
  if (updateDeclarationError) throw updateDeclarationError;

  const normalizedEvidence = {
    webhookEventId: delivery.ICUSWH_id,
    providerEventId: parsed.eventId,
    correlationId: parsed.correlationId,
    bodySha256: parsed.bodyHash,
    providerStatus: parsed.providerStatus || null,
    mrn: parsed.mrn || null,
    lrn: parsed.lrn || null,
    documentId: document?.CUSTD_ID ?? null,
    documentSha256: document?.CUSTD_FileSHA256 ?? null,
  };
  const { error: eventError } = await admin.from("ICUS_SubmissionEvents").insert({
    ICUSE_SubmissionID: submission.ICUSS_id,
    ICUSE_EventType: document ? "icustoms_webhook_document" : "icustoms_webhook_notification",
    ICUSE_EventStatus: parsed.providerStatus || null,
    ICUSE_EventCode: parsed.eventCode || null,
    ICUSE_EventMessage: parsed.eventMessage || null,
    ICUSE_EventPayloadJSON: normalizedEvidence,
    ICUSE_ReceivedAt: now,
  });
  if (eventError && eventError.code !== "23505") throw eventError;
  if (eventError?.code === "23505" && document) {
    const { error: evidenceUpdateError } = await admin.from("ICUS_SubmissionEvents").update({
      ICUSE_EventType: "icustoms_webhook_document",
      ICUSE_EventStatus: parsed.providerStatus || safeText(submission.ICUSS_Status, 40) || null,
      ICUSE_EventPayloadJSON: normalizedEvidence,
    }).eq("ICUSE_EventPayloadJSON->>providerEventId", parsed.eventId);
    if (evidenceUpdateError) throw evidenceUpdateError;
  }

  const notificationId = await createNotification(
    admin,
    parsed,
    savedDeclaration as Json,
    incomingLifecycle || safeText(submission.ICUSS_Status, 40),
    statusChanged,
    Boolean(document),
  );
  const { error: auditError } = await admin.from("Customs_AuditLog").insert({
    CUSTAU_CustomsID: declaration.CUST_id,
    CUSTAU_Action: document ? "icustoms_webhook_document_received" : "icustoms_webhook_status_received",
    CUSTAU_TableName: "ICUS_WebhookEvents",
    CUSTAU_RecordID: delivery.ICUSWH_id,
    CUSTAU_ChangedBy: declaration.CUST_CreatedBy,
    CUSTAU_NewValues: normalizedEvidence,
    CUSTAU_Source: "icustoms-webhook",
    CUSTAU_Notes: document
      ? `${providerEnvironment === "production" ? "Official" : "Non-official sandbox"} iCustoms declaration document received and retained for seven years.`
      : "iCustoms webhook status evidence received.",
  });
  if (auditError) throw auditError;

  await updateDelivery(admin, String(delivery.ICUSWH_id), {
    ICUSWH_SubmissionID: submission.ICUSS_id,
    ICUSWH_DocumentSHA256: document?.CUSTD_FileSHA256 ?? null,
    ICUSWH_NotificationID: notificationId,
    ICUSWH_ProcessStatus: "processed",
    ICUSWH_ProcessError: null,
    ICUSWH_ProcessedAt: now,
  });
  return { status: "processed", documentAvailable: Boolean(document) };
}

async function recoverCapturedDelivery(request: Request, deliveryId: string) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return recoveryResponse(request, { detail: "Method not allowed." }, 405);
  }
  const origin = request.headers.get("Origin")?.trim() ?? "";
  if (origin && !readAllowedAppOrigins().has(origin)) {
    return recoveryResponse(request, { detail: "This application origin is not allowed." }, 403);
  }

  let recoveryAdmin: SupabaseClient | null = null;
  try {
    const admin = adminClient();
    recoveryAdmin = admin;
    const { user } = await authenticate(request, admin);
    await currentInternalUser(admin, user);
    const { data: delivery, error: deliveryError } = await admin.from("ICUS_WebhookEvents")
      .select("*")
      .eq("ICUSWH_id", deliveryId)
      .eq("ICUSWH_SignatureVerified", true)
      .maybeSingle();
    if (deliveryError) throw deliveryError;
    if (!delivery) throw new HttpError(404, "That verified webhook delivery was not found.");
    if (delivery.ICUSWH_DocumentSHA256) {
      return recoveryResponse(request, { recovered: false, duplicate: true, documentAvailable: true });
    }

    const connection = await activeConnection(admin);
    if (String(delivery.ICUSWH_ApiConnectionID) !== String(connection.ICUSC_id)) {
      throw new HttpError(404, "That verified webhook delivery was not found.");
    }
    const bucket = safeText(delivery.ICUSWH_RawStorageBucket, 160);
    const path = safeText(delivery.ICUSWH_RawStoragePath, 1000);
    if (bucket !== WEBHOOK_CAPTURE_BUCKET || !path.startsWith("v2/")) {
      throw new HttpError(409, "The private webhook capture is unavailable.");
    }
    const { data: capture, error: captureError } = await admin.storage.from(bucket).download(path);
    if (captureError || !capture) {
      throw new HttpError(409, "The private webhook capture is unavailable.");
    }
    const bytes = new Uint8Array(await capture.arrayBuffer());
    if (bytes.byteLength > MAX_WEBHOOK_BYTES) {
      throw new WebhookInputError(422, "The captured webhook is too large.");
    }
    const contentType = safeText(delivery.ICUSWH_ContentType, 160) || "application/octet-stream";
    const parsed = await parseWebhook(bytes, contentType, new Headers());
    if (
      parsed.eventId !== safeText(delivery.ICUSWH_EventID, 160) ||
      parsed.bodyHash !== safeText(delivery.ICUSWH_BodySHA256, 64)
    ) {
      throw new HttpError(409, "The private webhook capture no longer matches its ledger evidence.");
    }
    const submission = await submissionForCorrelation(
      admin,
      String(connection.ICUSC_id),
      parsed.correlationId,
    );
    if (!submission?.ICUSS_CustomsID) {
      throw new HttpError(409, "The webhook correlation no longer matches one declaration.");
    }
    const { data: authorised, error: authorisationError } = await admin.rpc(
      "customs_declaration_authorised",
      {
        caller_auth_user_id: user.id,
        requested_declaration_id: submission.ICUSS_CustomsID,
        require_write: false,
        require_draft: false,
      },
    );
    if (authorisationError) throw authorisationError;
    if (!authorised) throw new HttpError(404, "That verified webhook delivery was not found.");

    await updateDelivery(admin, deliveryId, {
      ICUSWH_EventType: parsed.eventType,
      ICUSWH_CorrelationID: parsed.correlationId,
      ICUSWH_ProcessStatus: "processing",
      ICUSWH_ProcessError: null,
    });
    const result = await processDelivery(admin, parsed, delivery as Json, connection);
    return recoveryResponse(request, { recovered: true, ...result });
  } catch (error) {
    const status = error instanceof HttpError
      ? error.status
      : error instanceof WebhookInputError
      ? error.status
      : 500;
    const detail = error instanceof Error
      ? error.message.slice(0, 500)
      : safeText((error as Json | null)?.message, 500) || "Webhook recovery failed.";
    if (recoveryAdmin) {
      try {
        await updateDelivery(recoveryAdmin, deliveryId, {
          ICUSWH_ProcessStatus: status < 500 ? "quarantined" : "failed",
          ICUSWH_ProcessError: detail,
          ICUSWH_ProcessedAt: status < 500 ? new Date().toISOString() : null,
        });
      } catch {
        // Preserve the original safe recovery failure.
      }
    }
    console.error("iCustoms webhook recovery failed", { status, deliveryId });
    return recoveryResponse(
      request,
      { detail: status >= 500 ? "Webhook recovery failed." : detail },
      status,
    );
  }
}

Deno.serve(async (request) => {
  const recoveryId = recoveryDeliveryId(request);
  if (recoveryId) return await recoverCapturedDelivery(request, recoveryId);

  const expected = configuredSecret();
  const supplied = routeSecret(request);
  if (!expected || !supplied || !constantTimeEqual(supplied, expected)) {
    return response({ error: "Not found" }, 404);
  }

  // iCustoms verifies a newly entered callback URL with a safe GET before it
  // will save the setting. Its challenge must be echoed exactly in JSON. Do
  // not create a delivery for that readiness probe.
  if (request.method === "GET") {
    const challenge = new URL(request.url).searchParams.get("challenge") ?? "";
    if (!challenge || challenge.length > 1024) {
      return response({ error: "A valid challenge is required." }, 400);
    }
    return response({ challenge });
  }
  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);

  let admin: SupabaseClient | null = null;
  let deliveryId = "";
  try {
    const bytes = await readBoundedBody(request);
    admin = adminClient();
    const connection = await activeConnection(admin);
    let parsed: ParsedICustomsWebhook;
    try {
      parsed = await parseWebhook(bytes, request.headers.get("content-type") ?? "", request.headers);
    } catch (error) {
      if (!(error instanceof WebhookInputError)) throw error;
      const bodyHash = await sha256(bytes);
      const contentType = safeText((request.headers.get("content-type") ?? "application/octet-stream").split(";")[0], 160);
      const malformed: ParsedICustomsWebhook = {
        bodyHash,
        bodySize: bytes.byteLength,
        contentType,
        eventId: bodyHash,
        eventType: "malformed",
        correlationId: "",
        providerStatus: "",
        mrn: "",
        lrn: "",
        eventCode: "",
        eventMessage: "",
        documentBytes: null,
        documentUrl: "",
        documentFileName: "CDS-Declaration-declaration.pdf",
        sanitizedPayload: { captureError: error.message },
        rawJson: null,
      };
      const claimed = await createDelivery(admin, String(connection.ICUSC_id), malformed, request);
      deliveryId = safeText(claimed.delivery.ICUSWH_id, 36);
      const capture = await storeCapture(
        admin,
        malformed,
        bytes,
        connection.ICUSC_Environment === "production" ? "production" : "sandbox",
      );
      await updateDelivery(admin, deliveryId, {
        ICUSWH_RawStorageBucket: capture.bucket,
        ICUSWH_RawStoragePath: capture.path,
        ICUSWH_ProcessStatus: "quarantined",
        ICUSWH_ProcessError: error.message,
        ICUSWH_ProcessedAt: new Date().toISOString(),
      });
      return response({ error: error.message }, error.status);
    }
    const claimed = await createDelivery(admin, String(connection.ICUSC_id), parsed, request);
    deliveryId = safeText(claimed.delivery.ICUSWH_id, 36);
    const existingStatus = safeText(claimed.delivery.ICUSWH_ProcessStatus, 40);
    const recoverableDocument = Boolean(parsed.documentBytes || parsed.documentUrl) &&
      !claimed.delivery.ICUSWH_DocumentSHA256;
    if (
      claimed.duplicate &&
      (["processed", "quarantined"].includes(existingStatus) ||
        (existingStatus === "captured" && captureMode())) &&
      !recoverableDocument
    ) {
      return response({ received: true, duplicate: true, status: existingStatus });
    }

    const capture = await storeCapture(
      admin,
      parsed,
      bytes,
      connection.ICUSC_Environment === "production" ? "production" : "sandbox",
    );
    await updateDelivery(admin, deliveryId, {
      ICUSWH_RawStorageBucket: capture.bucket,
      ICUSWH_RawStoragePath: capture.path,
      ICUSWH_ProcessStatus: captureMode() ? "captured" : "processing",
      ICUSWH_ProcessError: null,
    });

    if (captureMode()) {
      console.info("iCustoms webhook captured", {
        eventId: parsed.eventId,
        bodyHash: parsed.bodyHash,
        bodySize: parsed.bodySize,
        contentType: parsed.contentType,
        hasCorrelation: Boolean(parsed.correlationId),
        hasDocument: Boolean(parsed.documentBytes || parsed.documentUrl),
      });
      return response({ received: true, status: "captured" }, 202);
    }

    const result = await processDelivery(admin, parsed, claimed.delivery, connection);
    console.info("iCustoms webhook handled", {
      eventId: parsed.eventId,
      bodyHash: parsed.bodyHash,
      status: result.status,
      documentAvailable: "documentAvailable" in result ? result.documentAvailable : false,
    });
    return response({ received: true, ...result });
  } catch (error) {
    const status = error instanceof WebhookInputError ? error.status : 500;
    const reason = error instanceof Error ? error.message.slice(0, 500) : "Unexpected webhook failure";
    if (admin && deliveryId) {
      try {
        await updateDelivery(admin, deliveryId, {
          ICUSWH_ProcessStatus: status < 500 ? "quarantined" : "failed",
          ICUSWH_ProcessError: reason,
          ICUSWH_ProcessedAt: status < 500 ? new Date().toISOString() : null,
        });
      } catch {
        // The original safe failure remains the useful retry signal.
      }
    }
    console.error("iCustoms webhook failed", { status, reason, deliveryId: deliveryId || null });
    return response({ error: status >= 500 ? "Webhook processing failed." : reason }, status);
  }
});
