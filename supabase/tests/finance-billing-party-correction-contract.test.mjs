import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const root = new URL("../", import.meta.url)
const migration = await readFile(new URL("migrations/20260909163000_finance_document_billing_party_correction.sql", root), "utf8")
const edge = await readFile(new URL("functions/finance-subledger/index.ts", root), "utf8")
const dexter = await readFile(new URL("functions/agent-dexter/index.ts", root), "utf8")

test("billing-party correction is a controlled reversal and replacement", () => {
  assert.match(migration, /multideck_finance_correct_document_billing_party/)
  assert.match(migration, /v_reversal_id/)
  assert.match(migration, /v_replacement_id/)
  assert.match(migration, /FIN_CashAllocations/)
  assert.match(migration, /correct_billing_party/)
  assert.match(migration, /FIN_DocumentLineJobLinks/)
  assert.doesNotMatch(migration, /set\s+"FINDoc_PartyOrgID"\s*=\s*p_new_party_org_id/i)
})

test("the privileged route checks both drafting and posting permissions", () => {
  assert.match(edge, /correct-billing-party/)
  assert.match(edge, /documentPermission\(document\.FINDoc_TypeCode\)/)
  assert.match(edge, /Finance\.ReviewAndPost/)
  assert.match(dexter, /billing-party corrections remain manual finance controls/i)
})
