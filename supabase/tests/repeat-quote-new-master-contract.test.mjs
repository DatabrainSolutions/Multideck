import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const [page, migration] = await Promise.all([
  readFile(new URL("multideck.client/src/pages/quotes-page.tsx", root), "utf8"),
  readFile(new URL("supabase/migrations/20260904143000_repeat_quote_new_master.sql", root), "utf8"),
])

function sourceBetween(startMarker, endMarker) {
  const start = page.indexOf(startMarker)
  const end = page.indexOf(endMarker, start)
  assert.ok(start > -1 && end > start, `${startMarker} must remain present.`)
  return page.slice(start, end)
}

test("repeat quote action creates a separate same-customer master quote", () => {
  const action = sourceBetween("async function createRepeatQuote()", "async function saveChanges()")

  assert.match(page, /Use as a new repeat quote/u)
  assert.match(page, /Use this as a new repeat quote\?/u)
  assert.match(page, /separate master quote for the same customer/u)
  assert.match(action, /newRepeatMasterQuote\(savedQuote, sourceQuoteId, sourceReference\)/u)
  assert.match(action, /saveQuoteWorkflow\(null, quoteSavePayload\(nextQuote, \[\], sources\)\)/u)
  assert.match(action, /navigate\?\.\(`\/quotes\/\$\{result\.reference\}`\)/u)
})

test("repeat quote keeps reusable operations but clears stale schedule and commercial evidence", () => {
  const helper = sourceBetween("function newRepeatMasterQuote", "function compactQuoteFacts")

  assert.match(helper, /\.\.\.source/u)
  assert.match(helper, /id: "NEW"/u)
  assert.match(helper, /localRef: ""/u)
  assert.match(helper, /customerPO: ""/u)
  assert.match(helper, /carrierReference: ""/u)
  assert.match(helper, /startDate: ""/u)
  assert.match(helper, /endDate: ""/u)
  assert.match(helper, /estimatedDeparture: ""/u)
  assert.match(helper, /estimatedArrival: ""/u)
  assert.match(helper, /deadline: ""/u)
  assert.match(helper, /reference: ""/u)
  assert.match(helper, /rateSource: "Manual"/u)
  assert.match(helper, /status: "draft" as const/u)
  assert.match(helper, /margin: "0\.00%"/u)
  assert.match(helper, /profit: 0/u)
  assert.match(helper, /cost: 0/u)
  assert.match(helper, /revenue: 0/u)
  assert.match(helper, /copiedFromQuoteId: sourceQuoteId/u)
  assert.match(helper, /copiedFromQuoteReference: sourceReference/u)
  assert.match(helper, /copyReason: "repeat_quote"/u)
})

test("backend accepts repeat provenance only for the same tenant customer", () => {
  assert.match(migration, /copy_reason = 'repeat_quote'/u)
  assert.match(migration, /source_office\."Company_ID" = actor_company_id/u)
  assert.match(migration, /source_customer_id/u)
  assert.match(migration, /target_customer_id is distinct from source_customer_id/u)
  assert.match(migration, /A repeat quote must keep the source quote customer\./u)
  assert.match(migration, /Unsupported quote copy reason\./u)
  assert.match(migration, /quote_workflow_save_quote_before_repeat_20260904/u)
})

test("repeat quote is audited in both directions and exposed to Dexter", () => {
  assert.match(migration, /Repeat quote created from/u)
  assert.match(migration, /Quote copied to .* as a repeat enquiry/u)
  assert.match(migration, /'scheduleReset', true/u)
  assert.match(migration, /'commercialValuesReset', true/u)
  assert.match(migration, /'copyReason', 'repeat_quote'/u)
  assert.match(migration, /'copyReason', quote\."CusQuoteHeader_ShipmentFactsJSON"->>'copyReason'/u)
  assert.match(migration, /repeat enquiries keep the customer while resetting schedule and commercial values/u)
})
