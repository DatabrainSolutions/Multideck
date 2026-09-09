import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const page = readFileSync(new URL("../src/pages/crm-page.tsx", import.meta.url), "utf8")
const components = readFileSync(new URL("../src/components/multideck/crm-components.tsx", import.meta.url), "utf8")
const gallery = readFileSync(new URL("../src/data/multideck-data.ts", import.meta.url), "utf8")
const dealsSection = page.slice(page.indexOf("export function CrmDealsPage"), page.indexOf("export function CrmActivityPage"))

test("deals provide board and company-wide server-paged list views", () => {
  assert.match(page, /type DealViewMode = "Board" \| "List"/)
  assert.match(dealsSection, /<RegisterViewSwitch options=\{\["Board", "List"\] as const\}/)
  assert.match(dealsSection, /if \(viewMode !== "List"\) return undefined/)
  assert.match(dealsSection, /listDealsPage\(\{[\s\S]*limit: dealListPageSize,[\s\S]*offset: dealListOffset/)
  assert.match(dealsSection, /pagination=\{\{ offset: dealListOffset, limit: dealListPageSize, total: dealListTotal/)
  assert.match(dealsSection, /serverSorting=\{\{ value: dealListSort/)
  assert.match(dealsSection, /<RegisterSearchField[\s\S]*?label="Search deals"/)
  assert.match(dealsSection, /<RegisterFacetSelect label="Pipeline"/)
  assert.match(dealsSection, /<RegisterFacetSelect label="Status"/)
  assert.match(dealsSection, /<RegisterFacetSelect label="Owner"/)
})

test("overdue close dates are explicit text and not colour-only", () => {
  assert.match(page, /function isDealCloseOverdue\(deal: ApiDeal\)/)
  assert.match(page, /isDealCloseOverdue\(deal\) \? `\$\{translate\("Overdue"\)\} · \$\{date\}` : date/)
  assert.match(page, /isOverdue: isDealCloseOverdue\(deal\)/)
  assert.match(dealsSection, /isDealCloseOverdue\(deal\) \? "text-\[12px\] font-medium text-\[var\(--md-danger\)\]"/)
  assert.match(components, /key === "expectedClose" && deal\.isOverdue/)
  assert.match(components, /label === "Due" && activeDeal\.isOverdue/)
})

test("reused register controls link back to the live CRM deals route", () => {
  const registerToolbar = gallery.slice(gallery.indexOf('id: "register-toolbar"'), gallery.indexOf('id: "context-menu"'))
  assert.match(registerToolbar, /\{ label: "CRM deals", route: "\/crm\/deals" \}/)
})

test("deal board protects record text while localising its interface", () => {
  assert.match(components, /data-i18n-skip dir="auto">\{deal\.title\}/)
  assert.match(components, /data-i18n-skip dir="auto">\{deal\.account\}/)
  assert.match(components, /data-i18n-skip dir="auto">\s*\{dealCardValue\(deal, key\)\}/)
  assert.doesNotMatch(components, /\{t\(dealCardValue\(deal, key\)\)\}/)
})
