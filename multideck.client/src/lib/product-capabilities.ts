import { supabase } from "@/lib/supabase"

export type ProductCapabilities = {
  icustoms: boolean
  rateManagement: boolean
  jenkarPhone: boolean
}

export const noProductCapabilities: ProductCapabilities = {
  icustoms: false,
  rateManagement: false,
  jenkarPhone: false,
}

export async function loadProductCapabilities(): Promise<ProductCapabilities> {
  if (!supabase) return noProductCapabilities
  const { data, error } = await supabase.rpc("multideck_product_capabilities")
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return noProductCapabilities
  const value = data as Record<string, unknown>
  return {
    icustoms: value.icustoms === true,
    rateManagement: value.rateManagement === true,
    jenkarPhone: value.jenkarPhone === true,
  }
}
