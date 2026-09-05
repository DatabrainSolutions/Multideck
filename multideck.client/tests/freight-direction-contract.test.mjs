import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const directionSource = await readFile(new URL("../src/lib/freight-direction.ts", import.meta.url), "utf8")
const quoteSource = await readFile(new URL("../src/pages/quotes-page.tsx", import.meta.url), "utf8")
const bookingSource = await readFile(new URL("../src/components/multideck/booking-components.tsx", import.meta.url), "utf8")
const workflowSource = await readFile(new URL("../../supabase/functions/quotes-workflow/index.ts", import.meta.url), "utf8")

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

