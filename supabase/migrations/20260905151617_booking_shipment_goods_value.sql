begin;
set local lock_timeout='5s';

-- Never infer a current shipment total from cargo allocations or overwrite
-- operational values during upgrade. Existing jobs remain explicitly unset.
alter table public."Job_Header"
  add column "Job_GoodsValueAmount" numeric(18,4),
  add column "Job_GoodsValueCurrencyCode" text,
  add constraint "Job_goods_value_nonnegative" check ("Job_GoodsValueAmount">=0 and "Job_GoodsValueAmount"<100000000000000),
  add constraint "Job_goods_value_currency" check ("Job_GoodsValueCurrencyCode" ~ '^[A-Z]{3}$');

create function booking_api.normalise_shipment_value(value jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare amount_text text; currency_text text; amount_value numeric;
begin
  if value is null or jsonb_typeof(value)<>'object' or exists(select 1 from jsonb_object_keys(value) key where key not in ('amount','currency')) then
    raise exception 'Provide shipment goods value as an amount and currency.' using errcode='22023'; end if;
  if jsonb_typeof(value->'amount') not in ('number','string','null') or jsonb_typeof(value->'currency') not in ('string','null') then
    raise exception 'Shipment goods value must contain a numeric amount and currency code.' using errcode='22023'; end if;
  amount_text:=nullif(btrim(value->>'amount'),'');currency_text:=nullif(upper(btrim(value->>'currency')),'');
  if amount_text is not null then
    if length(amount_text)>32 or amount_text !~ '^([0-9]+|[0-9]{1,3}(,[0-9]{3})+)(\.[0-9]+)?$' then
      raise exception 'Enter a non-negative shipment goods value.' using errcode='22023'; end if;
    amount_value:=replace(amount_text,',','')::numeric;
    if amount_value>=100000000000000 or amount_value<>round(amount_value,4) then
      raise exception 'Shipment goods value supports up to 14 whole digits and 4 decimal places.' using errcode='22023'; end if;
  end if;
  if currency_text is not null and currency_text !~ '^[A-Z]{3}$' then
    raise exception 'Choose a three-letter shipment goods currency.' using errcode='22023'; end if;
  if amount_value is not null and currency_text is null then
    raise exception 'Choose a currency for the shipment goods value.' using errcode='22023'; end if;
  return jsonb_build_object('amount',amount_value,'currency',currency_text);
end;
$$;

-- Historical malformed values remain visible evidence, not a reason to hide
-- every unrelated review field. Applying an invalid proposed value is blocked.
create function booking_api.quote_shipment_value(snapshot jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare value jsonb:=jsonb_build_object('amount',snapshot#>'{quote,shipmentFacts,goodsValue}',
  'currency',coalesce(nullif(snapshot#>>'{quote,shipmentFacts,goodsValueCurrency}',''),snapshot#>>'{quote,currency}'));
begin
  return booking_api.normalise_shipment_value(value);
exception when invalid_parameter_value then
  return value||jsonb_build_object('invalidReason',sqlerrm);
end;
$$;

alter function booking_api.quote_readiness(uuid) rename to readiness_before_goods_value_20260905;
create function booking_api.quote_readiness(requested_quote_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; snapshot jsonb; facts jsonb; current_value jsonb; saved_value jsonb; missing jsonb;
begin
  result:=booking_api.readiness_before_goods_value_20260905(requested_quote_id);
  select "CusQuoteHeader_ShipmentFactsJSON" into facts from public."CusQuote_Header" where "CusQuoteHeader_ID"=requested_quote_id;
  select "CusQuoteVersion_SnapshotJSON" into snapshot from public."CusQuote_Versions" where "CusQuoteHeader_ID"=requested_quote_id
    order by "CusQuoteVersion_Number" desc limit 1;
  current_value:=booking_api.quote_shipment_value(jsonb_build_object('quote',jsonb_build_object('shipmentFacts',facts,'currency',snapshot#>'{quote,currency}')));
  saved_value:=booking_api.quote_shipment_value(snapshot);
  missing:=coalesce(result->'missing','[]'::jsonb);
  if current_value->>'invalidReason' is not null then
    missing:=missing||jsonb_build_array('Shipment goods value: '||(current_value->>'invalidReason'));
  elsif saved_value->>'invalidReason' is not null then
    missing:=missing||jsonb_build_array('Saved Quote goods value: '||(saved_value->>'invalidReason'));
  elsif current_value is distinct from saved_value then
    missing:=missing||jsonb_build_array('Save the current shipment goods value before sending');
  end if;
  return result||jsonb_build_object('missing',missing,'ready',coalesce((result->>'ready')::boolean,false) and jsonb_array_length(missing)=0);
end;
$$;

alter function booking_api.workspace(uuid,text) rename to workspace_before_goods_value_20260905;
create function booking_api.workspace(caller_auth_user_id uuid,requested_reference text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; money jsonb; job_id uuid;
begin
  result:=booking_api.workspace_before_goods_value_20260905(caller_auth_user_id,requested_reference);
  job_id:=nullif(result#>>'{booking,jobId}','')::uuid;
  if job_id is null then return result; end if;
  select jsonb_build_object('amount',job."Job_GoodsValueAmount"::text,'currency',job."Job_GoodsValueCurrencyCode") into money
    from public."Job_Header" job join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    join public."cmp_Users" actor on actor."Company_ID"=office."Company_ID" and actor."Auth_User_ID"=caller_auth_user_id and actor."User_AccessStatus"='active'
    where job."Job_ID"=job_id and not job."Job_IsDeleted" and booking_api.has_permission(caller_auth_user_id,'Bookings.Read');
  if not found then raise exception 'Shipment goods value is outside this workspace.' using errcode='42501'; end if;
  return jsonb_set(result,'{booking}',(result->'booking')||jsonb_build_object('shipmentGoodsValue',money));
end;
$$;

alter function booking_api.save_booking(uuid,uuid,jsonb) rename to save_before_goods_value_20260905;
create function booking_api.save_booking(caller_auth_user_id uuid,requested_job_id uuid,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; money jsonb; before_value jsonb; actor_id uuid; company_id uuid; reference text;
begin
  -- The canonical save validates the actor/job and holds the Job lock for this
  -- whole transaction. Omitted values remain untouched, including old clients.
  result:=booking_api.save_before_goods_value_20260905(caller_auth_user_id,requested_job_id,payload);
  if not payload ? 'shipmentGoodsValue' then return result; end if;
  money:=booking_api.normalise_shipment_value(payload->'shipmentGoodsValue');
  select actor."User_ID",actor."Company_ID",job."Job_BookingReference",
    jsonb_build_object('amount',job."Job_GoodsValueAmount",'currency',job."Job_GoodsValueCurrencyCode")
    into strict actor_id,company_id,reference,before_value
    from public."Job_Header" job join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    join public."cmp_Users" actor on actor."Company_ID"=office."Company_ID" and actor."Auth_User_ID"=caller_auth_user_id and actor."User_AccessStatus"='active'
    where job."Job_ID"=requested_job_id and not job."Job_IsDeleted";
  if before_value is distinct from money then
    update public."Job_Header" set "Job_GoodsValueAmount"=(money->>'amount')::numeric,"Job_GoodsValueCurrencyCode"=money->>'currency',
      "Job_UpdatedAt"=now(),"Job_UpdatedBy"=actor_id where "Job_ID"=requested_job_id;
    insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
      values(company_id,requested_job_id,'booking_updated','Shipment goods value updated; cargo allocations retained.',
        jsonb_build_object('field','shipmentGoodsValue','before',before_value,'after',money),actor_id);
  end if;
  return booking_api.workspace(caller_auth_user_id,reference);
end;
$$;

-- Capture the exact accepted source at first conversion, not when a later
-- snapshot changes. Existing single-cargo initial allocation remains separate.
do $migration$
declare definition text:=pg_get_functiondef('booking_api.convert_accepted_quote_before_sync_review_20260904(uuid,uuid,uuid)'::regprocedure);
  anchor text:=E'  ) returning "Job_ID" into job_id;';
begin
  if position(anchor in definition)=0 then raise exception 'Review initial Booking conversion before wiring shipment value.'; end if;
  execute replace(definition,anchor,anchor||$patch$
  update public."Job_Header" set
    "Job_GoodsValueAmount"=(booking_api.normalise_shipment_value(jsonb_build_object('amount',facts->'goodsValue','currency',coalesce(nullif(facts->>'goodsValueCurrency',''),payload->>'currency')))->>'amount')::numeric,
    "Job_GoodsValueCurrencyCode"=booking_api.normalise_shipment_value(jsonb_build_object('amount',facts->'goodsValue','currency',coalesce(nullif(facts->>'goodsValueCurrency',''),payload->>'currency')))->>'currency'
    where "Job_ID"=job_id;
$patch$);
end;
$migration$;

alter function booking_api.quote_sync_projection(jsonb) rename to projection_before_goods_value_20260905;
create function booking_api.quote_sync_projection(snapshot jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select booking_api.projection_before_goods_value_20260905(snapshot)||jsonb_build_object('shipmentGoodsValue',
    booking_api.quote_shipment_value(snapshot))
$$;
alter function booking_api.current_quote_sync_projection(uuid) rename to current_before_goods_value_20260905;
create function booking_api.current_quote_sync_projection(requested_job_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select booking_api.current_before_goods_value_20260905(requested_job_id)||jsonb_build_object('shipmentGoodsValue',
    jsonb_build_object('amount',job."Job_GoodsValueAmount",'currency',job."Job_GoodsValueCurrencyCode"))
  from public."Job_Header" job where job."Job_ID"=requested_job_id
$$;
alter function booking_api.quote_sync_differences(jsonb,jsonb,jsonb) rename to differences_before_goods_value_20260905;
create function booking_api.quote_sync_differences(baseline jsonb,booking jsonb,proposed jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb;
begin
  result:=booking_api.differences_before_goods_value_20260905(
    baseline #- '{cargo,goodsValue}' #- '{cargo,goodsValueCurrency}',
    booking #- '{cargo,goodsValue}' #- '{cargo,goodsValueCurrency}',
    proposed #- '{cargo,goodsValue}' #- '{cargo,goodsValueCurrency}');
  if baseline->'shipmentGoodsValue' is distinct from proposed->'shipmentGoodsValue' then
    result:=result||jsonb_build_array(jsonb_build_object('key','shipmentGoodsValue','label','Shipment goods value','section','Goods',
      'previousQuoteValue',baseline->'shipmentGoodsValue','bookingValue',booking->'shipmentGoodsValue','newQuoteValue',proposed->'shipmentGoodsValue',
      'conflict',booking->'shipmentGoodsValue' is distinct from baseline->'shipmentGoodsValue',
      'requiresConfirmation',true,'recommendation','review',
      'reviewNote','Changes the shipment total only. Existing cargo-line values and currencies are retained; review their allocations separately.')
      ||case when proposed#>>'{shipmentGoodsValue,invalidReason}' is not null then jsonb_build_object('blockedReason',proposed#>>'{shipmentGoodsValue,invalidReason}') else '{}'::jsonb end);
  end if;
  return result;
end;
$$;

do $migration$
declare definition text:=pg_get_functiondef('public.booking_workflow_apply_quote_sync_before_payer_20260904(uuid,uuid,uuid,jsonb)'::regprocedure);
  anchor text:='  before_snapshot := booking_api.current_quote_sync_projection(requested_job_id);';
  allocation_anchor text:=$a$'declaredValue',proposed#>>'{cargo,goodsValue}','declaredValueCurrency',proposed#>>'{cargo,goodsValueCurrency}'$a$;
begin
  if position(anchor in definition)=0 or position(allocation_anchor in definition)=0 then raise exception 'Review standard Quote Apply before separating shipment values.'; end if;
  definition:=replace(definition,anchor,anchor||$patch$
  if selected_fields ? 'shipmentGoodsValue' then
    save_payload:=save_payload||jsonb_build_object('shipmentGoodsValue',proposed->'shipmentGoodsValue');
  end if;
$patch$);
  -- Selecting the legacy cargo summary is not approval to change its value.
  definition:=replace(definition,allocation_anchor,$a$'declaredValue',before_snapshot#>>'{cargo,goodsValue}','declaredValueCurrency',before_snapshot#>>'{cargo,goodsValueCurrency}'$a$);
  execute definition;
end;
$migration$;

revoke all on function booking_api.normalise_shipment_value(jsonb),booking_api.quote_shipment_value(jsonb),booking_api.workspace_before_goods_value_20260905(uuid,text),
  booking_api.readiness_before_goods_value_20260905(uuid),
  booking_api.save_before_goods_value_20260905(uuid,uuid,jsonb),booking_api.projection_before_goods_value_20260905(jsonb),
  booking_api.current_before_goods_value_20260905(uuid),booking_api.differences_before_goods_value_20260905(jsonb,jsonb,jsonb)
  from public,anon,authenticated,service_role;
revoke all on function booking_api.workspace(uuid,text),booking_api.save_booking(uuid,uuid,jsonb),booking_api.quote_sync_projection(jsonb),booking_api.quote_readiness(uuid),
  booking_api.current_quote_sync_projection(uuid),booking_api.quote_sync_differences(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function booking_api.workspace(uuid,text),booking_api.save_booking(uuid,uuid,jsonb),booking_api.quote_readiness(uuid) to service_role;
commit;
