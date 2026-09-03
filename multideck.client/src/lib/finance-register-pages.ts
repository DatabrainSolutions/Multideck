/** Finance's existing filters and summaries need the whole scoped register, not just its first batch. */
export async function readFinanceRegisterPages(
  fetchPage: (offset: number, limit: number) => Promise<unknown>,
  key: "documents" | "cashTransactions",
): Promise<unknown[]> {
  const limit = 250
  const rows: unknown[] = []
  const ids = new Set<string>()
  let expectedTotal: number | undefined
  const idKey = key === "documents" ? "FINDoc_ID" : "FINCash_ID"
  for (;;) {
    const result = await fetchPage(rows.length, limit)
    if (!result || typeof result !== "object") throw new Error("Finance returned an invalid record list.")
    const page = result as Record<string, unknown>
    const batch = page[key]
    if (!Array.isArray(batch) || batch.length > limit) throw new Error("Finance returned an invalid record list.")
    // Older deployments cannot prove that a full 250-row response is complete.
    if (page.hasMore === undefined) {
      if (rows.length || batch.length === limit) throw new Error("Update the Finance service to load all records. The current service only returns the first 250 records.")
      return batch
    }
    if (typeof page.hasMore !== "boolean" || page.offset !== rows.length || page.limit !== limit || !Number.isInteger(page.total) || Number(page.total) < 0) {
      throw new Error("Finance returned invalid pagination. Refresh the register and try again.")
    }
    if (expectedTotal !== undefined && page.total !== expectedTotal) throw new Error("Finance records changed while loading. Refresh the register and try again.")
    expectedTotal = Number(page.total)
    for (const record of batch) {
      const id = record && typeof record === "object" ? (record as Record<string, unknown>)[idKey] : undefined
      if (typeof id !== "string" || !id || ids.has(id)) throw new Error("Finance records changed while loading. Refresh the register and try again.")
      ids.add(id)
    }
    rows.push(...batch)
    if (rows.length > expectedTotal || page.hasMore !== (rows.length < expectedTotal) || (page.hasMore && !batch.length)) {
      throw new Error("Finance returned an incomplete page. Refresh the register and try again.")
    }
    if (!page.hasMore) return rows
  }
}
