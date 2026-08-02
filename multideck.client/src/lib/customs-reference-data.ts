import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export const customsCatalogCodes = [
  "declaration_category",
  "declaration_type",
  "representation_type",
  "country",
  "currency",
  "transport_mode",
  "goods_location_type",
  "container_indicator",
  "previous_document_category",
  "previous_document_type",
  "transaction_nature",
  "package_kind",
  "procedure_code",
  "additional_procedure_code",
] as const

export type CustomsCatalogCode = typeof customsCatalogCodes[number]

export type CustomsReferenceOption = {
  code: string
  name: string
  description: string | null
}

export type CustomsReferenceData = Record<CustomsCatalogCode, CustomsReferenceOption[]>

type CatalogueRow = {
  catalog_code: string
  option_code: string
  option_name: string
  option_description: string | null
  direction: string
  sort_order: number
}

export function createEmptyCustomsReferenceData(): CustomsReferenceData {
  const catalogues = {} as CustomsReferenceData
  for (const catalogue of customsCatalogCodes) catalogues[catalogue] = []
  return catalogues
}

export async function loadCustomsReferenceData(direction: "export" | "import") {
  if (!supabase) throw new Error("Supabase is not configured for this App workspace.")

  const { data, error } = await supabase
    .from("sys_CustomsOptionCatalogue")
    .select("catalog_code, option_code, option_name, option_description, direction, sort_order")
    .order("catalog_code")
    .order("sort_order")
    .order("option_name")

  if (error) throw error

  const catalogues = createEmptyCustomsReferenceData()
  for (const row of (data ?? []) as CatalogueRow[]) {
    if (row.direction !== "all" && row.direction !== direction) continue
    if (!customsCatalogCodes.includes(row.catalog_code as CustomsCatalogCode)) continue
    catalogues[row.catalog_code as CustomsCatalogCode].push({
      code: row.option_code,
      name: row.option_name,
      description: row.option_description,
    })
  }

  const missingCatalogues = customsCatalogCodes.filter((catalogue) => catalogues[catalogue].length === 0)
  if (missingCatalogues.length) {
    throw new Error(`Customs reference catalogues are incomplete: ${missingCatalogues.join(", ")}`)
  }

  return catalogues
}

export function useCustomsReferenceData(direction: "export" | "import") {
  const [data, setData] = useState<CustomsReferenceData>(createEmptyCustomsReferenceData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    loadCustomsReferenceData(direction)
      .then((catalogues) => {
        if (!cancelled) setData(catalogues)
      })
      .catch((reason: unknown) => {
        console.error("Customs reference data could not be loaded.", reason)
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Customs reference data could not be loaded.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [direction])

  return { data, loading, error }
}
