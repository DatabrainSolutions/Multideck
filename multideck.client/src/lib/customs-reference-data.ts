import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { importProcedureSnapshot, importAdditionalProcedureSnapshot, withImportProcedureSnapshot } from "./customs-procedure-snapshot"

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

type CustomsReferenceCacheEntry = {
  value?: CustomsReferenceData
  expiresAt: number
  inFlight?: Promise<CustomsReferenceData>
}

const CUSTOMS_REFERENCE_CACHE_TTL_MS = 5 * 60_000
const customsReferenceCache = new Map<"export" | "import", CustomsReferenceCacheEntry>()

export function createEmptyCustomsReferenceData(): CustomsReferenceData {
  const catalogues = {} as CustomsReferenceData
  for (const catalogue of customsCatalogCodes) catalogues[catalogue] = []
  return catalogues
}

export async function loadCustomsReferenceData(direction: "export" | "import") {
  if (!supabase) throw new Error("Supabase is not configured for this App workspace.")

  const cached = customsReferenceCache.get(direction)
  if (cached?.value && cached.expiresAt > Date.now()) return cached.value
  if (cached?.inFlight) return cached.inFlight

  const inFlight = (async () => {
    // Page the catalogue: complete provider lists can exceed PostgREST's row cap.
    // Publish only after every page succeeds; never replace a list with a partial refresh.
    const rows: CatalogueRow[] = []
    const pageSize = 500
    let complete = false
    for (let page = 0; page < 100; page += 1) {
      const { data, error } = await supabase
      .from("sys_CustomsOptionCatalogue")
      .select("catalog_code, option_code, option_name, option_description, direction, sort_order")
      .in("catalog_code", [...customsCatalogCodes])
      .in("direction", ["all", direction])
      .order("catalog_code")
      .order("direction")
      .order("option_code")
      .range(page * pageSize, (page + 1) * pageSize - 1)

      if (error) throw error
      const batch = (data ?? []) as CatalogueRow[]
      rows.push(...batch)
      if (batch.length < pageSize) {
        complete = true
        break
      }
    }
    if (!complete) throw new Error("Customs reference catalogues are too large to load safely.")

    const catalogues = createEmptyCustomsReferenceData()
    // Direction-specific definitions take precedence over shared defaults.
    const unique = new Map<string, CatalogueRow>()
    for (const row of rows) {
      if (row.direction !== "all" && row.direction !== direction) continue
      if (!customsCatalogCodes.includes(row.catalog_code as CustomsCatalogCode)) continue
      const key = `${row.catalog_code}:${row.option_code}`
      if (!unique.has(key) || row.direction === direction) unique.set(key, row)
    }
    for (const row of [...unique.values()].sort((a, b) =>
      a.sort_order - b.sort_order || a.option_name.localeCompare(b.option_name) || a.option_code.localeCompare(b.option_code)
    )) {
      catalogues[row.catalog_code as CustomsCatalogCode].push({
        code: row.option_code,
        name: row.option_name,
        description: row.option_description,
      })
    }

    if (direction === "import") {
      catalogues.procedure_code = withImportProcedureSnapshot(catalogues.procedure_code, importProcedureSnapshot)
      catalogues.additional_procedure_code = withImportProcedureSnapshot(catalogues.additional_procedure_code, importAdditionalProcedureSnapshot)
    }
    const missingCatalogues = customsCatalogCodes.filter((catalogue) => catalogues[catalogue].length === 0)
    if (missingCatalogues.length) {
      throw new Error(`Customs reference catalogues are incomplete: ${missingCatalogues.join(", ")}`)
    }

    customsReferenceCache.set(direction, {
      value: catalogues,
      expiresAt: Date.now() + CUSTOMS_REFERENCE_CACHE_TTL_MS,
    })
    return catalogues
  })().catch((error) => {
    customsReferenceCache.delete(direction)
    throw error
  })

  customsReferenceCache.set(direction, { expiresAt: 0, inFlight })
  return inFlight
}

export function useCustomsReferenceData(direction: "export" | "import") {
  const [data, setData] = useState<CustomsReferenceData>(createEmptyCustomsReferenceData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setData(createEmptyCustomsReferenceData())
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
  }, [direction, attempt])

  return { data, loading, error, retry: () => setAttempt(value => value + 1) }
}
