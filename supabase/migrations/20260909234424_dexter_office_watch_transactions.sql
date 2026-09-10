begin;
create table public."AI_DexterOfficeWatchChanges" (
 transaction_id bigint not null,
 profile_id uuid not null,
 before_value jsonb not null,
 primary key(transaction_id,profile_id)
);
alter table public."AI_DexterOfficeWatchChanges" enable row level security;
revoke all on public."AI_DexterOfficeWatchChanges" from public,anon,authenticated;

create function public._multideck_dexter_office_watch_snapshot(p_profile_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(jsonb_build_object('officeId',a."CRMAccountOffice_OrgOfficeID",'isPrimary',a."CRMAccountOffice_IsPrimary") order by a."CRMAccountOffice_OrgOfficeID",a."CRMAccountOffice_IsPrimary"),'[]'::jsonb)
 from public."CRM_AccountOfficeAssignments" a
 join public."CRM_AccountProfiles" p on p."CRMAccount_ID"=a."CRMAccountOffice_AccountID" and p."CRMAccount_CompanyID"=a."CRMAccountOffice_CompanyID"
 where p."CRMAccount_ID"=p_profile_id and not p."CRMAccount_IsDeleted"
$$;

create function public._multideck_dexter_capture_office_watch()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_profile_id uuid;
begin
 for v_profile_id in select distinct value from unnest(array[
  case when tg_op<>'INSERT' then old."CRMAccountOffice_AccountID" end,
  case when tg_op<>'DELETE' then new."CRMAccountOffice_AccountID" end]) value where value is not null
 loop
  insert into public."AI_DexterOfficeWatchChanges" values(txid_current(),v_profile_id,public._multideck_dexter_office_watch_snapshot(v_profile_id)) on conflict do nothing;
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;

create function public._multideck_dexter_flush_office_watch()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_profile_id uuid;before_value jsonb;after_value jsonb;source_id uuid;company_id uuid;
begin
 for v_profile_id in select distinct value from unnest(array[
  case when tg_op<>'INSERT' then old."CRMAccountOffice_AccountID" end,
  case when tg_op<>'DELETE' then new."CRMAccountOffice_AccountID" end]) value where value is not null
 loop
  delete from public."AI_DexterOfficeWatchChanges" q where q.transaction_id=txid_current() and q.profile_id=v_profile_id returning q.before_value into before_value;
  if not found then continue;end if;
  after_value:=public._multideck_dexter_office_watch_snapshot(v_profile_id);
  if before_value is not distinct from after_value then continue;end if;
  select p."CRMAccount_OrgID",p."CRMAccount_CompanyID" into source_id,company_id from public."CRM_AccountProfiles" p where p."CRMAccount_ID"=v_profile_id and not p."CRMAccount_IsDeleted";
  if not found then continue;end if;
  insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
  select distinct w."AIDexterWatch_CompanyID",'customers','CRM_AccountOfficeAssignments',source_id,
   jsonb_build_object('responsibleOffices',before_value),jsonb_build_object('responsibleOffices',after_value)
  from public."AI_DexterWatches" w where w."AIDexterWatch_CompanyID"=company_id and w."AIDexterWatch_CapabilityCode"='customers' and w."AIDexterWatch_StatusCode"='active'
   and (w."AIDexterWatch_TargetID" is null or w."AIDexterWatch_TargetID"=source_id)
   and exists(select 1 from public.multideck_crm_accessible_account_ids(company_id) a where a.account_id=source_id);
 end loop;
 return null;
end $$;

drop trigger if exists "TR_CRM_AccountOfficeAssignments_customer_watch" on public."CRM_AccountOfficeAssignments";
create trigger "TR_CRM_AccountOfficeAssignments_watch_capture" before insert or update or delete on public."CRM_AccountOfficeAssignments"
 for each row execute function public._multideck_dexter_capture_office_watch();
create constraint trigger "TR_CRM_AccountOfficeAssignments_watch_flush" after insert or update or delete on public."CRM_AccountOfficeAssignments" deferrable initially deferred
 for each row execute function public._multideck_dexter_flush_office_watch();
revoke all on function public._multideck_dexter_office_watch_snapshot(uuid) from public,anon,authenticated;
revoke all on function public._multideck_dexter_capture_office_watch() from public,anon,authenticated;
revoke all on function public._multideck_dexter_flush_office_watch() from public,anon,authenticated;

do $patch$
declare definition text;marker text:=$old$('Org_Addresses','Org_Master','CRM_AccountProfiles')$old$;
begin
 definition:=pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
 if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>2 then raise exception 'Review office watch access/repeat guards';end if;
 definition:=replace(definition,marker,$new$('Org_Addresses','Org_Master','CRM_AccountProfiles','CRM_AccountOfficeAssignments')$new$);
 marker:='insert into public."AI_DexterWatchEvents" (';
 if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review office notification insertion';end if;
 definition:=replace(definition,marker,$body$
 if new."AIDexterWatchSignal_SourceTable"='CRM_AccountOfficeAssignments' and v_field='responsibleOffices' then
  v_event_body:=coalesce(watch."AIDexterWatch_TargetLabel",'A watched company')||': Responsible offices updated.';
 end if;
 $body$||marker);
 execute definition;
end $patch$;
commit;
