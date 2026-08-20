import { edgeFetch } from "@/lib/api"
import { invalidateRegisterPages, readCachedRegisterPage, type RegisterSort } from "@/lib/application-data-api"
import { getSupabaseSession } from "@/lib/supabase"

export type RateMode = "lcl" | "fcl" | "air" | "road"
export type RateRecordType = "cost_tariff" | "sales_tariff"
export type RateStatus = "draft" | "active" | "expired" | "pending_approval"
export type RatePricingMode = "markup_percent" | "markup_amount" | "override"

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
  customerOrgId: string
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
  sendAfterApproval: boolean
  itemCount: number
  modeDetails: Record<string, string | number | boolean>
  charges: RateCharge[]
  updatedAt: string
  updatedBy: string
}

export type RatePackItem = {
  id: string
  packId: string
  sourceCostId: string
  sourceVersionId: string
  sourceName: string
  sourceMode: string
  sourceCarrier: string
  origin: string
  destination: string
  service: string
  cargo: string
  currency: string
  pricingMode: RatePricingMode
  markupPercent: number
  markupAmount: number
  sourceBuyTotal: number
  sellTotal: number
  charges: RateCharge[]
  sortOrder: number
}

export type RatePublication = {
  id: string
  packId: string
  status: string
  fileName: string
  sentAt: string
  sentTo: string[]
  errorMessage: string
  createdAt: string
}

export type RateCustomer = { id: string; name: string }

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

export type RatesSummary = {
  total: number
  attention: number
  active: number
  drafts: number
  costTariffs: number
  salesTariffs: number
  customerPacks: number
  pendingApproval: number
  customerSpecific: number
  expiringTariffs: number
  sourcesInReview: number
}

export type RatesWorkspace = {
  summary: RatesSummary
  attention: RateRecord[]
  recent: RateRecord[]
  imports: RateImportBatch[]
  quotes: RateQuote[]
  permissions: { canManage: boolean }
  integrations: { seaRates: { connected: false; reason: string } }
}

export type RateExpiryCounts = { expired: number; sevenDays: number; thirtyDays: number; activeCurrent: number; pendingApproval?: number }

export type RatesPageResult = {
  rows: RateRecord[]
  total: number
  expiryCounts: RateExpiryCounts
}

export type RatesPageInput = {
  scope: "costs" | "packs" | "contracts" | "tariffs"
  search?: string
  mode?: RateMode
  tariffType?: RateRecordType
  expiry?: "expired" | "7" | "30" | "active" | "pending_approval"
  sort?: RegisterSort | null
  limit: number
  offset: number
}

export type RateDetails = {
  rate: RateRecord
  versions: RateVersion[]
  audit: RateAuditEvent[]
  items: RatePackItem[]
  publications: RatePublication[]
}

export type RateRecordInput = Omit<RateRecord, "id" | "versionNo" | "marginAmount" | "marginPercent" | "updatedAt" | "updatedBy" | "itemCount"> & {
  id?: string
  importId?: string
  changeReason?: string
  itemCount?: number
}

export type RatePackItemInput = {
  sourceCostId: string
  pricingMode: RatePricingMode
  markupPercent?: number
  markupAmount?: number
  sellTotal?: number
  charges?: RateCharge[]
  reason?: string
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

export function searchRateCustomers(search = "", signal?: AbortSignal) {
  const parameters = new URLSearchParams()
  if (search.trim()) parameters.set("search", search.trim())
  return request<{ customers: RateCustomer[] }>(`/customers?${parameters.toString()}`, { signal })
}

export async function getRatesPage(input: RatesPageInput, signal?: AbortSignal) {
  const session = await getSupabaseSession()
  if (!session?.user) throw new RatesApiError("Sign in again to view rates.")
  const scope = input.scope === "contracts" ? "costs" : input.scope === "tariffs" ? "packs" : input.scope
  const normalized = {
    ...input,
    scope,
    search: input.search?.trim() || undefined,
    limit: Math.max(1, Math.min(input.limit, 50)),
    offset: Math.max(0, input.offset),
  }
  const parameters = new URLSearchParams({
    scope: normalized.scope,
    limit: String(normalized.limit),
    offset: String(normalized.offset),
    sort: normalized.sort?.id ?? "name",
    direction: normalized.sort?.direction ?? "asc",
  })
  if (normalized.search) parameters.set("search", normalized.search)
  if (normalized.mode) parameters.set("mode", normalized.mode)
  if (normalized.tariffType) parameters.set("tariffType", normalized.tariffType)
  if (normalized.expiry) parameters.set("expiry", normalized.expiry)
  const resource = `rates:page:${parameters.toString()}`
  return readCachedRegisterPage(session.user.id, resource, (requestSignal) => (
    request<RatesPageResult>(`/records?${parameters.toString()}`, { signal: requestSignal })
  ), signal)
}

export function getRateDetails(id: string, signal?: AbortSignal) {
  return request<RateDetails>(`/records/${encodeURIComponent(id)}`, { signal })
}

export async function saveRate(input: RateRecordInput) {
  const result = await request<{ rate: RateRecord }>(input.id ? `/records/${input.id}` : "/records", {
    method: input.id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  invalidateRegisterPages("rates:")
  return result
}

export async function expireRate(id: string) {
  const result = await request<{ rate: RateRecord }>(`/records/${id}/expire`, { method: "POST" })
  invalidateRegisterPages("rates:")
  return result
}

export async function saveRatePackItem(packId: string, input: RatePackItemInput, itemId?: string) {
  const result = await request<RateDetails>(itemId ? `/records/${packId}/items/${itemId}` : `/records/${packId}/items`, {
    method: itemId ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  invalidateRegisterPages("rates:")
  return result
}

export async function removeRatePackItem(packId: string, itemId: string) {
  const result = await request<RateDetails>(`/records/${packId}/items/${itemId}`, { method: "DELETE" })
  invalidateRegisterPages("rates:")
  return result
}

export async function approveRatePack(packId: string) {
  const result = await request<RateDetails>(`/records/${packId}/approve`, { method: "POST" })
  invalidateRegisterPages("rates:")
  return result
}

export async function generateRatePackDocument(packId: string) {
  const result = await request<RateDetails>(`/records/${packId}/generate`, { method: "POST" })
  invalidateRegisterPages("rates:")
  return result
}

export async function sendRatePackDocument(packId: string, publicationId?: string) {
  const result = await request<RateDetails>(`/records/${packId}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicationId }),
  })
  invalidateRegisterPages("rates:")
  return result
}

export async function stageRateImport(file: File, preview: unknown) {
  const formData = new FormData()
  formData.set("file", file)
  formData.set("preview", JSON.stringify(preview))
  const result = await request<{ importBatch: RateImportBatch }>("/imports", { method: "POST", body: formData })
  invalidateRegisterPages("rates:")
  return result
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
