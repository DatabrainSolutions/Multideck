import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8")
const edge = read("../functions/finance-subledger/index.ts")
const page = read("../../multideck.client/src/pages/finance-document-page.tsx")
const api = read("../../multideck.client/src/lib/finance-subledger-api.ts")

test("finance document detail returns one bounded preferred billing address after tenant and permission checks", () => {
  for (const evidence of [
    "const document = await scopedDocument(admin, current, id)",
    "await requirePermission(admin, current.User_ID, viewPermission(typeLedger(document.FINDoc_TypeCode)))",
    "preferredPartyBillingAddress(admin, document.FINDoc_PartyOrgID)",
    '.eq("OrgAdd_IsActive", true)',
    '.limit(100)',
    'code === "billing" ? 30 : code === "main" ? 20 : code === "postal" ? 10 : 0',
    "countryName: country?.RN_Desc ?? null",
    "billingAddress,",
  ]) assert.ok(edge.includes(evidence), `Missing finance address evidence: ${evidence}`)
})

test("the invoice header leads with bill-to identity and document fields without exposing source or legal entity controls", () => {
  for (const evidence of [
    'sl_invoice: "Invoice details"',
    'sl_invoice: "Invoice number"',
    'sl_invoice: "Invoice date"',
    'pl_invoice: "Supplier and invoice details remain editable until this draft enters finance review."',
    'debit_note: "Supplier credit note information"',
    'ledger === "receivables" ? "Bill to" : "Supplier"',
    '"No billing address is saved for this account."',
    '"Job reference (optional)"',
    'disabled={!editable}',
    "detail?.billingAddress ?? null",
  ]) assert.ok(page.includes(evidence), `Missing invoice header evidence: ${evidence}`)
  assert.ok(!page.includes('htmlFor="finance-detail-source"'), "The invoice header must not expose a Source field.")
  assert.ok(!page.includes('htmlFor="finance-detail-entity"'), "The tenant issuer must not be a document field.")
  assert.ok(api.includes("billingAddress: null | {"), "The typed document workspace must carry its billing address.")
})

test("editable invoice and credit details remain loadable while accounting-period options roll out", () => {
  for (const evidence of [
    'admin.from("FIN_Periods").select("FINPeriod_ID,FINPeriod_LegalEntityID,FINPeriod_Code,FINPeriod_Name,FINPeriod_StartDate,FINPeriod_EndDate,FINPeriod_StatusCode,FINPeriod_BaseCurrencyCode")',
    '.in("FINPeriod_LegalEntityID", ids)',
    "result.accountingPeriods = periods.data ?? []",
  ]) assert.ok(edge.includes(evidence), `Missing draft accounting-period evidence: ${evidence}`)

  assert.ok(
    page.includes("(options.accountingPeriods ?? []).filter"),
    "Editable documents must tolerate an older draft-options response while the finance function is deployed.",
  )
  assert.ok(api.includes("accountingPeriods: Array<{"), "Draft options must expose accounting periods to the document editor.")
})

test("address projection remains read-only and does not create a second Dexter or watch workflow", () => {
  for (const evidence of [
    "Presentation-only projection of an address already available through the",
    "It does not add a finance write or event",
    "FIN_Documents and Org_Master remain Dexter's evidence/watch boundaries",
  ]) assert.ok(edge.includes(evidence), `Missing Dexter/watch boundary evidence: ${evidence}`)
})
