
import { getSupabaseSession, supabase, supabaseFunctionsUrl, supabasePublicApiKey } from "@/lib/supabase"

export type DocumentOutputFormat = "pdf" | "docx"
export type DocumentTemplateStatus = "draft" | "published" | "retired"
export type DocumentRenderStatus = "queued" | "rendering" | "ready" | "failed"
export type DocumentContentSectionCode = "job" | "customer" | "shipper" | "consignee" | "cargo" | "routing"

export type DocumentContentSection = {
  code: DocumentContentSectionCode
  label: string
  description: string
  required: boolean
  defaultSelected: boolean
}

export type DocumentTemplateSummary = {
  id: string
  code: string
  name: string
  description: string | null
  targetType: "Job_Header"
  outputFormats: DocumentOutputFormat[]
  defaultOutputFormat: DocumentOutputFormat
  status: DocumentTemplateStatus
  version: number
  languageCode: string
  updatedAt: string
  updatedBy: string | null
  contentSections: DocumentContentSection[]
}

export type GeneratedDocumentSummary = {
  id: string
  renderJobId: string
  templateCode: string
  templateName: string
  targetType: "Job_Header"
  targetId: string
  targetReference: string
  customerName: string | null
  fileName: string
  outputFormat: DocumentOutputFormat
  mimeType: string
  fileSizeBytes: number | null
  status: DocumentRenderStatus
  createdAt: string
  createdBy: string | null
  failureReason: string | null
}

export type DocumentBuilderWorkspace = {
  templates: DocumentTemplateSummary[]
  generatedDocuments: GeneratedDocumentSummary[]
  generatedDocumentTotal?: number
  generatedDocumentOffset?: number
  generatedDocumentLimit?: number
  permissions: {
    canGenerate: boolean
    canManageTemplates: boolean
  }
}

export type GeneratedDocumentPage = {
  rows: GeneratedDocumentSummary[]
  total: number
  offset: number
  limit: number
}

export type GeneratedDocumentPageRequest = {
  offset?: number
  limit?: number
  search?: string
  sort?: { id: string; direction: "asc" | "desc" }
}

export type RenderDocumentRequest = {
  templateCode: string
  targetType: "Job_Header"
  jobNumber: string
  outputFormat: DocumentOutputFormat
  contentSections: DocumentContentSectionCode[]
  reason?: string
  studioTemplateBase64?: string
}

export type DocumentStudioSession = {
  templateBase64: string
  templateType: "docx"
  templateName: string
  templateVersion: number
  multideckTemplateId?: string
  carboneTemplateId?: string
  carboneVersionId?: string
  dataModuleCode?: string
  dataModuleName?: string
  jobReference: string
  renderOptions: {
    data: Record<string, unknown>
    complement: Record<string, unknown>
    enum: Record<string, unknown>
    translations: Record<string, unknown>
    converter: "L"
    lang: string
    reportName: string
  }
}

export type DocumentStudioRequest = {
  templateCode: string
  jobNumber: string
  contentSections: DocumentContentSectionCode[]
}

export type SaveDocumentStudioTemplateResponse = {
  multideckTemplateId: string
  templateCode: string
  carboneTemplateId: string
  carboneVersionId: string
  multideckVersion: number
  status: "draft" | "published"
}

export type ApproveDocumentStudioTemplateResponse = {
  templateCode: string
  templateVersion: number
  status: "published"
}

export type RenderDocumentResponse = {
  renderJobId: string
  generatedDocumentId: string
  fileName: string
  mimeType: string
  fileSizeBytes: number
  signedUrl: string
  expiresAt: string
}

export type DocumentDownloadResponse = {
  signedUrl: string
  expiresAt: string
  fileName: string
}

function requireDocumentClient() {
  if (!supabase) throw new Error("The secure document service is not configured for this workspace.")
  return supabase
}

function isTransientFunctionFetchError(error: unknown) {
  if (!(error instanceof Error)) return false
  return error.name === "FunctionsFetchError"
    || error.message === "Failed to send a request to the Edge Function"
}

function waitForDocumentWorkspaceRetry() {
  return new Promise((resolve) => window.setTimeout(resolve, 250))
}

async function toFunctionError(error: unknown, fallback: string) {
  const context = typeof error === "object" && error && "context" in error
    ? (error as { context?: unknown }).context
    : null
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json() as { error?: unknown }
      if (typeof payload.error === "string" && payload.error.trim()) return new Error(payload.error)
    } catch {
      // Keep the safe fallback when the gateway did not return JSON.
    }
  }
  if (error instanceof Error && error.message.trim() && !error.message.includes("non-2xx")) return error
  return new Error(fallback)
}

export async function getDocumentBuilderWorkspace(options: GeneratedDocumentPageRequest = {}): Promise<DocumentBuilderWorkspace> {
  const client = requireDocumentClient()
  const invokeWorkspace = () => client.functions.invoke<DocumentBuilderWorkspace>("document-builder-workspace", {
    method: "POST",
    body: {
      action: "workspace",
      documentOffset: options.offset ?? 0,
      documentLimit: options.limit ?? 20,
      documentSearch: options.search ?? "",
      documentSort: options.sort ?? { id: "created", direction: "desc" },
    },
  })

  let { data, error } = await invokeWorkspace()
  if (error && isTransientFunctionFetchError(error)) {
    await waitForDocumentWorkspaceRetry()
    const retryResult = await invokeWorkspace()
    data = retryResult.data
    error = retryResult.error
  }

  if (error) throw await toFunctionError(error, "The document workspace could not be loaded.")
  if (!data) throw new Error("The document workspace returned no data.")
  if (typeof data.generatedDocumentTotal !== "number") {
    throw new Error("Paged document workspace data is still being prepared. Try again shortly.")
  }
  return data
}

export async function getGeneratedDocumentsPage(options: GeneratedDocumentPageRequest = {}): Promise<GeneratedDocumentPage> {
  const client = requireDocumentClient()
  const request = {
    action: "documents",
    documentOffset: options.offset ?? 0,
    documentLimit: options.limit ?? 20,
    documentSearch: options.search ?? "",
    documentSort: options.sort ?? { id: "created", direction: "desc" },
  }
  const invokePage = () => client.functions.invoke<GeneratedDocumentPage | DocumentBuilderWorkspace>("document-builder-workspace", {
    method: "POST",
    body: request,
  })

  let { data, error } = await invokePage()
  if (error && isTransientFunctionFetchError(error)) {
    await waitForDocumentWorkspaceRetry()
    const retryResult = await invokePage()
    data = retryResult.data
    error = retryResult.error
  }

  if (error) throw await toFunctionError(error, "Document history could not be loaded.")
  if (!data) throw new Error("Document history returned no data.")
  if ("rows" in data && Array.isArray(data.rows)) return data

  throw new Error("Paged document history is still being prepared. Try again shortly.")
}

export async function renderDocument(request: RenderDocumentRequest): Promise<RenderDocumentResponse> {
  const client = requireDocumentClient()
  const { data, error } = await client.functions.invoke<RenderDocumentResponse>("render-document", {
    method: "POST",
    body: request,
  })

  if (error) throw await toFunctionError(error, "The document could not be generated.")
  if (!data) throw new Error("The render service returned no document.")
  return data
}

export async function getDocumentStudioSession(request: DocumentStudioRequest): Promise<DocumentStudioSession> {
  requireDocumentClient()
  const session = await getSupabaseSession()
  if (!session) throw new Error("Sign in again to open the document studio.")
  if (!supabaseFunctionsUrl || !supabasePublicApiKey) throw new Error("The secure document service is not configured for this workspace.")

  const response = await fetch(`${supabaseFunctionsUrl}/document-studio`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabasePublicApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "open", ...request }),
  })

  if (!response.ok) {
    let message = "The document studio could not be opened."
    try {
      const payload = await response.json() as { error?: string }
      if (payload.error) message = payload.error
    } catch {
      // Keep the safe fallback when the gateway did not return JSON.
    }
    throw new Error(message)
  }
  return response.json() as Promise<DocumentStudioSession>
}

export async function getDocumentStudioComponent(): Promise<Blob> {
  requireDocumentClient()
  const session = await getSupabaseSession()
  if (!session) throw new Error("Sign in again to open the document studio.")
  if (!supabaseFunctionsUrl || !supabasePublicApiKey) throw new Error("The secure document service is not configured for this workspace.")

  const response = await fetch(`${supabaseFunctionsUrl}/document-studio`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabasePublicApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "component" }),
  })

  if (!response.ok) {
    let message = "The Carbone Studio interface could not be loaded."
    try {
      const payload = await response.json() as { error?: string }
      if (payload.error) message = payload.error
    } catch {
      // Keep the safe fallback when the gateway did not return JSON.
    }
    throw new Error(message)
  }
  return response.blob()
}

export async function renderDocumentStudioPreview(
  request: DocumentStudioRequest & { templateBase64: string; sampleData?: Record<string, unknown> },
): Promise<Response> {
  requireDocumentClient()
  const session = await getSupabaseSession()
  if (!session) throw new Error("Sign in again to preview this document.")
  if (!supabaseFunctionsUrl || !supabasePublicApiKey) throw new Error("The secure document service is not configured for this workspace.")

  const response = await fetch(`${supabaseFunctionsUrl}/document-studio`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabasePublicApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "preview", ...request }),
  })

  if (!response.ok) {
    let message = "The Studio preview could not be created."
    try {
      const payload = await response.json() as { error?: string }
      if (payload.error) message = payload.error
    } catch {
      // Keep the safe fallback when the gateway did not return JSON.
    }
    throw new Error(message)
  }
  return response
}

export async function saveDocumentStudioTemplate(
  request: DocumentStudioRequest & { templateBase64: string },
): Promise<SaveDocumentStudioTemplateResponse> {
  requireDocumentClient()
  const session = await getSupabaseSession()
  if (!session) throw new Error("Sign in again to save this template.")
  if (!supabaseFunctionsUrl || !supabasePublicApiKey) throw new Error("The secure document service is not configured for this workspace.")

  const response = await fetch(`${supabaseFunctionsUrl}/document-studio`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabasePublicApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "save", ...request }),
  })

  if (!response.ok) {
    let message = "The template could not be saved."
    try {
      const payload = await response.json() as { error?: string }
      if (payload.error) message = payload.error
    } catch {
      // Keep the safe fallback when the gateway did not return JSON.
    }
    throw new Error(message)
  }
  return response.json() as Promise<SaveDocumentStudioTemplateResponse>
}

export async function bootstrapDocumentStudioTemplate(templateId: string, templateBase64: string) {
  requireDocumentClient()
  const session = await getSupabaseSession()
  if (!session) throw new Error("Sign in to manage templates.")
  if (!supabaseFunctionsUrl || !supabasePublicApiKey) throw new Error("The secure document service is not configured for this workspace.")
  const response = await fetch(`${supabaseFunctionsUrl}/document-studio`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabasePublicApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "bootstrap", multideckTemplateId: templateId, templateBase64 }),
  })
  if (!response.ok) {
    let message = "The template source could not be saved."
    try {
      const payload = await response.json() as { error?: string }
      if (payload.error) message = payload.error
    } catch {
      // Keep the safe fallback when the gateway did not return JSON.
    }
    throw new Error(message)
  }
  return response.json() as Promise<SaveDocumentStudioTemplateResponse>
}

export async function approveDocumentStudioTemplate(templateId: string) {
  requireDocumentClient()
  const session = await getSupabaseSession()
  if (!session) throw new Error("Sign in to manage templates.")
  if (!supabaseFunctionsUrl || !supabasePublicApiKey) throw new Error("The secure document service is not configured for this workspace.")
  const response = await fetch(`${supabaseFunctionsUrl}/document-studio`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabasePublicApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "approve", multideckTemplateId: templateId }),
  })
  if (!response.ok) {
    let message = "The template could not be approved."
    try {
      const payload = await response.json() as { error?: string }
      if (payload.error) message = payload.error
    } catch {
      // Keep the safe fallback when the gateway did not return JSON.
    }
    throw new Error(message)
  }
  return response.json() as Promise<ApproveDocumentStudioTemplateResponse>
}

export async function getGeneratedDocumentDownload(generatedDocumentId: string): Promise<DocumentDownloadResponse> {
  const client = requireDocumentClient()
  const { data, error } = await client.functions.invoke<DocumentDownloadResponse>("document-download", {
    method: "POST",
    body: { generatedDocumentId },
  })

  if (error) throw await toFunctionError(error, "A secure download link could not be created.")
  if (!data) throw new Error("The download service returned no link.")
  return data
}
