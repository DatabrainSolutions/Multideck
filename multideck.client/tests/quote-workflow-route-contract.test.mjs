import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

const app = await read("src/App.tsx")
const page = await read("src/pages/quote-workflow-page.tsx")
const api = await read("src/lib/quote-workflow-api.ts")
const phrases = await read("src/i18n/quote-workflow-phrases.ts")

test("new and existing quote routes use the canonical workflow workspace", () => {
  assert.match(app, /import\("@\/pages\/quote-workflow-page"\)/)
  assert.match(app, /isQuoteDetailRoute\(route\)[\s\S]+<QuoteWorkflowPage/)
  assert.doesNotMatch(app, /<QuoteDetailPage/)
  assert.match(page, /const isNew = !quoteReference \|\| quoteReference === "new"/)
})

test("the quote workspace supports the full manual happy path", () => {
  for (const action of ["calculated", "generated", "sent", "revised", "accepted", "declined", "ghosted", "converted"]) {
    assert.match(page, new RegExp(`"${action}"`))
  }
  assert.match(page, /renderDocument\(\{[\s\S]+targetType: "CusQuote_Header"/)
  assert.match(page, /convertQuoteWorkflow/)
  assert.match(page, /UnifiedQuoteChargesWorkspace/)
  assert.match(page, /navigate\("\/rates\/imports"\)/)
})

test("the browser API exposes only the authenticated quote workflow function", () => {
  assert.match(api, /functions\.invoke<T>\("quotes-workflow"/)
  assert.doesNotMatch(api, /service_role|SUPABASE_SERVICE/)
  assert.match(api, /crypto\.randomUUID\(\)/)
})

test("new workflow copy participates in all supported app languages", () => {
  for (const label of ["New quote", "Commercial calculation", "Issued quote versions", "Booking readiness", "Create booking"]) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    assert.match(phrases, new RegExp(`"${escaped}": \\{ de: .+ fr: .+ ar: .+ \\}`))
  }
  assert.match(page, /rtl:rotate-180/)
  assert.match(page, /dir="ltr"/)
})
