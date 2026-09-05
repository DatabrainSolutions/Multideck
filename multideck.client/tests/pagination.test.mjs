import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { defaultPaginationPageSize, paginationPageSizes, paginationRange, paginationVisiblePages } from "../src/lib/pagination.ts"
import { readFinanceRegisterPages } from "../src/lib/finance-register-pages.ts"

test("pagination starts at 30 rows while keeping every row-count option available", () => {
  assert.equal(defaultPaginationPageSize, 30)
  assert.deepEqual(paginationPageSizes, [10, 20, 30, 50])
  assert.equal(paginationRange(75, 1, defaultPaginationPageSize).end, 30)
  assert.equal(paginationRange(75, 1, NaN).size, 30)
})

test("every paginated view initializes from the shared default", async () => {
  const views = [
    ["pages/admin-page.tsx","pageSize"],
    ["pages/bookings-page.tsx","rowsPerPage"],
    ["pages/components-gallery-page.tsx","previewPageSize"],
    ["pages/contact-cards-page.tsx","pageSize"],
    ["pages/crm-accounts-page.tsx","accountPageSize"],
    ["pages/crm-contacts-page.tsx","contactPageSize"],
    ["pages/crm-page.tsx","rowsPerPage"],
    ["pages/crm-page.tsx","dealListPageSize"],
    ["pages/crm-phone-calls-page.tsx","limit"],
    ["pages/customer-detail-page.tsx","documentPageSize"],
    ["pages/customer-detail-page.tsx","contactPageSize"],
    ["pages/customer-detail-page.tsx","userPageSize"],
    ["pages/customers-page.tsx","rowsPerPage"],
    ["pages/customs-declarations-page.tsx","customsRegisterPageSize"],
    ["pages/documents-page.tsx","documentPageSize"],
    ["pages/quotes-register-page.tsx","rowsPerPage"],
    ["pages/rates-page.tsx","pageSize"],
    ["pages/road-control-page.tsx","roadPageSize"],
    ["pages/screening-page.tsx","recentPageSize"],
    ["pages/settings-page.tsx","userPageSize"],
    ["pages/settings-page.tsx","pageSize"],
    ["components/multideck/data-table.tsx","localPageSize"],
    ["components/multideck/warehouse-inventory-workspace.tsx","inventoryPageSize"],
    ["components/multideck/warehouse-management-components.tsx","warehouseRegisterPageSize"],
    ["components/multideck/warehouse-operations-components.tsx","warehouseOrderPageSize"],
    ["components/multideck/warehouse-purchase-orders-workspace.tsx","purchaseOrderPageSize"],
  ]
  for (const [file, state] of views) {
    const source = await readFile(new URL(`../src/${file}`, import.meta.url), "utf8")
    const declarations = source.split("\n").filter((line) => line.includes(`const [${state},`))
    assert.ok(declarations.length > 0 && declarations.every((line) => line.includes("useState(defaultPaginationPageSize)")), `${file}: every ${state} must start at the shared default`)
  }
  const matches = await readFile(new URL("../src/components/multideck/screening-components.tsx", import.meta.url), "utf8")
  assert.match(matches, /SCREENING_MATCH_PAGE_SIZE = defaultPaginationPageSize/)
  const documents = await readFile(new URL("../src/pages/documents-page.tsx", import.meta.url), "utf8")
  assert.ok(documents.includes("`0|${defaultPaginationPageSize}||created:desc`"))
})

test("every supported size covers the dataset exactly once, including partial last pages", () => {
  for (const size of [...paginationPageSizes, 25]) {
    for (const total of [0, 1, 9, 10, 20, 21, 50, 57, 250, 501]) {
      const rows = Array.from({ length: total }, (_, index) => index)
      const visited = []
      for (let page = 1; page <= Math.max(1, Math.ceil(total / size)); page++) {
        const range = paginationRange(total, page, size)
        const visible = rows.slice(range.offset, range.offset + size)
        assert.ok(visible.length <= size)
        assert.equal(range.start, visible.length ? visible[0] + 1 : 0)
        assert.equal(range.end, visible.length ? visible.at(-1) + 1 : 0)
        visited.push(...visible)
      }
      assert.deepEqual(visited, rows)
    }
  }
})

test("removed last pages, empty results and invalid inputs stay in bounds", () => {
  assert.deepEqual(paginationRange(21, 9, 20), { total: 21, size: 20, pageCount: 2, currentPage: 2, offset: 20, start: 21, end: 21 })
  assert.equal(paginationRange(0, 9, 20).currentPage, 1)
  assert.equal(paginationRange(50, -2, 10).currentPage, 1)
  assert.equal(paginationRange(NaN, Infinity, 0).start, 0)
  assert.equal(paginationRange(57, 2, 20, 3).end, 23)
  assert.equal(paginationRange(57, 2, 20, 0).start, 0)
})

test("page navigation stays bounded and retains the first, last and neighbouring pages", () => {
  assert.deepEqual(paginationVisiblePages(1, 1), [1])
  assert.deepEqual(paginationVisiblePages(1, 8), [1, 2, 8])
  assert.deepEqual(paginationVisiblePages(8, 8), [1, 7, 8])
  assert.deepEqual(paginationVisiblePages(4, 8), [1, 3, 4, 5, 8])
  assert.deepEqual(paginationVisiblePages(500_000, 1_000_000), [1, 499_999, 500_000, 500_001, 1_000_000])
})

test("the shared control resets page size atomically and guards loading, errors and page bounds", async () => {
  const source = await readFile(new URL("../src/components/multideck/pagination.tsx", import.meta.url), "utf8")
  assert.match(source, /onPageSizeChange\(Number\(value\)\); onPageChange\(1\)/)
  assert.match(source, /if \(!loading && !error && page !== currentPage\) onPageChange\(currentPage\)/)
  assert.match(source, /if \(!loading && nextPage !== currentPage && nextPage >= 1 && nextPage <= safePageCount\)/)
  assert.match(source, /Select disabled=\{loading\}/)
  assert.match(source, /Rows could not be loaded/)
  assert.match(source, /aria-live="polite"/)
  assert.match(source, /aria-disabled=\{loading\}/)
  assert.match(source, /safePageCount > 1/)
  assert.match(source, /aria-label=\{t\("Previous page"\)\}/)
  assert.match(source, /aria-label=\{t\("Next page"\)\}/)
  assert.match(source, /useReducedMotion\(\)/)
  assert.doesNotMatch(source, /href="#"/)
})

const serverRegisters = [
  ["pages/crm-accounts-page.tsx", "accountPageSize", "setAccountPageSize"],
  ["pages/crm-contacts-page.tsx", "contactPageSize", "setContactPageSize"],
  ["pages/customs-declarations-page.tsx", "customsRegisterPageSize", "setCustomsRegisterPageSize"],
  ["pages/rates-page.tsx", "pageSize", "setPageSize"],
  ["pages/contact-cards-page.tsx", "pageSize", "setPageSize"],
  ["pages/admin-page.tsx", "pageSize", "setPageSize"],
  ["pages/documents-page.tsx", "documentPageSize", "setDocumentPageSize"],
  ["pages/settings-page.tsx", "userPageSize", "setUserPageSize"],
  ["pages/crm-page.tsx", "dealListPageSize", "setDealListPageSize"],
  ["components/multideck/warehouse-inventory-workspace.tsx", "inventoryPageSize", "setInventoryPageSize"],
  ["components/multideck/warehouse-operations-components.tsx", "warehouseOrderPageSize", "setWarehouseOrderPageSize"],
  ["components/multideck/warehouse-purchase-orders-workspace.tsx", "purchaseOrderPageSize", "setPurchaseOrderPageSize"],
  ["components/multideck/warehouse-management-components.tsx", "warehouseRegisterPageSize", "setWarehouseRegisterPageSize"],
]
for (const [file, size, setter] of serverRegisters) {
  test(`${file}: selector changes the query limit and refetch dependency`, async () => {
    const source = await readFile(new URL(`../src/${file}`, import.meta.url), "utf8")
    assert.ok(source.includes(`const [${size}, ${setter}] = useState(defaultPaginationPageSize)`))
    assert.ok(source.includes(`limit: ${size}`))
    assert.ok(source.includes(`onLimitChange: ${setter}`))
    assert.ok(source.split("\n").some((line) => line.includes("}, [") && new RegExp(`\\b${size}\\b`).test(line)), "page size must trigger a refetch")
  })
}

test("local paging is opt-in, sorts before slicing and selects only visible rows", async () => {
  const source = await readFile(new URL("../src/components/multideck/data-table.tsx", import.meta.url), "utf8")
  assert.match(source, /clientPagination = false/)
  assert.match(source, /clientPagination && !pagination/)
  assert.match(source, /sortedRows\.slice\(localRange\.offset, localRange\.offset \+ localPageSize\)/)
  assert.match(source, /pageRows\.length \? pageRows\.map/)
  assert.match(source, /pageRows\.forEach\(\(row\) =>/)
  assert.match(source, /onLimitChange: \(limit: number\) => void/)
})

test("documents cache identity includes the selected row count", async () => {
  const source = await readFile(new URL("../src/pages/documents-page.tsx", import.meta.url), "utf8")
  assert.match(source, /const key = `\$\{documentOffset\}\|\$\{documentPageSize\}\|/)
  assert.match(source, /lastDocumentPageKeyRef.current = `\$\{documentOffset\}\|\$\{documentPageSize\}\|/)
})

test("screening matches use the selected size and keep controls reachable after filtering", async () => {
  const source = await readFile(new URL("../src/components/multideck/screening-components.tsx", import.meta.url), "utf8")
  assert.match(source, /visible\.slice\(\(currentPage - 1\) \* pageSize, currentPage \* pageSize\)/)
  assert.match(source, /onPageSizeChange=\{setPageSize\}/)
  assert.match(source, /matches\.length > SCREENING_MATCH_PAGE_SIZE \? \(/)
})

for (const key of ["documents", "cashTransactions"]) {
  test(`Finance ${key}: reads beyond 250 without losing, duplicating or reordering records`, async () => {
    const id = key === "documents" ? "FINDoc_ID" : "FINCash_ID"
    const records = Array.from({ length: 513 }, (_, index) => ({ [id]: `record-${index}` }))
    const requests = []
    const rows = await readFinanceRegisterPages(async (offset, limit) => {
      requests.push([offset, limit])
      return { [key]: records.slice(offset, offset + limit), offset, limit, total: records.length, hasMore: offset + limit < records.length }
    }, key)
    assert.deepEqual(rows, records)
    assert.deepEqual(requests, [[0, 250], [250, 250], [500, 250]])
  })
}

test("Finance never presents a capped legacy response or partial failure as complete", async () => {
  await assert.rejects(readFinanceRegisterPages(async () => ({ documents: Array(250).fill({}) }), "documents"), /Update the Finance service/)
  assert.deepEqual(await readFinanceRegisterPages(async () => ({ documents: [] }), "documents"), [])
  await assert.rejects(readFinanceRegisterPages(async () => ({ documents: [], offset: 0, limit: 250, total: 500, hasMore: true }), "documents"), /incomplete page/)
  await assert.rejects(readFinanceRegisterPages(async () => ({ documents: [{ FINDoc_ID: "a" }], offset: 0, limit: 250, total: 0, hasMore: false }), "documents"), /incomplete page/)
  await assert.rejects(readFinanceRegisterPages(async (offset, limit) => ({ documents: [{ FINDoc_ID: String(offset) }], offset, limit, total: offset ? 3 : 2, hasMore: true }), "documents"), /changed while loading/)
  await assert.rejects(readFinanceRegisterPages(async () => ({ documents: [{ FINDoc_ID: "a" }, { FINDoc_ID: "a" }], offset: 0, limit: 250, total: 2, hasMore: false }), "documents"), /changed while loading/)
  await assert.rejects(readFinanceRegisterPages(async (offset, limit) => {
    if (offset) throw new Error("Network unavailable")
    return { documents: [{ FINDoc_ID: "a" }], offset, limit, total: 2, hasMore: true }
  }, "documents"), /Network unavailable/)
})
