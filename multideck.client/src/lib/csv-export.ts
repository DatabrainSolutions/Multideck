export type CsvScalar = string | number | boolean | bigint | Date | null | undefined

export type CsvExportSource<Row> = {
  row: Row
  record: unknown
}

export type CsvExportField<Row> = {
  id: string
  label: string
  category: string
  defaultSelected?: boolean
  getValue: (source: CsvExportSource<Row>) => unknown
}

export type DiscoverCsvFieldsOptions = {
  recordCategory?: string
  categoryForPath?: (path: readonly string[]) => string
  labelForPath?: (path: readonly string[]) => string
  excludePaths?: readonly string[]
  maxDepth?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)
}

function isScalar(value: unknown): value is CsvScalar {
  return value === null
    || value === undefined
    || value instanceof Date
    || ["string", "number", "boolean", "bigint"].includes(typeof value)
}

export function humanizeExportKey(value: string) {
  return value
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (character) => character.toUpperCase())
}

function collectPaths(
  value: unknown,
  path: string[],
  paths: Map<string, string[]>,
  visited: WeakSet<object>,
  depth: number,
  maxDepth: number,
) {
  if (depth > maxDepth) return

  if (isScalar(value)) {
    if (path.length) paths.set(path.join("."), path)
    return
  }

  if (Array.isArray(value)) {
    if (!value.length) return
    if (value.every(isScalar)) {
      if (path.length) paths.set(path.join("."), path)
      return
    }
    for (const item of value) collectPaths(item, path, paths, visited, depth + 1, maxDepth)
    return
  }

  if (!isRecord(value) || visited.has(value)) return
  visited.add(value)
  for (const [key, nestedValue] of Object.entries(value)) {
    if (["function", "symbol"].includes(typeof nestedValue)) continue
    collectPaths(nestedValue, [...path, key], paths, visited, depth + 1, maxDepth)
  }
}

function readPath(value: unknown, path: readonly string[]): unknown {
  if (Array.isArray(value)) {
    const values = value
      .flatMap((item) => {
        const nested = readPath(item, path)
        return Array.isArray(nested) ? nested : [nested]
      })
      .filter((item) => item !== null && item !== undefined && item !== "")
    return values
  }
  if (!path.length) return value
  if (!isRecord(value)) return undefined
  return readPath(value[path[0]], path.slice(1))
}

export function discoverCsvRecordFields<Row>(
  sources: readonly CsvExportSource<Row>[],
  options: DiscoverCsvFieldsOptions = {},
): CsvExportField<Row>[] {
  const paths = new Map<string, string[]>()
  for (const source of sources) {
    collectPaths(source.record, [], paths, new WeakSet(), 0, options.maxDepth ?? 7)
  }

  const excluded = new Set(options.excludePaths ?? [])
  return [...paths.values()]
    .filter((path) => !excluded.has(path.join(".")))
    .sort((left, right) => left.join(".").localeCompare(right.join("."), undefined, { numeric: true, sensitivity: "base" }))
    .map((path) => {
      const category = options.categoryForPath?.(path)
        ?? (path.length > 1 ? humanizeExportKey(path[0]) : options.recordCategory ?? "Record")
      const label = options.labelForPath?.(path)
        ?? (path.length > 2
          ? path.slice(1).map(humanizeExportKey).join(" · ")
          : humanizeExportKey(path.at(-1) ?? path.join(".")))
      return {
        id: `record:${path.join(".")}`,
        label,
        category,
        defaultSelected: false,
        getValue: (source) => readPath(source.record, path),
      }
    })
}

function formatCsvValue(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(formatCsvValue).filter(Boolean).join(" | ")
  if (typeof value === "object") {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function escapeCsvCell(value: unknown) {
  let formatted = formatCsvValue(value)
  // Spreadsheet applications can execute formula-looking CSV cells. Keep the
  // exported value visible while forcing user-authored strings to remain plain
  // text. Negative numeric values must retain their numeric meaning.
  const isTextCell = typeof value === "string" || Array.isArray(value)
  if (isTextCell && /^[\s\u0000-\u001f]*[=+\-@]/.test(formatted)) formatted = `'${formatted}`
  return `"${formatted.replaceAll('"', '""')}"`
}

export function buildCsv<Row>(sources: readonly CsvExportSource<Row>[], fields: readonly CsvExportField<Row>[]) {
  const header = fields.map((field) => escapeCsvCell(field.category === "Columns" ? field.label : `${field.category} / ${field.label}`))
  const body = sources.map((source) => fields.map((field) => escapeCsvCell(field.getValue(source))))
  return `\uFEFF${[header, ...body].map((line) => line.join(",")).join("\r\n")}`
}

export function sanitiseCsvFileName(value: string) {
  const normalised = value
    .trim()
    .replace(/\.csv$/i, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
  return `${normalised || "multideck-export"}.csv`
}
