import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const dealApi = readFileSync(new URL("../src/lib/deal-api.ts", import.meta.url), "utf8")
const dealsPage = readFileSync(new URL("../src/pages/crm-page.tsx", import.meta.url), "utf8")
const sidebar = readFileSync(new URL("../src/components/multideck/app-sidebar.tsx", import.meta.url), "utf8")
const navigation = readFileSync(new URL("../src/data/navigation-data.ts", import.meta.url), "utf8")

test("Deals board and CRM sidebar count come from the authenticated Supabase deal list", () => {
  const dealsSection = dealsPage.slice(dealsPage.indexOf("export function CrmDealsPage"))
  assert.match(dealApi, /multideck_crm_list_deals_essential/)
  assert.match(dealsSection, /listDeals\(\{ forceRefresh: reloadKey > 0 \}\)/)
  assert.match(sidebar, /listDeals\(\)/)
  assert.match(sidebar, /setCrmDealCount\(deals\.length\)/)
  assert.doesNotMatch(navigation, /label: "Deals", value:/)
})
