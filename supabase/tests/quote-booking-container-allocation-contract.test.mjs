import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = await readFile(
  new URL("../migrations/20260904161000_quote_booking_container_allocation.sql", import.meta.url),
  "utf8",
)

test("structured quote quantities become one booking line per physical container", () => {
  assert.match(migration, /quote_container_rows/u)
  assert.match(migration, /jsonb_typeof\(facts->'containerRequests'\) = 'array'/u)
  assert.match(migration, /for unit_index in 1\.\.request_quantity loop/u)
  assert.match(migration, /total_quantity > 100/u)
  assert.match(migration, /'type', request_item->>'type'/u)
})

test("only one requested container inherits quote-level goods totals", () => {
  assert.match(migration, /'packages', case when total_quantity = 1 then package_quantity end/u)
  assert.match(migration, /'packageType', case when total_quantity = 1 then package_type end/u)
  assert.match(migration, /'grossWeightKg', case when total_quantity = 1 then gross_weight end/u)
  assert.match(migration, /'volumeCbm', case when total_quantity = 1 then volume_cbm end/u)
})

test("initial conversion and later accepted quote application share the allocator", () => {
  assert.match(migration, /convert_accepted_quote_before_container_allocation_20260904/u)
  assert.match(migration, /booking_workflow_apply_quote_sync_before_container_allocation_20260904/u)
  assert.match(migration, /'accepted_quote_update'/u)
  assert.match(migration, /replace_quote_containers/u)
})

test("existing operational container records are protected during reconciliation", () => {
  assert.match(migration, /nullif\(btrim\(container\."JobContainer_Number"\), ''\) is null/u)
  assert.match(migration, /nullif\(btrim\(container\."JobContainer_Notes"\), ''\) is null/u)
  assert.match(migration, /quote_container_plan_reconciled/u)
})

test("the shared conversion boundaries remain service-role only", () => {
  assert.match(migration, /security definer/u)
  assert.match(migration, /grant execute on function booking_api\.convert_accepted_quote\(uuid, uuid, uuid\) to service_role/u)
  assert.match(migration, /grant execute on function public\.booking_workflow_apply_quote_sync\(uuid, uuid, uuid, jsonb\) to service_role/u)
})

test("Dexter booking reads expose the reconciled container plan through the existing safe domain", () => {
  assert.match(migration, /multideck_dexter_domain_bookings_before_container_allocation_20260904/u)
  assert.match(migration, /'containers', coalesce\(container_plan\.lines, '\[\]'::jsonb\)/u)
  assert.match(migration, /container plan, dates, tracking status/u)
  assert.match(migration, /grant execute on function public\.multideck_dexter_domain_bookings\(uuid, text, integer\) to service_role/u)
})
