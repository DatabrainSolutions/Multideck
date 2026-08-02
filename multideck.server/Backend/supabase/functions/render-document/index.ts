
import {
  authenticateRequest,
  corsHeaders,
  FunctionError,
  generatedDocumentsBucket,
  isUuid,
  jsonResponse,
  maximumGeneratedFileBytes,
  safeFailureMessage,
  signedUrlLifetimeSeconds,
  toFunctionError,
} from "../_shared/document-functions.ts"

type OutputFormat = "pdf" | "docx"

type RenderRequest = {
  templateCode?: string
  targetType?: string
  targetId?: string
  outputFormat?: string
  reason?: string
}

type PreparedRender = {
  renderJobId: string
  templateCode: string
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

async function sha256(bytes: Uint8Array) {
  const hashInput = Uint8Array.from(bytes)
  const digest = await crypto.subtle.digest("SHA-256", hashInput.buffer)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")
}

function renderTimeout() {
  const configured = Number(Deno.env.get("CARBONE_TIMEOUT_MS") ?? 90000)
  return Number.isFinite(configured) ? Math.min(Math.max(configured, 5000), 120000) : 90000
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
    const templateCode = payload.templateCode?.trim().toUpperCase() ?? ""
    const outputFormat = payload.outputFormat?.trim().toLowerCase() ?? ""

    if (!/^[A-Z0-9][A-Z0-9_-]{1,99}$/.test(templateCode)) {
      throw new FunctionError(400, "Choose a valid document template.", "Template code validation failed")
    }
    if (payload.targetType !== "Job_Header" || !isUuid(payload.targetId)) {
      throw new FunctionError(400, "Choose a valid job.", "Only an exact Job_Header UUID is accepted")
    }
    if (outputFormat !== "pdf" && outputFormat !== "docx") {
      throw new FunctionError(400, "Choose PDF or DOCX.", "Output format validation failed")
    }

    const { data, error } = await context.admin
      .schema("document_api")
      .rpc("prepare_job_render", {
        caller_auth_user_id: context.userId,
        requested_template_code: templateCode,
        requested_job_id: payload.targetId,
        requested_output_format: outputFormat,
        requested_reason: payload.reason?.trim().slice(0, 500) || null,
      })
    if (error || !data) throw error ?? new Error("Render preparation returned no data")
    prepared = data as PreparedRender

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), renderTimeout())
    let carboneResponse: Response
    try {
      carboneResponse = await fetch(
        `${getCarboneBaseUrl()}/render/${encodeURIComponent(prepared.carboneTemplateReference)}?download=true`,
        {
          method: "POST",
          headers: {
            "Authorization": getCarboneAuthorization(),
            "Content-Type": "application/json",
            "carbone-version": Deno.env.get("CARBONE_API_VERSION")?.trim() || "5",
          },
          body: JSON.stringify({
            data: prepared.dataset,
            convertTo: prepared.outputFormat,
            lang: prepared.languageCode,
            reportName: safeReportName(prepared.templateCode, prepared.jobReference),
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
    const fileName = `${safeReportName(prepared.templateCode, prepared.jobReference)}.${extension}`
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

