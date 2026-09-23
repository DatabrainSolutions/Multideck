import { supabase } from "@/lib/supabase"
import { validateWarehouseRates, type WarehouseRate, type WarehousePricingState } from "@/lib/warehouse-pricing"

export async function warehousePricingCard(customerOrgId: string | null, save?: { rates: WarehouseRate[]; version: number; defaultVersion: number }): Promise<WarehousePricingState> {
  if (!supabase) throw new Error("The workspace connection is unavailable.")
  if (save) {
    const error = validateWarehouseRates(save.rates)
    if (error) throw new Error(error)
  }
  const { data, error } = await supabase.rpc("warehouse_pricing_card", {
    p_customer_org_id: customerOrgId, p_rates: save?.rates ?? null,
    p_expected_version: save?.version ?? null, p_expected_default_version: save?.defaultVersion ?? null,
  })
  if (error) {
    if (["PGRST202", "42883"].includes(error.code)) throw new Error("Warehouse pricing is not available on this workspace yet. The pricing database update needs to be installed.")
    throw new Error(error.message || "Warehouse pricing could not be loaded. Try again.")
  }
  return data as WarehousePricingState
}
