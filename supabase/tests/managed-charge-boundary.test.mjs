import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')

test('provisioned schema contains the managed charge write boundary', () => {
  const migration = read('migrations/20260923121000_charge_catalogue_quote_booking_enforcement.sql').trim()
  const baseline = read('baseline/public-schema.sql')
  assert.ok(baseline.includes(migration), 'new tenant provisioning must include the write boundary')
  assert.match(migration, /create function public\.quote_workflow_save_quote[\s\S]*multideck_resolve_operational_charge/)
  assert.match(migration, /create function booking_api\.convert_accepted_quote[\s\S]*multideck_assign_booking_charge_codes/)
  assert.match(migration, /create function public\.booking_workflow_apply_quote_sync_v2[\s\S]*multideck_assign_booking_charge_codes/)
  assert.match(migration, /create trigger zz_managed_quote_charge_codes/)
  assert.match(migration, /_multideck_validate_nominal_group\(entity_id,mapping\.cost_group_id,'cost'\)/)
  assert.match(migration, /_multideck_validate_nominal_group\(entity_id,mapping\.revenue_group_id,'revenue'\)/)
  assert.match(migration, /revoke all on function quote_api\.save_quote\(uuid,uuid,jsonb\) from service_role/)
  assert.match(migration, /revoke all on function public\.booking_workflow_apply_quote_sync_confirmed\(uuid,uuid,uuid,jsonb,boolean\) from service_role/)
})

test('Booking responses retain provisional state and historical charge codes alongside managed identities', () => {
  const edge = read('functions/bookings-workflow/index.ts')
  assert.match(edge, /code: codeById\.get\(chargeCodeId\) \?\? charge\.code \?\? null/)
  assert.match(edge, /action === "attachment-access"/)
  assert.match(edge, /return jsonResponse\(request, await withProvisionalState\(admin, userId, await withManagedChargeCodes\(admin, data\)\)\)/)
  assert.match(edge, /workspace: await withProvisionalState\(admin, userId, await withManagedChargeCodes\(admin, data\.workspace\)\)/)
})
