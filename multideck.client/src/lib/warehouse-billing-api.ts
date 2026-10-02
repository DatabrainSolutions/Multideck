import { supabase } from "@/lib/supabase"

export type WarehouseBillingCycle = "weekly" | "monthly"

export type WarehouseBillingSettings = {
  timeZone: string
  cutoffTime: string
  cycle: WarehouseBillingCycle
  weekStart: number
  monthStart: number
  version: number
  isDefault: boolean
  updatedAt: string | null
  canManage: boolean
  lastStockRecord: { stockDate: string; capturedAt: string; balances: number } | null
}

export type WarehouseChargeLine = {
  stage: "receipt" | "dispatch" | "storage"
  code: string
  name: string
  basis: "pallet" | "unit" | "m3" | "kg" | "fixed"
  period: "once" | "night" | "day" | "week"
  reference: string | null
  orderNumber: string | null
  date: string
  quantity: number
  periods: number
  rate: number
  minimum: number
  currency: string
  source: "default" | "customer"
  amount: number
  minimumApplied: boolean
}

export type WarehouseChargeStatement = {
  customer: { id: string; name: string | null }
  period: { start: string; end: string; cycle: WarehouseBillingCycle; previousStart: string; nextStart: string; isCurrent: boolean; isComplete: boolean }
  settings: { timeZone: string; cutoffTime: string; isDefault: boolean }
  nights: { expected: number; recorded: number }
  lines: WarehouseChargeLine[]
  totals: { currency: string; amount: number }[]
  warnings: string[]
  generatedAt: string
}

const unavailable = "Warehouse billing is not available on this workspace yet. The billing database update needs to be installed."

async function rpc<T>(name: string, args: Record<string, unknown>, fallback: string): Promise<T> {
  if (!supabase) throw new Error("The workspace connection is unavailable.")
  const { data, error } = await supabase.rpc(name, args)
  if (error) {
    if (["PGRST202", "42883"].includes(error.code)) throw new Error(unavailable)
    throw new Error(error.message || fallback)
  }
  return data as T
}

export function getWarehouseBillingSettings() {
  return rpc<WarehouseBillingSettings>("warehouse_billing_settings", { p_settings: null, p_expected_version: null }, "Billing settings could not be loaded. Try again.")
}

export function saveWarehouseBillingSettings(settings: Pick<WarehouseBillingSettings, "timeZone" | "cutoffTime" | "cycle" | "weekStart" | "monthStart">, version: number) {
  return rpc<WarehouseBillingSettings>("warehouse_billing_settings", { p_settings: settings, p_expected_version: version }, "Billing settings could not be saved. Try again.")
}

export function listWarehouseChargeCustomers(search = "") {
  return rpc<{ id: string; name: string }[]>("warehouse_charge_customers", { p_search: search.trim() || null, p_limit: 50 }, "Customers could not be loaded. Try again.")
}

export function getWarehouseChargeStatement(customerOrgId: string, periodStart: string | null) {
  return rpc<WarehouseChargeStatement>("warehouse_charge_statement", { p_customer_org_id: customerOrgId, p_period_start: periodStart }, "Charges could not be calculated. Try again.")
}
