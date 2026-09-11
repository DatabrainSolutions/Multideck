begin;
create table public."AI_DexterAddressWatchChanges" (
 transaction_id bigint not null,
 address_id uuid not null,
 before_value jsonb not null,
 primary key(transaction_id,address_id)
);
alter table public."AI_DexterAddressWatchChanges" enable row level security;
revoke all on public."AI_DexterAddressWatchChanges" from public,anon,authenticated;

create function public._multideck_dexter_address_watch_snapshot(p_address_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce((select public._multideck_dexter_address_watch_value(to_jsonb(a)) || jsonb_build_object(
  'purposes',coalesce((select jsonb_agg(jsonb_build_object('type',t."OrgAddType_Type",'isDefault',t."OrgAddType_IsDefault") order by t."OrgAddType_Type",t."OrgAddType_IsDefault") from public."Org_AddressTypes" t where t."OrgAdd_ID"=a."OrgAdd_ID"),'[]'::jsonb),
  'weeklyHours',coalesce((select jsonb_agg(jsonb_build_object('dayOfWeek',h."OrgAddHours_DayOfWeek",'opensAt',h."OrgAddHours_OpensAt",'closesAt',h."OrgAddHours_ClosesAt",'sortOrder',h."OrgAddHours_SortOrder") order by h."OrgAddHours_DayOfWeek",h."OrgAddHours_OpensAt",h."OrgAddHours_ClosesAt",h."OrgAddHours_SortOrder") from public."Org_AddressOpeningHours" h where h."OrgAddHours_OrgAddID"=a."OrgAdd_ID"),'[]'::jsonb),
  'openingOverrides',coalesce((select jsonb_agg(jsonb_build_object('date',o."OrgAddOverride_Date",'isClosed',o."OrgAddOverride_IsClosed",'opensAt',o."OrgAddOverride_OpensAt",'closesAt',o."OrgAddOverride_ClosesAt",'note',o."OrgAddOverride_Note") order by o."OrgAddOverride_Date",o."OrgAddOverride_OpensAt",o."OrgAddOverride_ClosesAt",o."OrgAddOverride_IsClosed",o."OrgAddOverride_Note") from public."Org_AddressOpeningOverrides" o where o."OrgAddOverride_OrgAddID"=a."OrgAdd_ID"),'[]'::jsonb)
 ) from public."Org_Addresses" a where a."OrgAdd_ID"=p_address_id),'{}'::jsonb)
$$;

create function public._multideck_dexter_capture_address_watch()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_address_id uuid;
begin
 -- Capture both sides of a reassignment, before the first row mutation.
 for v_address_id in select distinct value::uuid from unnest(array[
  case when tg_op<>'INSERT' then to_jsonb(old)->>tg_argv[0] end,
  case when tg_op<>'DELETE' then to_jsonb(new)->>tg_argv[0] end]) value where value is not null
 loop
  insert into public."AI_DexterAddressWatchChanges" values(txid_current(),v_address_id,public._multideck_dexter_address_watch_snapshot(v_address_id))
   on conflict do nothing;
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;

create function public._multideck_dexter_flush_address_watch()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_address_id uuid;before_value jsonb;after_value jsonb;source_id uuid;
begin
 for v_address_id in select distinct value::uuid from unnest(array[
  case when tg_op<>'INSERT' then to_jsonb(old)->>tg_argv[0] end,
  case when tg_op<>'DELETE' then to_jsonb(new)->>tg_argv[0] end]) value where value is not null
 loop
  delete from public."AI_DexterAddressWatchChanges" q where q.transaction_id=txid_current() and q.address_id=v_address_id returning q.before_value into before_value;
  if not found then continue;end if;
  after_value:=public._multideck_dexter_address_watch_snapshot(v_address_id);
  if before_value is not distinct from after_value then continue;end if;
  for source_id in select distinct value::uuid from unnest(array[before_value->>'Org_ID',after_value->>'Org_ID']) value where value is not null
  loop
   insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
   select distinct w."AIDexterWatch_CompanyID",'customers','Org_Addresses',source_id,
    jsonb_build_object('addresses',case when before_value->>'Org_ID'=source_id::text then before_value else '{}'::jsonb end),
    jsonb_build_object('addresses',case when after_value->>'Org_ID'=source_id::text then after_value else '{}'::jsonb end)
   from public."AI_DexterWatches" w where w."AIDexterWatch_CapabilityCode"='customers' and w."AIDexterWatch_StatusCode"='active'
    and (w."AIDexterWatch_TargetID" is null or w."AIDexterWatch_TargetID"=source_id)
    and exists(select 1 from public.multideck_crm_accessible_account_ids(w."AIDexterWatch_CompanyID") a where a.account_id=source_id);
  end loop;
 end loop;
 return null;
end $$;

do $$declare item record;begin
 for item in select * from (values ('Org_Addresses','OrgAdd_ID'),('Org_AddressTypes','OrgAdd_ID'),('Org_AddressOpeningHours','OrgAddHours_OrgAddID'),('Org_AddressOpeningOverrides','OrgAddOverride_OrgAddID')) v(table_name,id_column)
 loop
  execute format('drop trigger if exists %I on public.%I','TR_'||item.table_name||'_customer_watch',item.table_name);
  execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public._multideck_dexter_capture_address_watch(%L)','TR_'||item.table_name||'_watch_capture',item.table_name,item.id_column);
  execute format('create constraint trigger %I after insert or update or delete on public.%I deferrable initially deferred for each row execute function public._multideck_dexter_flush_address_watch(%L)','TR_'||item.table_name||'_watch_flush',item.table_name,item.id_column);
 end loop;
end $$;
revoke all on function public._multideck_dexter_address_watch_snapshot(uuid) from public,anon,authenticated;
revoke all on function public._multideck_dexter_capture_address_watch() from public,anon,authenticated;
revoke all on function public._multideck_dexter_flush_address_watch() from public,anon,authenticated;
commit;
