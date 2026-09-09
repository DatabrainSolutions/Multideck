import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8")
const wizard = read("../src/components/multideck/provider-customer-setup-wizard.tsx")
const financePage = read("../src/pages/finance-page.tsx")
const financeFunction = read("../../supabase/functions/finance-subledger/index.ts")

test("ERPNext and Sage customer setup use the controlled finance currency selector", () => {
  assert.ok(wizard.includes("currencyOptions: string[]"))
  assert.ok(wizard.includes("availableCurrencies.map((code) =>"))
  assert.equal(wizard.match(/<Select value=\{currencyCode \|\| undefined\} onValueChange=\{setCurrencyCode\}>/g)?.length, 2)
  assert.ok(!wizard.includes('<Input id="provider-currency"'))
  assert.ok(!wizard.includes('<Input id="sage-currency"'))
  assert.ok(financePage.includes("currencyOptions={[...new Set([baseCurrencyCode, ...(options?.currencies ?? []).map((item) => item.code)]"))
})

test("draft options expose the controlled currency reference list", () => {
  assert.ok(financeFunction.includes('admin.from("sys_Currency").select("Currency_Code")'))
  assert.ok(financeFunction.includes("result.currencies = (currencies.data ?? []).flatMap"))
})

test("ERPNext customer permission failures explain the recovery action", () => {
  assert.ok(wizard.includes('/^PermissionError$/i'))
  assert.ok(wizard.includes("Give the connected API user Create permission for Customer records in ERPNext, then retry."))
})
