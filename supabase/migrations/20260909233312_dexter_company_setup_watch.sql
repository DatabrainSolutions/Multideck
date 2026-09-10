begin;
create function public._multideck_dexter_company_setup_watch_signal()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare old_row jsonb:=to_jsonb(old);new_row jsonb:=to_jsonb(new);before_value jsonb;after_value jsonb;source_id uuid;company_id uuid;
begin
 if tg_table_name='Org_Master' then
  source_id:=(new_row->>'Org_id')::uuid;
  before_value:=jsonb_build_object('accountCode',old_row->'Org_AccCode');
  after_value:=jsonb_build_object('accountCode',new_row->'Org_AccCode');
 else
  source_id:=(new_row->>'CRMAccount_OrgID')::uuid;company_id:=(new_row->>'CRMAccount_CompanyID')::uuid;
  before_value:=jsonb_build_object('scopeCode',old_row->'CRMAccount_ScopeCode');
  after_value:=jsonb_build_object('scopeCode',new_row->'CRMAccount_ScopeCode');
 end if;
 if before_value is distinct from after_value then
  insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
  select distinct w."AIDexterWatch_CompanyID",'customers',tg_table_name,source_id,before_value,after_value
  from public."AI_DexterWatches" w where w."AIDexterWatch_CapabilityCode"='customers' and w."AIDexterWatch_StatusCode"='active'
   and (company_id is null or w."AIDexterWatch_CompanyID"=company_id)
   and (w."AIDexterWatch_TargetID" is null or w."AIDexterWatch_TargetID"=source_id)
   and exists(select 1 from public.multideck_crm_accessible_account_ids(w."AIDexterWatch_CompanyID") a where a.account_id=source_id);
 end if;
 return new;
end $$;
create trigger "TR_Org_Master_setup_watch" after update of "Org_AccCode" on public."Org_Master"
 for each row execute function public._multideck_dexter_company_setup_watch_signal();
create trigger "TR_CRM_AccountProfiles_setup_watch" after update of "CRMAccount_ScopeCode" on public."CRM_AccountProfiles"
 for each row execute function public._multideck_dexter_company_setup_watch_signal();
revoke all on function public._multideck_dexter_company_setup_watch_signal() from public,anon,authenticated;

do $patch$
declare definition text;old_guard text := $old$new."AIDexterWatchSignal_SourceTable" <> 'Org_Addresses'$old$;
 old_repeat text := $old$new."AIDexterWatchSignal_SourceTable"='Org_Addresses'
          and watch."AIDexterWatch_RuleJSON"->>'operator'='changed'$old$;
begin
 definition:=pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
 if position(old_guard in definition)=0 or position(old_repeat in definition)=0 then raise exception 'Review company watch guards';end if;
 definition:=replace(definition,old_guard,$new$new."AIDexterWatchSignal_SourceTable" not in ('Org_Addresses','Org_Master','CRM_AccountProfiles')$new$);
 definition:=replace(definition,old_repeat,$new$new."AIDexterWatchSignal_SourceTable" in ('Org_Addresses','Org_Master','CRM_AccountProfiles')
          and watch."AIDexterWatch_RuleJSON"->>'operator'='changed'$new$);
 definition:=replace(definition,$old$|| ': ' || v_field || ' changed from '$old$,
  $new$|| ': ' || case v_field when 'accountCode' then 'Company code' when 'scopeCode' then 'Scope' else v_field end || ' changed from '$new$);
 execute definition;
end $patch$;
commit;
