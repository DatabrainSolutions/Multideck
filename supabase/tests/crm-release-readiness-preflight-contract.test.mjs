import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const preflight = readFileSync(
  new URL("./crm-release-readiness-preflight.sql", import.meta.url),
  "utf8",
)
const helperHardening = readFileSync(
  new URL("../migrations/20260818133000_app_company_helper_privilege_hardening.sql", import.meta.url),
  "utf8",
)

test("CRM release preflight is read-only and covers the current tenant contract", () => {
  assert.doesNotMatch(preflight, /^\s*(insert\s+into|update\s+|delete\s+from|alter\s+|create\s+|drop\s+|grant\s+|revoke\s+|truncate\s+)/im)

  for (const version of [
    "20260818101604",
    "20260818101834",
    "20260818102314",
    "20260818103119",
    "20260818115500",
    "20260818121500",
    "20260818123000",
    "20260818124500",
    "20260818125500",
    "20260818131000",
    "20260818132000",
    "20260818133000",
    "20260818134000",
    "20260818151000",
    "20260818152000",
    "20260818153000",
    "20260818154000",
    "20260818155000",
    "20260818156000",
    "20260818157000",
    "20260818194926",
    "20260818195523",
  ]) assert.match(preflight, new RegExp(`'${version}'`))

  assert.match(preflight, /crm_fixture_deal_isolation/)
  assert.match(preflight, /crm_reserved_domain_fixture_quarantine/)

  assert.match(preflight, /CRMAccount_CompanyID/)
  assert.match(preflight, /CRMContact_CompanyID/)
  assert.match(preflight, /CRMLead_EditVersion/)
  assert.match(preflight, /CRMOppty_EditVersion/)
  assert.match(preflight, /multideck_crm_update_account\(uuid,uuid,bigint,jsonb\)/)
  assert.match(preflight, /multideck_crm_update_deal\(uuid,bigint,jsonb\)/)
  assert.match(preflight, /multideck_crm_deal_is_visible\(uuid\)/)
  assert.match(preflight, /CRM_DriveObjectCleanupQueue/)
  assert.match(preflight, /crm_drive_folder_stats\(uuid\)/)
  assert.match(preflight, /crm_drive_update_folder\(uuid,text,text,text\)/)
  assert.match(preflight, /crm_drive_rename_file\(uuid,text\)/)
  assert.match(preflight, /drive_mutations_company_scoped/)
  assert.match(preflight, /function_acl_checks/)
  assert.match(preflight, /crm_drive_update_folder\(uuid,text,text,text\).*true, true/s)
  assert.match(preflight, /CRM_DriveObjectCleanupQueue/)
  assert.match(preflight, /_crm_contact_card_require_permission\(text\)/)
  assert.match(preflight, /contact_card_wrappers_permission_checked/)
  assert.match(preflight, /multideck_contact_card_save_atomic\(jsonb\)/)
  assert.match(preflight, /multideck_contact_card_delete\(uuid\)/)
  assert.match(preflight, /multideck_contact_card_preview\(text\)/)
  assert.match(preflight, /multideck_contact_card_test_automation\(uuid\)/)
  assert.match(preflight, /multideck_contact_card_rerun\(uuid\)/)
  assert.match(preflight, /multideck_contact_cards_page\(integer,integer,text,text,text,text,text\)/)
  assert.match(preflight, /multideck_contact_card_detail\(uuid\)/)
  assert.match(preflight, /contact_card_reads_company_scoped_and_bounded/)
  assert.match(preflight, /contact_card_paging_indexes_include_tiebreakers/)
  assert.match(preflight, /ContactCard_ID" DESC/)
  assert.match(preflight, /Exchange_ID" DESC/)
  assert.match(preflight, /Scan_ID" DESC/)
  assert.match(preflight, /AutomationRun_ID" DESC/)
  assert.match(preflight, /multideck_crm_account_register_page\(text,text,text,uuid,boolean,text,text,integer,integer\)/)
  assert.match(preflight, /multideck_crm_contact_register_page\(text,text,uuid,text,text,text,integer,integer\)/)
  assert.match(preflight, /customer_register_pages_company_scoped_and_bounded/)
  assert.match(preflight, /v_limit integer := greatest\(1, least\(coalesce\(p_limit, 50\), 100\)\)/)
  assert.match(preflight, /multideck_crm_lead_register_page\(text,text,uuid,boolean,text,text,text,text,boolean,text,text,integer,integer\)/)
  assert.match(preflight, /multideck_crm_deal_register_page\(text,text,uuid,uuid,uuid,boolean,boolean,text,text,integer,integer\)/)
  assert.match(preflight, /multideck_crm_get_deal_essential\(uuid\)/)
  assert.match(preflight, /lead_deal_register_pages_company_scoped_and_bounded/)
  assert.match(preflight, /deal_detail_recovery_permission_and_scope/)
  assert.match(preflight, /_multideck_crm_lead_is_reachable/)
  assert.match(preflight, /_multideck_crm_deal_is_operator_visible/)
  assert.match(preflight, /CRM\.Read/)
  assert.match(preflight, /crm_drive_list_folders\(uuid,integer,jsonb\)/)
  assert.match(preflight, /crm_drive_list_files\(uuid,integer,jsonb\)/)
  assert.match(preflight, /crm_drive_folder_path\(uuid\)/)
  assert.match(preflight, /drive_register_pages_company_scoped_and_bounded/)
  assert.match(preflight, /drive_folder_path_company_scoped_and_cycle_bounded/)
  assert.match(preflight, /limit v_limit \+ 1/)
  assert.match(preflight, /ancestors\.depth < 63/)
  for (const indexName of [
    "IX_CRM_DriveFolders_company_parent_name_id",
    "IX_CRM_DriveFiles_company_folder_name_id",
    "IX_CRM_ContactCards_Company_Updated",
    "IX_CRM_ContactCardExchanges_Card_At",
    "IX_CRM_ContactCardScans_Card_At",
    "IX_CRM_ContactCardAutomationRuns_Card_Started",
  ]) assert.match(preflight, new RegExp(indexName))
  assert.match(preflight, /multideck_crm_customer_recent_emails\(uuid,uuid,uuid\[\],text\[\],boolean,integer\)/)
  assert.match(preflight, /multideck_crm_contact_activity_page\(uuid,uuid,integer\)/)
  assert.match(preflight, /customer_detail_reads_bounded_and_permission_checked/)
  for (const indexName of [
    "IX_Comm_Messages_crm_customer_recent",
    "IX_Comm_MessageRecipients_crm_contact_message",
    "IX_Comm_MessageRecipients_crm_address_message",
    "IX_Comm_Threads_crm_customer_recent",
    "IX_CRM_ActivityParticipants_contact_activity",
  ]) assert.match(preflight, new RegExp(indexName))
  assert.match(preflight, /legacy_crm_views_private/)
  assert.match(preflight, /legacy_crm_functions_private/)
  assert.match(preflight, /company_helpers_authenticated_only/)
  assert.match(preflight, /fixture_deal_visibility_boundary/)
  assert.match(preflight, /reserved_example_accounts_quarantined/)
  assert.match(preflight, /OrgContactEmail_Email/)
})

test("company RLS helpers reject anon while preserving signed-in and service boundaries", () => {
  for (const signature of [
    "app_current_company_id()",
    "app_current_workspace_user_id()",
    "app_user_can_access_office(uuid)",
    "app_user_can_access_organisation(uuid)",
  ]) {
    const escapedSignature = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    assert.match(helperHardening, new RegExp(`alter function public\\.${escapedSignature}[\\s\\S]*set search_path = pg_catalog, public, auth`))
    assert.match(helperHardening, new RegExp(`revoke all privileges on function public\\.${escapedSignature}[\\s\\S]*from public, anon, authenticated`))
    assert.match(helperHardening, new RegExp(`grant execute on function public\\.${escapedSignature}[\\s\\S]*to authenticated, service_role`))
  }
  assert.match(helperHardening, /Dexter parity is unchanged/)
})
