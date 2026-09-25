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

type ContentSection = "job" | "customer" | "shipper" | "consignee" | "cargo" | "routing"

type StudioRequest = {
  action?: "component" | "open" | "preview" | "preview-draft" | "draft-source" | "save" | "bootstrap" | "create" | "approve"
  templateCode?: string
  multideckTemplateId?: string
  templateName?: string
  templateDescription?: string
  templateLanguageCode?: string
  templateFileName?: string
  templateMimeType?: string
  jobNumber?: string
  contentSections?: unknown
  templateBase64?: string
  sampleData?: unknown
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
  const digest = await crypto.subtle.digest("SHA-256", bytes)
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
  return new Response(bytes, {
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
  return data as StudioSession
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
  const sourcePath = `templates/${registration.multideckTemplateId}/source/${sha256}.${extension}`
  const { error: uploadError } = await context.admin.storage
    .from(templateSourcesBucket)
    .upload(sourcePath, bytes, {
      contentType: sourceMimeType,
      cacheControl: "31536000",
      upsert: true,
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
) {
  const { data, error } = await context.admin
    .schema("document_api")
    .rpc("approve_studio_template_version", {
      caller_auth_user_id: context.userId,
      requested_template_id: templateId,
    })
  if (error || !data) throw error ?? new Error("Document template approval returned no data")
  return data
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) })
  if (request.method !== "POST") return jsonResponse(request, { error: "Method not allowed" }, 405)

  try {
    const context = await authenticateRequest(request)
    const payload = await request.json() as StudioRequest

    if (payload.action === "component") {
      return await studioComponentResponse(request)
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

    if (payload.action === "approve") {
      if (!isUuid(payload.multideckTemplateId)) {
        throw new FunctionError(400, "Choose a valid document template.", "Studio approval request was invalid")
      }
      return jsonResponse(request, await approveTemplate(context, payload.multideckTemplateId))
    }

    if (payload.action === "draft-source") {
      if (!isUuid(payload.multideckTemplateId)) {
        throw new FunctionError(400, "Choose a valid document template.", "Draft source request was invalid")
      }
      const { data, error } = await context.admin.schema("document_api").rpc("studio_template_draft_source", {
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
      return jsonResponse(request, { draft: {
        multideckTemplateId: payload.multideckTemplateId,
        templateCode: data.templateCode,
        multideckVersion: data.multideckVersion,
        carboneTemplateId: data.carboneTemplateId,
        carboneVersionId: data.carboneVersionId,
        status: "draft",
        templateBase64: toBase64(bytes),
        templateFileName: fileName,
        templateMimeType: data.mimeType,
      } })
    }

    if (payload.action === "preview-draft") {
      if (!isUuid(payload.multideckTemplateId) || typeof payload.templateBase64 !== "string") {
        throw new FunctionError(400, "Choose a valid template source.", "Draft preview request was invalid")
      }
      await authorizeTemplateSave(context, payload.multideckTemplateId)
      const templateFileName = payload.templateFileName ?? "template.docx"
      fromBase64(payload.templateBase64, templateFileName)
      const sampleData = parseSampleData(payload.sampleData)
      if (!sampleData) throw new FunctionError(400, "Enter safe sample data to preview this template.", "Draft preview had no sample data")
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
          ...(templateExtension === "pdf" ? {} : { convertTo: "pdf" }),
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
