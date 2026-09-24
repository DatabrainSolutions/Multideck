import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const dexter = read('../functions/agent-dexter/index.ts')
const migration = read('../migrations/20260922170000_warehouse_import_dexter_boundary.sql')

test('warehouse imports disclose the chat and watch exception without adding unreviewed bulk actions', () => {
  const warehouseActions = dexter.match(/const WAREHOUSE_EDGE_ACTIONS = new Set\(\[([\s\S]*?)\]\)/)?.[1]
  assert.ok(warehouseActions)
  assert.match(warehouseActions, /"create_warehouse_item"/)
  assert.match(warehouseActions, /"create_warehouse_location"/)
  assert.doesNotMatch(warehouseActions, /import|bulk/)
  assert.match(dexter, /Do not turn an attached spreadsheet into a sequence of create actions/)
  assert.match(dexter, /Saved item and location fields may use the listed warehouse capability/)
  assert.match(dexter, /batch-completion watches are unsupported\. Choose status=unsupported/)
  assert.match(migration, /AIDexterDomain_Code" = 'warehouse_reference'/)
  assert.match(migration, /AIDexterWatchCapability_Code" = 'warehouse'/)
  assert.match(migration, /\/warehouse\/items or \/warehouse\/locations/)
})
