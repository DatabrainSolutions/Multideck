import { createExportDeclarationItem, createStandaloneDeclarationDraft, type DeclarationDirection, type ExportDeclarationItem, type StandaloneExportDraft } from "@/lib/customs-declaration"
import { supabase } from "@/lib/supabase"

type SavedDraftRow = {
  CUST_id: string
  CUST_CreatedBy: string | null
  CUST_JobID: string | null
  CUST_LocalReferenceNumber: string | null
  CUST_TraderReference: string | null
  CUST_Status: string
  CUST_CountryOfDestinationCodeSnapshot: string | null
  CUST_InvoiceAmount: number | string | null
  CUST_InvoiceCurrencyCodeSnapshot: string | null
  CUST_GenericPayloadJSON: unknown
  CUST_CreatedAt: string
  CUST_UpdatedAt: string
}

type LiveBookingRow = {
  Job_ID: string
  Job_Reference: string | null
  Booking_Reference: string | null
  Customer_Name: string | null
  Route: string | null
}

type SavedItemRow = {
  CUSTI_ItemNumber: number
  CUSTI_ItemPayloadJSON: unknown
}

type SaveDraftResultRow = {
  declaration_id: string
  local_reference_number: string
  updated_at: string
}

export type CustomsDraftSummary = {
  id: string
  submittedBy: string | null
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

export type CustomsDeclarationScope = "standalone" | "job-related"

export type SaveCustomsDraftResult = {
  id: string
  reference: string
  updatedAt: string
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

function numeric(value: number | string | null) {
  if (value === null || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function listCustomsDeclarationDrafts(
  direction: DeclarationDirection,
  scope: CustomsDeclarationScope,
): Promise<CustomsDraftSummary[]> {
  const client = requireSupabase()
  const query = client
    .from("Customs_Declarations")
    .select("CUST_id, CUST_CreatedBy, CUST_JobID, CUST_LocalReferenceNumber, CUST_TraderReference, CUST_Status, CUST_CountryOfDestinationCodeSnapshot, CUST_InvoiceAmount, CUST_InvoiceCurrencyCodeSnapshot, CUST_GenericPayloadJSON, CUST_CreatedAt, CUST_UpdatedAt")
    .eq("CUST_Direction", direction)
    .eq("CUST_DeclarationKind", `cds_${direction}`)
    .eq("CUST_IsDeleted", false)
    .order("CUST_UpdatedAt", { ascending: false })

  const { data, error } = scope === "standalone"
    ? await query.is("CUST_JobID", null)
    : await query.not("CUST_JobID", "is", null)

  if (error) throw error

  const savedDrafts = (data ?? []) as SavedDraftRow[]
  const jobIds = savedDrafts.flatMap((draft) => draft.CUST_JobID ? [draft.CUST_JobID] : [])
  const linkedJobs = new Map<string, LiveBookingRow>()

  if (jobIds.length) {
    const { data: jobRows, error: jobsError } = await client
      .from("App_Live_Bookings")
      .select("Job_ID, Job_Reference, Booking_Reference, Customer_Name, Route")
      .in("Job_ID", jobIds)

    if (jobsError) {
      console.warn("Linked Customs jobs could not be loaded.", jobsError)
    } else {
      for (const job of (jobRows ?? []) as LiveBookingRow[]) linkedJobs.set(job.Job_ID, job)
    }
  }

  return savedDrafts.map((row) => {
    const payload = record(row.CUST_GenericPayloadJSON)
    const job = row.CUST_JobID ? linkedJobs.get(row.CUST_JobID) : null
    return {
      id: row.CUST_id,
      submittedBy: row.CUST_CreatedBy,
      jobId: row.CUST_JobID,
      jobReference: job?.Job_Reference ?? null,
      bookingReference: job?.Booking_Reference ?? null,
      customerName: job?.Customer_Name ?? null,
      route: job?.Route ?? null,
      reference: row.CUST_LocalReferenceNumber ?? row.CUST_id,
      traderReference: row.CUST_TraderReference,
      status: row.CUST_Status,
      destinationCountry: row.CUST_CountryOfDestinationCodeSnapshot,
      amount: numeric(row.CUST_InvoiceAmount),
      currency: row.CUST_InvoiceCurrencyCodeSnapshot,
      itemCount: Array.isArray(payload.items) ? payload.items.length : 0,
      createdAt: row.CUST_CreatedAt,
      updatedAt: row.CUST_UpdatedAt,
    }
  })
}

export const listStandaloneDeclarationDrafts = (direction: DeclarationDirection) => listCustomsDeclarationDrafts(direction, "standalone")
export const listJobRelatedDeclarationDrafts = (direction: DeclarationDirection) => listCustomsDeclarationDrafts(direction, "job-related")

export async function loadStandaloneDeclarationDraft(declarationId: string, direction: DeclarationDirection): Promise<StandaloneExportDraft> {
  const client = requireSupabase()
  const [{ data: declaration, error: declarationError }, { data: itemRows, error: itemsError }] = await Promise.all([
    client
      .from("Customs_Declarations")
      .select("CUST_id, CUST_LocalReferenceNumber, CUST_iCustomsExternalID, CUST_GenericPayloadJSON")
      .eq("CUST_id", declarationId)
      .eq("CUST_Direction", direction)
      .eq("CUST_DeclarationKind", `cds_${direction}`)
      .is("CUST_JobID", null)
      .eq("CUST_IsDeleted", false)
      .single(),
    client
      .from("Customs_Items")
      .select("CUSTI_ItemNumber, CUSTI_ItemPayloadJSON")
      .eq("CUSTI_CustomsID", declarationId)
      .order("CUSTI_ItemNumber", { ascending: true }),
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
  return {
    id: saved.declaration_id,
    reference: saved.local_reference_number,
    updatedAt: saved.updated_at,
  }
}

export const listStandaloneExportDrafts = () => listStandaloneDeclarationDrafts("export")
export const listStandaloneImportDrafts = () => listStandaloneDeclarationDrafts("import")
export const loadStandaloneExportDraft = (declarationId: string) => loadStandaloneDeclarationDraft(declarationId, "export")
export const loadStandaloneImportDraft = (declarationId: string) => loadStandaloneDeclarationDraft(declarationId, "import")
export const saveStandaloneExportDraft = saveStandaloneDeclarationDraft
