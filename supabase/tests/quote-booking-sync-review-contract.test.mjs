import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = await readFile(
  new URL("../migrations/20260904100000_quote_booking_sync_reviews.sql", import.meta.url),
  "utf8",
)
const applyMigration = await readFile(
  new URL("../migrations/20260904103000_quote_booking_sync_apply.sql", import.meta.url),
  "utf8",
)
const applyPermission = await readFile(
  new URL("../migrations/20260904152000_booking_quote_charge_apply_operational_permission.sql", import.meta.url),
  "utf8",
)
const notificationLinkMigration = await readFile(
  new URL("../migrations/20260904154000_booking_quote_sync_notification_link.sql", import.meta.url),
  "utf8",
)
const idempotentConversionMigration = await readFile(
  new URL("../migrations/20260904155000_idempotent_accepted_quote_booking_review.sql", import.meta.url),
  "utf8",
)
const modeConfirmationMigration = await readFile(
  new URL("../migrations/20260904130000_quote_booking_mode_confirmation.sql", import.meta.url),
  "utf8",
)
const versionVisibilityMigration = await readFile(
  new URL("../migrations/20260904131000_quote_booking_version_visibility.sql", import.meta.url),
  "utf8",
)
const routingPlansMigration = await readFile(
  new URL("../migrations/20260904133000_quote_booking_routing_plans.sql", import.meta.url),
  "utf8",
)
const routingOrderMigration = await readFile(
  new URL("../migrations/20260904134000_quote_routing_plan_labels_and_order.sql", import.meta.url),
  "utf8",
)
const quotePage = await readFile(
  new URL("../../multideck.client/src/pages/quotes-page.tsx", import.meta.url),
  "utf8",
)

test("newer accepted quotes create an approval review without overwriting the booking", () => {
  assert.match(migration, /"Job_QuoteSyncStatus" varchar\(30\) not null default 'in_sync'/u)
  assert.match(migration, /create table if not exists booking_api\.quote_sync_reviews/u)
  assert.match(migration, /booking_api\.quote_sync_differences\(baseline, booking_snapshot, proposed\)/u)
  assert.match(migration, /"Job_PendingQuoteVersionID"=version_row\."CusQuoteVersion_ID"/u)
  assert.match(migration, /"Job_QuoteSyncStatus"='out_of_sync'/u)
  assert.doesNotMatch(migration, /"Job_SourceQuoteVersionID"=version_row\."CusQuoteVersion_ID"[\s\S]{0,300}"Job_QuoteSyncStatus"='out_of_sync'/u)
  assert.match(idempotentConversionMigration, /'quoteSyncReviewId', active_review\.review_id/u)
})

test("operators can apply individual fields or the complete accepted quote update", () => {
  assert.match(applyMigration, /create or replace function public\.booking_workflow_apply_quote_sync/u)
  assert.match(applyMigration, /requested_fields jsonb/u)
  assert.match(applyMigration, /Choose at least one quote field to apply/u)
  assert.match(applyMigration, /review\.status_code in \('pending','partially_applied'\)/u)
  assert.match(applyMigration, /remaining_count=0 then 'applied' else 'partially_applied'/u)
  assert.match(applyMigration, /"Job_SourceQuoteVersionID"=review_row\.proposed_version_id/u)
  assert.match(applyMigration, /'before',before_snapshot,'after',after_snapshot/u)
  assert.match(applyMigration, /Finance\.Management\.Prepare/u)
})

test("accepted quote charges follow the booking write boundary", () => {
  assert.match(applyPermission, /Accepted quote charges are operational job costing lines/)
  assert.match(applyPermission, /through Bookings\.Write/)
})

test("field comparisons distinguish safe quote updates from booking conflicts", () => {
  assert.match(migration, /'previousQuoteValue', baseline->field_key/u)
  assert.match(migration, /'bookingValue', booking->field_key/u)
  assert.match(migration, /'newQuoteValue', proposed->field_key/u)
  assert.match(migration, /'bookingChanged'/u)
  assert.match(migration, /'conflict'/u)
  assert.match(migration, /then 'review'[\s\S]*else 'apply'/u)
  for (const key of ["mode", "estimatedDeparture", "estimatedArrival", "shipper", "consignee", "cargo", "equipment", "charges"]) {
    assert.match(migration, new RegExp(`'${key}'`, "u"))
  }
})

test("mode changes always require an explicit approval and cannot bypass the protected RPC", () => {
  assert.match(modeConfirmationMigration, /'requiresConfirmation', field_key='mode' or has_conflict/u)
  assert.match(modeConfirmationMigration, /when field_key='mode' then 'mode_change'/u)
  assert.match(modeConfirmationMigration, /when field_key='mode' or has_conflict then 'review'/u)
  assert.match(modeConfirmationMigration, /Confirm the mode change before applying it to the booking/u)
  assert.match(modeConfirmationMigration, /revoke all on function public\.booking_workflow_apply_quote_sync\(uuid,uuid,uuid,jsonb\)[^;]*service_role/u)
  assert.match(modeConfirmationMigration, /grant execute on function public\.booking_workflow_apply_quote_sync_confirmed\(uuid,uuid,uuid,jsonb,boolean\) to service_role/u)
})

test("bookings expose the master quote reference and the applied and proposed version numbers", () => {
  assert.match(versionVisibilityMigration, /'appliedVersionNumber', applied_version_number/u)
  assert.match(versionVisibilityMigration, /'pendingVersionNumber', pending_version_number/u)
  assert.match(versionVisibilityMigration, /'quoteReference',review_row\.quote_reference/u)
  assert.match(versionVisibilityMigration, /'proposedVersionNumber',review_row\.proposed_version_number/u)
})

test("the review is tenant safe, service-role only and represented in the audit trail", () => {
  assert.match(migration, /booking_api\.has_permission\(caller_auth_user_id,'Bookings\.Read'\)/u)
  assert.match(migration, /review\.company_id=app_user\."Company_ID"/u)
  assert.match(migration, /revoke all on table booking_api\.quote_sync_reviews from public, anon, authenticated/u)
  assert.match(migration, /grant execute on function public\.booking_workflow_quote_sync_review\(uuid,uuid\) to service_role/u)
  assert.match(migration, /'quote_update_available'/u)
  assert.match(migration, /'booking_quote_sync'/u)
  assert.match(notificationLinkMigration, /'booking_quote_sync'/u)
  assert.match(migration, /Applying a quote update is approval-only/u)
})

test("multi-leg quote routing is versioned and only quote-owned booking legs are replaced", () => {
  assert.match(quotePage, /Add routing leg/u)
  assert.match(quotePage, /routingLegs: quoteRoutingLegs/u)
  assert.match(routingPlansMigration, /'routing', route_plan\.routes/u)
  assert.match(routingPlansMigration, /'Routing plan','Route & service'/u)
  assert.match(routingPlansMigration, /route\."JobRoute_RouteJSON"->>'source' in \('accepted_quote','accepted_quote_update'\)/u)
  assert.match(routingPlansMigration, /Booking-only operational legs remain separate/u)
  assert.match(routingPlansMigration, /perform booking_api\.apply_quote_routing_plan/u)
  assert.match(routingPlansMigration, /'quote_routing_plan_applied'/u)
  assert.match(routingOrderMigration, /carrierName/u)
  assert.match(routingOrderMigration, /not in \('accepted_quote','accepted_quote_update'\)/u)
  assert.match(routingOrderMigration, /quote_route_count\+operational_order\.sequence_no/u)
})
