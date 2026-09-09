export type ExportDateRange = { start: string | null; end: string | null }
export type ExportDatePreset = "7D" | "30D" | "90D" | "All time" | "Custom"
export type TableExportScope = "page" | "all"

/** Same stable, null-last ordering used by local table pagination and export. */
export function sortExportRows<Row>(rows: readonly Row[], read: ((row: Row) => unknown) | undefined, direction: "asc" | "desc" = "asc"): Row[] {
  if (!read) return [...rows]
  return [...rows].sort((left, right) => {
    const a = read(left), b = read(right)
    if (a === b) return 0
    if (a === null || a === undefined) return 1
    if (b === null || b === undefined) return -1
    const comparison = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" })
    return direction === "asc" ? comparison : -comparison
  })
}

/** Date-only fields keep their calendar date; timestamps are evaluated in UTC. */
export function exportDateKey(value: string | Date | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

export function exportPresetRange(preset: ExportDatePreset, now = new Date()): ExportDateRange {
  if (preset === "All time" || preset === "Custom") return { start: null, end: null }
  const end = now.toISOString().slice(0, 10)
  const start = new Date(`${end}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - Number.parseInt(preset, 10) + 1)
  return { start: start.toISOString().slice(0, 10), end }
}

export function validExportRange(range: ExportDateRange) {
  const validDate = (date: string | null) => Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date) && exportDateKey(date) === date)
  return validDate(range.start) && validDate(range.end) && range.start! <= range.end!
}

export function inExportDateRange(value: string | Date | null | undefined, range: ExportDateRange) {
  if (!range.start && !range.end) return true
  if (!validExportRange(range)) return false
  const key = exportDateKey(value)
  return Boolean(key && key >= range.start! && key <= range.end!)
}

/** Uses only a caller-owned, authorised list endpoint. Never accepts table names or SQL. */
export async function collectExportPages<Row>(
  loadPage: (page: { offset: number; limit: number }) => Promise<{ rows: readonly Row[]; total: number }>,
  key: (row: Row) => string,
  signal?: AbortSignal,
): Promise<Row[]> {
  const rows: Row[] = []
  const seen = new Set<string>()
  let total: number | undefined
  do {
    signal?.throwIfAborted()
    // Small enough for existing API caps. Advance by the actual response size.
    const page = await loadPage({ offset: rows.length, limit: 100 })
    signal?.throwIfAborted()
    if (!Number.isSafeInteger(page.total) || page.total < 0 || (total !== undefined && total !== page.total)) {
      throw new Error("The record list changed during export. Try again.")
    }
    total = page.total
    if ((!page.rows.length && rows.length < total) || rows.length + page.rows.length > total) {
      throw new Error("The export response was incomplete. Try again.")
    }
    for (const row of page.rows) {
      const id = key(row)
      if (!id || seen.has(id)) throw new Error("The record list changed during export. Try again.")
      seen.add(id)
      rows.push(row)
    }
  } while (rows.length < total)
  return rows
}
