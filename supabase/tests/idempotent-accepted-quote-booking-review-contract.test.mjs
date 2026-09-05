import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = await readFile(
  new URL("../migrations/20260904155000_idempotent_accepted_quote_booking_review.sql", import.meta.url),
  "utf8",
)

test("repeated conversion of one accepted version reuses its active booking review", () => {
  assert.match(migration, /proposed_version_id = quote_row\."CusQuoteHeader_AcceptedVersionID"/u)
  assert.match(migration, /review\.status_code in \('pending', 'partially_applied'\)/u)
  assert.match(migration, /'quoteSyncReviewId', active_review\.review_id/u)
  assert.match(migration, /convert_accepted_quote_before_idempotent_review_20260904/u)
})

test("a later customer response id is retained without creating another review", () => {
  assert.match(migration, /proposed_response_id = coalesce\(proposed_response_id, requested_response_id\)/u)
  assert.match(migration, /"Job_PendingQuoteResponseID" = coalesce\("Job_PendingQuoteResponseID", requested_response_id\)/u)
  assert.doesNotMatch(migration, /insert into booking_api\.quote_sync_reviews/u)
  assert.doesNotMatch(migration, /insert into public\."Comm_Notifications"/u)
})

test("the accepted conversion wrapper remains internal and service-role callable", () => {
  assert.match(migration, /security definer/u)
  assert.match(migration, /revoke all on function booking_api\.convert_accepted_quote_before_idempotent_review_20260904\(uuid, uuid, uuid\)[\s\S]*service_role/u)
  assert.match(migration, /grant execute on function booking_api\.convert_accepted_quote\(uuid, uuid, uuid\) to service_role/u)
})
