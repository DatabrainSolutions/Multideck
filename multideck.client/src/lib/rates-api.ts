import { edgeFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"

export type RateMode = "lcl" | "fcl" | "air" | "road"
export type RateRecordType = "contract" | "cost_tariff" | "sales_tariff"
export type RateStatus = "draft" | "active" | "expired"

export type RateCharge = {
  id?: string
  description: string
  basis: string
  buyAmount: number
  sellAmount: number
  minimumAmount?: number
}

export type RateRecord = {
  id: string
  code: string
  name: string
  type: RateRecordType
  status: RateStatus
  mode: RateMode
  carrier: string
  supplier: string
  customer: string
  origin: string
  destination: string
  cargo: string
  service: string
  validFrom: string
  validTo: string
  currency: string
  buyTotal: number
  sellTotal: number
  marginAmount: number
  marginPercent: number | null
  versionNo: number
  sourceType: string
  sourceReference: string
  schedule: "weekly" | "monthly" | "ad_hoc"
  modeDetails: Record<string, string | number | boolean>
  charges: RateCharge[]
  updatedAt: string
  updatedBy: string
}

export type RateVersion = {
  id: string
  rateId: string
  versionNo: number
  status: string
  effectiveFrom: string
  effectiveTo: string
  changeReason: string
  sourceReference: string
  createdAt: string
  createdBy: string
}

export type RateAuditEvent = {
  id: string
  rateId: string | null
  action: string
  message: string
  createdAt: string
  createdBy: string
}

export type RateImportBatch = {
  id: string
  fileName: string
  sourceType: string
  status: string
  rowCount: number
  errorCount: number
  warningCount: number
  createdAt: string
}

export type RateQuote = {
  id: string
  reference: string
  customer: string
  origin: string
  destination: string
  mode: string
  equipment: string
  currency: string
}

export type RateOption = RateRecord & { matchScore: number; matchReasons: string[] }

export type RatesWorkspace = {
  rates: RateRecord[]
  versions: RateVersion[]
  audit: RateAuditEvent[]
  imports: RateImportBatch[]
  quotes: RateQuote[]
  permissions: { canManage: boolean }
  integrations: { seaRates: { connected: false; reason: string } }
}

export type RateRecordInput = Omit<RateRecord, "id" | "versionNo" | "marginAmount" | "marginPercent" | "updatedAt" | "updatedBy"> & {
  id?: string
  importId?: string
  changeReason?: string
}

export class RatesApiError extends Error {}

async function parseError(response: Response) {
  try {
    const body = await response.json()
    return body.detail || body.message || body.title || `Rates request failed (${response.status}).`
  } catch {
    return `Rates request failed (${response.status}).`
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new RatesApiError("Sign in again to manage rates.")
  const response = await edgeFetch("rates-api", path, session.access_token, init)
  if (!response.ok) throw new RatesApiError(await parseError(response))
  return response.json() as Promise<T>
}

export function getRatesWorkspace() {
  return request<RatesWorkspace>("/workspace")
}

export function saveRate(input: RateRecordInput) {
  return request<{ rate: RateRecord }>(input.id ? `/records/${input.id}` : "/records", {
    method: input.id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
}

export function expireRate(id: string) {
  return request<{ rate: RateRecord }>(`/records/${id}/expire`, { method: "POST" })
}

export function stageRateImport(file: File, preview: unknown) {
  const formData = new FormData()
  formData.set("file", file)
  formData.set("preview", JSON.stringify(preview))
  return request<{ importBatch: RateImportBatch }>("/imports", { method: "POST", body: formData })
}

export function getRateOptions(quoteId: string) {
  return request<{ quote: RateQuote; options: RateOption[]; seaRates: { connected: false; reason: string } }>(`/quotes/${quoteId}/options`)
}

export function applyRateToQuote(quoteId: string, rateId: string) {
  return request<{ quoteId: string; rateId: string; snapshotId: string }>(`/quotes/${quoteId}/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rateId }),
  })
}
