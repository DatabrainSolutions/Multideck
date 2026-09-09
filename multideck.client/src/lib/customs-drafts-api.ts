import { createExportDeclarationItem, createStandaloneDeclarationDraft, type DeclarationDirection, type ExportDeclarationItem, type StandaloneExportDraft } from "@/lib/customs-declaration"
import { invalidateRegisterPages, readCachedRegisterPage, type RegisterSort } from "@/lib/application-data-api"
import type { UserProfilePhoto } from "@/lib/profile-photo"
import { getSupabaseSession, supabase } from "@/lib/supabase"

type SavedItemRow = {
  CUSTI_ItemNumber: number
  CUSTI_ItemPayloadJSON: unknown
}

const customsDeclarationItemReadLimit = 1_000

type SaveDraftResultRow = {
  declaration_id: string
  local_reference_number: string
  updated_at: string
}

export type CustomsDraftSummary = {
  id: string
  submittedBy: string | null
  assignmentSupported: boolean
  assignedUserId: string | null
  assignee: CustomsAssignee | null
  jobId: string | null
  jobReference: string | null
  bookingReference: string | null
  customerName: string | null
  route: string | null
  reference: string
  traderReference: string | null
  status: string
  destinationCountry: string | null
  amount: number | null
  currency: string | null
  itemCount: number
  createdAt: string
  updatedAt: string
}

export type CustomsAssignee = {
  id: string
  displayName: string
  firstName: string | null
  lastName: string | null
  email: string
  jobTitle: string | null
  canWorkCustoms: boolean
  profilePhoto: UserProfilePhoto | null
}

export type CustomsAssigneePage = {
  users: CustomsAssignee[]
  total: number
  limit: number
  offset: number
}

export type CustomsDeclarationScope = "standalone" | "job-related"

export type SaveCustomsDraftResult = {
  id: string
  reference: string
  updatedAt: string
}

export type CustomsDeclarationRegisterPage = {
  rows: CustomsDraftSummary[]
  total: number
  availableTotal: number
  facets: { statuses: string[]; destinations: string[] }
}

export type CustomsDeclarationRegisterInput = {
  search?: string
  status?: string
  destination?: string
  sort?: RegisterSort | null
  limit: number
  offset: number
}

export function invalidateCustomsDeclarationPages() {
  invalidateRegisterPages("customs:declarations:")
}

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured for this App workspace.")
  return supabase
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export async function listCustomsDeclarationDraftsPage(
  direction: DeclarationDirection,
  scope: CustomsDeclarationScope,
  input: CustomsDeclarationRegisterInput,
  signal?: AbortSignal,
): Promise<CustomsDeclarationRegisterPage> {
  const client = requireSupabase()
  const session = await getSupabaseSession()
  if (!session) throw new Error("Sign in again to view Customs declarations.")
  const normalized = {
    search: input.search?.trim() || undefined,
    status: input.status?.trim() || undefined,
    destination: input.destination?.trim().toUpperCase() || undefined,
    sort: input.sort ?? { id: "lastSaved", direction: "desc" as const },
    limit: Math.max(1, Math.min(input.limit, 50)),
    offset: Math.max(0, input.offset),
  }
  const resource = `customs:declarations:${direction}:${scope}:${JSON.stringify(normalized)}`
  return readCachedRegisterPage(session.user.id, resource, async (requestSignal) => {
    const { data, error } = await client.rpc("multideck_customs_declaration_register_page", {
      p_direction: direction,
      p_scope: scope,
      p_search: normalized.search ?? null,
      p_status: normalized.status ?? null,
      p_destination: normalized.destination ?? null,
      p_sort: normalized.sort.id,
      p_sort_direction: normalized.sort.direction,
      p_limit: normalized.limit,
      p_offset: normalized.offset,
    }).abortSignal(requestSignal)
    if (error) throw error
    const response = record(data)
    const facets = record(response.facets)
    const rows = Array.isArray(response.rows) ? response.rows as Array<Omit<CustomsDraftSummary, "assignee" | "assignmentSupported"> & { assignedUserId?: string | null }> : []
    const assignees = await getCustomsDeclarationAssigneesByIds(
      rows.map((row) => row.assignedUserId).filter((value): value is string => Boolean(value)),
      requestSignal,
    )
    const assigneeById = new Map(assignees.map((assignee) => [assignee.id, assignee]))
    return {
      rows: rows.map((row) => ({
        ...row,
        assignmentSupported: Object.prototype.hasOwnProperty.call(row, "assignedUserId"),
        assignedUserId: row.assignedUserId ?? null,
        assignee: row.assignedUserId ? assigneeById.get(row.assignedUserId) ?? null : null,
      })),
      total: Number(response.total ?? 0),
      availableTotal: Number(response.availableTotal ?? 0),
      facets: {
        statuses: Array.isArray(facets.statuses) ? facets.statuses.map(String) : [],
        destinations: Array.isArray(facets.destinations) ? facets.destinations.map(String) : [],
      },
    }
  }, signal)
}

export async function listCustomsDeclarationAssignees(
  search = "",
  limit = 50,
  offset = 0,
  signal?: AbortSignal,
): Promise<CustomsAssigneePage> {
  const client = requireSupabase()
  let query = client.rpc("multideck_customs_assignment_users_page", {
    p_search: search.trim().slice(0, 200) || null,
    p_limit: Math.max(1, Math.min(Math.trunc(limit), 50)),
    p_offset: Math.max(0, Math.trunc(offset)),
  })
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) throw error
  const response = record(data)
  return {
    users: Array.isArray(response.users) ? response.users as CustomsAssignee[] : [],
    total: Number(response.total ?? 0),
    limit: Number(response.limit ?? limit),
    offset: Number(response.offset ?? offset),
  }
}

export async function getCustomsDeclarationAssigneesByIds(
  userIds: string[],
  signal?: AbortSignal,
): Promise<CustomsAssignee[]> {
  const ids = [...new Set(userIds.filter(Boolean))].slice(0, 50)
  if (!ids.length) return []
  const client = requireSupabase()
  let query = client.rpc("multideck_customs_assignees_by_ids", { p_user_ids: ids })
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) throw error
  return Array.isArray(data) ? data as CustomsAssignee[] : []
}

export async function getCustomsDeclarationAssignment(declarationId: string): Promise<CustomsAssignee | null> {
  const client = requireSupabase()
  const { data, error } = await client
    .from("Customs_Declarations")
    .select("CUST_AssignedUserID")
    .eq("CUST_id", declarationId)
    .eq("CUST_IsDeleted", false)
    .single()
  if (error) throw error
  const assignedUserId = data.CUST_AssignedUserID as string | null
  if (!assignedUserId) return null
  return (await getCustomsDeclarationAssigneesByIds([assignedUserId]))[0] ?? null
}

export async function assignCustomsDeclaration(declarationId: string, assignedUserId: string | null) {
  const client = requireSupabase()
  const { data, error } = await client.rpc("assign_customs_declaration", {
    p_declaration_id: declarationId,
    p_assigned_user_id: assignedUserId,
  })
  if (error) throw error
  invalidateCustomsDeclarationPages()
  return record(data)
}

export async function loadStandaloneDeclarationDraft(
  declarationId: string,
  direction: DeclarationDirection,
  scope: CustomsDeclarationScope = "standalone",
): Promise<StandaloneExportDraft> {
  const client = requireSupabase()
  const declarationQuery = client
    .from("Customs_Declarations")
    .select("CUST_id, CUST_LocalReferenceNumber, CUST_iCustomsExternalID, CUST_GenericPayloadJSON")
    .eq("CUST_id", declarationId)
    .eq("CUST_Direction", direction)
    .eq("CUST_DeclarationKind", `cds_${direction}`)
    .eq("CUST_IsDeleted", false)
  const scopedDeclarationQuery = scope === "standalone"
    ? declarationQuery.is("CUST_JobID", null)
    : declarationQuery.not("CUST_JobID", "is", null)

  const [{ data: declaration, error: declarationError }, { data: itemRows, error: itemsError }] = await Promise.all([
    scopedDeclarationQuery.single(),
    client
      .from("Customs_Items")
      .select("CUSTI_ItemNumber, CUSTI_ItemPayloadJSON")
      .eq("CUSTI_CustomsID", declarationId)
      .order("CUSTI_ItemNumber", { ascending: true })
      .limit(customsDeclarationItemReadLimit),
  ])

  if (declarationError) throw declarationError
  if (itemsError) throw itemsError

  const saved = record(declaration.CUST_GenericPayloadJSON)
  const items = ((itemRows ?? []) as SavedItemRow[]).map((row, index) => {
    const item = record(row.CUSTI_ItemPayloadJSON)
    return {
      ...createExportDeclarationItem(index + 1),
      ...item,
      id: typeof item.id === "string" ? item.id : `item-${row.CUSTI_ItemNumber}`,
    } as ExportDeclarationItem
  })

  return {
    ...createStandaloneDeclarationDraft(direction),
    ...saved,
    multideckReference: declaration.CUST_LocalReferenceNumber ?? declaration.CUST_id,
    iCustomsCorrelationId: declaration.CUST_iCustomsExternalID,
    items: items.length ? items : [createExportDeclarationItem()],
  } as StandaloneExportDraft
}

export async function reopenRejectedCustomsDeclaration(declarationId: string) {
  const client = requireSupabase()
  const { error } = await client.rpc("reopen_rejected_customs_declaration", {
    p_declaration_id: declarationId,
  })
  if (error) throw error
  invalidateCustomsDeclarationPages()
}

export async function saveStandaloneDeclarationDraft(
  draft: StandaloneExportDraft,
  declarationId?: string,
): Promise<SaveCustomsDraftResult> {
  const client = requireSupabase()
  const { data, error } = await client
    .rpc(draft.direction === "import" ? "save_customs_import_draft" : "save_customs_export_draft", {
      p_declaration_id: declarationId ?? null,
      p_draft: draft,
    })
    .single()

  if (error) throw error

  const saved = data as SaveDraftResultRow
  invalidateCustomsDeclarationPages()
  return {
    id: saved.declaration_id,
    reference: saved.local_reference_number,
    updatedAt: saved.updated_at,
  }
}

export async function saveJobRelatedDeclarationDraft(
  declarationId: string,
  draft: StandaloneExportDraft,
): Promise<SaveCustomsDraftResult> {
  const client = requireSupabase()
  const { data, error } = await client.rpc("save_job_customs_draft", {
    p_declaration_id: declarationId,
    p_draft: draft,
  }).single()
  if (error) throw error
  const saved = data as SaveDraftResultRow
  invalidateCustomsDeclarationPages()
  return { id: saved.declaration_id, reference: saved.local_reference_number, updatedAt: saved.updated_at }
}

export const loadStandaloneExportDraft = (declarationId: string) => loadStandaloneDeclarationDraft(declarationId, "export")
export const loadStandaloneImportDraft = (declarationId: string) => loadStandaloneDeclarationDraft(declarationId, "import")
export const saveStandaloneExportDraft = saveStandaloneDeclarationDraft
