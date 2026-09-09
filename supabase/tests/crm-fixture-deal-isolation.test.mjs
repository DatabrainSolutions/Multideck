import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(
  new URL("../migrations/20260818142716_crm_fixture_deal_isolation.sql", import.meta.url),
  "utf8",
)

test("fixture deals have one canonical visibility boundary", () => {
  assert.match(migration, /_multideck_crm_deal_is_fixture\(p_deal_id uuid\)/)
  assert.match(migration, /_multideck_crm_deal_is_operator_visible/)
  assert.match(migration, /CRMAccount_OrgID" = deal\."CRMOppty_OrgID"/)
  assert.match(migration, /CRMOppty_MetadataJSON" ->> 'developmentFixture'/)
  assert.match(migration, /CRMLead_MetadataJSON" ->> 'isDemo'/)
})

test("all operator and Dexter deal surfaces reuse the visibility boundary", () => {
  for (const functionName of [
    "multideck_crm_list_deals",
    "multideck_crm_list_deals_essential",
    "multideck_crm_get_dashboard",
    "multideck_crm_move_deal_stage",
    "multideck_crm_update_deal",
    "multideck_crm_win_deal",
    "multideck_dexter_domain_deals",
    "multideck_dexter_action_update_deal",
    "multideck_dexter_create_watch",
    "multideck_dexter_list_watches",
  ]) {
    assert.match(migration, new RegExp(`create function public\\.${functionName}\\(`))
  }
  assert.match(migration, /_multideck_dexter_watch_source_change/)
  assert.match(migration, /if v_company_id is null or not public\._multideck_crm_deal_is_operator_visible/)
  assert.match(migration, /alter policy "Dexter owners can read their watch events"/)
})

test("legacy fixture records and notifications are quarantined without deletion", () => {
  assert.match(migration, /update public\."CRM_Leads" lead/)
  assert.match(migration, /'demoReason', 'linked-development-fixture-account'/)
  assert.match(migration, /update public\."CRM_Opportunities" deal/)
  assert.match(migration, /'fixtureReason', 'linked-development-fixture-account'/)
  assert.match(migration, /"CommNotif_DismissedAt" = coalesce/)
  assert.match(migration, /'fixtureQuarantined', true/)
  assert.doesNotMatch(migration, /delete\s+from\s+public\."(?:CRM_|AI_Dexter|Comm_Notifications)/i)
})

test("private unfiltered snapshots are not browser APIs", () => {
  assert.match(migration, /revoke all on function public\._multideck_crm_list_deals_unfiltered_20260818\(\) from public, anon, authenticated/)
  assert.match(migration, /revoke all on function public\._multideck_dexter_domain_deals_unfiltered_20260818\(uuid, text, integer\) from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.multideck_crm_list_deals_essential\(\) to authenticated, service_role/)
  assert.match(migration, /grant execute on function public\.multideck_dexter_domain_deals\(uuid, text, integer\) to service_role/)
})
