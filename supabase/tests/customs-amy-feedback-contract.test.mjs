import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

const [referenceMigration, jobHandoffMigration, dexterParityMigration, declarationModel, declarationPage, provider, providerEdge, dexterRuntime] = await Promise.all([
  read("supabase/migrations/20260820163000_customs_transaction_nature_reference.sql"),
  read("supabase/migrations/20260820151000_job_customs_handoff.sql"),
  read("supabase/migrations/20260820151500_job_customs_dexter_parity.sql"),
  read("multideck.client/src/lib/customs-declaration.ts"),
  read("multideck.client/src/pages/customs-declarations-page.tsx"),
  read("supabase/functions/_shared/icustoms.ts"),
  read("supabase/functions/icustoms-api/index.ts"),
  read("supabase/functions/agent-dexter/index.ts"),
])

test("DE 8/5 publishes every currently usable transaction code and defaults common sales to 11", () => {
  const expectedCodes = ["11", "12", "13", "14", "19", "21", "22", "23", "29", "3", "41", "42", "51", "52", "7", "8", "91", "99"]
  for (const code of expectedCodes) {
    assert.match(referenceMigration, new RegExp(`'transaction_nature', '${code}'`))
    assert.match(declarationModel, new RegExp(`"${code}"`))
    assert.match(provider, new RegExp(`"${code}"`))
  }
  assert.doesNotMatch(referenceMigration, /'transaction_nature', '6'/)
  assert.match(declarationModel, /transactionNature: "11"/)
  assert.match(jobHandoffMigration, /'transactionNature', '11'/)
})

test("Customs reference fields can be searched by typing while their trigger has focus", () => {
  assert.match(declarationPage, /event\.key\.length === 1/)
  assert.match(declarationPage, /setQuery\(event\.key\)/)
  assert.match(declarationPage, /setOpen\(true\)/)
})

test("exports require eight commodity digits while imports retain ten", () => {
  assert.match(declarationModel, /draft\.direction === "export" \? 8 : 10/)
  assert.match(declarationPage, /declarationDirection === "export" \? 8 : 10/)
  assert.match(provider, /direction === "export" \? 8 : 10/)
  assert.match(providerEdge, /valid 8-digit export commodity code/)
  assert.match(providerEdge, /valid 10-digit import commodity code/)
})

test("visible import costs map onto official CDS DE 4\/9 codes before provider submission", () => {
  for (const label of ["Freight costs", "VAT value adjustment (AVV)", "Insurance costs", "Containers and packing"]) {
    assert.match(declarationPage, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }
  for (const code of ["AP", "AQ", "AV", "AW", "AK", "AD"]) {
    assert.match(provider, new RegExp(`"${code}"`))
  }
  assert.doesNotMatch(provider, /borderMode[\s\S]*?"AR"/)
  assert.doesNotMatch(provider, /borderMode[\s\S]*?"AS"/)
  assert.match(provider, /importCostAdjustmentsByItem/)
  assert.match(provider, /allocatedAmounts/)
  assert.match(provider, /EXW imports require freight costs for CDS valuation/)
})

test("Dexter can read, edit and watch the same import costs without broader table access", () => {
  const fields = ["freightChargeAmount", "vatValueAdjustmentAmount", "insuranceCostAmount", "containerPackingCostAmount"]
  for (const field of fields) {
    assert.match(dexterParityMigration, new RegExp(`'${field}'`))
    assert.match(dexterParityMigration, new RegExp(`\\"${field}\\"`))
  }
  assert.match(dexterParityMigration, /AIDexterWatchCapability_FieldsJSON/)
  assert.match(dexterParityMigration, /booking_api\.customs_access\(auth\.uid\(\), declaration\."CUST_id", false\)/)
  assert.match(dexterParityMigration, /_multideck_dexter_customs_declaration_watch_change/)
  assert.match(dexterParityMigration, /AI_DexterWatchSignals/)
  assert.match(dexterRuntime, /Import declarations may also record freight, VAT value adjustment, insurance, and container or packing costs/)
})
