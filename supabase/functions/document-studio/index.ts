import {
  authenticateRequest,
  corsHeaders,
  FunctionError,
  jsonResponse,
  isUuid,
  maximumGeneratedFileBytes,
  parseJobNumber,
  templateSourcesBucket,
  toFunctionError,
} from "../_shared/document-functions.ts"
import { templatePreviewSample, templatePreviewPrivacyMessage } from "../_shared/template-preview-safety.ts"
import { jobDocumentIdentity } from "../_shared/document-branding.ts"
import { documentIssueConversion } from "../_shared/document-issue.ts"
import { bookingTemplateSample, validateBookingTemplate } from "../_shared/booking-template-validation.ts"
import { multideckDocumentLogo } from "../_shared/multideck-document-logo.ts"
import { bookingDefaultTemplate } from "../_shared/booking-default-template.ts"
import { transportDefaultTemplates } from "../_shared/transport-default-templates.ts"
import { transportTemplateSample, validateTransportTemplate } from "../_shared/transport-template-validation.ts"

type ContentSection = "job" | "customer" | "shipper" | "consignee" | "cargo" | "routing"

type StudioRequest = {
  action?: "library" | "component" | "open" | "preview" | "preview-draft" | "draft-source" | "template-source" | "save" | "bootstrap" | "create" | "approve" | "duplicate-booking" | "history" | "version-source" | "restore-default"
  libraryAction?: "read" | "reorder" | "remove" | "restore"
  templateOrder?: string[]
  templateCode?: string
  multideckTemplateId?: string
  templateName?: string
  templateDescription?: string
  templateLanguageCode?: string
  templateFileName?: string
  templateMimeType?: string
  sourceTemplateId?: string
  jobNumber?: string
  contentSections?: unknown
  templateBase64?: string
  sampleData?: unknown
  versionNo?: number
  reviewedVersion?: number
  reviewedSourceSha256?: string
  previewScenario?: "standard" | "short" | "optional" | "long" | "tenant" | "oversized"
}

type StudioSession = {
  templateCode: string
  templateName: string
  templateVersion: number
  multideckTemplateId?: string
  carboneTemplateReference: string
  carboneTemplateId?: string
  carboneVersionId?: string
  templateFileName?: string
  templateMimeType?: string
  dataModuleCode?: string
  dataModuleName?: string
  languageCode: string
  jobReference: string
  dataset: Record<string, unknown>
}

type TemplateRegistration = {
  multideckTemplateId: string
  multideckVersion: number
  carboneTemplateId: string
  carboneVersionId: string
}

const allowedContentSections: ContentSection[] = ["job", "customer", "shipper", "consignee", "cargo", "routing"]
const maximumStudioTemplateBytes = 15 * 1024 * 1024
const maximumStudioComponentBytes = 5 * 1024 * 1024
const maximumStudioSampleBytes = 1024 * 1024

function getCarboneAuthorization() {
  const explicitHeader = Deno.env.get("CARBONE_AUTH_HEADER")?.trim()
  if (explicitHeader) return explicitHeader

  const username = Deno.env.get("CARBONE_USERNAME")
  const password = Deno.env.get("CARBONE_PASSWORD")
  if (username && password) return `Basic ${btoa(`${username}:${password}`)}`

  const token = Deno.env.get("CARBONE_API_TOKEN")?.trim()
  if (token) return `Bearer ${token}`
  throw new FunctionError(500, "The document studio is not configured.", "Carbone authentication is unavailable")
}

function getCarboneBaseUrl() {
  const configured = Deno.env.get("CARBONE_URL")?.trim().replace(/\/$/, "")
  if (!configured) throw new FunctionError(500, "The document studio is not configured.", "CARBONE_URL is unavailable")

  const url = new URL(configured)
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new FunctionError(500, "The document studio is not configured safely.", "CARBONE_URL must use HTTPS")
  }
  return url.toString().replace(/\/$/, "")
}

function getCarboneStudioVersion() {
  const configured = Deno.env.get("CARBONE_STUDIO_VERSION")?.trim() || "5.9.0"
  if (!/^\d+\.\d+\.\d+$/.test(configured)) {
    throw new FunctionError(500, "The document studio is not configured safely.", "CARBONE_STUDIO_VERSION must be a pinned semantic version")
  }
  return configured
}

function renderTimeout() {
  const configured = Number(Deno.env.get("CARBONE_TIMEOUT_MS") ?? 90000)
  return Number.isFinite(configured) ? Math.min(Math.max(configured, 5000), 120000) : 90000
}

function parseTemplateCode(value: unknown) {
  const templateCode = typeof value === "string" ? value.trim().toUpperCase() : ""
  if (!/^[A-Z0-9][A-Z0-9_-]{1,99}$/.test(templateCode)) {
    throw new FunctionError(400, "Choose a valid document template.", "Studio template code validation failed")
  }
  return templateCode
}

function parseContentSections(value: unknown): ContentSection[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > allowedContentSections.length) {
    throw new FunctionError(400, "Choose the information to include.", "Studio content selection was not a valid array")
  }

  const unique = [...new Set(value)]
  if (unique.length !== value.length || unique.some((section) => typeof section !== "string" || !allowedContentSections.includes(section as ContentSection))) {
    throw new FunctionError(400, "Choose valid document information.", "Studio content selection contained duplicates or unsupported values")
  }
  if (!unique.includes("job")) {
    throw new FunctionError(400, "Job details must be included.", "Required studio content section was omitted")
  }
  return unique as ContentSection[]
}

function toBase64(bytes: Uint8Array) {
  let binary = ""
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function fromBase64(value: string, sourceFileName = "template.docx") {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length > Math.ceil(maximumStudioTemplateBytes / 3) * 4 + 4) {
    throw new FunctionError(400, "The Studio template is invalid.", "Studio template base64 validation failed")
  }

  let binary: string
  try {
    binary = atob(value)
  } catch {
    throw new FunctionError(400, "The Studio template is invalid.", "Studio template base64 decoding failed")
  }

  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  const extension = sourceFileName.toLowerCase().split(".").pop() ?? ""
  const isPdf = new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
  const isZipOfficeFile = bytes[0] === 0x50 && bytes[1] === 0x4b
  const allowedExtension = ["pdf", "doc", "docx", "xls", "xlsx"].includes(extension)
  const validSignature = extension === "pdf" ? isPdf : ["docx", "xlsx"].includes(extension) ? isZipOfficeFile : allowedExtension
  if (!bytes.byteLength || bytes.byteLength > maximumStudioTemplateBytes || !validSignature) {
    throw new FunctionError(400, "Choose a valid PDF, Word or Excel template.", "Studio accepts PDF, DOC, DOCX, XLS and XLSX templates up to 15 MiB")
  }
  return bytes
}

function sourceExtension(fileName: string) {
  const extension = fileName.toLowerCase().split(".").pop() ?? "docx"
  return ["pdf", "doc", "docx", "xls", "xlsx"].includes(extension) ? extension : "docx"
}

function sourceMimeType(fileName: string, requestedMimeType?: string) {
  if (requestedMimeType?.trim()) return requestedMimeType.trim().slice(0, 120)
  return {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }[sourceExtension(fileName)] ?? "application/octet-stream"
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function parseSampleData(value: unknown) {
  if (value === undefined) return null
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FunctionError(400, "The preview data must be a JSON object.", "Studio sample data was not an object")
  }

  let encoded: string
  try {
    encoded = JSON.stringify(value)
  } catch {
    throw new FunctionError(400, "The preview data is not valid JSON.", "Studio sample data could not be serialized")
  }
  if (new TextEncoder().encode(encoded).byteLength > maximumStudioSampleBytes) {
    throw new FunctionError(400, "The preview data is too large.", "Studio sample data exceeded 1 MiB")
  }
  return value as Record<string, unknown>
}

function binaryResponse(request: Request, bytes: Uint8Array, contentType: string) {
  return new Response(new Uint8Array(bytes).buffer, {
    status: 200,
    headers: {
      ...corsHeaders(request),
      "Cache-Control": "no-store",
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    },
  })
}

async function studioComponentResponse(request: Request) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), renderTimeout())

  try {
    const version = getCarboneStudioVersion()
    const response = await fetch(`${getCarboneBaseUrl()}/carbone-studio.js?v=${encodeURIComponent(version)}`, {
      method: "GET",
      headers: { "Authorization": getCarboneAuthorization() },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new FunctionError(502, "The Carbone Studio interface could not be loaded.", `Carbone Studio component returned HTTP ${response.status}`)
    }

    const contentLength = Number(response.headers.get("Content-Length") ?? 0)
    if (contentLength > maximumStudioComponentBytes) {
      throw new FunctionError(502, "The Carbone Studio interface is too large.", "Carbone Studio component exceeded 5 MiB")
    }

    const bytes = new Uint8Array(await response.arrayBuffer())
    if (!bytes.byteLength || bytes.byteLength > maximumStudioComponentBytes) {
      throw new FunctionError(502, "The Carbone Studio interface is invalid.", "Carbone Studio component was empty or exceeded 5 MiB")
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders(request),
        "Cache-Control": "private, max-age=3600",
        "Content-Type": "text/javascript; charset=utf-8",
        "X-Carbone-Studio-Version": version,
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new FunctionError(502, "The document studio did not respond in time.", "Carbone Studio component request timed out")
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

async function prepareSession(
  context: Awaited<ReturnType<typeof authenticateRequest>>,
  templateCode: string,
  jobNumber: string,
  contentSections: ContentSection[],
) {
  const { data, error } = await context.admin
    .schema("document_api")
    .rpc("prepare_studio_job_session", {
      caller_auth_user_id: context.userId,
      requested_template_code: templateCode,
      requested_job_number: jobNumber,
      requested_content_sections: contentSections,
    })
  if (error || !data) throw error ?? new Error("Document Studio session returned no data")
  const session = data as StudioSession
  if (/^JOB_CONFIRMATION(?:_[A-Z0-9]+)*$/.test(templateCode)) {
    const jobId = (session.dataset.job as { id?: string } | undefined)?.id
      ?? (session.dataset.bookingConfirmation as { jobId?: string } | undefined)?.jobId
    if (!isUuid(jobId)) throw new FunctionError(409, "Refresh the booking source and try again.", "Authorised Studio source identity is missing")
    const actor = await context.admin.from("cmp_Users").select("Company_ID").eq("Auth_User_ID", context.userId).single()
    if (actor.error || !actor.data?.Company_ID) throw actor.error ?? new Error("Studio company identity is missing")
    session.dataset = { ...session.dataset, ...await jobDocumentIdentity(context.admin, jobId, actor.data.Company_ID) }
  }
  return session
}

async function authorizeTemplateSave(
  context: Awaited<ReturnType<typeof authenticateRequest>>,
  templateId: string,
) {
  const { data, error } = await context.admin
    .schema("document_api")
    .rpc("authorize_studio_template_save", {
      caller_auth_user_id: context.userId,
      requested_template_id: templateId,
    })
  if (error || !data) throw error ?? new Error("Document template authorisation returned no data")
  return data as { templateId: string; templateCode: string; templateName: string; carboneTemplateId?: string }
}

async function registerTemplateVersion(
  context: Awaited<ReturnType<typeof authenticateRequest>>,
  templateId: string,
  providerTemplateId: string,
  providerVersionId: string,
) {
  const { data, error } = await context.admin
    .schema("document_api")
    .rpc("register_studio_template_version", {
      caller_auth_user_id: context.userId,
      requested_template_id: templateId,
      provider_template_id: providerTemplateId,
      provider_version_id: providerVersionId,
    })
  if (error || !data) throw error ?? new Error("Document template registration returned no data")
  return data as TemplateRegistration
}

async function recordTemplateSource(
  context: Awaited<ReturnType<typeof authenticateRequest>>,
  registration: TemplateRegistration,
  bytes: Uint8Array,
  sha256: string,
  sourceFileName: string,
  sourceMimeType: string,
) {
  const extension = sourceExtension(sourceFileName)
  const storedFileName = `${registration.carboneTemplateId}-${registration.carboneVersionId}.${extension}`
  const sourcePath = `templates/${registration.multideckTemplateId}/source/v${registration.multideckVersion}/${sha256}.${extension}`
  const { error: uploadError } = await context.admin.storage
    .from(templateSourcesBucket)
    .upload(sourcePath, bytes, {
      contentType: sourceMimeType,
      cacheControl: "31536000",
      upsert: false,
    })
  if (uploadError) throw new Error(`Template source upload failed: ${uploadError.message}`)

  const { error: catalogueError } = await context.admin
    .schema("document_api")
    .rpc("record_template_source", {
      caller_auth_user_id: context.userId,
      requested_template_id: registration.multideckTemplateId,
      requested_version_no: registration.multideckVersion,
      source_bucket: templateSourcesBucket,
      source_path: sourcePath,
      source_file_name: storedFileName,
      source_mime_type: sourceMimeType,
      source_size_bytes: bytes.byteLength,
      source_sha256: sha256,
    })
  if (catalogueError) throw catalogueError
}

async function saveTemplateToCarbone(
  context: Awaited<ReturnType<typeof authenticateRequest>>,
  templateId: string,
  templateBase64: string,
  templateBytes: Uint8Array,
  comment: string,
  sourceFileName = "template.docx",
  sourceMimeTypeValue = sourceMimeType(sourceFileName),
) {
  const templateSha256 = await sha256Hex(templateBytes)
  const authorisedTemplate = await authorizeTemplateSave(context, templateId)
  if (/^JOB_CONFIRMATION(?:_[A-Z0-9]+)*$/.test(authorisedTemplate.templateCode)) {
    await testBookingTemplate(templateBytes, templateBase64, sourceFileName)
  }
  if (authorisedTemplate.templateCode === "HBL" || authorisedTemplate.templateCode === "HAWB") {
    await testTransportTemplate(templateBytes, templateBase64, sourceFileName, authorisedTemplate.templateCode)
  }
  if (["MAWB", "MNG_AWB", "FIATA_BOL_REFERENCE", "JE2648771_FBL_MULTIMODAL_CTRS_A4260714093859"].includes(authorisedTemplate.templateCode)) {
    throw new FunctionError(409, "This issuer layout is protected. An approved issuer source is required before changing it.", "Protected transport source editing was blocked")
  }
  const saveResponse = await fetch(`${getCarboneBaseUrl()}/template`, {
    method: "POST",
    headers: {
      "Authorization": getCarboneAuthorization(),
      "Content-Type": "application/json",
      "carbone-version": Deno.env.get("CARBONE_API_VERSION")?.trim() || "5",
    },
    body: JSON.stringify({
      template: templateBase64,
      versioning: true,
      ...(authorisedTemplate.carboneTemplateId ? { id: authorisedTemplate.carboneTemplateId } : {}),
      name: authorisedTemplate.templateName,
      comment,
      category: "Multideck",
      tags: ["multideck", authorisedTemplate.templateCode.toLowerCase()],
    }),
  })
  if (!saveResponse.ok) {
    throw new FunctionError(502, "The template could not be saved to Carbone.", `Carbone template save returned HTTP ${saveResponse.status}`)
  }

  const savePayload = await saveResponse.json() as {
    success?: boolean
    data?: { id?: unknown; versionId?: unknown }
  }
  const providerTemplateId = savePayload.data?.id
  const providerVersionId = savePayload.data?.versionId
  if (savePayload.success !== true
    || typeof providerTemplateId !== "string"
    || !/^[0-9]{1,20}$/.test(providerTemplateId)
    || typeof providerVersionId !== "string"
    || !/^[0-9a-f]{64}$/.test(providerVersionId)) {
    throw new FunctionError(502, "Carbone did not return a valid template ID.", "Carbone template save identifiers were invalid")
  }

  const registration = await registerTemplateVersion(
    context,
    authorisedTemplate.templateId,
    providerTemplateId,
    providerVersionId,
  )
  await recordTemplateSource(context, registration, templateBytes, templateSha256, sourceFileName, sourceMimeTypeValue)
  return registration
}

async function testBookingTemplate(bytes: Uint8Array, base64: string, fileName: string, scenario = "standard") {
  if (!templatePreviewSample(await sha256Hex(bytes))) throw new FunctionError(400, templatePreviewPrivacyMessage, "Unreviewed Booking source blocked before test render")
  if (!["standard", "short", "optional", "long", "tenant", "oversized"].includes(scenario)) throw new FunctionError(400, "Choose a supported template test.", "Unsupported template preview scenario")
  if (!fileName.toLowerCase().endsWith(".docx")) throw new FunctionError(400, "Use a Word DOCX file for booking confirmations.", "Unsupported Booking template format")
  try { validateBookingTemplate(bytes) } catch (error) {
    throw new FunctionError(400, error instanceof Error ? error.message : "Check the required template fields.", "Booking template validation failed")
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), renderTimeout())
  try {
    const response = await fetch(`${getCarboneBaseUrl()}/render/template?download=true`, {
      method: "POST",
      headers: { Authorization: getCarboneAuthorization(), "Content-Type": "application/json", "carbone-version": Deno.env.get("CARBONE_API_VERSION")?.trim() || "5" },
      body: JSON.stringify({ data: { ...bookingTemplateSample(scenario), branding: { logoDataUri: scenario === "tenant" ? 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"><rect x="2" y="2" width="116" height="76" fill="white" stroke="black"/><text x="60" y="46" text-anchor="middle" font-family="Arial" font-size="20" fill="black">DEMO</text></svg>') : multideckDocumentLogo } }, template: base64,
        convertTo: documentIssueConversion("pdf", "draft"), converter: "L", lang: "en-GB", timezone: "UTC", reportName: "booking-template-test" }),
      signal: controller.signal,
    })
    if (!response.ok) throw new FunctionError(400, "Carbone could not render this template. Check its fields and formatting, then upload it again.", `Booking test render returned HTTP ${response.status}`)
    const output = new Uint8Array(await response.arrayBuffer())
    if (!output.length || output.length > maximumGeneratedFileBytes || new TextDecoder().decode(output.slice(0, 5)) !== "%PDF-") {
      throw new FunctionError(502, "The template test did not return a valid PDF. Try again.", "Invalid Booking template test output")
    }
    return output
  } finally { clearTimeout(timer) }
}

async function testTransportTemplate(bytes: Uint8Array, base64: string, fileName: string, code: "HBL" | "HAWB", scenario = "standard") {
  if (!templatePreviewSample(await sha256Hex(bytes))) throw new FunctionError(400, templatePreviewPrivacyMessage, "Unreviewed house transport source blocked before test render")
  if (!["standard", "short", "optional", "long", "tenant", "oversized"].includes(scenario)) throw new FunctionError(400, "Choose a supported template test.", "Unsupported transport preview scenario")
  if (!fileName.toLowerCase().endsWith(".docx")) throw new FunctionError(400, "Use a Word DOCX file for this draft layout.", "Unsupported transport template format")
  try { validateTransportTemplate(bytes, code) } catch (error) {
    throw new FunctionError(400, error instanceof Error ? error.message : "Check the required template fields.", "Own-issuer draft template validation failed")
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), renderTimeout())
  try {
    const response = await fetch(`${getCarboneBaseUrl()}/render/template?download=true`, {
      method: "POST", headers: { Authorization: getCarboneAuthorization(), "Content-Type": "application/json", "carbone-version": Deno.env.get("CARBONE_API_VERSION")?.trim() || "5" },
      body: JSON.stringify({ data: transportTemplateSample(code, scenario), template: base64,
        convertTo: documentIssueConversion("pdf", "draft"), converter: "L", lang: "en-GB", timezone: "UTC", reportName: `${code.toLowerCase()}-template-test` }), signal: controller.signal,
    })
    if (!response.ok) throw new FunctionError(400, "Carbone could not render this template. Check its fields and formatting, then upload it again.", `Transport test render returned HTTP ${response.status}`)
    const output = new Uint8Array(await response.arrayBuffer())
    if (!output.length || output.length > maximumGeneratedFileBytes || new TextDecoder().decode(output.slice(0, 5)) !== "%PDF-") throw new FunctionError(502, "The template test did not return a valid PDF. Try again.", "Invalid transport template test output")
    return output
  } finally { clearTimeout(timer) }
}

async function createTemplate(
  context: Awaited<ReturnType<typeof authenticateRequest>>,
  templateCode: string,
  templateName: string,
  templateDescription: string | null,
  templateLanguageCode: string,
) {
  const { data, error } = await context.admin
    .schema("document_api")
    .rpc("create_studio_template", {
      caller_auth_user_id: context.userId,
      requested_template_code: templateCode,
      requested_template_name: templateName,
      requested_description: templateDescription,
      requested_language_code: templateLanguageCode,
    })
  if (error || !data) throw error ?? new Error("Document template creation returned no data")
  return data as { multideckTemplateId: string; templateCode: string; templateName: string; multideckVersion: number; status: "draft" }
}

async function addTemplateSourceMetadata(
  context: Awaited<ReturnType<typeof authenticateRequest>>,
  session: StudioSession,
) {
  if (!session.multideckTemplateId) return session
  const { data } = await context.admin
    .from("DOCB_TemplateVersions")
    .select('DOCBTV_TemplateSnapshotJSON')
    .eq("DOCBTV_TemplateID", session.multideckTemplateId)
    .eq("DOCBTV_VersionNo", session.templateVersion)
    .maybeSingle()
  const snapshot = data?.DOCBTV_TemplateSnapshotJSON as { source?: { fileName?: unknown; mimeType?: unknown } } | null
  const fileName = typeof snapshot?.source?.fileName === "string" ? snapshot.source.fileName : undefined
  const mimeType = typeof snapshot?.source?.mimeType === "string" ? snapshot.source.mimeType : undefined
  return { ...session, templateFileName: fileName, templateMimeType: mimeType }
}

async function approveTemplate(
  context: Awaited<ReturnType<typeof authenticateRequest>>,
  templateId: string,
  reviewedVersion: number,
  reviewedSourceSha256: string,
) {
  const template = await authorizeTemplateSave(context, templateId)
  if (/^JOB_CONFIRMATION(?:_[A-Z0-9]+)*$/.test(template.templateCode) || template.templateCode === "HBL" || template.templateCode === "HAWB") {
    const source = await context.admin.schema("document_api").rpc("studio_template_draft_source", {
      caller_auth_user_id: context.userId, requested_template_id: templateId,
    })
    if (source.error || !source.data) throw source.error ?? new FunctionError(409, "Save and preview the template draft before activating it.", "No saved Booking draft to approve")
    const file = await context.admin.storage.from(templateSourcesBucket).download(source.data.path)
    if (file.error || !file.data || file.data.size > maximumStudioTemplateBytes) throw new FunctionError(502, "The draft source could not be checked. Try again.", "Booking draft approval source unavailable")
    const bytes = new Uint8Array(await file.data.arrayBuffer())
    if (source.data.multideckVersion !== reviewedVersion || await sha256Hex(bytes) !== reviewedSourceSha256) throw new FunctionError(409, "The template changed. Preview the latest saved draft before activating it.", "Stale Booking template review")
    if (template.templateCode === "HBL" || template.templateCode === "HAWB") await testTransportTemplate(bytes, toBase64(bytes), source.data.fileName, template.templateCode)
    else await testBookingTemplate(bytes, toBase64(bytes), source.data.fileName)
  }
  const { data, error } = await context.admin
    .schema("document_api")
    .rpc("approve_reviewed_template_version", {
      caller_auth_user_id: context.userId,
      requested_template_id: templateId,
      reviewed_version_no: reviewedVersion,
      reviewed_source_sha256: reviewedSourceSha256,
    })
  if (error?.code === "40001") throw new FunctionError(409, "The template changed. Preview the latest saved draft before activating it.", "Stale template review")
  if (error || !data) throw error ?? new Error("Document template approval returned no data")
  return data
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) })
  if (request.method !== "POST") return jsonResponse(request, { error: "Method not allowed" }, 405)

  try {
    const context = await authenticateRequest(request)
    const payload = await request.json() as StudioRequest

    if (payload.action === "library") {
      const { data, error } = await context.admin.schema("document_api").rpc("template_library", {
        caller_auth_user_id: context.userId,
        requested_action: payload.libraryAction ?? "read",
        requested_template_id: payload.multideckTemplateId ?? null,
        requested_order: payload.templateOrder ?? null,
      })
      if (error || !data) throw error ?? new Error("Template library returned no data")
      return jsonResponse(request, data)
    }

    if (payload.action === "component") {
      return await studioComponentResponse(request)
    }

    if (["history", "version-source", "restore-default"].includes(payload.action ?? "")) {
      if (!isUuid(payload.multideckTemplateId)) throw new FunctionError(400, "Choose a valid template.", "Invalid template history target")
      const template = await authorizeTemplateSave(context, payload.multideckTemplateId)
      if (payload.action === "restore-default") {
        if (template.templateCode === "HBL" || template.templateCode === "HAWB") {
          const base64 = transportDefaultTemplates[template.templateCode]
          return jsonResponse(request, await saveTemplateToCarbone(context, payload.multideckTemplateId, base64,
            fromBase64(base64), "Restored Multideck draft default as a reviewable version", template.templateCode === "HBL" ? "house-bill-of-lading.docx" : "house-air-waybill.docx"))
        }
        if (!/^JOB_CONFIRMATION(?:_[A-Z0-9]+)*$/.test(template.templateCode)) throw new FunctionError(409, "This document has no reviewed default available to restore.", "No supported default source")
        return jsonResponse(request, await saveTemplateToCarbone(context, payload.multideckTemplateId, bookingDefaultTemplate,
          fromBase64(bookingDefaultTemplate), "Restored Multideck default as a reviewable draft", "booking-confirmation.docx"))
      }
      const history = await context.admin.from("DOCB_TemplateVersions")
        .select("DOCBTV_VersionNo,DOCBTV_StatusCode,DOCBTV_TemplateSnapshotJSON,DOCBTV_PublishedAt,DOCBTV_ChangeReason")
        .eq("DOCBTV_TemplateID", payload.multideckTemplateId).in("DOCBTV_StatusCode", ["draft", "published"])
        .order("DOCBTV_VersionNo", { ascending: false }).limit(100)
      if (history.error) throw history.error
      if (payload.action === "history") return jsonResponse(request, { versions: history.data.map((row) => ({
        version: row.DOCBTV_VersionNo, status: row.DOCBTV_StatusCode, publishedAt: row.DOCBTV_PublishedAt,
        reason: row.DOCBTV_ChangeReason, hasSource: !!row.DOCBTV_TemplateSnapshotJSON?.source?.path,
      })) })
      const version = history.data.find((row) => row.DOCBTV_VersionNo === payload.versionNo)
      const source = version?.DOCBTV_TemplateSnapshotJSON?.source
      if (!source || source.bucket !== templateSourcesBucket || source.provider !== "supabase_storage"
        || !/^[a-f0-9]{64}$/.test(source.sha256 ?? "")
        || !new RegExp(`^templates/${payload.multideckTemplateId}/source/(?:v${version!.DOCBTV_VersionNo}/)?${source.sha256}\\.(?:pdf|docx?|xlsx?)$`).test(source.path ?? "")) {
        throw new FunctionError(404, "That version has no recoverable source file.", "No valid saved template version source")
      }
      const file = await context.admin.storage.from(templateSourcesBucket).download(source.path)
      if (file.error || !file.data || file.data.size > maximumStudioTemplateBytes) throw new FunctionError(502, "That source file could not be opened. Try again.", "Template history file unavailable")
      const bytes = new Uint8Array(await file.data.arrayBuffer())
      if (await sha256Hex(bytes) !== source.sha256) throw new FunctionError(502, "The saved source could not be verified.", "Historical template source hash mismatch")
      return jsonResponse(request, { draft: { multideckTemplateId: payload.multideckTemplateId, templateCode: template.templateCode,
        multideckVersion: version!.DOCBTV_VersionNo, status: version!.DOCBTV_StatusCode,
        sourceSha256: source.sha256, templateBase64: toBase64(bytes), templateFileName: source.fileName ?? "template.docx" } })
    }

    if (payload.action === "bootstrap") {
      if (!isUuid(payload.multideckTemplateId) || typeof payload.templateBase64 !== "string") {
        throw new FunctionError(400, "Choose a valid template source.", "Studio bootstrap request was invalid")
      }
      const templateBytes = fromBase64(payload.templateBase64, payload.templateFileName ?? "template.docx")
      return jsonResponse(request, await saveTemplateToCarbone(
        context,
        payload.multideckTemplateId,
        payload.templateBase64,
        templateBytes,
        "Initial source saved from Multideck",
        payload.templateFileName ?? "template.docx",
        sourceMimeType(payload.templateFileName ?? "template.docx", payload.templateMimeType),
      ))
    }

    if (payload.action === "create") {
      if (typeof payload.templateCode !== "string"
        || typeof payload.templateName !== "string") {
        throw new FunctionError(400, "Complete the template details.", "Studio create request was invalid")
      }
      if (payload.templateName.trim().length < 2 || payload.templateName.trim().length > 180) {
        throw new FunctionError(400, "Enter a template name between 2 and 180 characters.", "Studio template name validation failed")
      }
      const templateCode = parseTemplateCode(payload.templateCode)
      const templateName = payload.templateName.trim()
      const templateDescription = typeof payload.templateDescription === "string" ? payload.templateDescription.trim() || null : null
      const templateLanguageCode = typeof payload.templateLanguageCode === "string" ? payload.templateLanguageCode.trim() || "en" : "en"
      if (!payload.templateBase64 && !payload.templateFileName) {
        return jsonResponse(request, await createTemplate(context, templateCode, templateName, templateDescription, templateLanguageCode))
      }
      if (typeof payload.templateBase64 !== "string" || typeof payload.templateFileName !== "string") {
        throw new FunctionError(400, "Choose a valid template source.", "Studio create source was incomplete")
      }
      const templateBytes = fromBase64(payload.templateBase64, payload.templateFileName)
      const template = await createTemplate(
        context,
        templateCode, templateName, templateDescription, templateLanguageCode,
      )
      return jsonResponse(request, await saveTemplateToCarbone(
        context,
        template.multideckTemplateId,
        payload.templateBase64,
        templateBytes,
        "Initial source saved from the Multideck template upload flow",
        payload.templateFileName,
        sourceMimeType(payload.templateFileName, payload.templateMimeType),
      ))
    }

    if (payload.action === "duplicate-booking") {
      if (!isUuid(payload.sourceTemplateId)
        || typeof payload.templateCode !== "string"
        || typeof payload.templateName !== "string") {
        throw new FunctionError(400, "Choose a Booking template and enter a name.", "Booking template copy request was invalid")
      }
      const templateCode = parseTemplateCode(payload.templateCode)
      const templateName = payload.templateName.trim()
      if (!/^JOB_CONFIRMATION(?:_[A-Z0-9]+)+$/.test(templateCode)
        || templateName.length < 2 || templateName.length > 180) {
        throw new FunctionError(400, "Choose a unique Booking template code and name.", "Booking template copy name or code was invalid")
      }
      const { data: source, error: sourceError } = await context.admin
        .schema("document_api")
        .rpc("studio_booking_published_source", {
          caller_auth_user_id: context.userId,
          requested_template_id: payload.sourceTemplateId,
        })
      if (sourceError || !source) throw sourceError ?? new Error("Published Booking template source was unavailable")
      const { data: sourceBlob, error: downloadError } = await context.admin.storage
        .from(templateSourcesBucket).download(source.path)
      if (downloadError || !sourceBlob) throw downloadError ?? new Error("Published Booking template file was unavailable")
      const templateBytes = new Uint8Array(await sourceBlob.arrayBuffer())
      if (!templateBytes.byteLength || templateBytes.byteLength > maximumStudioTemplateBytes
        || templateBytes[0] !== 0x50 || templateBytes[1] !== 0x4b) {
        throw new FunctionError(400, "The Booking template Word source could not be copied.", "Published Booking template source was not a valid DOCX")
      }
      const created = await createTemplate(context, templateCode, templateName,
        `Booking confirmation layout copied from ${source.name}`, "en")
      const registration = await saveTemplateToCarbone(context, created.multideckTemplateId,
        toBase64(templateBytes), templateBytes, `Draft copied from ${source.code}`,
        `${templateCode.toLowerCase()}.docx`)
      return jsonResponse(request, { ...registration, templateCode, templateName, status: "draft" })
    }

    if (payload.action === "approve") {
      if (!isUuid(payload.multideckTemplateId)) {
        throw new FunctionError(400, "Choose a valid document template.", "Studio approval request was invalid")
      }
      if (!Number.isInteger(payload.reviewedVersion) || typeof payload.reviewedSourceSha256 !== "string" || !/^[a-f0-9]{64}$/.test(payload.reviewedSourceSha256)) {
        throw new FunctionError(400, "Preview the saved draft before activating it.", "Template approval lacks a source review")
      }
      return jsonResponse(request, await approveTemplate(context, payload.multideckTemplateId, payload.reviewedVersion!, payload.reviewedSourceSha256))
    }

    if (payload.action === "draft-source" || payload.action === "template-source") {
      if (!isUuid(payload.multideckTemplateId)) {
        throw new FunctionError(400, "Choose a valid document template.", "Template source request was invalid")
      }
      const sourceReader = payload.action === "template-source" ? "studio_template_layout_source" : "studio_template_draft_source"
      const { data, error } = await context.admin.schema("document_api").rpc(sourceReader, {
        caller_auth_user_id: context.userId,
        requested_template_id: payload.multideckTemplateId,
      })
      if (error) throw error
      if (!data) return jsonResponse(request, { draft: null })
      const { data: source, error: downloadError } = await context.admin.storage.from(data.bucket).download(data.path)
      if (downloadError || !source) throw new FunctionError(502, "The saved template source is unavailable.", downloadError?.message ?? "Draft source was missing")
      if (source.size > maximumStudioTemplateBytes) throw new FunctionError(502, "The saved template source is too large.", "Draft source exceeded 15 MiB")
      const bytes = new Uint8Array(await source.arrayBuffer())
      const fileName = typeof data.fileName === "string" ? data.fileName : "template.docx"
      const extension = sourceExtension(fileName)
      if (!bytes.byteLength || (extension === "pdf" ? new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-" : ["docx", "xlsx"].includes(extension) && (bytes[0] !== 0x50 || bytes[1] !== 0x4b))) {
        throw new FunctionError(502, "The saved template source is invalid.", "Draft source signature was invalid")
      }
      const previewSampleData = templatePreviewSample(await sha256Hex(bytes))
      return jsonResponse(request, { draft: {
        multideckTemplateId: payload.multideckTemplateId,
        templateCode: data.templateCode,
        multideckVersion: data.multideckVersion,
        carboneTemplateId: data.carboneTemplateId,
        carboneVersionId: data.carboneVersionId,
        status: data.status === "published" ? "published" : "draft",
        templateBase64: toBase64(bytes),
        sourceSha256: await sha256Hex(bytes),
        templateFileName: fileName,
        templateMimeType: data.mimeType,
        previewSafe: previewSampleData !== null,
        previewSampleData,
      } })
    }

    if (payload.action === "preview-draft") {
      if (!isUuid(payload.multideckTemplateId) || typeof payload.templateBase64 !== "string") {
        throw new FunctionError(400, "Choose a valid template source.", "Draft preview request was invalid")
      }
      await authorizeTemplateSave(context, payload.multideckTemplateId)
      const templateFileName = payload.templateFileName ?? "template.docx"
      const templateBytes = fromBase64(payload.templateBase64, templateFileName)
      const template = await authorizeTemplateSave(context, payload.multideckTemplateId)
      if (template.templateCode === "HBL" || template.templateCode === "HAWB") {
        return binaryResponse(request, await testTransportTemplate(templateBytes, payload.templateBase64, templateFileName, template.templateCode, payload.previewScenario), "application/pdf")
      }
      if (/^JOB_CONFIRMATION(?:_[A-Z0-9]+)*$/.test(template.templateCode)) {
        return binaryResponse(request, await testBookingTemplate(templateBytes, payload.templateBase64, templateFileName, payload.previewScenario), "application/pdf")
      }
      const sampleData = templatePreviewSample(await sha256Hex(templateBytes))
      if (!sampleData) throw new FunctionError(400, templatePreviewPrivacyMessage, "Unreviewed template source blocked before rendering")
      // Never accept caller-entered customer data on the template demo surface.
      // Real record document generation uses the separate authorised job workflow.
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), renderTimeout())
      try {
        const response = await fetch(`${getCarboneBaseUrl()}/render/template?download=true`, {
          method: "POST",
          headers: {
            "Authorization": getCarboneAuthorization(),
            "Content-Type": "application/json",
            "carbone-version": Deno.env.get("CARBONE_API_VERSION")?.trim() || "5",
          },
          body: JSON.stringify({ data: sampleData, template: payload.templateBase64,
            convertTo: "pdf", converter: "L", lang: "en-GB", reportName: "template-review-preview" }),
          signal: controller.signal,
        })
        if (!response.ok) throw new FunctionError(502, "The draft preview could not be created.", `Carbone draft preview returned HTTP ${response.status}`)
        const contentLength = Number(response.headers.get("Content-Length") ?? 0)
        if (contentLength > maximumGeneratedFileBytes) throw new FunctionError(502, "The draft preview is too large.", "Carbone draft preview exceeded 50 MiB")
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (!bytes.byteLength || bytes.byteLength > maximumGeneratedFileBytes
          || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
          throw new FunctionError(502, "The draft preview is invalid.", "Carbone returned an invalid draft PDF")
        }
        return binaryResponse(request, bytes, "application/pdf")
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new FunctionError(502, "The draft preview did not respond in time.", "Carbone draft preview timed out")
        }
        throw error
      } finally {
        clearTimeout(timeoutId)
      }
    }

    const templateCode = parseTemplateCode(payload.templateCode)
    const contentSections = parseContentSections(payload.contentSections)
    const jobNumber = parseJobNumber(payload.jobNumber)

    const session = await addTemplateSourceMetadata(context, await prepareSession(context, templateCode, jobNumber, contentSections))
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), renderTimeout())

    try {
      if (payload.action === "open") {
        const response = await fetch(
          `${getCarboneBaseUrl()}/template/${encodeURIComponent(session.carboneTemplateReference)}`,
          {
            method: "GET",
            headers: {
              "Authorization": getCarboneAuthorization(),
              "carbone-version": Deno.env.get("CARBONE_API_VERSION")?.trim() || "5",
            },
            signal: controller.signal,
          },
        )
        if (!response.ok) {
          throw new FunctionError(502, "The Studio template could not be opened.", `Carbone template download returned HTTP ${response.status}`)
        }

        const contentLength = Number(response.headers.get("Content-Length") ?? 0)
        if (contentLength > maximumStudioTemplateBytes) {
          throw new FunctionError(502, "The Studio template is too large.", "Carbone template exceeded 15 MiB")
        }

        const bytes = new Uint8Array(await response.arrayBuffer())
        const templateExtension = sourceExtension(session.templateFileName ?? "template.docx")
        const isPdfTemplate = templateExtension === "pdf"
        const isZipOfficeTemplate = ["docx", "xlsx"].includes(templateExtension)
        const isValidPdf = new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
        const isValidZipOfficeFile = bytes[0] === 0x50 && bytes[1] === 0x4b
        if (!bytes.byteLength || bytes.byteLength > maximumStudioTemplateBytes || (isPdfTemplate ? !isValidPdf : isZipOfficeTemplate ? !isValidZipOfficeFile : false)) {
          throw new FunctionError(502, "The Studio template is invalid.", "Carbone returned an invalid template source")
        }

        return jsonResponse(request, {
          templateBase64: toBase64(bytes),
          templateType: sourceExtension(session.templateFileName ?? "template.docx") === "xlsx" || sourceExtension(session.templateFileName ?? "template.docx") === "xls" ? "xlsx" : sourceExtension(session.templateFileName ?? "template.docx") === "pdf" ? "pdf" : "docx",
          templateFileName: session.templateFileName,
          templateMimeType: session.templateMimeType,
          templateName: session.templateName,
          templateVersion: session.templateVersion,
          multideckTemplateId: session.multideckTemplateId,
          carboneTemplateId: session.carboneTemplateId,
          carboneVersionId: session.carboneVersionId,
          dataModuleCode: session.dataModuleCode,
          dataModuleName: session.dataModuleName,
          jobReference: session.jobReference,
          renderOptions: {
            data: session.dataset,
            complement: {},
            enum: {},
            translations: {},
            converter: "L",
            lang: session.languageCode,
            reportName: `${session.templateCode}-${session.jobReference}`,
          },
        })
      }

      if (payload.action === "save" && typeof payload.templateBase64 === "string") {
        if (!session.multideckTemplateId) {
          throw new FunctionError(409, "Refresh the document builder before saving this template.", "Studio session did not include a Multideck template identity")
        }
        const registration = await saveTemplateToCarbone(
          context,
          session.multideckTemplateId,
          payload.templateBase64,
          fromBase64(payload.templateBase64, session.templateFileName ?? "template.docx"),
          `Saved from Multideck · ${session.jobReference}`,
          session.templateFileName ?? "template.docx",
          session.templateMimeType ?? sourceMimeType(session.templateFileName ?? "template.docx"),
        )
        return jsonResponse(request, registration)
      }

      if (payload.action !== "preview" || typeof payload.templateBase64 !== "string") {
        throw new FunctionError(400, "Choose a valid Studio action.", "Studio action validation failed")
      }

      fromBase64(payload.templateBase64, session.templateFileName ?? "template.docx")
      const sampleData = parseSampleData(payload.sampleData)
      const templateExtension = sourceExtension(session.templateFileName ?? "template.docx")
      const response = await fetch(`${getCarboneBaseUrl()}/render/template?download=true`, {
        method: "POST",
        headers: {
          "Authorization": getCarboneAuthorization(),
          "Content-Type": "application/json",
          "carbone-version": Deno.env.get("CARBONE_API_VERSION")?.trim() || "5",
        },
        body: JSON.stringify({
          data: sampleData ?? session.dataset,
          template: payload.templateBase64,
          ...(templateExtension === "pdf" ? {} : { convertTo: /^JOB_CONFIRMATION(?:_[A-Z0-9]+)*$/.test(templateCode) ? documentIssueConversion("pdf", "draft") : "pdf" }),
          converter: "L",
          lang: session.languageCode,
          reportName: `${session.templateCode}-${session.jobReference}-preview`,
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new FunctionError(502, "The Studio preview could not be created.", `Carbone Studio preview returned HTTP ${response.status}`)
      }

      const contentLength = Number(response.headers.get("Content-Length") ?? 0)
      if (contentLength > maximumGeneratedFileBytes) {
        throw new FunctionError(502, "The Studio preview is too large.", "Carbone preview exceeded 50 MiB")
      }

      const bytes = new Uint8Array(await response.arrayBuffer())
      if (!bytes.byteLength || bytes.byteLength > maximumGeneratedFileBytes || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
        throw new FunctionError(502, "The Studio preview is invalid.", "Carbone returned an invalid PDF preview")
      }
      return binaryResponse(request, bytes, "application/pdf")
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new FunctionError(502, "The document studio did not respond in time.", "Carbone Studio request timed out")
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (error) {
    const functionError = toFunctionError(error)
    console.error("Secure document studio failed", { status: functionError.status, reason: functionError.auditMessage })
    return jsonResponse(request, { error: functionError.clientMessage }, functionError.status)
  }
})
