
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
  permissions: {
    canGenerate: boolean
    canManageTemplates: boolean
  }
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

function toFunctionError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error
  return new Error(fallback)
}

export async function getDocumentBuilderWorkspace(): Promise<DocumentBuilderWorkspace> {
  const client = requireDocumentClient()
  const { data, error } = await client.functions.invoke<DocumentBuilderWorkspace>("document-builder-workspace", {
    method: "POST",
    body: {},
  })

  if (error) throw toFunctionError(error, "The document workspace could not be loaded.")
  if (!data) throw new Error("The document workspace returned no data.")
  return data
}

export async function renderDocument(request: RenderDocumentRequest): Promise<RenderDocumentResponse> {
  const client = requireDocumentClient()
  const { data, error } = await client.functions.invoke<RenderDocumentResponse>("render-document", {
    method: "POST",
    body: request,
  })

  if (error) throw toFunctionError(error, "The document could not be generated.")
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
  request: DocumentStudioRequest & { templateBase64: string },
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

export async function getGeneratedDocumentDownload(generatedDocumentId: string): Promise<DocumentDownloadResponse> {
  const client = requireDocumentClient()
  const { data, error } = await client.functions.invoke<DocumentDownloadResponse>("document-download", {
    method: "POST",
    body: { generatedDocumentId },
  })

  if (error) throw toFunctionError(error, "A secure download link could not be created.")
  if (!data) throw new Error("The download service returned no link.")
  return data
}
