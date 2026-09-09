begin;
set local lock_timeout='5s';

create function public.multideck_dexter_domain_report_sources(p_company_id uuid,p_search text,p_take integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u public."cmp_Users"; result jsonb;
begin
  u:=report_api.context(auth.uid());
  if u."Company_ID"<>p_company_id then raise exception 'The reporting workspace is unavailable.' using errcode='42501';end if;
  select coalesce(jsonb_agg(c||jsonb_build_object('recordId',c->>'id','sourceUrl','/reports/new',
    'queryExample',jsonb_build_object('source',c->>'id','dateField',c->>'defaultDate','period',jsonb_build_object('preset','last12months'),
      'columns',(select jsonb_agg(f->>'id') from jsonb_array_elements(c->'fields') f),'mode','rows','filters','[]'::jsonb,'filterMatch','all',
      'groupBy','month','measure','count','aggregation','sum','currency','','compare','none','chart','bar',
      'sort',jsonb_build_object('field',c->>'defaultDate','direction','desc')))),'[]') into result
    from jsonb_array_elements(report_api.catalogue()) c where booking_api.has_permission(auth.uid(),c->>'permission');
  return result;
end $$;
create function public.multideck_dexter_domain_reports(p_company_id uuid,p_search text,p_take integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u public."cmp_Users"; result jsonb;
begin
  u:=report_api.context(auth.uid());
  if u."Company_ID"<>p_company_id then raise exception 'The reporting workspace is unavailable.' using errcode='42501';end if;
  select coalesce(jsonb_agg(row order by edited desc),'[]') into result from (
    select jsonb_build_object('recordId',r.id,'name',r.name,'definition',r.definition,'version',r.version,'visibility',r.visibility,
      'canEdit',r.owner_id=u."User_ID",'updatedAt',r.updated_at,'sourceTable','report_api.reports','sourceUrl','/reports/edit/'||r.id,
      'latestRun',(select jsonb_build_object('id',h.id,'status',h.status,'generatedAt',h.created_at,'sourceUrl','/reports/history')
        from report_api.runs h where h.report_id=r.id and h.owner_id=u."User_ID" order by h.created_at desc limit 1)) row,r.updated_at edited
    from report_api.reports r where report_api.can_read(auth.uid(),r) and (nullif(btrim(p_search),'') is null or r.id::text=p_search or r.name ilike '%'||p_search||'%')
    order by r.updated_at desc limit greatest(1,least(coalesce(p_take,10),25))) selected;
  return result;
end $$;
create function public.multideck_dexter_action_save_report(p_company_id uuid,p_user_id uuid,p_arguments jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid; saved jsonb; input jsonb;
begin
  select "Auth_User_ID" into actor from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and "User_AccessStatus"='active';
  if actor is null then raise exception 'The report owner is unavailable.' using errcode='42501';end if;
  if jsonb_typeof(p_arguments) is distinct from 'object' or not (p_arguments ?& array['name','definition','visibility'])
    or exists(select 1 from jsonb_object_keys(p_arguments) k where k not in ('name','definition','visibility','target_id','expected_version')) then
    raise exception 'Provide the report name, definition and visibility for review.' using errcode='22023';end if;
  input:=jsonb_build_object('id',p_arguments->'target_id','version',p_arguments->'expected_version','name',p_arguments->'name',
    'definition',p_arguments->'definition','visibility',p_arguments->'visibility');
  saved:=report_api.save(actor,input);
  return saved||jsonb_build_object('recordId',saved->'id','sourceUrl','/reports/edit/'||(saved->>'id'));
end $$;

-- Report watches are personal: owners can watch their own definition or run.
-- Recheck ownership, account and every data permission at signal time.
create function report_api.watch_allowed(user_id uuid,company_id uuid,target_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from report_api.reports r join public."cmp_Users" u on u."User_ID"=r.owner_id
    where r.id=target_id and r.owner_id=user_id and r.company_id=company_id and u."Company_ID"=company_id
      and coalesce(u."User_AccessStatus",'active')='active' and report_api.can_read(u."Auth_User_ID",r))
$$;
create function report_api.signal_change() returns trigger language plpgsql security definer set search_path='' as $$
declare company uuid; target uuid; owner_user uuid; before_value jsonb; after_value jsonb;
begin
  if tg_table_name='reports' then
    company:=new.company_id;target:=new.id;owner_user:=new.owner_id;
    before_value:=case when tg_op='INSERT' then '{}'::jsonb else jsonb_build_object('version',old.version) end;
    after_value:=jsonb_build_object('version',new.version,'sourceUrl','/reports/edit/'||new.id);
  else
    company:=new.company_id;target:=new.report_id;owner_user:=new.owner_id;
    before_value:='{}';after_value:=jsonb_build_object('lastRunId',new.id,'status',new.status,'sourceUrl','/reports/history');
  end if;
  if not report_api.watch_allowed(owner_user,company,target) then return new;end if;
  if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_OwnerUserID"=owner_user and "AIDexterWatch_CompanyID"=company
    and "AIDexterWatch_CapabilityCode"='reports' and "AIDexterWatch_TargetID"=target and "AIDexterWatch_StatusCode"='active') then
    insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable",
      "AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
      values(company,'reports','report_api.reports',target,before_value,after_value||jsonb_build_object('ownerId',owner_user));
  end if;
  return new;
end $$;
create trigger report_definition_watch after insert or update of version on report_api.reports for each row execute function report_api.signal_change();
create trigger report_run_watch after insert on report_api.runs for each row execute function report_api.signal_change();

insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON") values
('report_sources','Report data and fields','Read first to discover authorised data sources, field definitions and a complete query example. No arbitrary SQL or joins. Monetary totals require one currency.', 'multideck_dexter_domain_report_sources','[]','["operational"]'),
('reports','Saved reports','Read report definitions, ownership, versions and the latest personal run status. Results are not included in this domain; open Reports to preview the actual data. Share definitions only with users who already have the underlying permissions.', 'multideck_dexter_domain_reports','[]','["operational"]');
insert into public."sys_AIDexterActions"("AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description","AIDexterAction_Function",
  "AIDexterAction_ParametersJSON","AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily","AIDexterAction_AlwaysRequiresApproval") values
('save_report','reports','Save a report for review','Always requires approval. Read report_sources first and show the name, data, columns, period, date basis, currency, comparison and visibility. Use version 1 definitions with kind table/chart and query, or kind document with period, customer and 1-24 text/table/chart blocks. Period presets: last12months (to today), last2months (complete months), lastmonth, thismonth, custom with start/end. Summary measures: count or a money field; aggregation sum/avg/min/max; groupBy month/day/total or field; compare none/previous; filters field, op (eq/neq/contains/gte/lte/empty/notEmpty), value. Shared reports remain permission-filtered. Edit only owned reports using target_id and expected_version. Omit target_id to create a private copy. Saving does not run, export or send anything. Use the Reports editor to review document layout, generate downloads, schedule or archive.',
 'multideck_dexter_action_save_report',
 '{"type":"object","properties":{"name":{"type":"string"},"visibility":{"type":"string","enum":["private","workspace"]},"definition":{"type":"object"},"target_id":{"type":"string"},"expected_version":{"type":"integer"}},"required":["name","visibility","definition"],"additionalProperties":false}',
 '[]','save_report',true);
insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_RequiredPermissionsJSON") values
('reports','My saved reports','Watch one owned report. version changed means the definition was edited; lastRunId changed means a new personal snapshot finished. No automatic edits, export or email actions. Underlying business-value thresholds are not supported by this adapter.','["version","lastRunId"]','[]');

alter function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) rename to _multideck_dexter_watch_before_reports_20260907;
create function public.multideck_dexter_create_watch(p_capability text,p_title text,p_summary text,p_request text,p_target_id uuid,p_target_label text,p_rule jsonb,p_action jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare u public."cmp_Users";
begin
  if lower(btrim(p_capability))='reports' then
    u:=report_api.context(auth.uid());
    if p_target_id is null or not report_api.watch_allowed(u."User_ID",u."Company_ID",p_target_id) then raise exception 'Choose one report you own and can access.' using errcode='42501';end if;
    if p_action is not null or p_rule->>'operator' is distinct from 'changed' or coalesce(p_rule->>'field','') not in ('version','lastRunId') then
      raise exception 'Report watches notify on saved changes or completed runs. Automatic actions and data-value thresholds are not supported.' using errcode='22023';end if;
  end if;
  return public._multideck_dexter_watch_before_reports_20260907(p_capability,p_title,p_summary,p_request,p_target_id,p_target_label,p_rule,p_action);
end $$;
do $patch$
declare definition text; marker text;
begin
  definition:=pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
  marker:=E'      and watch_row."AIDexterWatch_StatusCode" = ''active''';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review reporting watch access guard';end if;
  definition:=replace(definition,marker,marker||E'\n      and (watch_row."AIDexterWatch_CapabilityCode"<>''reports'' or (\n        report_api.watch_allowed(watch_row."AIDexterWatch_OwnerUserID",watch_row."AIDexterWatch_CompanyID",watch_row."AIDexterWatch_TargetID")\n        and new."AIDexterWatchSignal_NewJSON"->>''ownerId''=watch_row."AIDexterWatch_OwnerUserID"::text\n        and new."AIDexterWatchSignal_NewJSON" ? (watch_row."AIDexterWatch_RuleJSON"->>''field'')))');
  marker:='if v_matches and (';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review reporting watch repeat guard';end if;
  definition:=replace(definition,marker,'if v_matches and (watch."AIDexterWatch_CapabilityCode"=''reports'' or ');
  execute definition;
end $patch$;

revoke all on function public._multideck_dexter_watch_before_reports_20260907(text,text,text,text,uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.multideck_dexter_domain_report_sources(uuid,text,integer),public.multideck_dexter_domain_reports(uuid,text,integer),public.multideck_dexter_action_save_report(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_report_sources(uuid,text,integer),public.multideck_dexter_domain_reports(uuid,text,integer),public.multideck_dexter_action_save_report(uuid,uuid,jsonb) to service_role;
revoke all on function report_api.watch_allowed(uuid,uuid,uuid),report_api.signal_change() from public,anon,authenticated;
revoke all on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) to authenticated,service_role;
commit;
