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
  action?: "component" | "open" | "preview" | "save" | "bootstrap" | "approve"
  templateCode?: string
  multideckTemplateId?: string
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

function fromBase64(value: string) {
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
  if (!bytes.byteLength || bytes.byteLength > maximumStudioTemplateBytes || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new FunctionError(400, "Choose a valid Word template.", "Studio accepts ZIP-based Office templates up to 15 MiB")
  }
  return bytes
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
) {
  const sourcePath = `templates/${registration.multideckTemplateId}/source/${sha256}.docx`
  const sourceFileName = `${registration.carboneTemplateId}-${registration.carboneVersionId}.docx`
  const { error: uploadError } = await context.admin.storage
    .from(templateSourcesBucket)
    .upload(sourcePath, bytes, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
      source_file_name: sourceFileName,
      source_mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
  await recordTemplateSource(context, registration, templateBytes, templateSha256)
  return registration
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
      const templateBytes = fromBase64(payload.templateBase64)
      return jsonResponse(request, await saveTemplateToCarbone(
        context,
        payload.multideckTemplateId,
        payload.templateBase64,
        templateBytes,
        "Initial source saved from Multideck",
      ))
    }

    if (payload.action === "approve") {
      if (!isUuid(payload.multideckTemplateId)) {
        throw new FunctionError(400, "Choose a valid document template.", "Studio approval request was invalid")
      }
      return jsonResponse(request, await approveTemplate(context, payload.multideckTemplateId))
    }

    const templateCode = parseTemplateCode(payload.templateCode)
    const contentSections = parseContentSections(payload.contentSections)
    const jobNumber = parseJobNumber(payload.jobNumber)

    const session = await prepareSession(context, templateCode, jobNumber, contentSections)
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
        if (!bytes.byteLength || bytes.byteLength > maximumStudioTemplateBytes || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
          throw new FunctionError(502, "The Studio template is not a valid Word file.", "Carbone returned an invalid ZIP-based Office template")
        }

        return jsonResponse(request, {
          templateBase64: toBase64(bytes),
          templateType: "docx",
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
          fromBase64(payload.templateBase64),
          `Saved from Multideck · ${session.jobReference}`,
        )
        return jsonResponse(request, registration)
      }

      if (payload.action !== "preview" || typeof payload.templateBase64 !== "string") {
        throw new FunctionError(400, "Choose a valid Studio action.", "Studio action validation failed")
      }

      fromBase64(payload.templateBase64)
      const sampleData = parseSampleData(payload.sampleData)
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
          convertTo: "pdf",
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
