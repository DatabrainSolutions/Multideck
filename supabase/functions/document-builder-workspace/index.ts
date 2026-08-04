
import {
  authenticateRequest,
  corsHeaders,
  jsonResponse,
  toFunctionError,
} from "../_shared/document-functions.ts"

const contentSections = [
  { code: "job", label: "Job details", description: "Reference, dates, status, mode, origin and destination.", required: true, defaultSelected: true },
  { code: "customer", label: "Customer", description: "Customer name and approved address details.", required: false, defaultSelected: true },
  { code: "shipper", label: "Shipper", description: "Shipper name and approved address details.", required: false, defaultSelected: true },
  { code: "consignee", label: "Consignee", description: "Consignee name and approved address details.", required: false, defaultSelected: true },
  { code: "cargo", label: "Cargo", description: "Goods, packages, weights, volume and commodity details.", required: false, defaultSelected: true },
  { code: "routing", label: "Routing", description: "Route legs, planned dates and transport references.", required: false, defaultSelected: true },
] as const

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) })
  if (request.method !== "POST") return jsonResponse(request, { error: "Method not allowed" }, 405)

  try {
    const { admin, userId } = await authenticateRequest(request)
    const { data, error } = await admin
      .schema("document_api")
      .rpc("workspace", { caller_auth_user_id: userId })
    if (error || !data) throw error ?? new Error("Document workspace returned no data")
    const workspace = data as { templates?: Array<Record<string, unknown>> }
    return jsonResponse(request, {
      ...workspace,
      templates: (workspace.templates ?? []).map((template) => ({ ...template, contentSections })),
    })
  } catch (error) {
    const functionError = toFunctionError(error)
    console.error("Secure document workspace failed", { status: functionError.status, reason: functionError.auditMessage })
    return jsonResponse(request, { error: functionError.clientMessage }, functionError.status)
  }
})
