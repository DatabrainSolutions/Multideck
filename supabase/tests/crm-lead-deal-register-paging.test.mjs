import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const repoRoot = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8")

const migration = read("supabase/migrations/20260818154000_crm_lead_deal_register_paging.sql")
const scoreColumnFix = read("supabase/migrations/20260818194926_crm_lead_register_score_column_fix.sql")
const leadApi = read("multideck.client/src/lib/lead-api.ts")
const dealApi = read("multideck.client/src/lib/deal-api.ts")

test("lead and deal register RPCs are bounded and page after server filtering", () => {
  assert.match(migration, /multideck_crm_lead_register_page\(/)
  assert.match(migration, /multideck_crm_deal_register_page\(/)
  assert.equal((migration.match(/least\(coalesce\(p_limit, 50\), 100\)/g) ?? []).length, 2)
  assert.equal((migration.match(/ordinal > v_offset and ordinal <= v_offset \+ v_limit/g) ?? []).length, 2)
  assert.equal((migration.match(/order by item\.ordinal/g) ?? []).length, 2)
  assert.equal((migration.match(/'total', \(select count\(\*\) from filtered\)/g) ?? []).length, 2)
  assert.match(migration, /CRM\.Read/)
  assert.match(migration, /_multideck_crm_lead_is_reachable/)
  assert.match(migration, /_multideck_crm_deal_is_operator_visible/)
  assert.match(migration, /CRMLead_EditVersion/)
  assert.match(migration, /CRMOppty_EditVersion/)
  assert.match(migration, /_multideck_crm_lead_transfer_state/)
  assert.match(migration, /_multideck_crm_deal_conversion_state/)
  assert.match(migration, /'facets', jsonb_build_object/)
  assert.match(migration, /primary_contact_email/)
  assert.match(migration, /'qualified'/)
  assert.match(migration, /lead\."CRMLead_Score" as qualification_score/)
  assert.doesNotMatch(migration, /CRMLead_QualificationScore/)
  assert.match(scoreColumnFix, /CRMLead_QualificationScore/)
  assert.match(scoreColumnFix, /CRMLead_Score/)
  assert.match(scoreColumnFix, /pg_get_functiondef/)
})

test("register RPCs cannot be called by anonymous clients and include detail recovery", () => {
  assert.match(migration, /revoke all on function public\.multideck_crm_lead_register_page[\s\S]*from public, anon/)
  assert.match(migration, /revoke all on function public\.multideck_crm_deal_register_page[\s\S]*from public, anon/)
  assert.match(migration, /create or replace function public\.multideck_crm_get_deal_essential\(p_deal_id uuid\)/)
  assert.match(migration, /grant execute on function public\.multideck_crm_get_deal_essential\(uuid\) to authenticated, service_role/)
})

test("client page APIs expose server filters and fail closed instead of loading full registers", () => {
  assert.match(leadApi, /export async function listLeadsPage\(/)
  assert.match(leadApi, /multideck_crm_lead_register_page/)
  assert.match(leadApi, /followUpScope/)
  assert.match(leadApi, /valueScope/)
  assert.match(leadApi, /PGRST202/)
  assert.doesNotMatch(leadApi, /PGRST204|PGRST205/)
  assert.match(leadApi, /CRM lead paging is still being prepared/)
  assert.doesNotMatch(leadApi, /leadRegisterFallback\(await|multideck_crm_list_leads_essential/)
  assert.match(dealApi, /export async function listDealsPage\(/)
  assert.match(dealApi, /multideck_crm_deal_register_page/)
  assert.match(dealApi, /pipelineStageId/)
  assert.match(dealApi, /CRM deal paging is still being prepared/)
  assert.doesNotMatch(dealApi, /dealRegisterFallback\(await|multideck_crm_list_deals_essential/)
  assert.doesNotMatch(dealApi, /PGRST204|PGRST205/)
  assert.match(dealApi, /export async function getDeal\(dealId: string, options\?: CrmReadOptions\)/)
  assert.match(dealApi, /multideck_crm_get_deal_essential/)
  assert.match(dealApi, /multideck_crm_get_deal_essential[\s\S]*\.abortSignal\(controller\.signal\)/)
  assert.match(dealApi, /CRM deal details are still being prepared/)
})
