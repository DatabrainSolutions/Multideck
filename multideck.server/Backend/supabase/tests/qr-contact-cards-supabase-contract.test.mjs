import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const repoRoot = resolve(import.meta.dirname, "../../../..");
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8")

const store = read("multideck.client/src/lib/contact-card-store.ts")
const data = read("multideck.client/src/data/contact-card-data.ts")
const automation = read("multideck.client/src/components/multideck/contact-card-automation.tsx")
const schema = read("multideck.server/Backend/supabase/migrations/20260731212420_qr_contact_cards_supabase.sql")

test("QR cards have no local demo-store fallback", () => {
  assert.doesNotMatch(store, /localStorage|createSeedCards|resetContactCards/)
  assert.doesNotMatch(data, /generateScans|generateExchanges|createSeedCards/)
  assert.match(store, /multideck_contact_cards_workspace/)
  assert.match(store, /multideck_contact_card_submit_exchange/)
})

test("pipeline and owner choices come from the Supabase workspace", () => {
  assert.match(automation, /useContactCardStore/)
  assert.match(automation, /pipeline\.id/)
  assert.match(automation, /stage\.id/)
  assert.match(automation, /owner\.id/)
  assert.doesNotMatch(automation, /const PIPELINES|const STAGES|const OWNERS/)
})

test("QR tables are private and public access is narrow RPC-only", () => {
  for (const table of [
    "CRM_ContactCards",
    "CRM_ContactCardAutomations",
    "CRM_ContactCardAutomationActions",
    "CRM_ContactCardScans",
    "CRM_ContactCardExchanges",
    "CRM_LeadPipelinePlacements",
  ]) {
    assert.match(schema, new RegExp(`alter table public\\."${table}" enable row level security`))
  }
  assert.match(schema, /revoke all on public\."CRM_ContactCards"[\s\S]*from public, anon, authenticated/)
  assert.match(schema, /grant execute on function public\.multideck_public_contact_card[\s\S]*to anon, authenticated/)
  assert.match(schema, /"Action_PipelineID" uuid references public\."CRM_Pipelines"/)
  assert.match(schema, /"Action_PipelineStageID" uuid references public\."CRM_PipelineStages"/)
})
