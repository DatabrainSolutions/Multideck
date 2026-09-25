
import {
  authenticateRequest,
  corsHeaders,
  FunctionError,
  isUuid,
  jsonResponse,
  signedUrlLifetimeSeconds,
  toFunctionError,
} from "../_shared/document-functions.ts"

type DownloadRequest = { generatedDocumentId?: string; libraryDocumentId?: string; libraryKind?: string; preview?: boolean }
type AuthorisedDownload = { bucket: string; path: string; fileName: string }

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) })
  if (request.method !== "POST") return jsonResponse(request, { error: "Method not allowed" }, 405)

  try {
    const { admin, userId } = await authenticateRequest(request)
    const payload = await request.json() as DownloadRequest
    const documentId = payload.libraryDocumentId ?? payload.generatedDocumentId
    if (!isUuid(documentId)) {
      throw new FunctionError(400, "Choose a valid document.", "Generated document UUID validation failed")
    }
    if (payload.libraryDocumentId && !["generated", "booking_attachment", "quote_pdf", "customs_declaration", "finance_pdf"].includes(payload.libraryKind ?? "")) {
      throw new FunctionError(400, "Choose a valid document type.", "Library document kind validation failed")
    }
    if (payload.preview !== undefined && typeof payload.preview !== "boolean") {
      throw new FunctionError(400, "Choose a valid document preview.", "Preview flag validation failed")
    }

    const { data, error } = await admin
      .schema("document_api")
      .rpc(payload.libraryDocumentId ? "authorize_unified_download" : "authorize_download",
        payload.libraryDocumentId ? {
          caller_auth_user_id: userId,
          requested_kind: payload.libraryKind,
          requested_document_id: documentId,
        } : {
          caller_auth_user_id: userId,
          requested_generated_document_id: documentId,
        })
    if (error || !data) throw error ?? new Error("Document download authorization returned no data")

    const authorised = data as AuthorisedDownload
    const { data: signed, error: signedError } = await admin.storage
      .from(authorised.bucket)
      .createSignedUrl(authorised.path, signedUrlLifetimeSeconds, payload.preview ? undefined : { download: authorised.fileName })
    if (signedError || !signed?.signedUrl) {
      throw new FunctionError(500, "A secure download link could not be created.", "Supabase signed URL creation failed")
    }

    return jsonResponse(request, {
      signedUrl: signed.signedUrl,
      expiresAt: new Date(Date.now() + signedUrlLifetimeSeconds * 1000).toISOString(),
      fileName: authorised.fileName,
    })
  } catch (error) {
    const functionError = toFunctionError(error)
    console.error("Secure document download failed", { status: functionError.status, reason: functionError.auditMessage })
    return jsonResponse(request, { error: functionError.clientMessage }, functionError.status)
  }
})
