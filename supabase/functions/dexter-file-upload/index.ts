import {
  assertAllowedRequestOrigin,
  corsHeaders,
  InboxHttpError,
  jsonResponse,
  problemResponse,
  readAllowedOrigins,
} from "../inbox-api/core.ts"
import { uploadDexterDocument } from "../_shared/dexter-uploads.ts"
import { requireActor, requirePermission, runtimeClients } from "../inbox-api/runtime.ts"

const MAX_MULTIPART_BYTES = 27 * 1024 * 1024

const allowedOrigins = readAllowedOrigins({
  EMAIL_ALLOWED_REDIRECT_ORIGINS: Deno.env.get("EMAIL_ALLOWED_REDIRECT_ORIGINS"),
  EMAIL_CANONICAL_APP_ORIGIN: Deno.env.get("EMAIL_CANONICAL_APP_ORIGIN"),
  APP_ALLOWED_ORIGINS: Deno.env.get("APP_ALLOWED_ORIGINS"),
  APP_URL: Deno.env.get("APP_URL"),
})

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("Origin")?.trim() ?? ""
    return new Response(null, { status: allowedOrigins.has(origin) ? 204 : 403, headers: corsHeaders(request, allowedOrigins) })
  }
  try {
    assertAllowedRequestOrigin(request, allowedOrigins)
    const authorization = request.headers.get("Authorization")?.trim() ?? ""
    if (!/^Bearer\s+\S+$/i.test(authorization)) {
      throw new InboxHttpError(401, "Sign in again to upload a document to Dexter.", "authentication_required")
    }
    if (request.method !== "POST") {
      throw new InboxHttpError(405, "That Dexter upload operation is not available.", "method_not_allowed")
    }
    const contentType = request.headers.get("Content-Type") ?? ""
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      throw new InboxHttpError(415, "Choose a document from your computer.", "upload_content_type_invalid")
    }
    const declaredLength = Number(request.headers.get("Content-Length") ?? "0")
    if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) {
      throw new InboxHttpError(413, "Choose a file smaller than 25 MB.", "upload_too_large")
    }

    // Authenticate and authorise before the multipart parser is allowed to
    // allocate memory for attacker-controlled file content.
    const clients = runtimeClients(authorization)
    const actor = await requireActor(clients.user, clients.admin)
    await requirePermission(clients.admin, actor, "AgentDexter.Manage")
    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) throw new InboxHttpError(400, "Choose a document to upload.", "upload_missing")
    return jsonResponse(request, allowedOrigins, { upload: await uploadDexterDocument(authorization, file) })
  } catch (error) {
    if (!(error instanceof InboxHttpError)) console.error("dexter-file-upload unhandled error", error)
    return problemResponse(request, allowedOrigins, error)
  }
})
