export const defaultPaginationPageSize = 30
export const paginationPageSizes = [10, 20, 30, 50]

/** Keep ranges valid when a filter or deletion removes the last page. */
export function paginationRange(totalItems: number, page: number, pageSize: number, itemCount?: number) {
  const total = Number.isFinite(totalItems) ? Math.max(0, Math.floor(totalItems)) : 0
  const size = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : defaultPaginationPageSize
  const pageCount = Math.max(1, Math.ceil(total / size))
  const currentPage = Math.min(pageCount, Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1))
  const offset = (currentPage - 1) * size
  const count = Math.min(size, Math.max(0, total - offset), itemCount === undefined ? size : Math.max(0, itemCount))
  return { total, size, pageCount, currentPage, offset, start: count ? offset + 1 : 0, end: count ? offset + count : 0 }
}
