import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import {
  createCsvParser,
  createOfsiEntryParser,
  extractOfsiListingNotes,
  listIsStale,
  normalizeScreeningName,
  parseCsv,
  parseOfsiEntries,
} from "../functions/_shared/screening.ts"

const repoRoot = resolve(import.meta.dirname, "../..")
const ofsiFixture = `Unique ID,Group ID,Name 1,Name 2,Name 3,Alias Type,Group Type,Regime Name,Listed On,Country,UK Sanctions List Ref
1001,G-88,ALFA,SHIPPING,LTD,Primary name,Entity,Russia,01/03/2022,IR,RUS1234
1002,G-88,ALPHA,SHIPPING,,AKA,Entity,Russia,01/03/2022,IR,RUS1234
1003,G-91,IVAN,PETROV,,Primary name,Individual,Russia,12/04/2022,RU,RUS5555
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

test("streams the current OFSI shape in small chunks", () => {
  const currentShape = `Last Updated,03/06/2026
Name 6,Name 1,Name 2,Name 3,Name 4,Name 5,Title,Country,Other Information,Group Type,Alias Type,Regime,Listed On,Group ID
,ALFA,SHIPPING,LTD,,,,IR,"(UK Sanctions List Ref):RUS1234.",Entity,Primary name,Russia,01/03/2022,G-88
`
  const entries = []
  const parser = createOfsiEntryParser((entry) => entries.push(entry))
  for (let index = 0; index < currentShape.length; index += 17) {
    parser.push(currentShape.slice(index, index + 17))
  }
  parser.end()
  assert.equal(entries.length, 1)
  assert.equal(entries[0].ukRef, "RUS1234")
  assert.equal(entries[0].otherInformation, null)
})

test("extracts the UK statement of reasons as listing notes", () => {
  const notes = extractOfsiListingNotes("(UK Sanctions List Ref):GHR0086. (UK Statement of Reasons):Forced conversions of girls from religious minorities. (Gender):Male")
  assert.equal(notes, "Forced conversions of girls from religious minorities")
})

test("keeps untagged OFSI narrative after the UN reference", () => {
  const notes = extractOfsiListingNotes('(UK Sanctions List Ref):AQD0302. (UN Ref):QDi.289. In approximately 2005, ran a "basic training" camp for Al-Qaida.')
  assert.match(notes ?? "", /basic training/)
  assert.doesNotMatch(notes ?? "", /AQD0302/)
})

test("reads OFSI names, aliases and group ids from the official CSV shape", () => {
  const entries = parseOfsiEntries(ofsiFixture)
  assert.equal(entries.length, 3)
  assert.equal(entries[0].groupId, "G-88")
  assert.equal(entries[0].normalizedName, "alfa shipping")
  assert.equal(entries[1].normalizedName, "alpha shipping")
  assert.equal(entries[0].regime, "Russia")
  assert.equal(entries[0].listedOn, "2022-03-01")
  assert.equal(entries[2].groupType, "Individual")
})

test("skips the OFSI last-updated preamble and reads group id from the current file", () => {
  const currentShape = `Last Updated,03/06/2026
Name 6,Name 1,Name 2,Name 3,Name 4,Name 5,Title,Country,Other Information,Group Type,Alias Type,Regime,Listed On,Group ID
,ALFA,SHIPPING,LTD,,,,IR,"(UK Sanctions List Ref):RUS1234.",Entity,Primary name,Russia,01/03/2022,G-88
`
  const entries = parseOfsiEntries(currentShape)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].groupId, "G-88")
  assert.equal(entries[0].normalizedName, "alfa shipping")
  assert.equal(entries[0].ukRef, "RUS1234")
  assert.equal(entries[0].regime, "Russia")
})

test("treats a list older than 36 hours as stale", () => {
  assert.equal(listIsStale(new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString()), true)
  assert.equal(listIsStale(new Date().toISOString()), false)
  assert.equal(listIsStale(null), true)
})

test("registers screening as a Dexter domain, action and watch with no live government scrape per query", () => {
  const migration = readFileSync(resolve(repoRoot, "supabase/migrations/20260819100000_party_screening_ofsi.sql"), "utf8")
  const edgeFunction = readFileSync(resolve(repoRoot, "supabase/functions/agent-dexter/index.ts"), "utf8")
  assert.match(migration, /multideck_dexter_domain_screening/)
  assert.match(migration, /'run_screening_check'/)
  assert.match(migration, /'screening',\s+'Party screening'/)
  assert.match(migration, /ofsistorage\.blob\.core\.windows\.net\/publishlive\/2022format\/ConList\.csv/)
  assert.match(edgeFunction, /domain === "screening"/)
  assert.match(edgeFunction, /the screening data domain/)
  assert.match(edgeFunction, /Use screening for UK OFSI list freshness/)
})

test("returns every qualifying OFSI match through trigram search instead of a silent 12-row cap", () => {
  const migration = readFileSync(resolve(repoRoot, "supabase/migrations/20260819150000_screening_all_matches.sql"), "utf8")
  const edgeFunction = readFileSync(resolve(repoRoot, "supabase/functions/screening/index.ts"), "utf8")
  const dexter = readFileSync(resolve(repoRoot, "supabase/functions/agent-dexter/index.ts"), "utf8")
  assert.match(migration, /pg_trgm\.similarity_threshold/)
  assert.match(migration, /'totalCount', v_match_count/)
  assert.match(migration, /interval '3 months'/)
  assert.doesNotMatch(migration, /limit 12/i)
  assert.doesNotMatch(migration, /char_length\(v_normalized\) >= 5/)
  assert.match(edgeFunction, /setMonth\(since\.getMonth\(\) - 3\)/)
  assert.match(dexter, /matchCount and totalCount are the full number/)
})

