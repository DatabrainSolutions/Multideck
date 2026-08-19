import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const dealApi = readFileSync(new URL("../src/lib/deal-api.ts", import.meta.url), "utf8")
const dealsPage = readFileSync(new URL("../src/pages/crm-page.tsx", import.meta.url), "utf8")
const sidebar = readFileSync(new URL("../src/components/multideck/app-sidebar.tsx", import.meta.url), "utf8")
const topBar = readFileSync(new URL("../src/components/multideck/top-bar.tsx", import.meta.url), "utf8")
const navigation = readFileSync(new URL("../src/data/navigation-data.ts", import.meta.url), "utf8")

test("Deals board and CRM sidebar counts come from authenticated lists and New deal opens lead conversion", () => {
  const dealsSection = dealsPage.slice(dealsPage.indexOf("export function CrmDealsPage"))
  assert.match(dealApi, /multideck_crm_deal_register_page/)
  assert.match(dealsSection, /listDealsPage\(\{/)
  assert.match(dealsSection, /pipelineStageId: stageId/)
  assert.match(dealsSection, /limit: 40/)
  assert.match(dealsSection, /stagePaging=/)
  assert.match(topBar, /"\/crm\/deals": \{ label: "New deal", eventName: topBarActionEvents\.createCrmDeal \}/)
  assert.match(dealsSection, /subscribeTopBarAction\(topBarActionEvents\.createCrmDeal, \(\) => setNewDealOpen\(true\)\)/)
  assert.match(dealsSection, /function startDealFromLead\(leadId: string\)/)
  assert.match(dealsSection, /const path = `\/crm\/leads\/\$\{encodeURIComponent\(leadId\)\}\/convert`/)
  assert.match(dealsSection, /if \(navigate\) navigate\(path\)/)
  assert.match(sidebar, /import \{ listLeadsPage \} from "@\/lib\/lead-api"/)
  assert.match(sidebar, /listLeadsPage\(\{ limit: 1, offset: 0 \}\)/)
  assert.match(sidebar, /listDealsPage\(\{ limit: 1, offset: 0 \}\)/)
  assert.match(sidebar, /setCrmLeadCount\(leads\.status === "fulfilled" \? leads\.value\.total : null\)/)
  assert.match(sidebar, /setCrmDealCount\(deals\.status === "fulfilled" \? deals\.value\.total : null\)/)
  const crmNavigation = navigation.slice(navigation.indexOf('id: "sales-crm"'), navigation.indexOf('id: "rates-contracts"'))
  assert.doesNotMatch(crmNavigation, /label: "Leads", value:/)
  assert.doesNotMatch(crmNavigation, /label: "Deals", value:/)
})
