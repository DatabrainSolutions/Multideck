
import { supabase } from "@/lib/supabase"

export type DocumentOutputFormat = "pdf" | "docx"
export type DocumentTemplateStatus = "draft" | "published" | "retired"
export type DocumentRenderStatus = "queued" | "rendering" | "ready" | "failed"

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
  targetId: string
  outputFormat: DocumentOutputFormat
  reason?: string
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

