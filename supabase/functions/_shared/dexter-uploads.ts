import { cleanString, InboxHttpError, safeFileName } from "../inbox-api/core.ts"
import { requireActor, requirePermission, runtimeClients } from "../inbox-api/runtime.ts"

type JsonObject = Record<string, unknown>

const DOCUMENT_BUCKET = "multideck-documents"
const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_FILES_PER_TURN = 3
const MAX_BYTES_PER_TURN = 45 * 1024 * 1024

const supportedFiles: Record<string, { mimeType: string; kind: "image" | "file" }> = {
  ".pdf": { mimeType: "application/pdf", kind: "file" },
  ".txt": { mimeType: "text/plain", kind: "file" },
  ".csv": { mimeType: "text/csv", kind: "file" },
  ".tsv": { mimeType: "text/tab-separated-values", kind: "file" },
  ".doc": { mimeType: "application/msword", kind: "file" },
  ".docx": { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "file" },
  ".xls": { mimeType: "application/vnd.ms-excel", kind: "file" },
  ".xlsx": { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "file" },
  ".ods": { mimeType: "application/vnd.oasis.opendocument.spreadsheet", kind: "file" },
  ".odt": { mimeType: "application/vnd.oasis.opendocument.text", kind: "file" },
  ".pptx": { mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", kind: "file" },
  ".png": { mimeType: "image/png", kind: "image" },
  ".jpg": { mimeType: "image/jpeg", kind: "image" },
  ".jpeg": { mimeType: "image/jpeg", kind: "image" },
  ".webp": { mimeType: "image/webp", kind: "image" },
}

function extension(fileName: string) {
  const match = safeFileName(fileName).toLowerCase().match(/(\.[a-z0-9]{1,10})$/)
  return match?.[1] ?? ""
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte)
}

function littleEndian16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function littleEndian32(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

function validateInspectableArchive(bytes: Uint8Array) {
  let entryCount = 0
  let totalExpandedBytes = 0
  let totalCompressedBytes = 0
  let foundCentralDirectory = false
  const decoder = new TextDecoder()
  for (let offset = 0; offset + 46 <= bytes.length;) {
    if (littleEndian32(bytes, offset) !== 0x02014b50) {
      offset += 1
      continue
    }
    foundCentralDirectory = true
    const flags = littleEndian16(bytes, offset + 8)
    const compressedBytes = littleEndian32(bytes, offset + 20)
    const expandedBytes = littleEndian32(bytes, offset + 24)
    const nameLength = littleEndian16(bytes, offset + 28)
    const extraLength = littleEndian16(bytes, offset + 30)
    const commentLength = littleEndian16(bytes, offset + 32)
    const end = offset + 46 + nameLength + extraLength + commentLength
    if (end > bytes.length || flags & 0x1) {
      throw new InboxHttpError(422, "Encrypted or malformed documents cannot be inspected safely.", "upload_archive_unsafe")
    }
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength)).toLowerCase()
    if (/(^|\/)(vbaproject\.bin|macros?|scripts?|embeddings?|externallinks?|customui)(\/|$)/i.test(name)) {
      throw new InboxHttpError(422, "Documents containing macros, scripts or embedded active content are not supported.", "upload_active_content")
    }
    entryCount += 1
    totalExpandedBytes += expandedBytes
    totalCompressedBytes += compressedBytes
    if (entryCount > 1_000 || totalExpandedBytes > 100 * 1024 * 1024 ||
        (totalCompressedBytes > 0 && totalExpandedBytes / totalCompressedBytes > 50)) {
      throw new InboxHttpError(422, "That document expands beyond Dexter's safe inspection limit.", "upload_archive_expansion")
    }
    offset = end
  }
  if (!foundCentralDirectory) {
    throw new InboxHttpError(422, "That document archive cannot be inspected safely.", "upload_archive_unsafe")
  }
}

function validateSignature(bytes: Uint8Array, ext: string) {
  if (ext === ".pdf") return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])
  if (ext === ".png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (ext === ".jpg" || ext === ".jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff])
  if (ext === ".webp") {
    return startsWith(bytes, [0x52, 0x49, 0x46, 0x46])
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  }
  if ([".docx", ".xlsx", ".pptx", ".ods", ".odt"].includes(ext)) {
    const valid = startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
      || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])
      || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])
    if (valid) validateInspectableArchive(bytes)
    return valid
  }
  if (ext === ".doc" || ext === ".xls") return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  if (ext === ".txt" || ext === ".csv" || ext === ".tsv") return !bytes.slice(0, 8_192).includes(0)
  return false
}

function fileDefinition(fileName: string, bytes: Uint8Array) {
  const ext = extension(fileName)
  const definition = supportedFiles[ext]
  if (!definition || !validateSignature(bytes, ext)) {
    throw new InboxHttpError(
      422,
      "Dexter supports PDF, text, CSV, Excel, Word, OpenDocument, PowerPoint, PNG, JPEG and WebP files.",
      "upload_type_unsupported",
    )
  }
  return { ...definition, extension: ext }
}

async function sha256Hex(bytes: Uint8Array) {
  const stableBytes = Uint8Array.from(bytes)
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", stableBytes.buffer))
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function requireCleanMalwareScan(bytes: Uint8Array, fileName: string, mimeType: string, hash: string) {
  const scannerUrl = Deno.env.get("DEXTER_MALWARE_SCAN_URL")?.trim()
  const scannerToken = Deno.env.get("DEXTER_MALWARE_SCAN_TOKEN")?.trim()
  if (!scannerUrl || !scannerToken) {
    throw new InboxHttpError(503, "Document scanning is temporarily unavailable. Try again later.", "upload_scanner_unavailable")
  }
  const abort = new AbortController()
  const timeout = setTimeout(() => abort.abort(), 20_000)
  try {
    const response = await fetch(scannerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${scannerToken}`,
        "Content-Type": mimeType,
        "X-File-Name": encodeURIComponent(fileName),
        "X-Content-SHA256": hash,
      },
      body: Uint8Array.from(bytes).buffer,
      signal: abort.signal,
    })
    const result = await response.json().catch(() => null) as { clean?: boolean; status?: string } | null
    if (!response.ok || result?.clean !== true || result?.status !== "clean") {
      throw new InboxHttpError(422, "That document did not pass the security scan.", "upload_malware_rejected")
    }
  } catch (error) {
    if (error instanceof InboxHttpError) throw error
    throw new InboxHttpError(503, "Document scanning is temporarily unavailable. Try again later.", "upload_scanner_unavailable")
  } finally {
    clearTimeout(timeout)
  }
}

function dataUrl(bytes: Uint8Array, mimeType: string) {
  let binary = ""
  const chunkSize = 32_768
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}

export type DexterUploadedDocument = {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
}

async function uploadSecurityEvent(
  admin: ReturnType<typeof runtimeClients>["admin"],
  actor: { companyId: string; userId: string },
  kind: string,
  severity: "info" | "warning" | "high",
  metadata: JsonObject,
) {
  try {
    await admin.from("AI_DexterSecurityEvents").insert({
      AIDexterSecurityEvent_CompanyID: actor.companyId,
      AIDexterSecurityEvent_UserID: actor.userId,
      AIDexterSecurityEvent_Kind: cleanString(kind, 80),
      AIDexterSecurityEvent_Severity: severity,
      AIDexterSecurityEvent_MetadataJSON: metadata,
    })
  } catch {
    // Security telemetry must not turn an already-denied upload into a success.
  }
}

export async function uploadDexterDocument(authorization: string, file: File): Promise<DexterUploadedDocument> {
  if (!(file instanceof File) || file.size <= 0) {
    throw new InboxHttpError(400, "Choose a document to upload.", "upload_missing")
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new InboxHttpError(413, "Choose a file smaller than 25 MB.", "upload_too_large")
  }

  const clients = runtimeClients(authorization)
  const actor = await requireActor(clients.user, clients.admin)
  await requirePermission(clients.admin, actor, "AgentDexter.Manage")

  const { data: reservationId, error: reservationError } = await clients.admin.rpc("multideck_dexter_reserve_upload", {
    p_company_id: actor.companyId,
    p_user_id: actor.userId,
    p_byte_count: file.size,
  })
  if (reservationError || typeof reservationId !== "string") {
    const detail = cleanString(reservationError?.message, 240)
    const code = detail.includes("upload_rate_limited")
      ? "upload_rate_limited"
      : detail.includes("upload_daily_limit")
        ? "upload_daily_limit"
        : detail.includes("upload_workspace_limit")
          ? "upload_workspace_limit"
          : "upload_allowance_unavailable"
    await uploadSecurityEvent(clients.admin, actor, `${code}_denied`, code === "upload_workspace_limit" ? "high" : "warning", {
      attemptedBytes: file.size,
    })
    if (code === "upload_rate_limited") {
      throw new InboxHttpError(429, "Too many recent uploads. Wait a few minutes and try again.", code)
    }
    if (code === "upload_daily_limit") {
      throw new InboxHttpError(429, "Your daily Dexter upload allowance has been reached.", code)
    }
    if (code === "upload_workspace_limit") {
      throw new InboxHttpError(429, "This workspace has reached its Dexter storage allowance.", code)
    }
    throw new InboxHttpError(503, "Dexter could not verify the upload allowance. Try again.", code)
  }

  let uploadCompleted = false
  try {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const fileName = safeFileName(file.name)
  const definition = fileDefinition(fileName, bytes)
  const uploadId = crypto.randomUUID()
  const storedObjectId = crypto.randomUUID()
  const createdAt = new Date()
  const hash = await sha256Hex(bytes)
  try {
    await requireCleanMalwareScan(bytes, fileName, definition.mimeType, hash)
  } catch (error) {
    const code = error instanceof InboxHttpError ? error.code : "upload_scanner_unavailable"
    await uploadSecurityEvent(clients.admin, actor, code, code === "upload_malware_rejected" ? "high" : "warning", {
      fileSizeBytes: file.size,
      sha256Prefix: hash.slice(0, 12),
    })
    throw error
  }
  const objectPath = [
    "v1", "dexter", actor.companyId.replaceAll("-", ""), actor.userId.replaceAll("-", ""),
    String(createdAt.getUTCFullYear()), String(createdAt.getUTCMonth() + 1).padStart(2, "0"),
    `${uploadId.replaceAll("-", "")}${definition.extension}`,
  ].join("/")

  const { error: storageError } = await clients.admin.storage.from(DOCUMENT_BUCKET).upload(objectPath, bytes, {
    contentType: definition.mimeType,
    cacheControl: "0",
    upsert: false,
    metadata: {
      concern: "dexter",
      aggregatetype: "dexter_upload",
      aggregateid: uploadId.replaceAll("-", ""),
      companyid: actor.companyId.replaceAll("-", ""),
      userid: actor.userId.replaceAll("-", ""),
      sha256: hash,
    },
  })
  if (storageError) throw new InboxHttpError(503, "Dexter could not store that file. Try again.", "upload_storage_failed")

  try {
    const { error: catalogueError } = await clients.admin.from("DOC_StoredObjects").insert({
      DOCStoredObject_ID: storedObjectId,
      DOCStoredObject_ConcernCode: "dexter",
      DOCStoredObject_OrganisationID: null,
      DOCStoredObject_AggregateType: "dexter_upload",
      DOCStoredObject_AggregateID: uploadId,
      DOCStoredObject_ProviderCode: "supabase_storage",
      DOCStoredObject_Container: DOCUMENT_BUCKET,
      DOCStoredObject_BlobName: objectPath,
      DOCStoredObject_OriginalFileName: fileName,
      DOCStoredObject_MimeType: definition.mimeType,
      DOCStoredObject_FileSizeBytes: bytes.byteLength,
      DOCStoredObject_SHA256: hash,
      DOCStoredObject_StatusCode: "active",
      DOCStoredObject_CreatedAt: createdAt.toISOString(),
      DOCStoredObject_CreatedBy: actor.userId,
    })
    if (catalogueError) throw catalogueError

    const { error: uploadError } = await clients.admin.from("AI_DexterUploads").insert({
      AIDexterUpload_ID: uploadId,
      AIDexterUpload_CompanyID: actor.companyId,
      AIDexterUpload_UserID: actor.userId,
      AIDexterUpload_StoredObjectID: storedObjectId,
      AIDexterUpload_FileName: fileName,
      AIDexterUpload_MimeType: definition.mimeType,
      AIDexterUpload_FileSizeBytes: bytes.byteLength,
      AIDexterUpload_SHA256: hash,
      AIDexterUpload_StatusCode: "active",
      AIDexterUpload_ScanStatusCode: "clean",
      AIDexterUpload_CreatedAt: createdAt.toISOString(),
      AIDexterUpload_LastUsedAt: createdAt.toISOString(),
      AIDexterUpload_ExpiresAt: new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    if (uploadError) throw uploadError
  } catch (error) {
    await clients.admin.from("DOC_StoredObjects").delete().eq("DOCStoredObject_ID", storedObjectId)
    await clients.admin.storage.from(DOCUMENT_BUCKET).remove([objectPath])
    console.error("Dexter upload catalogue failed", cleanString(error instanceof Error ? error.message : String(error), 240))
    throw new InboxHttpError(503, "Dexter could not finish that upload. Try again.", "upload_catalogue_failed")
  }

  uploadCompleted = true
  return { id: uploadId, fileName, mimeType: definition.mimeType, sizeBytes: bytes.byteLength }
  } finally {
    const { error: settlementError } = await clients.admin.rpc("multideck_dexter_settle_upload_reservation", {
      p_reservation_id: reservationId,
      p_company_id: actor.companyId,
      p_user_id: actor.userId,
      p_succeeded: uploadCompleted,
    })
    if (settlementError) console.error("Dexter upload reservation settlement failed", settlementError.code ?? "unknown")
  }
}

export async function resolveDexterUploadedDocuments(authorization: string, uploadIds: string[]) {
  const ids = [...new Set(uploadIds)].slice(0, MAX_FILES_PER_TURN)
  if (ids.length === 0) return { files: [] as DexterUploadedDocument[], modelInputs: [] as JsonObject[] }

  const clients = runtimeClients(authorization)
  const actor = await requireActor(clients.user, clients.admin)
  await requirePermission(clients.admin, actor, "AgentDexter.Manage")
  const { data, error } = await clients.admin.from("AI_DexterUploads")
    .select("*,DOC_StoredObjects(*)")
    .in("AIDexterUpload_ID", ids)
    .eq("AIDexterUpload_CompanyID", actor.companyId)
    .eq("AIDexterUpload_UserID", actor.userId)
    .eq("AIDexterUpload_StatusCode", "active")
    .eq("AIDexterUpload_ScanStatusCode", "clean")
    .gt("AIDexterUpload_ExpiresAt", new Date().toISOString())
  if (error) throw new InboxHttpError(503, "Dexter could not open the uploaded files.", "upload_lookup_failed")

  const byId = new Map((data ?? []).map((row: Record<string, any>) => [row.AIDexterUpload_ID, row]))
  const files: DexterUploadedDocument[] = []
  const modelInputs: JsonObject[] = []
  let totalBytes = 0
  for (const id of ids) {
    const row = byId.get(id)
    const stored = row?.DOC_StoredObjects
    if (!row || !stored || stored.DOCStoredObject_StatusCode !== "active") {
      throw new InboxHttpError(404, "An uploaded file is no longer available. Remove it and try again.", "upload_unavailable")
    }
    const declaredBytes = Math.max(0, Number(row.AIDexterUpload_FileSizeBytes) || 0)
    if (declaredBytes > MAX_FILE_BYTES || totalBytes + declaredBytes > MAX_BYTES_PER_TURN) {
      throw new InboxHttpError(413, "The selected files exceed Dexter's 45 MB limit for one request.", "upload_total_too_large")
    }
    const { data: blob, error: downloadError } = await clients.admin.storage
      .from(stored.DOCStoredObject_Container)
      .download(stored.DOCStoredObject_BlobName)
    if (downloadError || !blob) throw new InboxHttpError(503, "Dexter could not open an uploaded file. Try again.", "upload_download_failed")
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const fileName = safeFileName(row.AIDexterUpload_FileName)
    const definition = fileDefinition(fileName, bytes)
    totalBytes += bytes.byteLength
    if (totalBytes > MAX_BYTES_PER_TURN) {
      throw new InboxHttpError(413, "The selected files exceed Dexter's 45 MB limit for one request.", "upload_total_too_large")
    }
    const file = { id, fileName, mimeType: definition.mimeType, sizeBytes: bytes.byteLength }
    files.push(file)
    modelInputs.push(definition.kind === "image"
      ? { type: "input_image", image_url: dataUrl(bytes, definition.mimeType), detail: "high" }
      : { type: "input_file", filename: fileName, file_data: dataUrl(bytes, definition.mimeType) })
  }
  await clients.admin.from("AI_DexterUploads").update({
    AIDexterUpload_LastUsedAt: new Date().toISOString(),
    AIDexterUpload_ExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }).in("AIDexterUpload_ID", ids)
    .eq("AIDexterUpload_CompanyID", actor.companyId)
    .eq("AIDexterUpload_UserID", actor.userId)
  return { files, modelInputs }
}
