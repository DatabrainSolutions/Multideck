import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"
import { buildSync } from "esbuild"
const require = createRequire(import.meta.url)
function sourceModule(path) {
  const source = buildSync({ entryPoints: [new URL(path, import.meta.url).pathname], bundle: true, platform: "node", format: "cjs", write: false }).outputFiles[0].text
  const module = { exports: {} }
  new Function("module", "exports", "require", source)(module, module.exports, require)
  return module.exports
}
const { customsInvoiceErrors, customsInvoiceProjectionErrors, resolveCustomsInvoiceDeclaration, emptyCustomsInvoiceHeader } = sourceModule("../../supabase/functions/_shared/customs-invoices.mts")
const { restoreCustomsInvoiceHeaders, applyCustomsInvoiceImport } = sourceModule("../src/lib/customs-invoices.ts")
const { createStandaloneDeclarationDraft, createExportDeclarationItem, validateStandaloneExportDraft } = sourceModule("../src/lib/customs-declaration.ts")
const { validateICustomsDeclaration } = sourceModule("../../supabase/functions/_shared/icustoms.ts")
const header = (id, number) => ({ ...emptyCustomsInvoiceHeader(id), invoiceNumber: number, invoiceDate: "2026-09-14", currency: "GBP", totalAmount: "100.00" })

test("import preference claims identify the missing proof origin without inferring eligibility", () => {
  const draft = createStandaloneDeclarationDraft("import")
  for (const code of ["200", "300", "320", "400"]) {
    draft.items[0].preferenceCode = code
    draft.items[0].preferentialOrigin = " "
    assert.ok(validateStandaloneExportDraft(draft).some(issue => issue.field === "preferentialOrigin" && issue.scope === "item"))
    draft.items[0].preferentialOrigin = "EU"
    assert.ok(!validateStandaloneExportDraft(draft).some(issue => issue.field === "preferentialOrigin"))
  }
  draft.items[0].preferentialOrigin = ""
  for (const code of ["100", "120", "", "bad"]) {
    draft.items[0].preferenceCode = code
    assert.ok(!validateStandaloneExportDraft(draft).some(issue => issue.field === "preferentialOrigin"))
  }
  draft.direction = "export"; draft.items[0].preferenceCode = "300"
  assert.ok(!validateStandaloneExportDraft(draft).some(issue => issue.field === "preferentialOrigin"))
})

for (const direction of ["import", "export"]) {
  test(`${direction}: seven invoices keep their exact item links after rename, reorder and JSON reload`, () => {
    const draft = createStandaloneDeclarationDraft(direction)
    draft.invoiceHeaders = Array.from({ length: 7 }, (_, i) => header(`invoice-${i}`, `INV-${i + 1}`))
    draft.items = draft.invoiceHeaders.map((invoice, i) => ({ ...createExportDeclarationItem(i + 1), currency: "GBP", invoiceHeaderId: invoice.id }))
    draft.invoiceHeaders[2].invoiceNumber = "RENAMED/003"
    draft.invoiceHeaders.reverse()
    const loaded = restoreCustomsInvoiceHeaders(JSON.parse(JSON.stringify(draft)))
    assert.equal(loaded.invoiceHeaders.find(h => h.id === loaded.items[2].invoiceHeaderId).invoiceNumber, "RENAMED/003")
    assert.deepEqual(customsInvoiceErrors(loaded), [])
    loaded.items[0].invoiceHeaderId = loaded.invoiceHeaders[0].id
    assert.equal(loaded.items[0].invoiceHeaderId, "invoice-6")
    assert.deepEqual(customsInvoiceErrors(loaded), [])
  })
  test(`${direction}: front and backend reject duplicate, empty and dangling references while accepting old drafts`, () => {
    const draft = createStandaloneDeclarationDraft(direction)
    assert.deepEqual(customsInvoiceErrors(draft), [])
    draft.invoiceHeaders = [header("a", "ONE"), header("b", " one "), header("c", "")]
    draft.items[0].invoiceHeaderId = "missing"
    const expected = customsInvoiceErrors(draft)
    assert.equal(expected.length, 3)
    const frontend = validateStandaloneExportDraft(draft)
    const backend = validateICustomsDeclaration(draft, direction)
    for (const error of expected) {
      assert.ok(frontend.some(issue => issue.message === error.message))
      assert.ok(backend.includes(error.message))
    }
    draft.invoiceHeaders = [header("a", "ONE")]
    draft.items[0].invoiceHeaderId = ""
    assert.match(customsInvoiceErrors(draft)[0].message, /select its invoice/)
    assert.deepEqual(customsInvoiceErrors(draft, false), [])
    draft.items[0].invoiceHeaderId = "a"
    draft.items[0].currency = "EUR"
    assert.deepEqual(customsInvoiceErrors(draft), [])
  })
}

test("reimport reuses the invoice identity and preserves reviewed header details in append and replace modes", () => {
  const draft = createStandaloneDeclarationDraft("import")
  draft.invoiceHeaders = [header("a", "INV-1"), header("b", "INV-2")]
  draft.items[0].invoiceHeaderId = "b"
  const imported = { ...header("new-id", "inv-1"), totalAmount: "999.00" }
  const appended = applyCustomsInvoiceImport(draft, [createExportDeclarationItem(2)], "append", imported)
  assert.equal(appended.invoiceHeaders.length, 2)
  assert.equal(appended.invoiceHeaders[0].totalAmount, "100.00")
  assert.deepEqual(appended.items.map(item => item.invoiceHeaderId), ["b", "a"])
  const replaced = applyCustomsInvoiceImport(appended, [createExportDeclarationItem(1)], "replace", header("c", "INV-3"))
  assert.equal(replaced.items.length, 1)
  assert.equal(replaced.items[0].invoiceHeaderId, "c")
  assert.equal(replaced.invoiceHeaders.length, 3)
})

test("legacy invoice import upgrades once without altering any existing row field or guessing ordinary customs references", () => {
  const draft = createStandaloneDeclarationDraft("import")
  delete draft.invoiceHeaders
  draft.items = [
    { ...createExportDeclarationItem(1), id: "invoice-100-1", previousDocumentReference: "142712", currency: "AUD" },
    { ...createExportDeclarationItem(2), id: "invoice-100-2", previousDocumentReference: "142712", currency: "AUD" },
    { ...createExportDeclarationItem(3), id: "invoice-100-3", previousDocumentType: "DCR", previousDocumentReference: "CUSTOMSREF" },
    { ...createExportDeclarationItem(4), previousDocumentReference: "MANUAL" },
  ]
  const restored = restoreCustomsInvoiceHeaders(draft)
  assert.equal(restored.invoiceHeaders.length, 1)
  assert.equal(restored.invoiceHeaders[0].invoiceNumber, "142712")
  assert.equal(restored.items[0].invoiceHeaderId, restored.items[1].invoiceHeaderId)
  assert.equal(restored.items[2].invoiceHeaderId, undefined)
  assert.equal(restored.items[3].invoiceHeaderId, undefined)
  restored.items.forEach((item, i) => { const { invoiceHeaderId, ...unchanged } = item; assert.deepEqual(unchanged, draft.items[i]) })
  assert.deepEqual(restoreCustomsInvoiceHeaders(restored), restored)
  assert.deepEqual(restoreCustomsInvoiceHeaders({ ...draft, invoiceHeaders: [] }).invoiceHeaders, [])
})

test("header checks reject repeated IDs, impossible dates, invalid totals and currencies", () => {
  const draft = { invoiceHeaders: [header("same", "ONE"), { ...header("same", "TWO"), invoiceDate: "2026-02-30", totalAmount: "-1", currency: "" }] }
  assert.deepEqual(customsInvoiceErrors(draft).map(error => error.field), ["invoiceHeaders.1.id", "invoiceHeaders.1.invoiceDate", "invoiceHeaders.1.totalAmount", "invoiceHeaders.1.currency"])
  assert.equal(customsInvoiceErrors({ invoiceHeaders: {} }).length, 1)
})

for (const direction of ["import", "export"]) {
  test(`${direction}: moved fields derive from invoices and ignore stale declaration summaries`, () => {
    const draft = createStandaloneDeclarationDraft(direction)
    draft.invoiceHeaders = [
      { ...header("a", "ONE"), tradeTerms: "CIF", tradeTermsLocation: "London", transactionNature: "11", grossMass: "20", netMass: "15", packageCount: "2", letterOfCreditExchangeRate: "1.23" },
      { ...header("b", "TWO"), totalAmount: "50", tradeTerms: "CIF", tradeTermsLocation: "London", transactionNature: "11", grossMass: "10", netMass: "8", packageCount: "1", letterOfCreditExchangeRate: "1.45" },
    ]
    Object.assign(draft, { totalAmount: "999", currency: "USD", tradeTerms: "EXW", totalGrossMass: "900", exchangeRate: "999" })
    const result = resolveCustomsInvoiceDeclaration(draft)
    assert.equal(result.totalAmount, "150")
    assert.equal(result.currency, "GBP")
    assert.equal(result.tradeTerms, "CIF")
    assert.equal(result.totalGrossMass, "30")
    assert.equal(result.totalNetMass, "23")
    assert.equal(result.totalPackages, "3")
    assert.equal(result.exchangeRate, "")
    assert.deepEqual(customsInvoiceProjectionErrors(result), [])
    draft.invoiceHeaders[1].currency = "EUR"
    draft.invoiceHeaders[1].tradeTerms = "EXW"
    const conflict = resolveCustomsInvoiceDeclaration(draft)
    assert.equal(conflict.totalAmount, "")
    assert.equal(conflict.currency, "")
    assert.equal(conflict.tradeTerms, "")
    assert.deepEqual(customsInvoiceProjectionErrors(conflict).map(issue => issue.field), ["invoiceHeaders.currency", "invoiceHeaders.tradeTerms"])
  })
}

test("legacy declaration-level inputs move into one header once, without overwriting later edits", () => {
  const draft = createStandaloneDeclarationDraft("export")
  Object.assign(draft, { totalAmount: "123", currency: "EUR", exchangeRate: "1.2", tradeTerms: "DAP", tradeTermsLocation: "Paris", totalGrossMass: "40", totalNetMass: "35", totalPackages: "3" })
  const migrated = restoreCustomsInvoiceHeaders(draft)
  assert.equal(migrated.invoiceHeaders.length, 1)
  assert.equal(migrated.invoiceHeaders[0].totalAmount, "123")
  assert.equal(migrated.invoiceHeaders[0].tradeTermsLocation, "Paris")
  assert.equal(migrated.items[0].invoiceHeaderId, migrated.invoiceHeaders[0].id)
  migrated.invoiceHeaders[0].totalAmount = "200"
  assert.equal(restoreCustomsInvoiceHeaders(migrated).invoiceHeaders[0].totalAmount, "200")
})

const { customsToday, selectHmrcExchangeRate, verifyCustomsInvoiceHmrcRates } = sourceModule("../../supabase/functions/_shared/customs-hmrc-exchange-rates.mts")
const { refreshCustomsInvoiceEstimate } = sourceModule("../src/lib/customs-invoices.ts")
const monthly = (rate = "1.1681", month = 9) => ({ data: { attributes: { type: "monthly", year: 2026, month } }, included: [{ type: "exchange_rate", attributes: { currency_code: "EUR", rate, validity_start_date: `2026-${String(month).padStart(2, "0")}-01`, validity_end_date: `2026-${String(month).padStart(2, "0")}-${month === 9 ? "30" : "31"}` } }] })
test("customs today uses the UK submission date across BST midnight", () => {
  assert.equal(customsToday(new Date("2026-09-30T23:30:00Z")), "2026-10-01")
  assert.equal(customsToday(new Date("2026-12-31T23:30:00Z")), "2026-12-31")
})
test("HMRC selects effective rates, catches amendments, and refuses wrong periods or missing currencies", () => {
  const payload = monthly()
  const before = selectHmrcExchangeRate(payload, "EUR", "2026-09-14", "checked")
  assert.equal(before.rate, "1.1681")
  assert.equal(before.direction, "currency_units_per_gbp")
  payload.included.push({ type: "exchange_rate", attributes: { currency_code: "EUR", rate: "1.2000", validity_start_date: "2026-09-16", validity_end_date: "2026-09-30" } })
  assert.equal(selectHmrcExchangeRate(payload, "EUR", "2026-09-15", "checked").rate, "1.1681")
  assert.equal(selectHmrcExchangeRate(payload, "EUR", "2026-09-16", "checked").rate, "1.2000")
  assert.throws(() => selectHmrcExchangeRate(payload, "EUR", "2026-10-01", "checked"), /different rate period/)
  assert.throws(() => selectHmrcExchangeRate(payload, "XYZ", "2026-09-14", "checked"), /no published/)
})
test("estimate refresh preserves inputs and links, changes months, and retains the saved snapshot on failure", async () => {
  const originalFetch = globalThis.fetch
  const draft = { ...createStandaloneDeclarationDraft("import"), customsConversionDate: "2026-09-14", invoiceHeaders: [{ ...header("a", "INV-1"), currency: "EUR", exchangeRate: "1.1681", letterOfCreditExchangeRate: "1.25" }] }
  const snapshot = JSON.stringify(draft)
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => monthly("1.2100", 10) })
    const refreshed = await refreshCustomsInvoiceEstimate(draft, "2026-10-01")
    assert.equal(refreshed.customsConversionDate, "2026-10-01")
    assert.equal(refreshed.invoiceHeaders[0].exchangeRate, "1.2100")
    assert.equal(refreshed.invoiceHeaders[0].letterOfCreditExchangeRate, "1.25")
    assert.deepEqual(refreshed.items, draft.items)
    assert.equal(JSON.stringify(draft), snapshot)
    globalThis.fetch = async () => { throw new Error("Offline") }
    await assert.rejects(() => refreshCustomsInvoiceEstimate(draft, "2026-10-01"), /Offline/)
    assert.equal(JSON.stringify(draft), snapshot)
  } finally { globalThis.fetch = originalFetch }
})
test("submission refuses an earlier estimate date and rechecks amended rates server-side", async () => {
  const originalFetch = globalThis.fetch
  const draft = { customsConversionDate: "2026-09-14", invoiceHeaders: [{ ...header("a", "INV-1"), currency: "EUR", exchangeRate: "1.1681" }] }
  try {
    globalThis.fetch = async () => { throw new Error("Must not fetch stale date") }
    assert.match((await verifyCustomsInvoiceHmrcRates(draft, "2026-10-01"))[0], /submission date/)
    globalThis.fetch = async () => ({ ok: true, json: async () => monthly() })
    assert.deepEqual(await verifyCustomsInvoiceHmrcRates(draft, "2026-09-14"), [])
    globalThis.fetch = async () => ({ ok: true, json: async () => monthly("1.2000") })
    assert.match((await verifyCustomsInvoiceHmrcRates(draft, "2026-09-14"))[0], /differs from HMRC/)
  } finally { globalThis.fetch = originalFetch }
})

for (const direction of ["import", "export"]) {
  test(`${direction}: header-only import never adds, replaces or relinks items`, () => {
    const draft = createStandaloneDeclarationDraft(direction)
    draft.invoiceHeaders = [header("existing", "INV-1")]
    draft.items[0].invoiceHeaderId = "existing"
    const itemSnapshot = JSON.stringify(draft.items)
    const imported = header("new", "INV-2")
    const result = applyCustomsInvoiceImport(draft, [createExportDeclarationItem(2)], "header", imported)
    assert.equal(result.items, draft.items)
    assert.equal(JSON.stringify(result.items), itemSnapshot)
    assert.equal(result.invoiceHeaders.length, 2)
    const repeated = applyCustomsInvoiceImport(result, [], "header", { ...imported, id: "other" })
    assert.equal(repeated.invoiceHeaders.length, 2)
    assert.equal(repeated.items, draft.items)
    const withLines = applyCustomsInvoiceImport(repeated, [createExportDeclarationItem(2)], "append", imported)
    assert.equal(withLines.items.length, draft.items.length + 1)
    assert.equal(withLines.items.at(-1).invoiceHeaderId, "new")
  })
}

const { resolveInvoiceAgreedPlace } = sourceModule("../src/lib/unlocode-directory.ts")
test("agreed places resolve unique names and explicit country codes without guessing ambiguous locations", () => {
  const records = [["GB", "LBA", "Leeds", "Leeds", ""], ["AU", "PER", "Perth", "Perth", ""], ["GB", "PTH", "Perth", "Perth", ""], ["ES", "AGP", "Málaga", "Malaga", ""]]
  assert.equal(resolveInvoiceAgreedPlace("Leeds", records), "GBLBA")
  assert.equal(resolveInvoiceAgreedPlace("gb lba", records), "GBLBA")
  assert.equal(resolveInvoiceAgreedPlace("Malaga", records), "ESAGP")
  assert.equal(resolveInvoiceAgreedPlace("Perth", records), null)
  assert.equal(resolveInvoiceAgreedPlace("Perth, AU", records), "AUPER")
  assert.equal(resolveInvoiceAgreedPlace("Unknown place", records), null)
  const invoice = { ...header("a", "INV-1"), tradeTermsLocation: "Leeds" }
  assert.ok(customsInvoiceErrors({ invoiceHeaders: [invoice] }, false).some(error => error.field.endsWith("tradeTermsLocation")))
  invoice.tradeTermsLocation = "GBLBA"
  assert.deepEqual(customsInvoiceErrors({ invoiceHeaders: [invoice] }, false), [])
})
