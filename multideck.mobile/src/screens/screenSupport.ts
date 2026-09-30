import type { WarehouseFacility, WarehouseMobileApi } from "@/warehouse/api"
import { wt } from "@/warehouse/i18n"

export type ScreenProps = { api: WarehouseMobileApi; facility: WarehouseFacility; onBack: () => void }

export function message(error: unknown) {
  return error instanceof Error ? error.message : wt("serviceError")
}

export function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)))
}
