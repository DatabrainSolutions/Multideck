import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import {
  createCsvParser,
  createUkslEntryParser,
  extractListingNotes,
  listIsStale,
  normalizeScreeningName,
  parseCsv,
  parseUkslEntries,
} from "../functions/_shared/screening.ts"

const repoRoot = resolve(import.meta.dirname, "../..")
const ukslFixture = `Report Date: 18-Aug-2026
Last Updated,Unique ID,OFSI Group ID,Name 6,Name 1,Name 2,Name 3,Name type,Regime Name,Designation Type,Other Information,UK Statement of Reasons,Address Country,Date Designated
04/08/2026,RUS1234,G-88,,ALFA,SHIPPING,LTD,Primary Name,Russia,Entity,,Reason one,IR,01/03/2022
04/08/2026,RUS1234,G-88,,ALFA,SHIPPING,LTD,Primary Name,Russia,Entity,,Reason one,IR,01/03/2022
04/08/2026,RUS1234,G-88,,ALPHA,SHIPPING,,AKA,Russia,Entity,,Reason one,IR,01/03/2022
04/08/2026,RUS5555,G-91,,IVAN,PETROV,,Primary Name,Russia,Individual,,Reason two,RU,12/04/2022
`

test("normalizes legal suffixes and punctuation out of party names", () => {
  assert.equal(normalizeScreeningName("Alfa Shipping Ltd."), "alfa shipping")
  assert.equal(normalizeScreeningName("  Marlow Apparel Limited "), "marlow apparel")
  assert.equal(normalizeScreeningName("---"), null)
})

test("parses quoted CSV rows without dropping commas inside fields", () => {
  const rows = parseCsv('a,b\n"1,2",three\n')
  assert.deepEqual(rows[1], ["1,2", "three"])
})

test("parses escaped quotes that split across chunks", () => {
  const rows = []
  const parser = createCsvParser((row) => rows.push(row))
  parser.push('a,b\n"he')
  parser.push('llo ""x",y\n')
  parser.end()
  assert.deepEqual(rows[1], ['hello "x', "y"])
})

test("streams the current UKSL shape in small chunks", () => {
  const currentShape = `Report Date: 18-Aug-2026
Last Updated,Unique ID,OFSI Group ID,Name 6,Name 1,Name 2,Name 3,Name type,Regime Name,Designation Type,Address Country,Date Designated
04/08/2026,RUS1234,G-88,,ALFA,SHIPPING,LTD,Primary Name,Russia,Entity,IR,01/03/2022
`
  const entries = []
  const parser = createUkslEntryParser((entry) => entries.push(entry))
  for (let index = 0; index < currentShape.length; index += 17) {
    parser.push(currentShape.slice(index, index + 17))
  }
  parser.end()
  assert.equal(entries.length, 1)
  assert.equal(entries[0].ukRef, "RUS1234")
  assert.equal(entries[0].otherInformation, null)
})

test("extracts the UK statement of reasons as listing notes", () => {
  const notes = extractListingNotes("(UK Sanctions List Ref):GHR0086. (UK Statement of Reasons):Forced conversions of girls from religious minorities. (Gender):Male")
  assert.equal(notes, "Forced conversions of girls from religious minorities")
})

test("keeps untagged historic narrative after the UN reference", () => {
  const notes = extractListingNotes('(UK Sanctions List Ref):AQD0302. (UN Ref):QDi.289. In approximately 2005, ran a "basic training" camp for Al-Qaida.')
  assert.match(notes ?? "", /basic training/)
  assert.doesNotMatch(notes ?? "", /AQD0302/)
})

test("reads UKSL names and consolidates duplicate designation rows by Unique ID", () => {
  const entries = parseUkslEntries(ukslFixture)
  assert.equal(entries.length, 3)
  assert.equal(entries[0].groupId, "RUS1234")
  assert.equal(entries[0].normalizedName, "alfa shipping")
  assert.equal(entries[1].normalizedName, "alpha shipping")
  assert.equal(entries[0].regime, "Russia")
  assert.equal(entries[0].listedOn, "2022-03-01")
  assert.equal(entries[2].groupType, "Individual")
})

test("skips the UKSL report-date preamble and uses the Unique ID as the group key", () => {
  const currentShape = `Report Date: 18-Aug-2026
Last Updated,Unique ID,OFSI Group ID,Name 6,Name 1,Name 2,Name 3,Name type,Regime Name,Designation Type,Address Country,Date Designated
04/08/2026,RUS1234,G-88,,ALFA,SHIPPING,LTD,Primary Name,Russia,Entity,IR,01/03/2022
`
  const entries = parseUkslEntries(currentShape)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].groupId, "RUS1234")
  assert.equal(entries[0].normalizedName, "alfa shipping")
  assert.equal(entries[0].ukRef, "RUS1234")
  assert.equal(entries[0].regime, "Russia")
})

test("treats a list older than 36 hours as stale", () => {
  assert.equal(listIsStale(new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString()), true)
  assert.equal(listIsStale(new Date().toISOString()), false)
  assert.equal(listIsStale(null), true)
})

test("registers UKSL screening as a Dexter domain, action and watch with no live government scrape per query", () => {
  const migration = readFileSync(resolve(repoRoot, "supabase/migrations/20260819100000_party_screening_ofsi.sql"), "utf8")
  const ukslMigration = readFileSync(resolve(repoRoot, "supabase/migrations/20260820103442_uk_sanctions_list_feed.sql"), "utf8")
  const edgeFunction = readFileSync(resolve(repoRoot, "supabase/functions/agent-dexter/index.ts"), "utf8")
  assert.match(migration, /multideck_dexter_domain_screening/)
  assert.match(migration, /'run_screening_check'/)
  assert.match(migration, /'screening',\s+'Party screening'/)
  assert.match(ukslMigration, /sanctionslist\.fcdo\.gov\.uk\/docs\/UK-Sanctions-List\.csv/)
  assert.match(edgeFunction, /domain === "screening"/)
  assert.match(edgeFunction, /the screening data domain/)
  assert.match(edgeFunction, /Use screening for UK Sanctions List freshness/)
})

test("returns one consolidated UKSL result per Unique ID without a silent row cap", () => {
  const migration = readFileSync(resolve(repoRoot, "supabase/migrations/20260820103442_uk_sanctions_list_feed.sql"), "utf8")
  const edgeFunction = readFileSync(resolve(repoRoot, "supabase/functions/screening/index.ts"), "utf8")
  const dexter = readFileSync(resolve(repoRoot, "supabase/functions/agent-dexter/index.ts"), "utf8")
  assert.match(migration, /pg_trgm\.similarity_threshold/)
  assert.match(migration, /'totalCount', v_match_count/)
  assert.match(migration, /distinct on \(candidate\."ScreeningListEntry_GroupId"\)/)
  assert.match(edgeFunction, /setMonth\(since\.getMonth\(\) - 3\)/)
  assert.match(dexter, /matchCount and totalCount are the full number/)
})
