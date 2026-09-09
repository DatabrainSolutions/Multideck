import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import vm from "node:vm"
import ts from "typescript"

const directionSource = await readFile(new URL("../src/lib/freight-direction.ts", import.meta.url), "utf8")
const quoteSource = await readFile(new URL("../src/pages/quotes-page.tsx", import.meta.url), "utf8")
const bookingSource = await readFile(new URL("../src/components/multideck/booking-components.tsx", import.meta.url), "utf8")
const workflowSource = await readFile(new URL("../../supabase/functions/quotes-workflow/index.ts", import.meta.url), "utf8")
const runtime = vm.createContext({})
vm.runInContext(ts.transpileModule(directionSource.replace(/^export /gm, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, runtime)
const bookingAst = ts.createSourceFile("booking.tsx", bookingSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const bookingCalculation = bookingAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "calculatedDirectionForBooking")
assert.ok(bookingCalculation)
vm.runInContext(ts.transpileModule(bookingCalculation.getText(bookingAst), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, runtime)

test("actual Booking calculation leaves a blank draft direction operator-owned", () => {
  const lookups = { offices: [{ id: "office", countryCode: "GB" }], countries: [{ code: "AD", name: "Andorra", alpha3: null }] }
  for (const placeholder of [null, "", "—"]) {
    const workspace = { booking: { officeId: "office", direction: "domestic", origin: placeholder, destination: placeholder }, routes: [] }
    assert.equal(runtime.calculatedDirectionForBooking(workspace, lookups), null)
    workspace.booking.editableDetails = { customerReference: "Internal verification" }
    assert.equal(runtime.calculatedDirectionForBooking(workspace, lookups), null)
  }
})

test("missing route countries never match an optional empty country alias", () => {
  const countries = [{ code: "AD", name: "Andorra", alpha3: null }, { code: "GB", name: "United Kingdom", alpha3: "GBR" }]
  for (const missing of [undefined, null, "", "  "]) {
    assert.equal(runtime.countryCodeFromFreightLocation(missing, missing, countries), null)
    assert.equal(runtime.calculateQuoteFreightDirection({ operatingCountryCode: "GB", originUnlocode: missing, destinationUnlocode: missing, countries }), null)
    assert.equal(runtime.calculateQuoteFreightDirection({ operatingCountryCode: "GB", originUnlocode: "GBLON", destinationUnlocode: missing, countries }), null)
  }
  assert.equal(runtime.countryCodeFromFreightLocation("GBR", null, countries), "GB")
  for (const [origin, destination, expected] of [["GBLON", "GBFXT", "Domestic"], ["GBLON", "FRPAR", "Export"], ["FRPAR", "GBLON", "Import"], ["FRPAR", "DEHAM", "Cross trade"]]) {
    assert.equal(runtime.calculateQuoteFreightDirection({ operatingCountryCode: "GB", originUnlocode: origin, destinationUnlocode: destination, countries }), expected)
  }
})

test("direction uses the operating country and overall route", () => {
  assert.match(directionSource, /origin === operating && destination === operating[\s\S]*return "Domestic"/u)
  assert.match(directionSource, /origin === operating[\s\S]*return "Export"/u)
  assert.match(directionSource, /destination === operating[\s\S]*return "Import"/u)
  assert.match(directionSource, /return "Cross trade"/u)
})

test("quote and booking editors calculate rather than freely persist direction", () => {
  assert.match(quoteSource, /calculatedDirectionForQuote\(next, lookups\)/u)
  assert.match(quoteSource, /Direction \(auto\)/u)
  assert.match(bookingSource, /calculatedDirectionForBooking\(workspace, bookingLookups\)/u)
  assert.match(bookingSource, /editable=\{editable && !calculatedDirection\}/u)
})

test("quote sources expose each office country without a tenant hard-code", () => {
  assert.match(workflowSource, /Office_ID,Office_Code,Office_Name,Office_CountryCode/u)
  assert.match(workflowSource, /countryCode: row\.Office_CountryCode/u)
  assert.doesNotMatch(directionSource, /operatingCountryCode:\s*["']GB["']/u)
})
