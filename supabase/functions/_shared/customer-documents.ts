import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import { cleanString, InboxHttpError, safeFileName } from "../inbox-api/core.ts"
import {
  attachment as downloadEmailAttachment,
  requireActor,
  requirePermission,
  runtimeClients,
  type Actor,
} from "../inbox-api/runtime.ts"

type Db = SupabaseClient<any, "public", any, any, any>
type Row = Record<string, any>

const DOCUMENT_BUCKET = "multideck-documents"
const MAX_IDEMPOTENCY_LENGTH = 160
const BLOCKED_SCAN_STATUSES = new Set(["blocked", "infected", "quarantined", "malicious"])

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function one<T extends Row>(query: PromiseLike<{ data: T | null; error: any }>, message: string): Promise<T | null> {
  const { data, error } = await query
  if (error) throw new InboxHttpError(503, message, cleanString(error.code, 40) || "database_unavailable")
  return data
}

async function many<T extends Row>(query: PromiseLike<{ data: T[] | null; error: any }>, message: string): Promise<T[]> {
  const { data, error } = await query
  if (error) throw new InboxHttpError(503, message, cleanString(error.code, 40) || "database_unavailable")
  return data ?? []
}

async function requiredPermissions(admin: Db, actor: Actor) {
  for (const permission of ["AgentDexter.Manage", "Email.Read", "Email.AIRead", "Customers.Read", "Customers.Write"]) {
    await requirePermission(admin, actor, permission)
  }
}

async function customer(admin: Db, customerId: string) {
  const row = await one<Row>(admin.from("Org_Master")
    .select("Org_id,Org_Name,Org_CRMIsPotentialCustomer")
    .eq("Org_id", customerId)
    .limit(1)
    .maybeSingle(), "Customer data is unavailable.")
  if (!row) throw new InboxHttpError(404, "The destination customer no longer exists.", "customer_not_found")
  if (!row.Org_CRMIsPotentialCustomer) {
    const customerTypes = await many<Row>(admin.from("Org_Master_Type")
      .select("Org_ID,Org_Types!inner(OrgType_Name)")
      .eq("Org_ID", customerId).eq("Org_Types.OrgType_Name", "Customer").limit(1), "Customer scope is unavailable.")
    if (!customerTypes.length) throw new InboxHttpError(404, "The destination customer no longer exists.", "customer_not_found")
  }
  return row
}

function extension(fileName: string) {
  const match = safeFileName(fileName).toLowerCase().match(/\.([a-z0-9]{1,11})$/)
  return match ? `.${match[1]}` : ""
}

function storagePath(customerId: string, documentId: string, fileName: string, createdAt: Date) {
  const compactCustomer = customerId.replaceAll("-", "")
  return [
    "v1", "production", compactCustomer, "general", "customer", compactCustomer,
    String(createdAt.getUTCFullYear()), String(createdAt.getUTCMonth() + 1).padStart(2, "0"),
    `${documentId.replaceAll("-", "")}${extension(fileName)}`,
  ].join("/")
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer))
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function documentDto(row: Row) {
  return {
    id: row.CRMCustomerDocument_ID,
    fileName: row.CRMCustomerDocument_FileName,
    mimeType: row.CRMCustomerDocument_MimeType,
    fileSizeBytes: Number(row.CRMCustomerDocument_FileSizeBytes) || 0,
    status: row.CRMCustomerDocument_StatusCode,
    safetyStatus: row.CRMCustomerDocument_SafetyStatusCode,
    createdAt: row.CRMCustomerDocument_CreatedAt,
    sourceMessageId: row.CRMCustomerDocument_SourceMessageID,
    sourceAttachmentId: row.CRMCustomerDocument_SourceAttachmentID,
  }
}

export async function attachEmailDocumentToCustomer(input: {
  authorization: string
  actionId: string
  attachmentId: string
  customerId: string
  idempotencyKey: string
}) {
  const { authorization, actionId, attachmentId, customerId } = input
  const idempotencyKey = cleanString(input.idempotencyKey, MAX_IDEMPOTENCY_LENGTH)
  if (![actionId, attachmentId, customerId].every(isUuid) || idempotencyKey.length < 8) {
    throw new InboxHttpError(400, "The approved attachment action is invalid.", "invalid_action")
  }

  const clients = runtimeClients(authorization)
  const actor = await requireActor(clients.user, clients.admin)
  await requiredPermissions(clients.admin, actor)
  const customerRow = await customer(clients.admin, customerId)

  const existing = await one<Row>(clients.admin.from("CRM_CustomerDocuments").select("*")
    .eq("CRMCustomerDocument_CustomerOrgID", customerId)
    .eq("CRMCustomerDocument_SourceAttachmentID", attachmentId)
    .limit(1).maybeSingle(), "Customer document data is unavailable.")
  if (existing && ["ready", "pending_review"].includes(existing.CRMCustomerDocument_StatusCode)) {
    return { status: "already_attached", document: documentDto(existing) }
  }
  if (existing?.CRMCustomerDocument_StatusCode === "processing") {
    throw new InboxHttpError(409, "This attachment is already being saved to that customer.", "document_processing")
  }

  const source = await one<Row>(clients.admin.from("Comm_MessageAttachments").select("*")
    .eq("CommAttachment_ID", attachmentId).limit(1).maybeSingle(), "Email attachment data is unavailable.")
  if (!source || source.CommAttachment_IsInline) {
    throw new InboxHttpError(404, "This source email attachment is no longer eligible for import.", "attachment_not_found")
  }
  const scanStatus = cleanString(source.CommAttachment_ScanStatus, 40).toLowerCase()
  if (BLOCKED_SCAN_STATUSES.has(scanStatus)) {
    throw new InboxHttpError(422, "This attachment is blocked by the workspace security policy.", "attachment_blocked")
  }

  const message = await one<Row>(clients.admin.from("Comm_Messages").select("*")
    .eq("CommMessage_ID", source.CommAttachment_MessageID).limit(1).maybeSingle(), "Source email data is unavailable.")
  if (!message || message.CommMessage_IsDeleted || message.CommMessage_IsDraft || message.CommMessage_IsSpam) {
    throw new InboxHttpError(404, "This source email attachment is no longer eligible for import.", "attachment_not_found")
  }
  const excluded = await many<Row>(clients.admin.from("Comm_MessageFolders")
    .select("CommMessageFolder_MessageID,Comm_MailFolders!inner(CommMailFolder_RoleCode)")
    .eq("CommMessageFolder_MessageID", message.CommMessage_ID)
    .in("Comm_MailFolders.CommMailFolder_RoleCode", ["drafts", "spam", "trash"])
    .limit(1), "Source email folders are unavailable.")
  if (excluded.length) throw new InboxHttpError(404, "This source email attachment is no longer eligible for import.", "attachment_not_found")

  const rowId = existing?.CRMCustomerDocument_ID ?? crypto.randomUUID()
  const processing = {
    CRMCustomerDocument_ID: rowId,
    CRMCustomerDocument_CustomerOrgID: customerId,
    CRMCustomerDocument_SourceMessageID: message.CommMessage_ID,
    CRMCustomerDocument_SourceAttachmentID: attachmentId,
    CRMCustomerDocument_ActionID: actionId,
    CRMCustomerDocument_IdempotencyKey: idempotencyKey,
    CRMCustomerDocument_StatusCode: "processing",
    CRMCustomerDocument_SafetyStatusCode: "unscanned",
    CRMCustomerDocument_FileName: safeFileName(source.CommAttachment_FileName),
    CRMCustomerDocument_MimeType: cleanString(source.CommAttachment_MimeType, 160) || "application/octet-stream",
    CRMCustomerDocument_FileSizeBytes: Number(source.CommAttachment_FileSizeBytes) || 0,
    CRMCustomerDocument_FailureMessage: null,
    CRMCustomerDocument_CreatedBy: actor.userId,
    CRMCustomerDocument_UpdatedAt: new Date().toISOString(),
  }
  const processingWrite = existing
    ? clients.admin.from("CRM_CustomerDocuments").update(processing).eq("CRMCustomerDocument_ID", rowId)
    : clients.admin.from("CRM_CustomerDocuments").insert(processing)
  const { error: processingError } = await processingWrite
  if (processingError) {
    if (!existing && processingError.code === "23505") {
      throw new InboxHttpError(409, "This attachment is already being saved to that customer.", "document_processing")
    }
    throw new InboxHttpError(503, "The approved document import could not be started.", cleanString(processingError.code, 40))
  }

  let objectPath = ""
  let storedObjectId = ""
  try {
    const download = await downloadEmailAttachment(clients.admin, actor, attachmentId)
    const fileName = safeFileName(download.fileName)
    const documentId = crypto.randomUUID()
    storedObjectId = documentId
    const createdAt = new Date()
    const hash = await sha256Hex(download.bytes)
    objectPath = storagePath(customerId, documentId, fileName, createdAt)
    const { error: uploadError } = await clients.admin.storage.from(DOCUMENT_BUCKET).upload(objectPath, download.bytes, {
      contentType: download.mimeType,
      cacheControl: "0",
      upsert: false,
      metadata: { documentid: documentId.replaceAll("-", ""), concern: "general", aggregatetype: "customer", aggregateid: customerId.replaceAll("-", ""), sha256: hash, organisationid: customerId.replaceAll("-", "") },
    })
    if (uploadError) throw uploadError

    const { error: catalogueError } = await clients.admin.from("DOC_StoredObjects").insert({
      DOCStoredObject_ID: documentId,
      DOCStoredObject_ConcernCode: "general",
      DOCStoredObject_OrganisationID: customerId,
      DOCStoredObject_AggregateType: "customer",
      DOCStoredObject_AggregateID: customerId,
      DOCStoredObject_ProviderCode: "supabase_storage",
      DOCStoredObject_Container: DOCUMENT_BUCKET,
      DOCStoredObject_BlobName: objectPath,
      DOCStoredObject_OriginalFileName: fileName,
      DOCStoredObject_MimeType: download.mimeType,
      DOCStoredObject_FileSizeBytes: download.bytes.byteLength,
      DOCStoredObject_SHA256: hash,
      DOCStoredObject_StatusCode: "active",
      DOCStoredObject_CreatedAt: createdAt.toISOString(),
      DOCStoredObject_CreatedBy: actor.userId,
    })
    if (catalogueError) throw catalogueError

    const clean = source.CommAttachment_IsScanned === true && scanStatus === "clean"
    const { data: completed, error: completedError } = await clients.admin.from("CRM_CustomerDocuments").update({
      CRMCustomerDocument_StoredObjectID: documentId,
      CRMCustomerDocument_StatusCode: clean ? "ready" : "pending_review",
      CRMCustomerDocument_SafetyStatusCode: clean ? "clean" : "unscanned",
      CRMCustomerDocument_FileName: fileName,
      CRMCustomerDocument_MimeType: download.mimeType,
      CRMCustomerDocument_FileSizeBytes: download.bytes.byteLength,
      CRMCustomerDocument_SHA256: hash,
      CRMCustomerDocument_FailureMessage: null,
      CRMCustomerDocument_UpdatedAt: new Date().toISOString(),
    }).eq("CRMCustomerDocument_ID", rowId).select("*").single()
    if (completedError || !completed) throw completedError ?? new Error("The customer document relationship was not saved.")
    const result = { status: "attached", document: documentDto(completed) }
    const { error: auditError } = await clients.admin.from("AI_DexterActionAudit").insert({
      AIDexterAudit_CompanyID: actor.companyId,
      AIDexterAudit_UserID: actor.userId,
      AIDexterAudit_ActionCode: "attach_email_document_to_customer",
      AIDexterAudit_AccessMode: "approve",
      AIDexterAudit_ArgumentsJSON: { attachment_id: attachmentId, target_id: customerId },
      AIDexterAudit_ResultJSON: result,
    })
    if (auditError) throw auditError
    return result
  } catch (error) {
    if (objectPath) await clients.admin.storage.from(DOCUMENT_BUCKET).remove([objectPath]).catch(() => undefined)
    if (storedObjectId) await clients.admin.from("DOC_StoredObjects").delete().eq("DOCStoredObject_ID", storedObjectId)
    await clients.admin.from("CRM_CustomerDocuments").update({
      CRMCustomerDocument_StoredObjectID: null,
      CRMCustomerDocument_StatusCode: "failed",
      CRMCustomerDocument_FailureMessage: cleanString(error instanceof Error ? error.message : String(error), 1_000),
      CRMCustomerDocument_UpdatedAt: new Date().toISOString(),
    }).eq("CRMCustomerDocument_ID", rowId)
    throw error
  }
}

export async function listCustomerDocuments(authorization: string, customerId: string, input: { limit?: number; offset?: number } = {}) {
  if (!isUuid(customerId)) throw new InboxHttpError(400, "Choose a valid customer.", "customer_invalid")
  const limit = Math.max(1, Math.min(Math.trunc(Number(input.limit) || 20), 50))
  const offset = Math.max(0, Math.trunc(Number(input.offset) || 0))
  const clients = runtimeClients(authorization)
  const actor = await requireActor(clients.user, clients.admin)
  await requirePermission(clients.admin, actor, "Customers.Read")
  const customerRow = await customer(clients.admin, customerId)
  const { data, error, count } = await clients.admin.from("CRM_CustomerDocuments").select("*", { count: "exact" })
    .eq("CRMCustomerDocument_CustomerOrgID", customerId)
    .in("CRMCustomerDocument_StatusCode", ["ready", "pending_review"])
    .order("CRMCustomerDocument_CreatedAt", { ascending: false })
    .order("CRMCustomerDocument_ID", { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw new InboxHttpError(503, "Customer documents are unavailable.", cleanString(error.code, 40) || "database_unavailable")
  return {
    customer: { id: customerRow.Org_id, name: cleanString(customerRow.Org_Name, 240) },
    documents: (data ?? []).map(documentDto),
    total: count ?? 0,
    limit,
    offset,
  }
}

export async function createCustomerDocumentReadUrl(authorization: string, customerId: string, documentId: string) {
  if (!isUuid(customerId) || !isUuid(documentId)) throw new InboxHttpError(400, "Choose a valid customer document.", "document_invalid")
  const clients = runtimeClients(authorization)
  const actor = await requireActor(clients.user, clients.admin)
  await requirePermission(clients.admin, actor, "Customers.Read")
  await customer(clients.admin, customerId)
  const relation = await one<Row>(clients.admin.from("CRM_CustomerDocuments").select("*")
    .eq("CRMCustomerDocument_ID", documentId).eq("CRMCustomerDocument_CustomerOrgID", customerId)
    .in("CRMCustomerDocument_StatusCode", ["ready", "pending_review"]).limit(1).maybeSingle(), "Customer document data is unavailable.")
  if (!relation?.CRMCustomerDocument_StoredObjectID) throw new InboxHttpError(404, "This customer document is unavailable.", "document_not_found")
  const stored = await one<Row>(clients.admin.from("DOC_StoredObjects").select("*")
    .eq("DOCStoredObject_ID", relation.CRMCustomerDocument_StoredObjectID).eq("DOCStoredObject_StatusCode", "active")
    .limit(1).maybeSingle(), "Document storage data is unavailable.")
  if (!stored) throw new InboxHttpError(404, "The customer document file is no longer available.", "document_not_found")
  const { data, error } = await clients.admin.storage.from(stored.DOCStoredObject_Container).createSignedUrl(
    stored.DOCStoredObject_BlobName, 300,
  )
  if (error || !data?.signedUrl) throw new InboxHttpError(503, "A secure document link could not be created.", "signed_url_unavailable")
  return { url: data.signedUrl, expiresAt: new Date(Date.now() + 300_000).toISOString() }
}
