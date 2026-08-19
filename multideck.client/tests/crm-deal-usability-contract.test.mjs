import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const detail = readFileSync(new URL("../src/pages/crm-deal-detail-page.tsx", import.meta.url), "utf8")
const crmPage = readFileSync(new URL("../src/pages/crm-page.tsx", import.meta.url), "utf8")

test("deal mode and direction are constrained human choices instead of raw code fields", () => {
  assert.match(detail, /const dealModeOptions =/)
  assert.match(detail, /const dealDirectionOptions =/)
  assert.match(detail, /<InlineSelectField[\s\S]*label="Mode"/)
  assert.match(detail, /<InlineSelectField[\s\S]*label="Direction"/)
  assert.match(detail, /modeCode === "__none" \? null : modeCode/)
  assert.match(detail, /directionCode === "__none" \? null : directionCode/)
  assert.doesNotMatch(detail, /<InlineField label="Mode"/)
  assert.doesNotMatch(detail, /<InlineField label="Direction"/)
})

test("deal board details humanise stored enum codes", () => {
  assert.match(crmPage, /mode: translate\(humanizeDealCode\(deal\.modeCode\)/)
  assert.match(crmPage, /direction: translate\(humanizeDealCode\(deal\.directionCode\)/)
  assert.match(crmPage, /replace\(\/\[_-\]\+\/g, " "\)/)
})

test("deal records are not rewritten by the interface translation pass", () => {
  assert.match(crmPage, /data-i18n-skip dir="auto">\{deal\.name\}/)
  assert.match(crmPage, /data-i18n-skip dir="auto">\{deal\.companyName\}/)
  assert.match(crmPage, /data-i18n-skip dir="auto">\{pendingWin\.deal\.name\}/)
  assert.match(crmPage, /data-i18n-skip dir="auto">\{pendingWin\.deal\.companyName\}/)
})
