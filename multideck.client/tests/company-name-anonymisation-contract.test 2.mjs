import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(path, import.meta.url), "utf8")

const [roadPage, roadComponents, gallery, financeSetup, financeDocument, financePage, baseline] = await Promise.all([
  read("../src/pages/domestic-road-booking-page.tsx"),
  read("../src/components/multideck/domestic-road-components.tsx"),
  read("../src/pages/components-gallery-page.tsx"),
  read("../src/pages/finance-setup-page.tsx"),
  read("../src/pages/finance-document-page.tsx"),
  read("../src/pages/finance-page.tsx"),
  read("../../supabase/baseline/public-schema.sql"),
])

test("demo company fixtures use explicit anonymous identities", () => {
  assert.match(roadPage, /Demo Freight Company/)
  assert.match(roadPage, /@demo-freight\.example/)
  assert.match(roadComponents, /customer: "Demo Freight Company"/)
  assert.match(gallery, /Demo Apparel Company/)
  assert.match(baseline, /Company_Name" = 'Demo Freight Company Ltd'/)
})

test("finance screens do not render private external-company routing values", () => {
  for (const source of [financeSetup, financeDocument, financePage]) {
    assert.doesNotMatch(source, /ACCIC_ExternalTenantName/)
    assert.doesNotMatch(source, /FINConfigRun_ExternalCompany/)
  }
  assert.match(financeSetup, /External accounting company/)
  assert.match(financePage, /External accounting company/)
})
