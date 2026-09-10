begin;

-- Address identity and business fields only: audit timestamp refreshes are not changes.
create or replace function public._multideck_dexter_address_watch_value(p_row jsonb)
returns jsonb language sql immutable set search_path=pg_catalog,public as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(p_row)
 where key in ('OrgAdd_ID','Org_ID','Org_NameOverride','OrgAdd_Line1','OrgAdd_Line2',
 'OrgAdd_TownCity','OrgAdd_State','OrgAdd_PostZipCode','OrgAdd_Country','OrgAdd_UNLOCODE',
 'OrgAdd_TimeZone','OrgAdd_IsActive','OrgAdd_MainEmail','OrgAdd_MainPhone')
$$;

create or replace function public._multideck_dexter_address_watch_signal()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 before_value jsonb:=public._multideck_dexter_address_watch_value(case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end);
 after_value jsonb:=public._multideck_dexter_address_watch_value(case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end);
 source_id uuid:=case when tg_op='DELETE' then old."Org_ID" else new."Org_ID" end;
begin
 if before_value is distinct from after_value then
  insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode",
   "AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
  select distinct w."AIDexterWatch_CompanyID",'customers','Org_Addresses',source_id,
   jsonb_build_object('addresses',before_value),jsonb_build_object('addresses',after_value)
  from public."AI_DexterWatches" w
  where w."AIDexterWatch_CapabilityCode"='customers' and w."AIDexterWatch_StatusCode"='active'
   and (w."AIDexterWatch_TargetID" is null or w."AIDexterWatch_TargetID"=source_id)
   and exists(select 1 from public.multideck_crm_accessible_account_ids(w."AIDexterWatch_CompanyID") a where a.account_id=source_id);
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
drop trigger if exists "TR_Org_Addresses_customer_watch" on public."Org_Addresses";
create trigger "TR_Org_Addresses_customer_watch" after insert or update or delete on public."Org_Addresses"
 for each row execute function public._multideck_dexter_address_watch_signal();
revoke all on function public._multideck_dexter_address_watch_value(jsonb) from public,anon,authenticated;
revoke all on function public._multideck_dexter_address_watch_signal() from public,anon,authenticated;

do $patch$
declare definition text;marker text;
begin
 definition:=pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
 marker:=E'      and watch_row."AIDexterWatch_StatusCode" = ''active''';
 if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review address watch access guard';end if;
 definition:=replace(definition,marker,marker||$guard$
      and (new."AIDexterWatchSignal_SourceTable" <> 'Org_Addresses' or (
        exists(select 1 from public.multideck_crm_accessible_account_ids(watch_row."AIDexterWatch_CompanyID") a
          where a.account_id=new."AIDexterWatchSignal_SourceID")
        and exists(select 1 from public."cmp_Users" u where u."User_ID"=watch_row."AIDexterWatch_OwnerUserID"
          and u."Company_ID"=watch_row."AIDexterWatch_CompanyID" and u."User_AccessStatus"='active'
          and public._multideck_crm_has_permission(u."User_ID",'CRM.Read'))
      ))$guard$);
 marker:='if v_matches and (';
 if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review address watch repeat guard';end if;
 definition:=replace(definition,marker,marker||$repeat$
        (new."AIDexterWatchSignal_SourceTable"='Org_Addresses'
          and watch."AIDexterWatch_RuleJSON"->>'operator'='changed') or $repeat$);
 -- Keep the notification readable; detailed field evidence stays on the event.
 marker:='insert into public."AI_DexterWatchEvents" (';
 if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review address watch notification body';end if;
 definition:=replace(definition,marker,E'        if new."AIDexterWatchSignal_SourceTable" = ''Org_Addresses'' and v_field = ''addresses'' then\n          v_event_body := coalesce(watch."AIDexterWatch_TargetLabel", ''A watched company'') || '': address details changed.'';\n        end if;\n'||marker);
 execute definition;
end $patch$;
commit;
