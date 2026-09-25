
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

type Json = Record<string, unknown>

const missingReadModel = (error: { code?: string } | null | undefined) => ["42883", "PGRST202"].includes(error?.code ?? "")
const text = (value: unknown, maximum = 120) => typeof value === "string" ? value.trim().slice(0, maximum) : ""

function pageRequest(payload: Json) {
  const sort = typeof payload.documentSort === "object" && payload.documentSort ? payload.documentSort as Json : {}
  const requestedLimit = Number(payload.documentLimit)
  const requestedOffset = Number(payload.documentOffset)
  const sortColumn = text(sort.id, 30)
  return {
    search: text(payload.documentSearch),
    sortColumn: ["document", "job", "customer", "created", "status"].includes(sortColumn) ? sortColumn : "created",
    sortDirection: text(sort.direction, 4).toLowerCase() === "asc" ? "asc" : "desc",
    limit: Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 50)) : 20,
    offset: Number.isInteger(requestedOffset) ? Math.max(0, requestedOffset) : 0,
  }
}

function compatibilityPage(workspace: Json, page: ReturnType<typeof pageRequest>) {
  const documents = Array.isArray(workspace.generatedDocuments) ? workspace.generatedDocuments as Json[] : []
  const needle = page.search.toLocaleLowerCase()
  const filtered = needle ? documents.filter((document) => [
    document.fileName,
    document.templateName,
    document.targetReference,
    document.customerName,
  ].some((value) => text(value, 500).toLocaleLowerCase().includes(needle))) : documents
  const field = { document: "fileName", job: "targetReference", customer: "customerName", created: "createdAt", status: "status" }[page.sortColumn] ?? "createdAt"
  const rows = [...filtered].sort((left, right) => {
    const compared = String(left[field] ?? "").localeCompare(String(right[field] ?? ""), undefined, { numeric: true, sensitivity: "base" })
    return page.sortDirection === "asc" ? compared : -compared
  })
  return { rows: rows.slice(page.offset, page.offset + page.limit), total: rows.length, offset: page.offset, limit: page.limit }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) })
  if (request.method !== "POST") return jsonResponse(request, { error: "Method not allowed" }, 405)

  try {
    const { admin, userId } = await authenticateRequest(request)
    const payload = await request.json().catch(() => ({})) as Json
    const page = pageRequest(payload)
    const readDocumentPage = () => admin.schema("document_api").rpc("generated_documents_page", {
      caller_auth_user_id: userId,
      p_search: page.search || null,
      p_sort_column: page.sortColumn,
      p_sort_direction: page.sortDirection,
      p_limit: page.limit,
      p_offset: page.offset,
    })

    if (payload.action === "documents") {
      const documentPage = await readDocumentPage()
      if (!documentPage.error && documentPage.data) return jsonResponse(request, documentPage.data)
      if (!missingReadModel(documentPage.error)) throw documentPage.error ?? new Error("Document history returned no data")
      throw new Error("Paged document history is still being prepared. Try again shortly.")
    }

    const [overview, documentPage] = await Promise.all([
      admin.schema("document_api").rpc("workspace_overview", { caller_auth_user_id: userId }),
      readDocumentPage(),
    ])
    if (overview.error && !missingReadModel(overview.error)) throw overview.error
    if (documentPage.error && !missingReadModel(documentPage.error)) throw documentPage.error

    if (overview.error || !overview.data || documentPage.error || !documentPage.data) {
      throw new Error("Paged document workspace data is still being prepared. Try again shortly.")
    }
    const workspace = overview.data as Json
    const resolvedPage = documentPage.data as Json

    const templates = Array.isArray(workspace.templates) ? workspace.templates as Array<Record<string, unknown>> : []
    return jsonResponse(request, {
      ...workspace,
      templates: templates.map((template) => ({ ...template, contentSections })),
      generatedDocuments: Array.isArray(resolvedPage.rows) ? resolvedPage.rows : [],
      generatedDocumentTotal: Number(resolvedPage.total) || 0,
      generatedDocumentOffset: Number(resolvedPage.offset) || 0,
      generatedDocumentLimit: Number(resolvedPage.limit) || page.limit,
    })
  } catch (error) {
    const functionError = toFunctionError(error)
    console.error("Secure document workspace failed", { status: functionError.status, reason: functionError.auditMessage })
    return jsonResponse(request, { error: functionError.clientMessage }, functionError.status)
  }
})
