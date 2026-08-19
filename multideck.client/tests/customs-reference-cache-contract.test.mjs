import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("../src/lib/customs-reference-data.ts", import.meta.url), "utf8")

test("Customs reference catalogues are server-filtered and deduplicated by direction", () => {
  assert.match(source, /\.in\("catalog_code", \[\.\.\.customsCatalogCodes\]\)/)
  assert.match(source, /\.in\("direction", \["all", direction\]\)/)
  assert.match(source, /const customsReferenceCache = new Map/)
  assert.match(source, /if \(cached\?\.inFlight\) return cached\.inFlight/)
  assert.match(source, /CUSTOMS_REFERENCE_CACHE_TTL_MS = 5 \* 60_000/)
  assert.match(source, /customsReferenceCache\.delete\(direction\)/)
})
