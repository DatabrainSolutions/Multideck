import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const repoRoot = resolve(import.meta.dirname, "../..")
const financeSetup = readFileSync(resolve(repoRoot, "multideck.client/src/pages/finance-setup-page.tsx"), "utf8")
const accounts = readFileSync(resolve(repoRoot, "multideck.client/src/pages/crm-accounts-page.tsx"), "utf8")

test("finance connection and retry history show retained date and time evidence", () => {
  assert.match(financeSetup, /dateStyle: "medium", timeStyle: "short"/)
  assert.match(financeSetup, /dateTime=\{run\.FINConfigRun_RequestedAt\}/)
  assert.match(financeSetup, /dateTime=\{run\.FINConfigRun_CompletedAt\}/)
  assert.match(financeSetup, /dateTime=\{item\.FINIntQ_LastAttemptAt\}/)
  assert.match(financeSetup, /item\.FINIntQ_AttemptCount === 1 \? "attempt" : "attempts"/)
})

test("blocked mirror rows offer a corrective workflow before retrying", () => {
  assert.match(financeSetup, /Create or sync customer/)
  assert.match(financeSetup, /Create or sync supplier/)
  assert.match(financeSetup, /\/customers\?sync=accounting/)
  assert.match(financeSetup, /\/suppliers\?sync=accounting/)
  assert.match(financeSetup, /Review mappings/)
  assert.match(financeSetup, /await load\(selectedEntityId\)/)
})

test("account recovery deep links open the existing provider sync workflow", () => {
  assert.match(accounts, /new URLSearchParams\(window\.location\.search\)\.get\("sync"\) !== "accounting"/)
  assert.match(accounts, /setSyncOpen\(true\)/)
  assert.match(accounts, /Create or link every Multideck/)
  assert.match(accounts, /Sync all accounts/)
})
