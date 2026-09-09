begin;
set local lock_timeout='5s';

create function booking_api.shipment_value_dexter_values(job public."Job_Header")
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('amount',job."Job_GoodsValueAmount"::text,'currency',job."Job_GoodsValueCurrencyCode")
$$;
create function public.multideck_dexter_domain_booking_shipment_value(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(result order by reference),'[]'::jsonb) from (
    select booking_api.shipment_value_dexter_values(job)||jsonb_build_object('recordId',job."Job_ID",'bookingId',job."Job_ID",
      'bookingReference',job."Job_BookingReference",'updatedAt',job."Job_UpdatedAt",'sourceTable','Job_Header','valueScope','shipment_goods',
      'targetLabel',job."Job_BookingReference"||' · Shipment goods value','sourceUrl','/bookings/'||lower(job."Job_BookingReference")) result,
      job."Job_BookingReference" reference
    from public."Job_Header" job join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    where office."Company_ID"=p_company_id and not job."Job_IsDeleted" and (nullif(btrim(p_search),'') is null
      or job."Job_ID"::text=btrim(p_search) or job."Job_BookingReference" ilike '%'||btrim(p_search)||'%')
    order by job."Job_BookingReference" limit greatest(1,least(coalesce(p_take,10),25))
  ) selected
$$;

create function public.multideck_dexter_action_update_booking_shipment_value(p_company_id uuid,p_user_id uuid,p_arguments jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;job public."Job_Header";money jsonb;before_value jsonb;after_value jsonb;saved jsonb;
begin
  select "Auth_User_ID" into actor from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and "User_AccessStatus"='active';
  if actor is null or not booking_api.has_permission(actor,'Bookings.Read') or not booking_api.has_permission(actor,'Bookings.Write') then
    raise exception 'You do not have permission to edit shipment goods value.' using errcode='42501';end if;
  if jsonb_typeof(p_arguments) is distinct from 'object'
    or not (p_arguments ?& array['target_id','expected_updated_at','amount','currency','reason'])
    or exists(select 1 from jsonb_object_keys(p_arguments) key where key not in ('target_id','expected_updated_at','amount','currency','reason'))
    or jsonb_typeof(p_arguments->'amount') not in ('string','null') or jsonb_typeof(p_arguments->'currency') not in ('string','null')
    or nullif(btrim(p_arguments->>'reason'),'') is null then
    raise exception 'Provide an exact shipment value amount and currency, or explicit null to clear.' using errcode='22023';end if;
  money:=booking_api.normalise_shipment_value(jsonb_build_object('amount',p_arguments->'amount','currency',p_arguments->'currency'));
  select j.* into job from public."Job_Header" j join public."cmp_Offices" office on office."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
    where j."Job_ID"=nullif(p_arguments->>'target_id','')::uuid and office."Company_ID"=p_company_id and not j."Job_IsDeleted" for update of j;
  if not found then raise exception 'That shipment is outside this workspace.' using errcode='42501';end if;
  if nullif(p_arguments->>'expected_updated_at','') is null or job."Job_UpdatedAt" is distinct from (p_arguments->>'expected_updated_at')::timestamptz then
    raise exception 'The booking changed. Read its shipment value again and request fresh approval.' using errcode='40001';end if;
  before_value:=booking_api.shipment_value_dexter_values(job);
  saved:=public.booking_workflow_save(actor,job."Job_ID",jsonb_build_object('shipmentGoodsValue',money));
  select booking_api.shipment_value_dexter_values(j) into after_value from public."Job_Header" j where j."Job_ID"=job."Job_ID";
  if before_value is distinct from after_value then
    insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
      values(p_company_id,job."Job_ID",'dexter_shipment_value_updated','Approved shipment goods value updated; cargo allocations retained.',
        jsonb_build_object('before',before_value,'after',after_value,'reason',btrim(p_arguments->>'reason')),p_user_id);
  end if;
  return jsonb_build_object('recordId',job."Job_ID",'bookingReference',job."Job_BookingReference",'before',before_value,'after',after_value,
    'updatedAt',saved#>'{booking,updatedAt}','sourceUrl','/bookings/'||lower(job."Job_BookingReference"));
end $$;

create function public._multideck_dexter_shipment_value_watch_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare company uuid;before_value jsonb;after_value jsonb;
begin
  if new."Job_IsDeleted" then return new;end if;
  before_value:=case when tg_op='INSERT' then '{}'::jsonb else booking_api.shipment_value_dexter_values(old) end;
  after_value:=booking_api.shipment_value_dexter_values(new);
  if before_value=after_value then return new;end if;
  select "Company_ID" into company from public."cmp_Offices" where "Office_ID"=coalesce(new."Job_OrgOfficeID",new."Job_OfficeID");
  if not exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_CompanyID"=company
    and "AIDexterWatch_CapabilityCode"='booking_shipment_value' and "AIDexterWatch_StatusCode"='active' and "AIDexterWatch_TargetID"=new."Job_ID") then return new;end if;
  insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable",
    "AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values(company,'booking_shipment_value','Job_Header',new."Job_ID",before_value,after_value||jsonb_build_object(
      'bookingReference',new."Job_BookingReference",'sourceUrl','/bookings/'||lower(new."Job_BookingReference")));
  return new;
end $$;
create trigger "TR_Job_Header_dexter_shipment_value" after insert or update on public."Job_Header"
  for each row execute function public._multideck_dexter_shipment_value_watch_change();

insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON")
values('booking_shipment_value','Shipment goods value','Current typed shipment goods amount and currency, as exact decimal text. Not freight charges, margins, a cargo-line allocation or the historical Quote value.',
  'multideck_dexter_domain_booking_shipment_value','["Bookings.Read"]','["operational"]');
insert into public."sys_AIDexterActions"("AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description","AIDexterAction_Function",
  "AIDexterAction_ParametersJSON","AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily","AIDexterAction_AlwaysRequiresApproval")
values('update_booking_shipment_value','booking_shipment_value','Review shipment goods value','Always requires approval. Read the exact Booking and current timestamp first. Supply amount and currency together; show both before/after. No FX conversion, freight charges, margins or cargo allocations are changed. Accepted Quote remains unchanged.',
  'multideck_dexter_action_update_booking_shipment_value',
  '{"type":"object","properties":{"target_id":{"type":"string"},"expected_updated_at":{"type":"string"},"amount":{"type":["string","null"],"description":"Exact non-negative decimal text, max 14 whole digits and 4 decimal places. Null clears."},"currency":{"type":["string","null"],"description":"Three-letter code. Required when amount is set. No automatic conversion."},"reason":{"type":"string"}},"required":["target_id","expected_updated_at","amount","currency","reason"],"additionalProperties":false}',
  '["Bookings.Read","Bookings.Write"]','update_booking_shipment_value',true);
insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_RequiredPermissionsJSON")
values('booking_shipment_value','Shipment goods value','Notify when the amount or currency of one exact Booking changes. Changed rules only; monetary thresholds and automatic actions are not supported. No recurring AI calls.',
  '["amount","currency"]','["Bookings.Read"]');

do $patch$
declare definition text;marker text;
begin
  definition:=pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
  marker:='(''booking_cargo'',''booking_containers'',''booking_routes'')';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>2 then raise exception 'Review shipment-value watch guards';end if;
  execute replace(definition,marker,'(''booking_cargo'',''booking_containers'',''booking_routes'',''booking_shipment_value'')');
  definition:=pg_get_functiondef('public.multideck_dexter_execute_prepared_action(uuid,uuid,uuid,uuid)'::regprocedure);
  marker:='(''update_booking_cargo'',''update_booking_container'',''update_booking_route'',''change_booking_route_mode'')';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review shipment-value approval guard';end if;
  execute replace(definition,marker,'(''update_booking_cargo'',''update_booking_container'',''update_booking_route'',''change_booking_route_mode'',''update_booking_shipment_value'')');
end $patch$;

alter function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) rename to _multideck_dexter_create_watch_before_value_20260905;
create function public.multideck_dexter_create_watch(p_capability text,p_title text,p_summary text,p_request text,p_target_id uuid,p_target_label text,p_rule jsonb,p_action jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare context record;
begin
  select * into context from public._multideck_dexter_context();
  if lower(btrim(p_capability))='booking_shipment_value' then
    if not public.multideck_dexter_can_read_cargo_watch(context.company_id) or p_target_id is null or not exists(
      select 1 from public."Job_Header" job join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
      where job."Job_ID"=p_target_id and office."Company_ID"=context.company_id and not job."Job_IsDeleted") then
      raise exception 'Choose an exact Booking in this workspace.' using errcode='42501';end if;
    if p_action is not null or p_rule->>'operator' is distinct from 'changed' then
      raise exception 'Shipment value watches notify on changes only. Thresholds need currency-aware review; edits need fresh approval.' using errcode='22023';end if;
  end if;
  return public._multideck_dexter_create_watch_before_value_20260905(p_capability,p_title,p_summary,p_request,p_target_id,p_target_label,p_rule,p_action);
end $$;
create policy "Shipment value watches require Booking access" on public."AI_DexterWatches"
as restrictive for select to authenticated using("AIDexterWatch_CapabilityCode"<>'booking_shipment_value' or public.multideck_dexter_can_read_cargo_watch("AIDexterWatch_CompanyID"));
alter function public.multideck_dexter_list_watches() rename to _multideck_dexter_list_watches_before_value_20260905;
create function public.multideck_dexter_list_watches() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare context record;result jsonb;
begin
  select * into context from public._multideck_dexter_context();
  select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb) into result
    from jsonb_array_elements(public._multideck_dexter_list_watches_before_value_20260905()) with ordinality rows(item,ordinal)
    where item->>'capability'<>'booking_shipment_value' or public.multideck_dexter_can_read_cargo_watch(context.company_id);
  return result;
end $$;
revoke all on function booking_api.shipment_value_dexter_values(public."Job_Header"),public._multideck_dexter_shipment_value_watch_change(),
  public._multideck_dexter_create_watch_before_value_20260905(text,text,text,text,uuid,text,jsonb,jsonb),public._multideck_dexter_list_watches_before_value_20260905()
  from public,anon,authenticated,service_role;
revoke all on function public.multideck_dexter_domain_booking_shipment_value(uuid,text,integer),public.multideck_dexter_action_update_booking_shipment_value(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_booking_shipment_value(uuid,text,integer),public.multideck_dexter_action_update_booking_shipment_value(uuid,uuid,jsonb) to service_role;
revoke all on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb),public.multideck_dexter_list_watches() from public,anon;
grant execute on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb),public.multideck_dexter_list_watches() to authenticated,service_role;
commit;
