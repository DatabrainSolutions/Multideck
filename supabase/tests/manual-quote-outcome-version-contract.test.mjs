import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const [migration, page] = await Promise.all([
  readFile(new URL("supabase/migrations/20260904140000_manual_quote_outcome_submitted_version.sql", root), "utf8"),
  readFile(new URL("multideck.client/src/pages/quotes-page.tsx", root), "utf8"),
])

test("manual acceptance selects the latest submitted version and preserves a newer draft", () => {
  assert.match(migration, /"CusQuoteVersion_IsSubmitted"/)
  assert.match(migration, /order by version\."CusQuoteVersion_SubmittedAt" desc nulls last/)
  assert.match(migration, /Submit the quote before recording customer acceptance/)
  assert.match(migration, /Create and submit a new quote version before recording fresh customer acceptance/)
  assert.match(migration, /"CusQuoteHeader_AcceptedVersionID" = case[\s\S]*then selected_version_id/)
  assert.match(migration, /'workingDraftPreserved'/)
  assert.match(migration, /'outcomeSource'.*'manual'/)
})

test("the Mark won confirmation identifies the booking source version", () => {
  assert.match(page, /latestSubmittedVersion/)
  assert.match(page, /Booking source/)
  assert.match(page, /An unsubmitted working draft is never applied/)
  assert.match(page, /newer working draft stays editable and separate/)
})
