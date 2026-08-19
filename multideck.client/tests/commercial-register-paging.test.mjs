import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const repoRoot = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8")
const applicationApi = read("multideck.client/src/lib/application-data-api.ts")
const quoteApi = read("multideck.client/src/lib/quote-api.ts")
const bookingsPage = read("multideck.client/src/pages/bookings-page.tsx")
const quotesPage = read("multideck.client/src/pages/quotes-register-page.tsx")
const advancedFilter = read("multideck.client/src/components/multideck/advanced-filter-popover.tsx")
const bookingComponents = read("multideck.client/src/components/multideck/booking-components.tsx")
const benchmark = read("multideck.client/benchmarks/commercial-register-paging.mjs")

test("the client requests only bounded, authenticated Bookings and Quotes pages", () => {
  assert.match(applicationApi, /export async function listLiveBookingsPage/)
  assert.match(applicationApi, /rpc\("multideck_booking_register_page"/)
  assert.match(quoteApi, /export async function listSalesQuotesPage/)
  assert.match(quoteApi, /rpc\("multideck_quote_register_page"/)
  assert.equal((`${applicationApi}\n${quoteApi}`.match(/Math\.max\(1, Math\.min\(input\.limit, 50\)\)/g) ?? []).length, 2)
  assert.equal((`${applicationApi}\n${quoteApi}`.match(/getSupabaseSession\(\)/g) ?? []).length >= 2, true)
  assert.equal((`${applicationApi}\n${quoteApi}`.match(/filterQueryIsEmpty\(input\.filterQuery\)/g) ?? []).length, 2)
})

test("register requests use user-scoped dedupe, a short cache, cancellation, and bounded cache growth", () => {
  assert.match(applicationApi, /REGISTER_CACHE_TTL_MS = 15_000/)
  assert.match(applicationApi, /REGISTER_CACHE_MAX_ENTRIES = 64/)
  assert.match(applicationApi, /consumers: Set<symbol>/)
  assert.match(applicationApi, /activeEntry\.controller\?\.abort\(\)/)
  assert.match(applicationApi, /queueMicrotask/)
  assert.match(applicationApi, /const key = `\$\{scope\}\\u0000\$\{resource\}`/)
  assert.match(applicationApi, /invalidateRegisterPages\("bookings:"\)/)
})

test("table views debounce search, cancel stale reads, and delegate filtering, sorting, and paging to the server", () => {
  for (const page of [bookingsPage, quotesPage]) {
    assert.match(page, /setTimeout\(\(\) => setDebouncedQuickSearch\(quickSearch\), 250\)/)
    assert.match(page, /const controller = new AbortController\(\)/)
    assert.match(page, /return \(\) => controller\.abort\(\)/)
    assert.match(page, /serverSorting=\{\{ value: serverSort, onChange: setServerSort \}\}/)
  }
  assert.match(bookingsPage, /listLiveBookingsPage\(\{/)
  assert.match(quotesPage, /listSalesQuotesPage\(\{/)
  assert.doesNotMatch(quotesPage, /\blistSalesQuotes\(/)
  assert.doesNotMatch(bookingsPage, /getBookingShape/)
  assert.match(bookingsPage, /direction: directionFilter === "All directions" \? undefined : directionFilter/)
  assert.match(bookingsPage, /shipmentType: shipmentTypeFilter === "All types" \? undefined : shipmentTypeFilter/)
})

test("Booking Board shares the bounded register read and never downloads the full register", () => {
  assert.doesNotMatch(bookingsPage, /\blistLiveBookings\b/)
  assert.match(bookingsPage, /if \(viewMode === "Table"\) setTableRows\(result\.rows\)/)
  assert.match(bookingsPage, /else setBoardRecords\(result\.rows\)/)
  assert.match(bookingsPage, /const totalBookings = tableTotal/)
})

test("server totals power metrics, pagination, and asynchronous advanced-filter previews", () => {
  assert.match(advancedFilter, /countMatches\?: \(query: FilterQuery\) => number \| Promise<number>/)
  assert.match(advancedFilter, /Promise\.resolve\(countMatches\(draft\)\)/)
  assert.match(bookingComponents, /summary\?: BookingMetricSummary/)
  assert.match(bookingsPage, /<BookingMetricStrip summary=\{tableSummary\}/)
  assert.match(bookingsPage, /totalItems=\{totalBookings\}/)
  assert.match(quotesPage, /totalItems=\{quoteTotal\}/)
  assert.match(quotesPage, /totalCount=\{availableQuoteTotal\}/)
})

test("the 100,000-record proof is local-only and cannot write Supabase data", () => {
  assert.match(benchmark, /const recordCount = 100_000/)
  assert.match(benchmark, /REGISTER_BENCHMARK_VARIANT/)
  assert.match(benchmark, /warmups = 2/)
  assert.match(benchmark, /measuredRuns = 9/)
  assert.doesNotMatch(benchmark, /@supabase|createClient|fetch\(|(?:supabase|client)\.from\(|(?:supabase|client)\.rpc\(|insert\(|upsert\(/i)
})
