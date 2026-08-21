import { authenticateRequest, corsHeaders, jsonResponse } from "../_shared/document-functions.ts"
import { BookingWorkflowError, parseAction, parsePayload, parseReference, parseSequenceKey, parseUuid, toClientError } from "./core.ts"

const documentBucket = "multideck-documents"
const maximumBookingDocumentBytes = 20 * 1024 * 1024
const permittedDocumentTypes = new Set(["commercial_invoice", "packing_list"])
const permittedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
])

function safeFileName(value: string) {
  const fileName = value.trim().replace(/[\u0000-\u001f\u007f/\\]+/g, "-").replace(/\s+/g, " ").slice(0, 240)
  if (!fileName || fileName === "." || fileName === "..") throw new BookingWorkflowError(400, "Choose a valid document file.")
  return fileName
}

async function sha256Hex(value: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", value)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function uploadBookingDocument(request: Request) {
  const { admin, userId } = await authenticateRequest(request)
  const form = await request.formData()
  if (form.get("action") !== "upload-document") throw new BookingWorkflowError(400, "Choose a supported booking action.")
  const jobId = parseUuid(form.get("jobId"), "Booking")
  const suppliedIdempotencyKey = String(form.get("idempotencyKey") ?? "").trim()
  const idempotencyKey = suppliedIdempotencyKey
    ? parseUuid(suppliedIdempotencyKey, "Document upload request")
    : crypto.randomUUID()
  const documentType = String(form.get("documentType") ?? "").trim().toLowerCase()
  if (!permittedDocumentTypes.has(documentType)) throw new BookingWorkflowError(400, "Choose a commercial invoice or packing list.")
  const file = form.get("file")
  if (!(file instanceof File) || file.size <= 0) throw new BookingWorkflowError(400, "Choose a document to attach.")
  if (file.size > maximumBookingDocumentBytes) throw new BookingWorkflowError(413, "Booking documents can be up to 20 MB.")
  if (!permittedMimeTypes.has(file.type)) throw new BookingWorkflowError(400, "Attach a PDF, image, XLS or XLSX document.")
  const fileName = safeFileName(file.name)
  const { data: reservationData, error: reservationError } = await admin.rpc("booking_workflow_reserve_document_upload", {
    caller_auth_user_id: userId,
    requested_job_id: jobId,
    requested_document_type: documentType,
    requested_idempotency_key: idempotencyKey,
    requested_file_size_bytes: file.size,
  })
  if (reservationError || !reservationData) throw reservationError ?? new Error("Document upload capacity could not be reserved.")
  const reservation = reservationData as {
    reservationId: string
    blobName: string
    completed?: boolean
    documentId?: string | null
  }
  if (reservation.completed && reservation.documentId) {
    return { documentId: reservation.documentId, fileName, documentType, reused: true }
  }
  const bytes = await file.arrayBuffer()
  const blobName = reservation.blobName
  const { error: uploadError } = await admin.storage.from(documentBucket).upload(blobName, bytes, { contentType: file.type, upsert: true })
  if (uploadError) {
    await admin.rpc("booking_workflow_cancel_document_upload", {
      caller_auth_user_id: userId,
      requested_reservation_id: reservation.reservationId,
    })
    throw uploadError
  }
  const fileHash = await sha256Hex(bytes)
  const { data: document, error: documentError } = await admin.rpc("booking_workflow_complete_document_upload", {
    caller_auth_user_id: userId,
    requested_reservation_id: reservation.reservationId,
    requested_file_name: fileName,
    requested_mime_type: file.type,
    requested_sha256: fileHash,
  })
  if (documentError || !document) {
    await admin.storage.from(documentBucket).remove([blobName])
    await admin.rpc("booking_workflow_cancel_document_upload", {
      caller_auth_user_id: userId,
      requested_reservation_id: reservation.reservationId,
    })
    throw documentError ?? new Error("The booking document could not be linked.")
  }
  const completed = document as { documentId: string; fileName: string; documentType: string; oldBlobName?: string | null }
  if (completed.oldBlobName && completed.oldBlobName !== blobName) {
    const { error: cleanupError } = await admin.storage.from(documentBucket).remove([completed.oldBlobName])
    if (cleanupError) console.error("Superseded booking document cleanup failed", { reason: cleanupError.message })
  }
  return { documentId: completed.documentId, fileName: completed.fileName, documentType: completed.documentType }
}

async function canonicalBookingReference(
  admin: Awaited<ReturnType<typeof authenticateRequest>>["admin"],
  authUserId: string,
  requestedReference: string,
) {
  const { data: alias, error: aliasError } = await admin.rpc("resolve_workspace_reference_alias", {
    caller_auth_user_id: authUserId,
    requested_reference_kind: "booking",
    requested_alias: requestedReference,
  })
  if (aliasError) throw aliasError
  return String(alias?.canonicalReference || requestedReference)
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) })
  if (request.method !== "POST") return jsonResponse(request, { error: "Method not allowed" }, 405)

  try {
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      return jsonResponse(request, await uploadBookingDocument(request))
    }
    const { admin, userId } = await authenticateRequest(request)
    const body = await request.json() as Record<string, unknown>
    const action = parseAction(body.action)

    if (action === "open") {
      const { data, error } = await admin.rpc("booking_workflow_open", {
        caller_auth_user_id: userId,
        requested_idempotency_key: parseUuid(body.idempotencyKey, "Booking request"),
        requested_sequence_key: parseSequenceKey(body.sequenceKey),
      })
      if (error || !data) throw error ?? new Error("Booking opening returned no result")
      return jsonResponse(request, data)
    }
    if (action === "workspace") {
      const requestedReference = parseReference(body.reference)
      const { data, error } = await admin.rpc("booking_workflow_workspace", {
        caller_auth_user_id: userId,
        requested_reference: await canonicalBookingReference(admin, userId, requestedReference),
      })
      if (error || !data) throw error ?? new Error("Booking workspace returned no result")
      return jsonResponse(request, data)
    }
    if (action === "customs-readiness") {
      const { data, error } = await admin.rpc("booking_workflow_customs_readiness", {
        caller_auth_user_id: userId,
        requested_job_id: parseUuid(body.jobId, "Booking"),
      })
      if (error || !data) throw error ?? new Error("Customs readiness returned no result")
      return jsonResponse(request, data)
    }
    if (action === "send-to-customs") {
      const { data, error } = await admin.rpc("booking_workflow_send_to_customs", {
        caller_auth_user_id: userId,
        requested_job_id: parseUuid(body.jobId, "Booking"),
        requested_idempotency_key: parseUuid(body.idempotencyKey, "Customs handoff request"),
      })
      if (error || !data) throw error ?? new Error("Customs handoff returned no result")
      return jsonResponse(request, data)
    }

    const { data, error } = await admin.rpc("booking_workflow_save", {
      caller_auth_user_id: userId,
      requested_job_id: parseUuid(body.jobId, "Booking"),
      payload: parsePayload(body.booking),
    })
    if (error || !data) throw error ?? new Error("Booking save returned no result")
    return jsonResponse(request, data)
  } catch (error) {
    const safe = toClientError(error)
    console.error("Booking workflow failed", { status: safe.status, reason: safe.auditMessage })
    return jsonResponse(request, { error: safe.clientMessage }, safe.status)
  }
})
