import {
  InboxHttpError,
  assertAllowedRequestOrigin,
  corsHeaders,
  jsonResponse,
  problemResponse,
  readAllowedOrigins,
  readJson,
} from "../inbox-api/core.ts"
import { createCustomerDocumentReadUrl, listCustomerDocuments } from "../_shared/customer-documents.ts"

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
    if (!/^Bearer\s+\S+$/i.test(authorization)) throw new InboxHttpError(401, "Sign in again to open customer documents.", "authentication_required")
    if (request.method === "GET") {
      const params = new URL(request.url).searchParams
      const customerId = params.get("customerId") ?? ""
      return jsonResponse(request, allowedOrigins, await listCustomerDocuments(authorization, customerId, {
        limit: Number(params.get("limit") || 20),
        offset: Number(params.get("offset") || 0),
      }))
    }
    if (request.method === "POST") {
      const body = await readJson(request)
      return jsonResponse(request, allowedOrigins, await createCustomerDocumentReadUrl(authorization, String(body.customerId ?? ""), String(body.documentId ?? "")))
    }
    throw new InboxHttpError(405, "That customer document operation is not available.", "method_not_allowed")
  } catch (error) {
    if (!(error instanceof InboxHttpError)) console.error("customer-documents unhandled error", error)
    return problemResponse(request, allowedOrigins, error)
  }
})
