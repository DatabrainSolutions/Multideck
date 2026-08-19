-- Read-only CRM tenant release preflight.
-- Run against the exact Supabase project intended for release. It reports
-- schema, database-contract and quarantine parity without returning customer
-- row contents.
-- Edge Function presence/version, hostname configuration, authenticated UI,
-- cross-project denial and performance evidence are separate release gates.

with
expected_migrations(version, requirement) as (
  values
    ('20260818092910', 'Profile preferences deployment parity'),
    ('20260818092918', 'CRM demo lead isolation'),
    ('20260818093051', 'QA lead fixture marking'),
    ('20260818093539', 'Audit trigger search path hardening'),
    ('20260818093641', 'Profile preference audit context'),
    ('20260818101604', 'Lead and deal write boundaries'),
    ('20260818101834', 'Atomic contact cards and Drive hardening'),
    ('20260818102314', 'Current role permission parity'),
    ('20260818103119', 'Atomic account and contact writes'),
    ('20260818115500', 'Immutable account and contact company scope'),
    ('20260818121500', 'Pipeline and stage retirement guards'),
    ('20260818123000', 'Lead and deal optimistic concurrency'),
    ('20260818124500', 'Durable Drive object cleanup'),
    ('20260818125500', 'Deal contact-column correction'),
    ('20260818131000', 'Legacy CRM view exposure lockdown'),
    ('20260818132000', 'Legacy CRM function surface lockdown'),
    ('20260818133000', 'Company helper privilege hardening'),
    ('20260818134000', 'Drive folder statistics bigint contract correction'),
    ('20260818151000', 'CRM Drive mutation closure'),
    ('20260818152000', 'Contact Card permission closure'),
    ('20260818153000', 'Bounded Accounts and Contacts register paging'),
    ('20260818154000', 'Bounded Lead and Deal register paging and detail recovery'),
    ('20260818155000', 'Bounded CRM Drive register paging and folder paths'),
    ('20260818156000', 'Bounded CRM customer detail reads'),
    ('20260818157000', 'Bounded Contact Card register and detail reads'),
    ('20260818194926', 'Lead register canonical score-column correction'),
    ('20260818195523', 'Contact Card deterministic paging index upgrade')
),
expected_named_migrations(name, requirement) as (
  values
    ('crm_fixture_deal_isolation', 'Fixture leads, deals and watch history are quarantined'),
    ('crm_reserved_domain_fixture_quarantine', 'Reserved-domain sample accounts are quarantined')
),
expected_columns(table_name, column_name, nullable, requirement) as (
  values
    ('CRM_AccountProfiles', 'CRMAccount_CompanyID', 'NO', 'Account company scope is immutable and required'),
    ('CRM_AccountProfiles', 'CRMAccount_EditVersion', 'NO', 'Account writes reject stale versions'),
    ('CRM_ContactProfiles', 'CRMContact_CompanyID', 'NO', 'Contact company scope is immutable and required'),
    ('CRM_ContactProfiles', 'CRMContact_EditVersion', 'NO', 'Contact writes reject stale versions'),
    ('CRM_Leads', 'CRMLead_EditVersion', 'NO', 'Lead writes reject stale versions'),
    ('CRM_Opportunities', 'CRMOppty_EditVersion', 'NO', 'Deal writes reject stale versions')
),
expected_functions(signature, requirement) as (
  values
    ('public.multideck_crm_accessible_account_ids(uuid)', 'Company-scoped customer reachability'),
    ('public.multideck_crm_update_account(uuid,uuid,bigint,jsonb)', 'Versioned account write'),
    ('public.multideck_crm_update_contact(uuid,uuid,bigint,jsonb)', 'Versioned contact write'),
    ('public.multideck_crm_update_lead(uuid,bigint,jsonb)', 'Versioned lead write'),
    ('public.multideck_crm_update_deal(uuid,bigint,jsonb)', 'Versioned deal write'),
    ('public.multideck_crm_deal_is_visible(uuid)', 'Authenticated fixture-safe deal visibility'),
    ('public.crm_drive_delete_file(uuid)', 'Transactional Drive file deletion'),
    ('public.crm_drive_delete_folder(uuid)', 'Transactional Drive folder deletion'),
    ('public.crm_drive_folder_stats(uuid)', 'Typed Drive folder statistics'),
    ('public.crm_drive_pending_cleanup()', 'Durable Drive cleanup retry'),
    ('public.crm_drive_complete_cleanup(text[])', 'Durable Drive cleanup completion'),
    ('public.crm_drive_update_folder(uuid,text,text,text)', 'Permission-checked company-scoped Drive folder update'),
    ('public.crm_drive_rename_file(uuid,text)', 'Permission-checked company-scoped Drive file rename'),
    ('public._crm_contact_card_require_permission(text)', 'Contact Card CRM permission guard'),
    ('public.multideck_contact_cards_workspace()', 'Permission-checked Contact Card workspace read'),
    ('public.multideck_contact_card_save_atomic(jsonb)', 'Permission-checked Contact Card save'),
    ('public.multideck_contact_card_delete(uuid)', 'Permission-checked Contact Card delete'),
    ('public.multideck_contact_card_preview(text)', 'Permission-checked Contact Card preview'),
    ('public.multideck_contact_card_test_automation(uuid)', 'Permission-checked Contact Card automation test'),
    ('public.multideck_contact_card_rerun(uuid)', 'Permission-checked Contact Card automation rerun'),
    ('public.multideck_contact_cards_page(integer,integer,text,text,text,text,text)', 'Bounded Contact Card register page'),
    ('public.multideck_contact_card_detail(uuid)', 'Bounded Contact Card detail history'),
    ('public.multideck_crm_account_register_page(text,text,text,uuid,boolean,text,text,integer,integer)', 'Bounded company-scoped account register page'),
    ('public.multideck_crm_contact_register_page(text,text,uuid,text,text,text,integer,integer)', 'Bounded company-scoped contact register page'),
    ('public.multideck_crm_lead_register_page(text,text,uuid,boolean,text,text,text,text,boolean,text,text,integer,integer)', 'Bounded company-scoped lead register page'),
    ('public.multideck_crm_deal_register_page(text,text,uuid,uuid,uuid,boolean,boolean,text,text,integer,integer)', 'Bounded company-scoped deal register page'),
    ('public.multideck_crm_get_deal_essential(uuid)', 'Permission-checked deal detail recovery'),
    ('public.crm_drive_list_folders(uuid,integer,jsonb)', 'Bounded company-scoped Drive folder register page'),
    ('public.crm_drive_list_files(uuid,integer,jsonb)', 'Bounded company-scoped Drive file register page'),
    ('public.crm_drive_folder_path(uuid)', 'Bounded company-scoped Drive folder path'),
    ('public.multideck_crm_customer_recent_emails(uuid,uuid,uuid[],text[],boolean,integer)', 'Bounded permission-checked customer email detail read'),
    ('public.multideck_crm_contact_activity_page(uuid,uuid,integer)', 'Bounded permission-checked contact activity detail read')
),
expected_indexes(index_name, requirement) as (
  values
    ('IX_Comm_Messages_crm_customer_recent', 'Customer email detail uses a mailbox/date index'),
    ('IX_Comm_MessageRecipients_crm_contact_message', 'Customer email detail uses a contact/message lookup index'),
    ('IX_Comm_MessageRecipients_crm_address_message', 'Customer email detail uses a normalized-address/message lookup index'),
    ('IX_Comm_Threads_crm_customer_recent', 'Customer email detail uses a customer/thread recency index'),
    ('IX_CRM_ActivityParticipants_contact_activity', 'Contact activity detail uses a contact/activity lookup index'),
    ('IX_CRM_DriveFolders_company_parent_name_id', 'Drive folder paging uses a company/parent/name index'),
    ('IX_CRM_DriveFiles_company_folder_name_id', 'Drive file paging uses a company/folder/name index'),
    ('IX_CRM_ContactCards_Company_Updated', 'Contact Card paging uses a company/update index'),
    ('IX_CRM_ContactCardExchanges_Card_At', 'Contact Card recent exchanges use a card/date index'),
    ('IX_CRM_ContactCardScans_Card_At', 'Contact Card analytics scans use a card/date index'),
    ('IX_CRM_ContactCardAutomationRuns_Card_Started', 'Contact Card recent runs use a card/date index')
),
expected_function_acl(signature, authenticated_execute, service_role_execute, search_path, requirement) as (
  values
    ('public.crm_drive_update_folder(uuid,text,text,text)', true, true, 'search_path=pg_catalog, public', 'Drive folder updates are available only through signed-in or service-role callers'),
    ('public.crm_drive_rename_file(uuid,text)', true, true, 'search_path=pg_catalog, public', 'Drive file renames are available only through signed-in or service-role callers'),
    ('public._crm_contact_card_require_permission(text)', false, true, 'search_path=pg_catalog, public, auth', 'Contact Card permission helper is private from browser roles and available to the server role'),
    ('public.multideck_contact_cards_workspace()', true, true, 'search_path=pg_catalog, public, auth', 'Contact Card workspace is available to authenticated and service-role callers'),
    ('public.multideck_contact_card_save_atomic(jsonb)', true, true, 'search_path=pg_catalog, public, auth', 'Contact Card saves are available to authenticated and service-role callers'),
    ('public.multideck_contact_card_delete(uuid)', true, true, 'search_path=pg_catalog, public, auth', 'Contact Card deletes are available to authenticated and service-role callers'),
    ('public.multideck_contact_card_preview(text)', true, true, 'search_path=pg_catalog, public, auth', 'Contact Card preview is available to authenticated and service-role callers'),
    ('public.multideck_contact_card_test_automation(uuid)', true, true, 'search_path=pg_catalog, public, auth', 'Contact Card automation tests are available to authenticated and service-role callers'),
    ('public.multideck_contact_card_rerun(uuid)', true, true, 'search_path=pg_catalog, public, auth', 'Contact Card reruns are available to authenticated and service-role callers'),
    ('public.multideck_contact_cards_page(integer,integer,text,text,text,text,text)', true, true, 'search_path=pg_catalog, public, auth', 'Contact Card register paging is available to signed-in and service-role callers'),
    ('public.multideck_contact_card_detail(uuid)', true, true, 'search_path=pg_catalog, public, auth', 'Contact Card detail is available to signed-in and service-role callers'),
    ('public.multideck_crm_account_register_page(text,text,text,uuid,boolean,text,text,integer,integer)', true, true, 'search_path=pg_catalog, public, auth', 'Account register paging is available to signed-in and service-role callers'),
    ('public.multideck_crm_contact_register_page(text,text,uuid,text,text,text,integer,integer)', true, true, 'search_path=pg_catalog, public, auth', 'Contact register paging is available to signed-in and service-role callers'),
    ('public.multideck_crm_lead_register_page(text,text,uuid,boolean,text,text,text,text,boolean,text,text,integer,integer)', true, true, 'search_path=pg_catalog, public, auth', 'Lead register paging is available to signed-in and service-role callers'),
    ('public.multideck_crm_deal_register_page(text,text,uuid,uuid,uuid,boolean,boolean,text,text,integer,integer)', true, true, 'search_path=pg_catalog, public, auth', 'Deal register paging is available to signed-in and service-role callers'),
    ('public.multideck_crm_get_deal_essential(uuid)', true, true, 'search_path=pg_catalog, public, auth', 'Deal detail recovery is available to signed-in and service-role callers'),
    ('public.crm_drive_list_folders(uuid,integer,jsonb)', true, true, 'search_path=pg_catalog, public', 'Drive folder paging is available to signed-in and service-role callers'),
    ('public.crm_drive_list_files(uuid,integer,jsonb)', true, true, 'search_path=pg_catalog, public', 'Drive file paging is available to signed-in and service-role callers'),
    ('public.crm_drive_folder_path(uuid)', true, true, 'search_path=pg_catalog, public', 'Drive folder paths are available to signed-in and service-role callers'),
    ('public.multideck_crm_customer_recent_emails(uuid,uuid,uuid[],text[],boolean,integer)', false, true, 'search_path=pg_catalog, public', 'Customer email detail is service-role-only behind the authenticated Edge Function'),
    ('public.multideck_crm_contact_activity_page(uuid,uuid,integer)', false, true, 'search_path=pg_catalog, public', 'Contact activity detail is service-role-only behind the authenticated Edge Function')
),
legacy_views(view_name) as (
  values
    ('CRM_AIFocusAreaQueue'), ('CRM_AccountSalesSummary'),
    ('CRM_ActivityWorkflowRunSummary'), ('CRM_AppliedFieldUpdateAudit'),
    ('CRM_AutomationActionQueue'), ('CRM_AutomationPlaybookSummary'),
    ('CRM_BookingEngagementQueue'), ('CRM_CallActionAcceptanceSummary'),
    ('CRM_CallReviewTodoQueue'), ('CRM_CustomerKPIDashboard'),
    ('CRM_DataCaptureWizardQueue'), ('CRM_DataRequestQueue'),
    ('CRM_DataRequestResponseSummary'), ('CRM_FieldUpdateReviewQueue'),
    ('CRM_LeadKPIDashboard'), ('CRM_LeadWorklist'),
    ('CRM_MarketFeedbackSummary'), ('CRM_MessageRepetitionRisk'),
    ('CRM_NextBestActionQueue'), ('CRM_OnboardingWorklist'),
    ('CRM_PersonalMessageDraftQueue'), ('CRM_PipelineSummary'),
    ('CRM_PostCallReviewQueue'), ('CRM_QuickTaskOptionQueue'),
    ('CRM_SalesPitchImprovementQueue'), ('CRM_SalesRepKPIDashboard'),
    ('CRM_UserTodoQueue')
),
legacy_functions(function_name) as (
  values
    ('CRM_RecordActivity'), ('CRM_LinkQuoteToOpportunity'),
    ('CRM_CreateQuoteFollowup'), ('CRM_ConvertLeadToOpportunity'),
    ('CRM_AcceptCallActionCandidate'), ('CRM_CreateQuickTask'),
    ('CRM_CreatePersonalMessageDraft'), ('CRM_ApprovePersonalMessageDraft'),
    ('CRM_RecordQuickTaskDecision'), ('CRM_RegisterActivityWorkflowEvent'),
    ('CRM_StartAutomationRun'), ('CRM_CreateDataCaptureSession'),
    ('CRM_QueueFieldUpdate'), ('CRM_RecordWizardFieldValue'),
    ('CRM_CreateDataRequestFromRun'), ('CRM_RecordDataRequestFieldValue'),
    ('CRM_ApplyFieldUpdate')
),
migration_checks as (
  select
    'migration'::text as check_group,
    migration.version as check_name,
    exists (
      select 1
      from supabase_migrations.schema_migrations deployed
      where deployed.version = migration.version
    ) as passed,
    migration.requirement as evidence
  from expected_migrations migration
),
named_migration_checks as (
  select
    'migration'::text as check_group,
    migration.name as check_name,
    exists (
      select 1
      from supabase_migrations.schema_migrations deployed
      where deployed.name = migration.name
    ) as passed,
    migration.requirement as evidence
  from expected_named_migrations migration
),
column_checks as (
  select
    'column'::text as check_group,
    column_contract.table_name || '.' || column_contract.column_name as check_name,
    exists (
      select 1
      from information_schema.columns live_column
      where live_column.table_schema = 'public'
        and live_column.table_name = column_contract.table_name
        and live_column.column_name = column_contract.column_name
        and live_column.is_nullable = column_contract.nullable
    ) as passed,
    column_contract.requirement as evidence
  from expected_columns column_contract
),
function_checks as (
  select
    'function'::text as check_group,
    function_contract.signature as check_name,
    to_regprocedure(function_contract.signature) is not null as passed,
    function_contract.requirement as evidence
  from expected_functions function_contract
),
index_checks as (
  select
    'index'::text as check_group,
    index_contract.index_name as check_name,
    exists (
      select 1
      from pg_indexes live_index
      where live_index.schemaname = 'public'
        and live_index.indexname = index_contract.index_name
    ) as passed,
    index_contract.requirement as evidence
  from expected_indexes index_contract
),
function_acl_checks as (
  select
    'function_acl'::text as check_group,
    function_contract.signature as check_name,
    live_function.oid is not null
      and coalesce(has_function_privilege('anon', live_function.oid, 'EXECUTE'), false) = false
      and coalesce(has_function_privilege('authenticated', live_function.oid, 'EXECUTE'), false) = function_contract.authenticated_execute
      and coalesce(has_function_privilege('service_role', live_function.oid, 'EXECUTE'), false) = function_contract.service_role_execute
      and coalesce(live_function.proconfig, '{}'::text[]) @> array[function_contract.search_path]
      as passed,
    function_contract.requirement as evidence
  from expected_function_acl function_contract
  left join pg_proc live_function on live_function.oid = to_regprocedure(function_contract.signature)
),
function_body_contract_checks as (
  select * from (values
    (
      'scope'::text,
      'drive_mutations_company_scoped'::text,
      (
        strpos(pg_get_functiondef(to_regprocedure('public.crm_drive_update_folder(uuid,text,text,text)')), 'app_current_company_id()') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.crm_drive_update_folder(uuid,text,text,text)')), '"Company_ID" = v_company_id') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.crm_drive_rename_file(uuid,text)')), '"Company_ID" = v_company_id') > 0
      ),
      'Drive mutations resolve the current company and filter target rows by Company_ID'::text
    ),
    (
      'permission'::text,
      'contact_card_wrappers_permission_checked'::text,
      (
        strpos(pg_get_functiondef(to_regprocedure('public.multideck_contact_cards_workspace()')), '_crm_contact_card_require_permission') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_contact_card_save_atomic(jsonb)')), '_crm_contact_card_require_permission') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_contact_card_delete(uuid)')), '_crm_contact_card_require_permission') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_contact_card_preview(text)')), '_crm_contact_card_require_permission') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_contact_card_test_automation(uuid)')), '_crm_contact_card_require_permission') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_contact_card_rerun(uuid)')), '_crm_contact_card_require_permission') > 0
      ),
      'Every authenticated Contact Card wrapper invokes the shared CRM permission guard'::text
    ),
    (
      'paging'::text,
      'customer_register_pages_company_scoped_and_bounded'::text,
      (
        strpos(pg_get_functiondef(to_regprocedure('public.multideck_crm_account_register_page(text,text,text,uuid,boolean,text,text,integer,integer)')), 'multideck_crm_accessible_account_ids(v_context.company_id)') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_crm_contact_register_page(text,text,uuid,text,text,text,integer,integer)')), 'multideck_crm_accessible_account_ids(v_context.company_id)') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_crm_account_register_page(text,text,text,uuid,boolean,text,text,integer,integer)')), 'v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100))') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_crm_contact_register_page(text,text,uuid,text,text,text,integer,integer)')), 'v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100))') > 0
      ),
      'Account and Contact register pages use company-scoped IDs and cap page size at 100'::text
    ),
    (
      'paging'::text,
      'lead_deal_register_pages_company_scoped_and_bounded'::text,
      (
        strpos(pg_get_functiondef(to_regprocedure('public.multideck_crm_lead_register_page(text,text,uuid,boolean,text,text,text,text,boolean,text,text,integer,integer)')), '_multideck_crm_lead_is_reachable') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_crm_deal_register_page(text,text,uuid,uuid,uuid,boolean,boolean,text,text,integer,integer)')), '_multideck_crm_deal_is_operator_visible') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_crm_lead_register_page(text,text,uuid,boolean,text,text,text,text,boolean,text,text,integer,integer)')), 'CRM.Read') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_crm_deal_register_page(text,text,uuid,uuid,uuid,boolean,boolean,text,text,integer,integer)')), 'CRM.Read') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_crm_lead_register_page(text,text,uuid,boolean,text,text,text,text,boolean,text,text,integer,integer)')), 'v_context.company_id') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_crm_deal_register_page(text,text,uuid,uuid,uuid,boolean,boolean,text,text,integer,integer)')), 'v_context.company_id') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_crm_lead_register_page(text,text,uuid,boolean,text,text,text,text,boolean,text,text,integer,integer)')), 'v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100))') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_crm_deal_register_page(text,text,uuid,uuid,uuid,boolean,boolean,text,text,integer,integer)')), 'v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100))') > 0
      ),
      'Lead and Deal register pages use tenant/company visibility predicates and cap page size at 100'::text
    ),
    (
      'recovery'::text,
      'deal_detail_recovery_permission_and_scope'::text,
      (
        strpos(pg_get_functiondef(to_regprocedure('public.multideck_crm_get_deal_essential(uuid)')), '_multideck_crm_has_permission') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_crm_get_deal_essential(uuid)')), '_multideck_crm_deal_is_operator_visible') > 0
      ),
      'Deal detail recovery applies the CRM read permission and operator-visible company boundary'::text
    ),
    (
      'paging'::text,
      'drive_register_pages_company_scoped_and_bounded'::text,
      (
        strpos(pg_get_functiondef(to_regprocedure('public.crm_drive_list_folders(uuid,integer,jsonb)')), 'app_current_company_id()') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.crm_drive_list_files(uuid,integer,jsonb)')), 'app_current_company_id()') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.crm_drive_list_folders(uuid,integer,jsonb)')), '"Company_ID" = v_company_id') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.crm_drive_list_files(uuid,integer,jsonb)')), '"Company_ID" = v_company_id') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.crm_drive_list_folders(uuid,integer,jsonb)')), 'limit v_limit + 1') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.crm_drive_list_files(uuid,integer,jsonb)')), 'limit v_limit + 1') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.crm_drive_list_folders(uuid,integer,jsonb)')), 'CRM.Drive.Read') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.crm_drive_list_files(uuid,integer,jsonb)')), 'CRM.Drive.Read') > 0
      ),
      'Drive folder and file pages resolve the current company, require Drive read permission and bound the probe page'::text
    ),
    (
      'scope'::text,
      'drive_folder_path_company_scoped_and_cycle_bounded'::text,
      (
        strpos(pg_get_functiondef(to_regprocedure('public.crm_drive_folder_path(uuid)')), 'app_current_company_id()') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.crm_drive_folder_path(uuid)')), 'CRM.Drive.Read') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.crm_drive_folder_path(uuid)')), 'ancestors.depth < 63') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.crm_drive_folder_path(uuid)')), '"Company_ID" = v_company_id') > 0
      ),
      'Drive folder paths keep ancestry inside the current company and stop safely at the depth/cycle guard'::text
    ),
    (
      'bounded_read'::text,
      'contact_card_reads_company_scoped_and_bounded'::text,
      (
        strpos(pg_get_functiondef(to_regprocedure('public.multideck_contact_cards_page(integer,integer,text,text,text,text,text)')), '_crm_contact_card_require_permission') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_contact_cards_page(integer,integer,text,text,text,text,text)')), 'v_context.company_id') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_contact_cards_page(integer,integer,text,text,text,text,text)')), 'limit v_limit offset v_offset') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_contact_card_detail(uuid)')), '_crm_contact_card_require_permission') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_contact_card_detail(uuid)')), 'limit 20') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_contact_card_detail(uuid)')), 'limit 25') > 0
      ),
      'Contact Card register and detail reads enforce CRM permission, company scope, page limits and bounded recent history'::text
    ),
    (
      'index'::text,
      'contact_card_paging_indexes_include_tiebreakers'::text,
      (
        strpos(pg_get_indexdef(to_regclass('public."IX_CRM_ContactCards_Company_Updated"')), '"ContactCard_ID" DESC') > 0
        and strpos(pg_get_indexdef(to_regclass('public."IX_CRM_ContactCardExchanges_Card_At"')), '"Exchange_ID" DESC') > 0
        and strpos(pg_get_indexdef(to_regclass('public."IX_CRM_ContactCardScans_Card_At"')), '"Scan_ID" DESC') > 0
        and strpos(pg_get_indexdef(to_regclass('public."IX_CRM_ContactCardAutomationRuns_Card_Started"')), '"AutomationRun_ID" DESC') > 0
      ),
      'Contact Card paging indexes include deterministic ID tie-breakers'::text
    ),
    (
      'bounded_read'::text,
      'customer_detail_reads_bounded_and_permission_checked'::text,
      (
        strpos(pg_get_functiondef(to_regprocedure('public.multideck_crm_customer_recent_emails(uuid,uuid,uuid[],text[],boolean,integer)')), 'Email.Read') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_crm_customer_recent_emails(uuid,uuid,uuid[],text[],boolean,integer)')), 'limit v_limit') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_crm_contact_activity_page(uuid,uuid,integer)')), 'Customers.Read') > 0
        and strpos(pg_get_functiondef(to_regprocedure('public.multideck_crm_contact_activity_page(uuid,uuid,integer)')), 'limit v_limit') > 0
      ),
      'Customer email and Contact activity detail reads enforce permission and hard limits in SQL'::text
    )
  ) as contract(check_group, check_name, passed, evidence)
),
table_checks as (
  select
    'table'::text as check_group,
    'public.CRM_DriveObjectCleanupQueue'::text as check_name,
    exists (
      select 1
      from pg_class live_table
      join pg_namespace live_schema on live_schema.oid = live_table.relnamespace
      where live_schema.nspname = 'public'
        and live_table.relname = 'CRM_DriveObjectCleanupQueue'
        and live_table.relkind = 'r'
        and live_table.relrowsecurity
    ) as passed,
    'Drive cleanup work is durable, private and RLS-enabled'::text as evidence
),
view_security_check as (
  select
    'security'::text as check_group,
    'legacy_crm_views_private'::text as check_name,
    not exists (
      select 1
      from legacy_views expected_view
      join pg_class live_view on live_view.relname = expected_view.view_name
      join pg_namespace live_schema on live_schema.oid = live_view.relnamespace
      where live_schema.nspname = 'public'
        and live_view.relkind = 'v'
        and (
          not (coalesce(live_view.reloptions, '{}'::text[]) @> array['security_invoker=true'])
          or has_table_privilege('anon', format('%I.%I', live_schema.nspname, live_view.relname), 'SELECT,INSERT,UPDATE,DELETE')
          or has_table_privilege('authenticated', format('%I.%I', live_schema.nspname, live_view.relname), 'SELECT,INSERT,UPDATE,DELETE')
        )
    ) as passed,
    'Any legacy views present are invoker-scoped and unavailable to browser roles'::text as evidence
),
function_security_check as (
  select
    'security'::text as check_group,
    'legacy_crm_functions_private'::text as check_name,
    not exists (
      select 1
      from legacy_functions expected_function
      join pg_proc live_function on live_function.proname = expected_function.function_name
      join pg_namespace live_schema on live_schema.oid = live_function.pronamespace
      where live_schema.nspname = 'public'
        and (
          has_function_privilege('anon', live_function.oid, 'EXECUTE')
          or has_function_privilege('authenticated', live_function.oid, 'EXECUTE')
          or not (coalesce(live_function.proconfig, '{}'::text[]) @> array['search_path=pg_catalog, public'])
        )
    ) as passed,
    'Any legacy routines present are private and have a pinned lookup path'::text as evidence
),
company_helper_security_check as (
  select
    'security'::text as check_group,
    'company_helpers_authenticated_only'::text as check_name,
    (
      select count(*) = 4
        and bool_and(
          not has_function_privilege('anon', helper.oid, 'EXECUTE')
          and has_function_privilege('authenticated', helper.oid, 'EXECUTE')
          and has_function_privilege('service_role', helper.oid, 'EXECUTE')
          and coalesce(helper.proconfig, '{}'::text[]) @> array['search_path=pg_catalog, public, auth']
        )
      from pg_proc helper
      join pg_namespace helper_schema on helper_schema.oid = helper.pronamespace
      where helper_schema.nspname = 'public'
        and helper.oid::regprocedure::text in (
          'app_current_company_id()',
          'app_current_workspace_user_id()',
          'app_user_can_access_office(uuid)',
          'app_user_can_access_organisation(uuid)'
        )
    ) as passed,
    'Company and workspace RLS helpers reject anon and pin their security-definer path'::text as evidence
),
deal_visibility_security_check as (
  select
    'security'::text as check_group,
    'fixture_deal_visibility_boundary'::text as check_name,
    (
      to_regprocedure('public._multideck_crm_deal_is_fixture(uuid)') is not null
      and to_regprocedure('public._multideck_crm_deal_is_operator_visible(uuid,uuid)') is not null
      and to_regprocedure('public.multideck_crm_deal_is_visible(uuid)') is not null
      and not has_function_privilege('public', 'public.multideck_crm_deal_is_visible(uuid)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.multideck_crm_deal_is_visible(uuid)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.multideck_crm_deal_is_visible(uuid)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public._multideck_crm_deal_is_fixture(uuid)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public._multideck_crm_deal_is_operator_visible(uuid,uuid)', 'EXECUTE')
    ) as passed,
    'Deal reads, writes, Dexter and watches share one private fixture boundary'::text as evidence
),
reserved_domain_quarantine_check as (
  select
    'data'::text as check_group,
    'reserved_example_accounts_quarantined'::text as check_name,
    not exists (
      select 1
      from public."CRM_AccountProfiles" account
      where account."CRMAccount_IsDeleted" = false
        and lower(coalesce(account."CRMAccount_MetadataJSON" ->> 'developmentFixture', 'false')) <> 'true'
        and exists (
          select 1
          from public."Org_Contacts" contact
          join public."OrgContact_Emails" email
            on email."OrgContact_ID" = contact."OrgContact_ID"
          where contact."Org_ID" = account."CRMAccount_OrgID"
            and lower(btrim(email."OrgContactEmail_Email")) like '%.example'
        )
    ) as passed,
    'Reserved .example contact domains never appear as live customer accounts'::text as evidence
),
all_checks as (
  select * from migration_checks
  union all select * from named_migration_checks
  union all select * from column_checks
  union all select * from function_checks
  union all select * from index_checks
  union all select * from function_acl_checks
  union all select * from function_body_contract_checks
  union all select * from table_checks
  union all select * from view_security_check
  union all select * from function_security_check
  union all select * from company_helper_security_check
  union all select * from deal_visibility_security_check
  union all select * from reserved_domain_quarantine_check
)
select check_group, check_name, passed, evidence
from all_checks
order by passed, check_group, check_name;
