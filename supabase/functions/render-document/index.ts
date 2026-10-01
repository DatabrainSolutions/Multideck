
import {
  authenticateRequest,
  corsHeaders,
  FunctionError,
  generatedDocumentsBucket,
  jsonResponse,
  maximumGeneratedFileBytes,
  parseJobNumber,
  safeFailureMessage,
  signedUrlLifetimeSeconds,
  toFunctionError,
} from "../_shared/document-functions.ts"
import { bookingDocumentFamily, documentIssueConversion, resolveDocumentIssue } from "../_shared/document-issue.ts"
import { transportDocumentDataset } from "../_shared/transport-document.ts"
import { reviewedTransportSource, transportDraftSourceHashes } from "../_shared/transport-layouts.ts"

type OutputFormat = "pdf" | "docx"
type ContentSection = "job" | "customer" | "shipper" | "consignee" | "cargo" | "routing"

const allowedContentSections: ContentSection[] = ["job", "customer", "shipper", "consignee", "cargo", "routing"]
const maximumStudioTemplateBytes = 15 * 1024 * 1024

type RenderRequest = {
  action?: string
  jobId?: string
  documentIssueStatus?: unknown
  templateCode?: string
  targetType?: string
  jobNumber?: string
  outputFormat?: string
  contentSections?: unknown
  reason?: string
  studioTemplateBase64?: string
  bookingReviewToken?: string
  confirmCustomerPrices?: boolean
  transportReviewToken?: string
  confirmTransportReview?: boolean
}

type PreparedRender = {
  renderJobId: string
  templateCode: string
  templateVersionId: string
  carboneTemplateReference: string
  outputFormat: OutputFormat
  languageCode: string
  jobId: string
  jobReference: string
  companyId: string
  dataset: Record<string, unknown>
}

function getCarboneAuthorization() {
  const explicitHeader = Deno.env.get("CARBONE_AUTH_HEADER")?.trim()
  if (explicitHeader) return explicitHeader

  const username = Deno.env.get("CARBONE_USERNAME")
  const password = Deno.env.get("CARBONE_PASSWORD")
  if (username && password) return `Basic ${btoa(`${username}:${password}`)}`

  const token = Deno.env.get("CARBONE_API_TOKEN")?.trim()
  if (token) return `Bearer ${token}`
  throw new FunctionError(500, "The document renderer is not configured.", "Carbone authentication is unavailable")
}

function getCarboneBaseUrl() {
  const configured = Deno.env.get("CARBONE_URL")?.trim().replace(/\/$/, "")
  if (!configured) throw new FunctionError(500, "The document renderer is not configured.", "CARBONE_URL is unavailable")

  const url = new URL(configured)
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new FunctionError(500, "The document renderer is not configured safely.", "CARBONE_URL must use HTTPS")
  }
  return url.toString().replace(/\/$/, "")
}

function safeReportName(templateCode: string, jobReference: string) {
  return `${templateCode}-${jobReference}`
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180)
}

function expectedMimeType(format: OutputFormat) {
  return format === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
}

function validateRenderedFile(bytes: Uint8Array, format: OutputFormat) {
  if (!bytes.byteLength || bytes.byteLength > maximumGeneratedFileBytes) {
    throw new FunctionError(502, "The renderer returned an invalid file.", "Rendered file was empty or exceeded 50 MiB")
  }
  if (format === "pdf" && new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new FunctionError(502, "The renderer returned an invalid PDF.", "Rendered PDF signature was invalid")
  }
  if (format === "docx" && (bytes[0] !== 0x50 || bytes[1] !== 0x4b)) {
    throw new FunctionError(502, "The renderer returned an invalid Word document.", "Rendered DOCX ZIP signature was invalid")
  }
}

function decodeStudioTemplate(value: unknown) {
  if (value === undefined) return null
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length > Math.ceil(maximumStudioTemplateBytes / 3) * 4 + 4) {
    throw new FunctionError(400, "The Studio template is invalid.", "Studio template base64 validation failed")
  }

  let binary: string
  try {
    binary = atob(value)
  } catch {
    throw new FunctionError(400, "The Studio template is invalid.", "Studio template base64 decoding failed")
  }

  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  const archiveText = new TextDecoder("latin1").decode(bytes)
  if (!bytes.byteLength
      || bytes.byteLength > maximumStudioTemplateBytes
      || bytes[0] !== 0x50
      || bytes[1] !== 0x4b
      || !archiveText.includes("word/document.xml")) {
    throw new FunctionError(400, "Choose a valid Word template.", "Studio accepts DOCX templates up to 15 MiB")
  }
  return bytes
}

async function sha256(bytes: Uint8Array) {
  const hashInput = Uint8Array.from(bytes)
  const digest = await crypto.subtle.digest("SHA-256", hashInput.buffer)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")
}

function renderTimeout() {
  const configured = Number(Deno.env.get("CARBONE_TIMEOUT_MS") ?? 90000)
  return Number.isFinite(configured) ? Math.min(Math.max(configured, 5000), 120000) : 90000
}

function parseContentSections(value: unknown): ContentSection[] {
  if (value === undefined) return [...allowedContentSections]
  if (!Array.isArray(value) || value.length === 0 || value.length > allowedContentSections.length) {
    throw new FunctionError(400, "Choose the information to include.", "Content section selection was not a valid array")
  }

  const unique = [...new Set(value)]
  if (unique.length !== value.length || unique.some((section) => typeof section !== "string" || !allowedContentSections.includes(section as ContentSection))) {
    throw new FunctionError(400, "Choose valid document information.", "Content section selection contained duplicates or unsupported values")
  }
  if (!unique.includes("job")) {
    throw new FunctionError(400, "Job details must be included.", "Required job content section was omitted")
  }
  return unique as ContentSection[]
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) })
  if (request.method !== "POST") return jsonResponse(request, { error: "Method not allowed" }, 405)

  let context: Awaited<ReturnType<typeof authenticateRequest>> | null = null
  let prepared: PreparedRender | null = null
  let uploadedPath: string | null = null
  let catalogued = false

  try {
    context = await authenticateRequest(request)
    const payload = await request.json() as RenderRequest
    if (payload.action === "booking-issue-options" || payload.action === "transport-draft-review") {
      if (typeof payload.jobId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(payload.jobId)) {
        throw new FunctionError(400, "Choose a valid Booking.", "Invalid Booking issue options target")
      }
      if (payload.action === "transport-draft-review") {
        const code = payload.templateCode?.trim().toUpperCase() ?? ""
        const family = bookingDocumentFamily(code)
        if ((family !== "sea" && family !== "air") || !Object.hasOwn(transportDraftSourceHashes, code)) {
          throw new FunctionError(400, "Choose a supported transport Draft layout.", "Unsupported transport review layout")
        }
        const source = await context.admin.schema("document_api").rpc("transport_document_source", {
          caller_auth_user_id: context.userId, requested_job_id: payload.jobId,
        })
        if (source.error || !source.data) throw source.error ?? new Error("Transport review is unavailable")
        let dataset: ReturnType<typeof transportDocumentDataset>
        try { dataset = transportDocumentDataset(source.data, family) }
        catch (cause) { throw new FunctionError(400, cause instanceof Error ? cause.message : "Review the main carriage and cargo first.", "Invalid transport source") }
        return jsonResponse(request, { protocolVersion: 2, reviewToken: source.data.reviewToken,
          bookingReference: dataset.transport.reference, family, parties: dataset.transport.parties,
          route: dataset.routing[0], cargo: dataset.transport.cargo, equipment: dataset.transport.equipment,
          allocations: dataset.transport.allocations, totals: dataset.transport.totals, gaps: dataset.transport.gaps })
      }
      const options = await context.admin.schema("document_api").rpc("booking_document_issue_options", {
        caller_auth_user_id: context.userId, requested_job_id: payload.jobId,
      })
      if (options.error || !options.data) throw options.error ?? new Error("Document issue options are unavailable")
      const layouts = await context.admin.from("DOCB_DocumentTemplates")
        .select("DOCBT_Code,DOCBT_CurrentVersionNo,DOCB_TemplateVersions(DOCBTV_VersionNo,DOCBTV_StatusCode,DOCBTV_TemplateSnapshotJSON)")
        .eq("DOCBT_IsActive", true).eq("DOCBT_StatusCode", "published").in("DOCBT_Code", Object.keys(transportDraftSourceHashes))
      if (layouts.error) throw layouts.error
      const readyCodes = (layouts.data ?? []).filter(layout => layout.DOCB_TemplateVersions.some(version =>
        version.DOCBTV_StatusCode === "published" && version.DOCBTV_VersionNo === layout.DOCBT_CurrentVersionNo
        && reviewedTransportSource(layout.DOCBT_Code, version.DOCBTV_TemplateSnapshotJSON?.source?.sha256)))
        .map(layout => layout.DOCBT_Code)
      return jsonResponse(request, { ...options.data, protocolVersion: 2, transportGenerationReady: readyCodes.length > 0,
        transportDraftTemplateCodes: readyCodes, originalIssuanceEnabled: false })
    }
    const templateCode = payload.templateCode?.trim().toUpperCase() ?? ""
    const bookingConfirmation = /^JOB_CONFIRMATION(?:_[A-Z0-9]+)*$/.test(templateCode)
    const family = bookingDocumentFamily(templateCode)
    const transportDraft = family === "sea" || family === "air"
    const outputFormat = payload.outputFormat?.trim().toLowerCase() ?? ""
    const contentSections = parseContentSections(payload.contentSections)
    const jobNumber = parseJobNumber(payload.jobNumber)

    if (!/^[A-Z0-9][A-Z0-9_-]{1,99}$/.test(templateCode)) {
      throw new FunctionError(400, "Choose a valid document template.", "Template code validation failed")
    }
    if (payload.targetType !== "Job_Header") {
      throw new FunctionError(400, "Choose a valid job.", "Only Job_Header targets are accepted")
    }
    if (outputFormat !== "pdf" && outputFormat !== "docx") {
      throw new FunctionError(400, "Choose PDF or DOCX.", "Output format validation failed")
    }
    let issueStatus: ReturnType<typeof resolveDocumentIssue>
    let conversion: ReturnType<typeof documentIssueConversion>
    try {
      issueStatus = resolveDocumentIssue(templateCode, payload.documentIssueStatus)
      conversion = documentIssueConversion(outputFormat, issueStatus)
    } catch (cause) {
      throw new FunctionError(400, cause instanceof Error ? cause.message : "Choose a valid document status.", "Invalid document issue selection")
    }
    if (transportDraft && (!Object.hasOwn(transportDraftSourceHashes, templateCode)
      || typeof payload.transportReviewToken !== "string" || !/^[a-f0-9]{32}$/.test(payload.transportReviewToken)
      || payload.confirmTransportReview !== true)) {
      throw new FunctionError(409, "Review the supported transport Draft in Booking Documents first. No document has been created.", "Transport review is required")
    }
    if ((bookingConfirmation || transportDraft) && payload.studioTemplateBase64) {
      throw new FunctionError(400, "Publish the reviewed Booking template before using it on a Booking.", "Booking generation cannot use an unapproved source override")
    }

    const { data, error } = await context.admin
      .schema("document_api")
      .rpc("prepare_job_render", {
        caller_auth_user_id: context.userId,
        requested_template_code: templateCode,
        requested_job_number: jobNumber,
        requested_output_format: outputFormat,
        requested_reason: payload.reason?.trim().slice(0, 500) || null,
      })
    if (error || !data) throw error ?? new Error("Render preparation returned no data")
    prepared = data as PreparedRender

    if (transportDraft) {
      const version = await context.admin.from("DOCB_TemplateVersions").select("DOCBTV_TemplateSnapshotJSON")
        .eq("DOCBTV_ID", prepared.templateVersionId).single()
      const hash = version.data?.DOCBTV_TemplateSnapshotJSON?.source?.sha256
      if (version.error || !reviewedTransportSource(templateCode, hash)) {
        throw new FunctionError(409, "Publish the reviewed Draft transport layout before generating this PDF.", "Transport layout source is not approved")
      }
      const source = await context.admin.schema("document_api").rpc("transport_document_source", {
        caller_auth_user_id: context.userId, requested_job_id: prepared.jobId,
      })
      if (source.error || !source.data) throw source.error ?? new Error("Transport source is unavailable")
      if (source.data.reviewToken !== payload.transportReviewToken) {
        throw new FunctionError(409, "The Booking changed. Review the transport Draft again.", "Transport source changed before mapping")
      }
      let mapped: ReturnType<typeof transportDocumentDataset>
      try { mapped = transportDocumentDataset(source.data, family as "sea" | "air") }
      catch (cause) { throw new FunctionError(400, cause instanceof Error ? cause.message : "Review the transport data first.", "Invalid transport source") }
      const frozen = await context.admin.schema("document_api").rpc("freeze_transport_document_draft", {
        caller_auth_user_id: context.userId, requested_render_job_id: prepared.renderJobId,
        expected_review_token: payload.transportReviewToken, expected_source_hash: hash, mapped_dataset: mapped,
      })
      if (frozen.error?.code === "40001") throw new FunctionError(409, "The Booking changed. Review the transport Draft again.", "Transport review became stale")
      if (frozen.error || !frozen.data) throw frozen.error ?? new Error("Transport Draft could not be frozen")
      prepared = { ...prepared, dataset: frozen.data as Record<string, unknown> }
    } else {
      const { data: selectedDataset, error: selectionError } = await context.admin
      .schema("document_api")
      .rpc("apply_job_render_content_selection", {
        caller_auth_user_id: context.userId,
        requested_render_job_id: prepared.renderJobId,
        requested_content_sections: contentSections,
      })
      if (selectionError || !selectedDataset) {
        throw selectionError ?? new Error("Document content selection returned no data")
      }
      prepared = { ...prepared, dataset: selectedDataset as Record<string, unknown> }
    }
    if (bookingConfirmation) {
      if (outputFormat !== "pdf" || typeof payload.bookingReviewToken !== "string"
        || !/^[a-f0-9]{32}$/.test(payload.bookingReviewToken)
        || typeof payload.confirmCustomerPrices !== "boolean") {
        throw new FunctionError(400, "Review the Booking information and customer prices in Booking Documents first.", "Booking confirmation review was missing")
      }
      const { data: confirmation, error: confirmationError } = await context.admin
        .schema("document_api")
        .rpc("prepare_booking_confirmation", {
          caller_auth_user_id: context.userId,
          requested_render_job_id: prepared.renderJobId,
          expected_review_token: payload.bookingReviewToken,
          confirm_customer_prices: payload.confirmCustomerPrices,
        })
      if (confirmationError?.code === "40001") {
        throw new FunctionError(409, "The Booking changed. Review the latest details and prices before generating the PDF.", "Booking confirmation review became stale")
      }
      if (confirmationError || !confirmation) throw confirmationError ?? new Error("Booking confirmation preparation returned no data")
      prepared = { ...prepared, dataset: confirmation as Record<string, unknown> }
    }
    if (issueStatus && !transportDraft) {
      const issue = await context.admin.schema("document_api").rpc("apply_booking_document_issue", {
        caller_auth_user_id: context.userId, requested_render_job_id: prepared.renderJobId,
        requested_issue_status: issueStatus,
      })
      if (issue.error?.code === "40001") throw new FunctionError(409, "The Booking changed. Review it again before saving.", "Document issue review became stale")
      if (issue.error || !issue.data) throw issue.error ?? new Error("Document issue status could not be frozen")
      prepared = { ...prepared, dataset: issue.data as Record<string, unknown> }
    }
    const studioTemplateBytes = decodeStudioTemplate(payload.studioTemplateBase64)

    if (studioTemplateBytes) {
      const templateDigest = await sha256(studioTemplateBytes)
      const { error: studioAuditError } = await context.admin
        .schema("document_api")
        .rpc("record_studio_template", {
          caller_auth_user_id: context.userId,
          requested_render_job_id: prepared.renderJobId,
          template_sha256: templateDigest,
          template_size_bytes: studioTemplateBytes.byteLength,
        })
      if (studioAuditError) throw studioAuditError
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), renderTimeout())
    let carboneResponse: Response
    try {
      carboneResponse = await fetch(
        `${getCarboneBaseUrl()}/render/${studioTemplateBytes ? "template" : encodeURIComponent(prepared.carboneTemplateReference)}?download=true`,
        {
          method: "POST",
          headers: {
            "Authorization": getCarboneAuthorization(),
            "Content-Type": "application/json",
            "carbone-version": Deno.env.get("CARBONE_API_VERSION")?.trim() || "5",
          },
          body: JSON.stringify({
            data: prepared.dataset,
            ...(studioTemplateBytes ? { template: payload.studioTemplateBase64 } : {}),
            convertTo: conversion,
            ...(issueStatus ? { hardRefresh: true } : {}),
            lang: prepared.languageCode,
            ...(bookingConfirmation ? { timezone: "UTC" } : {}),
            reportName: `${safeReportName(prepared.templateCode, prepared.jobReference)}${issueStatus ? `-${issueStatus.toUpperCase()}` : ""}`,
          }),
          signal: controller.signal,
        },
      )
    } catch (error) {
      const message = error instanceof DOMException && error.name === "AbortError"
        ? "Carbone render timed out"
        : "Carbone render request failed"
      throw new FunctionError(502, "The document renderer did not respond.", message)
    } finally {
      clearTimeout(timeoutId)
    }

    if (!carboneResponse.ok) {
      throw new FunctionError(502, "The document renderer could not create this file.", `Carbone render returned HTTP ${carboneResponse.status}`)
    }

    const contentLength = Number(carboneResponse.headers.get("Content-Length") ?? 0)
    if (contentLength > maximumGeneratedFileBytes) {
      throw new FunctionError(502, "The generated file is too large.", "Carbone Content-Length exceeded 50 MiB")
    }

    const bytes = new Uint8Array(await carboneResponse.arrayBuffer())
    validateRenderedFile(bytes, prepared.outputFormat)

    const generatedDocumentId = crypto.randomUUID()
    const createdAt = new Date()
    const extension = prepared.outputFormat
    const fileName = bookingConfirmation
      ? `${safeReportName(prepared.templateCode, prepared.jobReference)}-${issueStatus?.toUpperCase()}-${createdAt.toISOString().replace(/[-:.TZ]/g, "")}-${generatedDocumentId.slice(0, 8)}.${extension}`
      : `${safeReportName(prepared.templateCode, prepared.jobReference)}.${extension}`
    const environment = (Deno.env.get("MULTIDECK_ENVIRONMENT")?.trim() || "production").replace(/[^a-z0-9_-]/gi, "-")
    uploadedPath = [
      "v1",
      environment,
      prepared.companyId,
      "generated",
      "job",
      prepared.jobId,
      String(createdAt.getUTCFullYear()),
      String(createdAt.getUTCMonth() + 1).padStart(2, "0"),
      `${generatedDocumentId}.${extension}`,
    ].join("/")

    const mimeType = expectedMimeType(prepared.outputFormat)
    const digest = await sha256(bytes)
    const { error: uploadError } = await context.admin.storage
      .from(generatedDocumentsBucket)
      .upload(uploadedPath, bytes, { contentType: mimeType, upsert: false })
    if (uploadError) {
      uploadedPath = null
      throw new FunctionError(502, "The generated file could not be stored.", "Supabase Storage upload failed")
    }

    const { data: completion, error: completionError } = await context.admin
      .schema("document_api")
      .rpc("complete_job_render", {
        caller_auth_user_id: context.userId,
        requested_render_job_id: prepared.renderJobId,
        generated_document_id: generatedDocumentId,
        storage_bucket: generatedDocumentsBucket,
        storage_path: uploadedPath,
        original_file_name: fileName,
        mime_type: mimeType,
        file_size_bytes: bytes.byteLength,
        sha256: digest,
      })
    if (completionError || !completion) {
      await context.admin.storage.from(generatedDocumentsBucket).remove([uploadedPath])
      uploadedPath = null
      throw new FunctionError(500, "The generated document could not be catalogued.", "Document completion transaction failed")
    }
    catalogued = true

    const { data: signed, error: signedError } = await context.admin.storage
      .from(generatedDocumentsBucket)
      .createSignedUrl(uploadedPath, signedUrlLifetimeSeconds, { download: fileName })
    if (signedError || !signed?.signedUrl) {
      throw new FunctionError(500, "The document is ready, but its download link could not be created.", "Signed URL creation failed after render completion")
    }

    const expiresAt = new Date(Date.now() + signedUrlLifetimeSeconds * 1000).toISOString()
    return jsonResponse(request, {
      renderJobId: prepared.renderJobId,
      generatedDocumentId,
      fileName,
      mimeType,
      fileSizeBytes: bytes.byteLength,
      signedUrl: signed.signedUrl,
      expiresAt,
    })
  } catch (error) {
    const functionError = toFunctionError(error)
    if (context && prepared && !catalogued) {
      if (uploadedPath) await context.admin.storage.from(generatedDocumentsBucket).remove([uploadedPath])
      await context.admin.schema("document_api").rpc("fail_job_render", {
        caller_auth_user_id: context.userId,
        requested_render_job_id: prepared.renderJobId,
        safe_error_message: safeFailureMessage(error),
      })
    }
    console.error("Secure document render failed", { status: functionError.status, reason: functionError.auditMessage })
    return jsonResponse(request, { error: functionError.clientMessage }, functionError.status)
  }
})
