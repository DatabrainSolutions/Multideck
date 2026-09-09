import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

const [migration, core, edge, page, api] = await Promise.all([
  read("supabase/migrations/20260903100000_customer_response_reason_audit.sql"),
  read("supabase/functions/quote-response/core.ts"),
  read("supabase/functions/quote-response/index.ts"),
  read("multideck.client/src/pages/quote-response-page.tsx"),
  read("multideck.client/src/lib/quote-response-api.ts"),
])

test("customer decline reasons are structured, optional detail is preserved, and response records are immutable", () => {
  assert.match(migration, /add column if not exists decline_reason_code varchar\(60\)/)
  assert.match(migration, /customer_responses_decline_reason/)
  assert.match(migration, /decision_code = 'declined' and decline_reason_code is not null/)
  assert.match(migration, /revoke update, delete on table quote_api\.customer_responses from public, anon, authenticated, service_role/)
  assert.match(migration, /requested_decline_reason text default null/)
  assert.match(migration, /previous Edge Function signature callable during a rolling deploy/)
  assert.match(migration, /then 'other' end/)
  assert.match(migration, /'declineReasonCode'/)
  assert.match(core, /export function parseDeclineReason/)
  assert.match(edge, /requested_decline_reason: declineReasonCode/)
  assert.match(page, /quoteCustomerDeclineReasons\.map/)
  assert.match(page, /disabled=\{!lossReason \|\| submitting\}/)
  assert.match(api, /declineReasonCode: QuoteCustomerDeclineReasonCode \| null = null/)
})
