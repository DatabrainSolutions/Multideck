/** Keyset pagination retains PostgreSQL microseconds and a stable UUID tie-break.
 * Strict validation is required before embedding values in a PostgREST filter. */
export function calculationHistoryCursor(value: string) {
  const parts = value.split("|")
  if (parts.length !== 2 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(parts[0]) || !Number.isFinite(Date.parse(parts[0])) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parts[1])) throw new Error("Invalid calculation history cursor.")
  return { createdAt: parts[0], id: parts[1] }
}

export function calculationHistoryFilter(cursor: string) {
  const { createdAt, id } = calculationHistoryCursor(cursor)
  return `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`
}

export function calculationHistoryPage<T extends { id: string; created_at: string }>(rows: T[], size = 30) {
  const history = rows.slice(0, size), last = history.at(-1)
  return { history, nextCursor: rows.length > size && last ? `${last.created_at}|${last.id}` : null }
}
