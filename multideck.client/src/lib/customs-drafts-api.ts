import { createExportDeclarationItem, createStandaloneExportDraft, type ExportDeclarationItem, type StandaloneExportDraft } from "@/lib/customs-declaration"
import { supabase } from "@/lib/supabase"

type SavedDraftRow = {
  CUST_id: string
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

export async function listStandaloneExportDrafts(): Promise<CustomsDraftSummary[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from("Customs_Declarations")
    .select("CUST_id, CUST_LocalReferenceNumber, CUST_TraderReference, CUST_Status, CUST_CountryOfDestinationCodeSnapshot, CUST_InvoiceAmount, CUST_InvoiceCurrencyCodeSnapshot, CUST_GenericPayloadJSON, CUST_CreatedAt, CUST_UpdatedAt")
    .eq("CUST_Direction", "export")
    .eq("CUST_DeclarationKind", "cds_export")
    .eq("CUST_IsDeleted", false)
    .order("CUST_UpdatedAt", { ascending: false })

  if (error) throw error

  return ((data ?? []) as SavedDraftRow[]).map((row) => {
    const payload = record(row.CUST_GenericPayloadJSON)
    return {
      id: row.CUST_id,
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

export async function loadStandaloneExportDraft(declarationId: string): Promise<StandaloneExportDraft> {
  const client = requireSupabase()
  const [{ data: declaration, error: declarationError }, { data: itemRows, error: itemsError }] = await Promise.all([
    client
      .from("Customs_Declarations")
      .select("CUST_id, CUST_LocalReferenceNumber, CUST_iCustomsExternalID, CUST_GenericPayloadJSON")
      .eq("CUST_id", declarationId)
      .eq("CUST_Status", "draft")
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
    ...createStandaloneExportDraft(),
    ...saved,
    multideckReference: declaration.CUST_LocalReferenceNumber ?? declaration.CUST_id,
    iCustomsCorrelationId: declaration.CUST_iCustomsExternalID,
    items: items.length ? items : [createExportDeclarationItem()],
  } as StandaloneExportDraft
}

export async function saveStandaloneExportDraft(
  draft: StandaloneExportDraft,
  declarationId?: string,
): Promise<SaveCustomsDraftResult> {
  const client = requireSupabase()
  const { data, error } = await client
    .rpc("save_customs_export_draft", {
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
