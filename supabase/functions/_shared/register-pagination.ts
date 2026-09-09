/** Bound each read without capping the number of records that can be reached. */
export function registerPagination(params: URLSearchParams) {
  const requestedLimit = Number(params.get("limit") ?? 250)
  const requestedOffset = Number(params.get("offset") ?? 0)
  return {
    limit: Number.isFinite(requestedLimit) ? Math.max(1, Math.min(250, Math.trunc(requestedLimit))) : 250,
    offset: Number.isFinite(requestedOffset) ? Math.max(0, Math.trunc(requestedOffset)) : 0,
  }
}
