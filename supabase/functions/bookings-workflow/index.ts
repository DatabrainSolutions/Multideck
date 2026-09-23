import { authenticateRequest, corsHeaders, jsonResponse, signedUrlLifetimeSeconds } from "../_shared/document-functions.ts"
import { acceptedBookingQuoteDocument, parseOperationalChargeSave, parseChargeReviewApply } from "./core.ts"
import { BookingWorkflowError, parseAction, parseOwnershipSave, parsePlanningChargeSave, parseProvisionalAction, parseOpeningDirection, parseOpeningMode, parseModeChangeConfirmation, parsePayload, parseQuoteSyncFields, parseQuoteReviewToken, parseReference, parseSequenceKey, parseUuid, toClientError } from "./core.ts"

const documentBucket = "multideck-documents"
const maximumBookingDocumentBytes = 20 * 1024 * 1024
const permittedDocumentTypes = new Set(["commercial_invoice", "packing_list"])
const originalInvoiceType = "commercial_invoice_original"
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
  const { data: cancellation, error: cancellationError } = await admin.rpc("booking_provisional_state", {
    caller_auth_user_id: userId,
    requested_job_id: jobId,
  })
  // Preserve compatibility with a backend that has not enabled cancellation.
  // The document-row guard also rejects completion if cancellation occurs mid-upload.
  if (cancellationError && cancellationError.code !== "PGRST202") throw cancellationError
  if (cancellation?.cancelled) throw new BookingWorkflowError(409, "Reopen the cancelled Booking before attaching documents.")
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

async function originalInvoiceAccess(admin: Awaited<ReturnType<typeof authenticateRequest>>["admin"], documentId: string, declarationId?: string, jobId?: string) {
  let query = admin.from("Customs_Documents").select("CUSTD_CustomsID,CUSTD_DocumentPayloadJSON")
    .eq("CUSTD_id", documentId).eq("CUSTD_DocumentRole", "supporting").eq("CUSTD_DocumentCode", originalInvoiceType)
  if (declarationId) query = query.eq("CUSTD_CustomsID", declarationId)
  if (jobId) query = query.eq("CUSTD_JobDocumentID", documentId)
  const { data: link, error } = await query.single()
  if (error || !link) throw new BookingWorkflowError(404, "The original invoice is unavailable.")
  const { data: declaration } = await admin.from("Customs_Declarations").select("CUST_JobID")
    .eq("CUST_id", link.CUSTD_CustomsID).eq("CUST_IsDeleted", false).single()
  if (!declaration || (jobId && declaration.CUST_JobID !== jobId)) throw new BookingWorkflowError(404, "The original invoice is unavailable.")
  const { data: stored } = await admin.from("DOC_StoredObjects")
    .select("DOCStoredObject_BlobName,DOCStoredObject_OriginalFileName,DOCStoredObject_MimeType")
    .eq("DOCStoredObject_ID", link.CUSTD_DocumentPayloadJSON?.storedObjectId)
    .eq("DOCStoredObject_AggregateID", link.CUSTD_CustomsID).eq("DOCStoredObject_AggregateType", "customs_declaration")
    .eq("DOCStoredObject_ConcernCode", "customs").eq("DOCStoredObject_Container", documentBucket)
    .eq("DOCStoredObject_StatusCode", "active").is("DOCStoredObject_DeletedAt", null).single()
  if (!stored?.DOCStoredObject_BlobName) throw new BookingWorkflowError(404, "The original invoice is unavailable.")
  const { data: signed, error: signingError } = await admin.storage.from(documentBucket).createSignedUrl(stored.DOCStoredObject_BlobName, signedUrlLifetimeSeconds)
  if (signingError || !signed?.signedUrl) throw new BookingWorkflowError(503, "The original invoice could not be opened. Please try again.")
  return { signedUrl: signed.signedUrl, fileName: stored.DOCStoredObject_OriginalFileName, mimeType: stored.DOCStoredObject_MimeType,
    expiresAt: new Date(Date.now() + signedUrlLifetimeSeconds * 1000).toISOString() }
}

async function withProvisionalState(admin: Awaited<ReturnType<typeof authenticateRequest>>["admin"], userId: string, workspace: any) {
  if (!workspace?.booking?.jobId) return workspace
  const { data, error } = await admin.rpc("booking_provisional_state", { caller_auth_user_id: userId, requested_job_id: workspace.booking.jobId })
  // Older backends do not advertise a capability they cannot honour.
  if (error?.code === "PGRST202") return workspace
  if (error) throw error
  const ownership = await admin.rpc("booking_ownership_workspace", { caller_auth_user_id: userId, requested_job_id: workspace.booking.jobId })
  if (ownership.error && ownership.error.code !== "PGRST202") throw ownership.error
  return { ...workspace, provisionalCancellation: data, ownership: ownership.error ? undefined : ownership.data }
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

    if (action === "opening-options") {
      const { data, error } = await admin.rpc("booking_workflow_open_options", { caller_auth_user_id: userId })
      if (error || !data) throw error ?? new Error("Booking modes returned no result")
      return jsonResponse(request, data)
    }

    if (action === "save-ownership") {
      const parameters = parseOwnershipSave(body)
      const { data, error } = await admin.rpc("booking_ownership_save", { ...parameters, caller_auth_user_id: userId })
      if (error?.code === "PGRST202") throw new BookingWorkflowError(409, "Booking ownership changes are awaiting a backend update. Nothing was saved.")
      if (error || !data) throw error ?? new Error("Booking ownership returned no result")
      return jsonResponse(request, data)
    }

    if (action === "quote-charge-review" || action === "apply-quote-charge-review") {
      const parameters = action === "apply-quote-charge-review" ? parseChargeReviewApply(body) : { requested_job_id: parseUuid(body.jobId, "Booking") }
      const { data, error } = await admin.rpc(action === "quote-charge-review" ? "booking_quote_charge_review" : "booking_quote_charge_review_apply", {
        ...parameters, caller_auth_user_id: userId,
      })
      if (error?.code === "40001") throw new BookingWorkflowError(409, "The Quote or Booking changed. Refresh the charge review before applying decisions.")
      if (error?.code === "55000" || error?.code === "22023") throw new BookingWorkflowError(409, error.message)
      if (error) throw error
      return jsonResponse(request, data)
    }

    if (action === "operational-charges" || action === "save-operational-charges") {
      const parameters = action === "save-operational-charges" ? parseOperationalChargeSave(body) : { requested_job_id: parseUuid(body.jobId, "Booking") }
      const { data, error } = await admin.rpc(action === "operational-charges" ? "booking_operational_charge_workspace" : "booking_operational_charges_save", {
        ...parameters, caller_auth_user_id: userId,
      })
      if (error?.code === "PGRST202") {
        if (action === "operational-charges") return jsonResponse(request, { supported: false })
        throw new BookingWorkflowError(409, "Operational charge saving is awaiting its backend release. Nothing was saved.")
      }
      if (error?.code === "40001") throw new BookingWorkflowError(409, "The Booking or charges changed. Reload and review before saving.")
      if (error?.code === "55000" || error?.code === "22023") throw new BookingWorkflowError(409, error.message)
      if (error || !data) throw error ?? new Error("Operational charges returned no result")
      return jsonResponse(request, data)
    }

    if (action === "planning-charges" || action === "save-planning-charges") {
      const parameters = action === "save-planning-charges"
        ? parsePlanningChargeSave(body)
        : { requested_job_id: parseUuid(body.jobId, "Booking") }
      const { data, error } = await admin.rpc(action === "planning-charges" ? "booking_planning_charge_workspace" : "booking_planning_charges_save", {
        ...parameters, caller_auth_user_id: userId,
      })
      if (error?.code === "PGRST202") {
        if (action === "planning-charges") return jsonResponse(request, { supported: false })
        throw new BookingWorkflowError(409, "Planning charge saving is not enabled on this backend. Your changes have not been saved.")
      }
      if (error?.code === "40001") throw new BookingWorkflowError(409, "Planning charges changed since you opened them. Reload and review the latest charges before saving.")
      if (error || !data) throw error ?? new Error("Planning charges returned no result")
      return jsonResponse(request, data)
    }

    if (action === "provisional-action") {
      const parameters = parseProvisionalAction(body)
      const { data, error } = await admin.rpc("booking_provisional_action", { ...parameters, caller_auth_user_id: userId })
      if (error || !data) throw error ?? new Error("Provisional action returned no result")
      return jsonResponse(request, data)
    }

    if (action === "open" || action === "open-road") {
      const mode = parseOpeningMode(body.mode)
      if (action === "open-road" && mode !== null && mode !== "road") throw new BookingWorkflowError(400, "Road jobs must use Road mode.")
      const { data, error } = await admin.rpc(mode !== null ? "booking_workflow_open_with_mode" : action === "open-road" ? "booking_workflow_open_road" : "booking_workflow_open", {
        caller_auth_user_id: userId,
        requested_idempotency_key: parseUuid(body.idempotencyKey, "Booking request"),
        requested_sequence_key: parseSequenceKey(body.sequenceKey),
        requested_direction: parseOpeningDirection(body.direction),
        ...(mode !== null ? { requested_mode: mode } : {}),
      })
      if (error || !data) throw error ?? new Error("Booking opening returned no result")
      return jsonResponse(request, data)
    }
    if (action === "declaration-attachments" || action === "declaration-attachment-access") {
      const declarationId = parseUuid(body.declarationId, "Declaration")
      const { data: authorised, error: accessError } = await admin.rpc("customs_declaration_authorised", {
        caller_auth_user_id: userId, requested_declaration_id: declarationId, require_write: false, require_draft: false,
      })
      if (accessError || authorised !== true) throw new BookingWorkflowError(404, "This declaration is unavailable.")
      const { data: declaration, error: declarationError } = await admin.from("Customs_Declarations")
        .select("CUST_JobID").eq("CUST_id", declarationId).eq("CUST_IsDeleted", false).single()
      if (declarationError || !declaration) throw new BookingWorkflowError(404, "This declaration is unavailable.")
      const { data: links, error: linksError } = await admin.from("Customs_Documents")
        .select("CUSTD_id,CUSTD_JobDocumentID,CUSTD_DocumentCode,CUSTD_DocumentPayloadJSON").eq("CUSTD_CustomsID", declarationId).eq("CUSTD_DocumentRole", "supporting")
        .in("CUSTD_DocumentCode", [...permittedDocumentTypes, originalInvoiceType])
      if (linksError) throw linksError
      const originals = (links ?? []).filter((link: any) => link.CUSTD_DocumentCode === originalInvoiceType)
      const originalDocuments = originals.map((link: any) => ({ id: link.CUSTD_id, fileName: link.CUSTD_DocumentPayloadJSON?.fileName,
        typeCode: originalInvoiceType, version: 1, available: Boolean(link.CUSTD_DocumentPayloadJSON?.storedObjectId) }))
      const ids = [...new Set((links ?? []).filter((link: any) => link.CUSTD_DocumentCode !== originalInvoiceType)
        .map((link: { CUSTD_JobDocumentID: string | null }) => link.CUSTD_JobDocumentID).filter(Boolean))]
      if (action === "declaration-attachments") {
        if (!ids.length || !declaration.CUST_JobID) return jsonResponse(request, { documents: originalDocuments })
        const { data: documents, error: documentsError } = await admin.from("Job_Documents")
          .select("JobDoc_ID,JobDoc_FileName,JobDoc_DocTypeCodeSnapshot,JobDoc_VersionNo,JobDoc_StoredObjectID")
          .in("JobDoc_ID", ids).eq("JobDoc_JobID", declaration.CUST_JobID).eq("JobDoc_IsDeleted", false)
          .in("JobDoc_DocTypeCodeSnapshot", [...permittedDocumentTypes])
        if (documentsError) throw documentsError
        return jsonResponse(request, { documents: [...originalDocuments, ...(documents ?? []).map((doc: {
          JobDoc_ID: string; JobDoc_FileName: string; JobDoc_DocTypeCodeSnapshot: string; JobDoc_VersionNo: number; JobDoc_StoredObjectID: string | null
        }) => ({ id: doc.JobDoc_ID, fileName: doc.JobDoc_FileName, typeCode: doc.JobDoc_DocTypeCodeSnapshot,
          version: doc.JobDoc_VersionNo, available: Boolean(doc.JobDoc_StoredObjectID) }))] })
      }
      const documentId = parseUuid(body.documentId, "Document")
      if (originals.some((link: any) => link.CUSTD_id === documentId))
        return jsonResponse(request, await originalInvoiceAccess(admin, documentId, declarationId))
      if (!ids.includes(documentId)) throw new BookingWorkflowError(404, "This attachment is not linked to this declaration.")
      // Use the exact linked version, even if a newer Booking attachment now exists.
      const { data: attachment, error: attachmentError } = await admin.from("Job_Documents")
        .select("JobDoc_StoredObjectID,JobDoc_DocTypeCodeSnapshot")
        .eq("JobDoc_ID", documentId).eq("JobDoc_JobID", declaration.CUST_JobID).eq("JobDoc_IsDeleted", false).single()
      if (attachmentError || !attachment?.JobDoc_StoredObjectID || !permittedDocumentTypes.has(attachment.JobDoc_DocTypeCodeSnapshot))
        throw new BookingWorkflowError(404, "The stored attachment is unavailable.")
      const { data: stored, error: storedError } = await admin.from("DOC_StoredObjects")
        .select("DOCStoredObject_BlobName,DOCStoredObject_OriginalFileName,DOCStoredObject_MimeType")
        .eq("DOCStoredObject_ID", attachment.JobDoc_StoredObjectID).eq("DOCStoredObject_AggregateID", declaration.CUST_JobID)
        .eq("DOCStoredObject_AggregateType", "job").eq("DOCStoredObject_ConcernCode", "booking")
        .eq("DOCStoredObject_Container", documentBucket).eq("DOCStoredObject_StatusCode", "active")
        .is("DOCStoredObject_DeletedAt", null).single()
      if (storedError || !stored?.DOCStoredObject_BlobName || !permittedMimeTypes.has(stored.DOCStoredObject_MimeType))
        throw new BookingWorkflowError(404, "The stored attachment is unavailable.")
      const { data: signed, error: signedError } = await admin.storage.from(documentBucket)
        .createSignedUrl(stored.DOCStoredObject_BlobName, signedUrlLifetimeSeconds)
      if (signedError || !signed?.signedUrl) throw new BookingWorkflowError(503, "The attachment could not be opened. Please try again.")
      return jsonResponse(request, { signedUrl: signed.signedUrl, fileName: stored.DOCStoredObject_OriginalFileName,
        mimeType: stored.DOCStoredObject_MimeType, expiresAt: new Date(Date.now() + signedUrlLifetimeSeconds * 1000).toISOString() })
    }
    if (action === "workspace" || action === "quote-document-access" || action === "attachment-access") {
      const requestedReference = parseReference(body.reference)
      const { data, error } = await admin.rpc("booking_workflow_workspace", {
        caller_auth_user_id: userId,
        requested_reference: await canonicalBookingReference(admin, userId, requestedReference),
      })
      if (error || !data) throw error ?? new Error("Booking workspace returned no result")
      if (action === "attachment-access") {
        const documentId = parseUuid(body.documentId, "Document")
        const document = (Array.isArray(data.documents) ? data.documents : []).find((item: { id?: string; category?: string; isCurrent?: boolean; typeCode?: string }) =>
          item.id === documentId && item.category === "customs" && (item.isCurrent !== false || item.typeCode === originalInvoiceType))
        if (!document || !data.booking?.jobId) throw new BookingWorkflowError(404, "This attachment is unavailable on this Booking.")
        const jobId = data.booking.jobId
        if (document.typeCode === originalInvoiceType) {
          const { data: original } = await admin.from("Job_Documents").select("JobDoc_ID")
            .eq("JobDoc_ID", documentId).eq("JobDoc_JobID", jobId).eq("JobDoc_DocTypeCodeSnapshot", originalInvoiceType).eq("JobDoc_IsDeleted", false).single()
          if (!original) throw new BookingWorkflowError(404, "The original invoice is unavailable.")
          return jsonResponse(request, await originalInvoiceAccess(admin, documentId, undefined, jobId))
        }
        const { data: attachment, error: attachmentError } = await admin.from("Job_Documents")
          .select("JobDoc_StoredObjectID,JobDoc_DocTypeCodeSnapshot")
          .eq("JobDoc_ID", documentId).eq("JobDoc_JobID", jobId)
          .eq("JobDoc_IsDeleted", false).eq("JobDoc_IsCurrentVersion", true).single()
        if (attachmentError || !attachment?.JobDoc_StoredObjectID || !permittedDocumentTypes.has(attachment.JobDoc_DocTypeCodeSnapshot)) {
          throw new BookingWorkflowError(404, "The stored attachment is unavailable.")
        }
        const { data: stored, error: storedError } = await admin.from("DOC_StoredObjects")
          .select("DOCStoredObject_Container,DOCStoredObject_BlobName,DOCStoredObject_OriginalFileName,DOCStoredObject_MimeType")
          .eq("DOCStoredObject_ID", attachment.JobDoc_StoredObjectID)
          .eq("DOCStoredObject_AggregateID", jobId).eq("DOCStoredObject_AggregateType", "job")
          .eq("DOCStoredObject_ConcernCode", "booking").eq("DOCStoredObject_Container", documentBucket)
          .eq("DOCStoredObject_StatusCode", "active").is("DOCStoredObject_DeletedAt", null).single()
        if (storedError || !stored?.DOCStoredObject_BlobName || !permittedMimeTypes.has(stored.DOCStoredObject_MimeType)) {
          throw new BookingWorkflowError(404, "The stored attachment is unavailable.")
        }
        const { data: signed, error: signedError } = await admin.storage.from(documentBucket)
          .createSignedUrl(stored.DOCStoredObject_BlobName, signedUrlLifetimeSeconds)
        if (signedError || !signed?.signedUrl) throw new BookingWorkflowError(503, "The attachment could not be opened. Please try again.")
        return jsonResponse(request, { signedUrl: signed.signedUrl, fileName: stored.DOCStoredObject_OriginalFileName,
          mimeType: stored.DOCStoredObject_MimeType, expiresAt: new Date(Date.now() + signedUrlLifetimeSeconds * 1000).toISOString() })
      }
      if (action === "quote-document-access") {
        const document = acceptedBookingQuoteDocument(data, parseUuid(body.documentId, "Document"))
        const { data: stored, error: storedError } = await admin.from("DOC_StoredObjects")
          .select("DOCStoredObject_Container,DOCStoredObject_BlobName,DOCStoredObject_OriginalFileName")
          .eq("DOCStoredObject_ID", document.id)
          .eq("DOCStoredObject_AggregateID", document.sourceRecordId)
          .eq("DOCStoredObject_AggregateType", "CusQuote_Header")
          .eq("DOCStoredObject_ConcernCode", "quote")
          .eq("DOCStoredObject_MimeType", "application/pdf")
          .is("DOCStoredObject_DeletedAt", null)
          .eq("DOCStoredObject_StatusCode", "active").single()
        if (storedError || !stored?.DOCStoredObject_Container || !stored.DOCStoredObject_BlobName) {
          throw new BookingWorkflowError(404, "The stored Quote PDF is unavailable.")
        }
        const { data: signed, error: signedError } = await admin.storage.from(stored.DOCStoredObject_Container)
          .createSignedUrl(stored.DOCStoredObject_BlobName, signedUrlLifetimeSeconds)
        if (signedError || !signed?.signedUrl) throw new BookingWorkflowError(503, "The PDF could not be opened. Please try again.")
        return jsonResponse(request, { signedUrl: signed.signedUrl, fileName: stored.DOCStoredObject_OriginalFileName,
          expiresAt: new Date(Date.now() + signedUrlLifetimeSeconds * 1000).toISOString() })
      }
      return jsonResponse(request, await withProvisionalState(admin, userId, data))
    }
    if (action === "customs-readiness") {
      const { data, error } = await admin.rpc("booking_workflow_customs_readiness", {
        caller_auth_user_id: userId,
        requested_job_id: parseUuid(body.jobId, "Booking"),
      })
      if (error || !data) throw error ?? new Error("Customs readiness returned no result")
      return jsonResponse(request, data)
    }
    if (action === "save-milestone") {
      const { data, error } = await admin.rpc("booking_workflow_save_route_milestone", {
        caller_auth_user_id: userId,
        requested_job_id: parseUuid(body.jobId, "Booking"),
        payload: parsePayload(body.milestone),
      })
      if (error?.code === "PT409" || error?.code === "40001") {
        throw new BookingWorkflowError(409, "The Booking, routing leg or milestone changed. Reload it and review your changes before saving.", error.message)
      }
      if (error || !data) throw error ?? new Error("Milestone save returned no result")
      return jsonResponse(request, data)
    }
    if (action === "save-dangerous-goods") {
      const { data, error } = await admin.rpc("booking_workflow_save_dangerous_goods", {
        caller_auth_user_id: userId,
        requested_job_id: parseUuid(body.jobId, "Booking"),
        payload: parsePayload(body.dangerousGoods),
      })
      if (error?.code === "PT409" || error?.code === "40001") {
        throw new BookingWorkflowError(409, "The Booking, cargo or dangerous-goods record changed. Reload it and review your changes before saving.", error.message)
      }
      if (error || !data) throw error ?? new Error("Dangerous-goods save returned no result")
      return jsonResponse(request, data)
    }
    if (action === "save-security-evidence") {
      const { data, error } = await admin.rpc("booking_workflow_save_security_evidence", {
        caller_auth_user_id: userId,
        requested_job_id: parseUuid(body.jobId, "Booking"),
        payload: parsePayload(body.securityEvidence),
      })
      if (error?.code === "PT409" || error?.code === "40001") {
        throw new BookingWorkflowError(409, "The Booking, cargo or screening evidence changed. Reload it and review your changes before saving.", error.message)
      }
      if (error || !data) throw error ?? new Error("Screening evidence save returned no result")
      return jsonResponse(request, data)
    }
    if (action === "quote-sync-review") {
      const { data, error } = await admin.rpc("booking_workflow_quote_sync_review_v2", {
        caller_auth_user_id: userId,
        requested_job_id: parseUuid(body.jobId, "Booking"),
      })
      if (error) throw error
      return jsonResponse(request, data)
    }
    if (action === "apply-quote-sync") {
      const fields = parseQuoteSyncFields(body.fields)
      const confirmModeChange = parseModeChangeConfirmation(body.confirmModeChange)
      if (fields.includes("mode") && !confirmModeChange) {
        throw new BookingWorkflowError(400, "Confirm the mode change before applying it to the booking.")
      }
      const { data, error } = await admin.rpc("booking_workflow_apply_quote_sync_v2", {
        caller_auth_user_id: userId,
        requested_job_id: parseUuid(body.jobId, "Booking"),
        requested_review_id: parseUuid(body.reviewId, "Quote update review"),
        requested_fields: fields,
        expected_review_token: parseQuoteReviewToken(body.reviewToken),
        confirm_mode_change: confirmModeChange,
      })
      if (error || !data) throw error ?? new Error("Quote update returned no result")
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
    return jsonResponse(request, await withProvisionalState(admin, userId, data))
  } catch (error) {
    const safe = toClientError(error)
    console.error("Booking workflow failed", { status: safe.status, reason: safe.auditMessage })
    return jsonResponse(request, { error: safe.clientMessage }, safe.status)
  }
})
