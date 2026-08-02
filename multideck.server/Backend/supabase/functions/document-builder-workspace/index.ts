
import {
  authenticateRequest,
  corsHeaders,
  jsonResponse,
  toFunctionError,
} from "../_shared/document-functions.ts"

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) })
  if (request.method !== "POST") return jsonResponse(request, { error: "Method not allowed" }, 405)

  try {
    const { admin, userId } = await authenticateRequest(request)
    const { data, error } = await admin
      .schema("document_api")
      .rpc("workspace", { caller_auth_user_id: userId })
    if (error || !data) throw error ?? new Error("Document workspace returned no data")
    return jsonResponse(request, data)
  } catch (error) {
    const functionError = toFunctionError(error)
    console.error("Secure document workspace failed", { status: functionError.status, reason: functionError.auditMessage })
    return jsonResponse(request, { error: functionError.clientMessage }, functionError.status)
  }
})

