-- Read-only development preflight. Do not infer release permission from results.
select jsonb_build_object(
'milestoneRows',(select count(*) from public."Job_RouteMilestones"),
'fingerprints',(select jsonb_agg(to_jsonb(entries)) from (
select 'Job_Header' as relation,count(*) as rows,md5(string_agg(to_jsonb(t)::text,'' order by "Job_ID")) as fingerprint from public."Job_Header" t
union all select 'Job_Routing',count(*),md5(string_agg(to_jsonb(t)::text,'' order by "JobRoute_ID")) from public."Job_Routing" t
union all select 'CusQuote_Versions',count(*),md5(string_agg(to_jsonb(t)::text,'' order by "CusQuoteVersion_ID")) from public."CusQuote_Versions" t) entries),
'migrationIdentities',(select jsonb_agg(to_jsonb(entries)) from (
select version,name from supabase_migrations.schema_migrations
where version in ('20260906143817','20260906171016','20260906174532','20260906182852','20260907075838','20260907080245') order by version) entries),
'registryConflicts',(select jsonb_agg(to_jsonb(entries)) from (
select 'domains' as registry,count(*) as conflicts from public."sys_AIDexterDataDomains" where "AIDexterDomain_Code" in ('booking_milestones','booking_milestone_types')
union all select 'actions',count(*) from public."sys_AIDexterActions" where "AIDexterAction_Code"='record_booking_milestone'
union all select 'watches',count(*) from public."sys_AIDexterWatchCapabilities" where "AIDexterWatchCapability_Code"='booking_milestones') entries),
'separateFinanceFunction',(select to_jsonb(row) from (
select pg_get_function_identity_arguments(oid) as arguments,md5(pg_get_functiondef(oid)) as definition_md5,proacl::text
from pg_proc where oid=to_regprocedure('public.multideck_finance_customer_account_snapshot(uuid,uuid[],boolean)')) row)
) as preflight;
