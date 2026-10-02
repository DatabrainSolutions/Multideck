/** Merge a supplier's edited pricing without deleting or rewriting other suppliers' rows. */
export function mergeVisibleQuoteChargeRows<Row extends { id: string }>(
  rows: readonly Row[],
  visibleRows: readonly Row[],
  editedRows: readonly Row[],
): Row[] {
  const visibleIds = new Set(visibleRows.map((row) => row.id))
  const existingIds = new Set(rows.map((row) => row.id))
  const editedById = new Map(editedRows.map((row) => [row.id, row]))
  return [
    ...rows.flatMap((row) => {
      if (!visibleIds.has(row.id)) return [row]
      const edited = editedById.get(row.id)
      return edited ? [edited] : []
    }),
    ...editedRows.filter((row) => !existingIds.has(row.id)),
  ]
}
