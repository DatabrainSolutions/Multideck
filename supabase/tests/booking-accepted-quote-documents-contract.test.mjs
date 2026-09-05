import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = await readFile(
  new URL("../migrations/20260904153000_booking_accepted_quote_documents.sql", import.meta.url),
  "utf8",
)

test("booking quote documents are tied to confirmed customer delivery", () => {
  assert.match(migration, /from quote_api\.customer_response_links link/u)
  assert.match(migration, /link\.delivery_status_code = 'sent'/u)
  assert.match(migration, /stored\."DOCStoredObject_ID" = link\.quote_document_id/u)
})

test("only accepted quote versions are visible in the booking document feed", () => {
  assert.match(migration, /version\."CusQuoteVersion_StatusCode" = 'accepted'/u)
  assert.match(migration, /link\.quote_id = job_row\."Job_SourceQuoteID"/u)
  assert.match(migration, /'quoteVersionNumber', version\."CusQuoteVersion_Number"/u)
})

test("accepted history is retained while the applied booking version is identified", () => {
  assert.match(migration, /'version', version\."CusQuoteVersion_Number"/u)
  assert.match(migration, /'appliedToBooking', version\."CusQuoteVersion_ID" = job_row\."Job_SourceQuoteVersionID"/u)
  assert.doesNotMatch(migration, /version\."CusQuoteVersion_ID" = job_row\."Job_SourceQuoteVersionID"\s+and/u)
})

test("the booking document function remains tenant-safe and service-role only", () => {
  assert.match(migration, /booking_api\.has_permission\(caller_auth_user_id, 'Bookings\.Read'\)/u)
  assert.match(migration, /link\.company_id = app_user\."Company_ID"/u)
  assert.match(migration, /creator\."Company_ID" = app_user\."Company_ID"/u)
  assert.match(migration, /revoke all on function booking_api\.workspace_documents\(uuid, uuid\) from public, anon, authenticated/u)
  assert.match(migration, /grant execute on function booking_api\.workspace_documents\(uuid, uuid\) to service_role/u)
})
