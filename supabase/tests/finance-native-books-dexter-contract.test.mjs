import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const dexter = readFileSync(new URL('../functions/agent-dexter/index.ts', import.meta.url), 'utf8')

test('Dexter states the exact unsupported native-books cutover boundary in chat and watches', () => {
  assert.match(dexter, /independently approved dated cutovers, and CargoWise opening-balance packages are not yet available as Dexter chat reads, writes or Watching for you signals/)
  assert.match(dexter, /General-ledger reads and status\/mirrorStatus watches do not expose the linked reversal relationship or its reason/)
  assert.match(dexter, /CargoWise opening-balance packages, dated charge-mapping cutovers and linked-journal-reversal relationships have no exact watch adapter/)
  assert.match(dexter, /Do not substitute a generic journal status, Finance or account watch/)
})
