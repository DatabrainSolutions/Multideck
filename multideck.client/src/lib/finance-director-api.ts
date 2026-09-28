import { edgeFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"

/** One calendar month of posted results and approved cash, in base currency. */
export type FinanceMonth = {
  /** YYYY-MM */
  month: string
  revenue: number
  directCost: number
  overheads: number
  cashIn: number
  cashOut: number
}

export type FinanceSplit = {
  key: string
  revenue: number
  cost: number
  jobs: number
}

export type FinanceCustomer = {
  id: string
  name: string
  revenue: number
  invoices: number
  /** Sales attributed to this customer's jobs, the base for a margin. */
  linkedRevenue: number
  linkedCost: number
  jobs: number
}

export type FinanceAgeing = {
  total: number
  items: number
  buckets: { key: "current" | "1-30" | "31-60" | "61-90" | "90+"; amount: number }[]
}

export type FinanceDirectorDashboard = {
  legalEntityId: string
  legalEntity: string
  currency: string
  countryCode: string
  fromDate: string
  toDate: string
  asOf: string
  months: FinanceMonth[]
  overheadAccounts: { code: string; name: string; amount: number }[]
  customers: FinanceCustomer[]
  customerCount: number
  otherCustomerRevenue: number
  modes: FinanceSplit[]
  regions: FinanceSplit[]
  salesRevenue: number
  jobLinkedRevenue: number
  receivables: FinanceAgeing
  payables: FinanceAgeing
  /** Null when no bank account is linked to a nominal yet. */
  cashAtBank: number | null
  coverage: { postedBatches: number; lastPostedAt: string | null }
  generatedAt: string
}

export type FinanceLegalEntityOption = { id: string; name: string; currency: string | null }

export type FinanceDirectorResponse = {
  legalEntities: FinanceLegalEntityOption[]
  dashboard: FinanceDirectorDashboard | null
}

export class FinanceDirectorApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message)
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
const list = (value: unknown) => Array.isArray(value) ? value : []
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback
const amount = (value: unknown) => { const result = Number(value); return Number.isFinite(result) ? result : 0 }

function split(value: unknown): FinanceSplit {
  const row = record(value)
  return { key: text(row.key, "unassigned"), revenue: amount(row.revenue), cost: amount(row.cost), jobs: amount(row.jobs) }
}

const bucketKeys = new Set(["current", "1-30", "31-60", "61-90", "90+"])
function ageing(value: unknown): FinanceAgeing {
  const row = record(value)
  return {
    total: amount(row.total),
    items: amount(row.items),
    buckets: list(row.buckets)
      .map((entry) => { const bucket = record(entry); return { key: text(bucket.key) as FinanceAgeing["buckets"][number]["key"], amount: amount(bucket.amount) } })
      .filter((bucket) => bucketKeys.has(bucket.key)),
  }
}

export function normaliseFinanceDirectorDashboard(value: unknown): FinanceDirectorDashboard {
  const row = record(value)
  const coverage = record(row.coverage)
  return {
    legalEntityId: text(row.legalEntityId),
    legalEntity: text(row.legalEntity),
    currency: text(row.currency, "GBP").toUpperCase(),
    countryCode: text(row.countryCode),
    fromDate: text(row.fromDate),
    toDate: text(row.toDate),
    asOf: text(row.asOf),
    months: list(row.months).map((entry) => {
      const month = record(entry)
      return {
        month: text(month.month),
        revenue: amount(month.revenue),
        directCost: amount(month.directCost),
        overheads: amount(month.overheads),
        cashIn: amount(month.cashIn),
        cashOut: amount(month.cashOut),
      }
    }),
    overheadAccounts: list(row.overheadAccounts).map((entry) => {
      const account = record(entry)
      return { code: text(account.code), name: text(account.name), amount: amount(account.amount) }
    }),
    customers: list(row.customers).map((entry) => {
      const customer = record(entry)
      return {
        id: text(customer.id),
        name: text(customer.name, "Unnamed customer"),
        revenue: amount(customer.revenue),
        invoices: amount(customer.invoices),
        linkedRevenue: amount(customer.linkedRevenue),
        linkedCost: amount(customer.linkedCost),
        jobs: amount(customer.jobs),
      }
    }),
    customerCount: amount(row.customerCount),
    otherCustomerRevenue: amount(row.otherCustomerRevenue),
    modes: list(row.modes).map(split),
    regions: list(row.regions).map(split),
    salesRevenue: amount(row.salesRevenue),
    jobLinkedRevenue: amount(row.jobLinkedRevenue),
    receivables: ageing(row.receivables),
    payables: ageing(row.payables),
    cashAtBank: row.cashAtBank === null || row.cashAtBank === undefined ? null : amount(row.cashAtBank),
    coverage: { postedBatches: amount(coverage.postedBatches), lastPostedAt: typeof coverage.lastPostedAt === "string" ? coverage.lastPostedAt : null },
    generatedAt: text(row.generatedAt),
  }
}

export async function getFinanceDirectorDashboard(
  input: { entityId?: string; from: string; to: string; asOf: string },
  signal?: AbortSignal,
): Promise<FinanceDirectorResponse> {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new FinanceDirectorApiError("Sign in again to continue.", 401)
  const query = new URLSearchParams({ from: input.from, to: input.to, asOf: input.asOf })
  if (input.entityId) query.set("entityId", input.entityId)
  const response = await edgeFetch("finance-director-dashboard", `?${query}`, session.access_token, { signal })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new FinanceDirectorApiError(error?.detail ?? "The finance dashboard could not be loaded.", response.status)
  }
  const result = record(await response.json())
  return {
    legalEntities: list(result.legalEntities).map((entry) => {
      const entity = record(entry)
      return { id: text(entity.id), name: text(entity.name), currency: typeof entity.currency === "string" ? entity.currency : null }
    }),
    dashboard: result.dashboard ? normaliseFinanceDirectorDashboard(result.dashboard) : null,
  }
}
