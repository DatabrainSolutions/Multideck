-- Bounded operational register reads for Bookings and Quotes. These functions
-- preserve the existing security-invoker views and therefore the underlying
-- RLS policies, while moving filtering, exact counts, sorting and paging out of
-- the browser. No fixture or production data is created by this migration.

begin;

create or replace function public.multideck_register_condition_matches(
  p_values jsonb,
  p_condition jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_operator text := coalesce(p_condition ->> 'operator', 'contains');
  v_query text := lower(btrim(coalesce(p_condition ->> 'value', '')));
  v_query_to text := lower(btrim(coalesce(p_condition ->> 'valueTo', '')));
  v_values text[];
  v_filled text[];
  v_days text[];
  v_start text;
  v_end text;
begin
  if jsonb_typeof(p_values) = 'array' then
    select coalesce(array_agg(coalesce(value #>> '{}', '')), array[]::text[])
      into v_values
    from jsonb_array_elements(p_values) value;
  else
    v_values := array[coalesce(p_values #>> '{}', '')];
  end if;

  select coalesce(array_agg(value), array[]::text[])
    into v_filled
  from unnest(v_values) value
  where btrim(value) <> '' and btrim(value) <> '—';

  if v_operator = 'is-empty' then return cardinality(v_filled) = 0; end if;
  if v_operator = 'is-not-empty' then return cardinality(v_filled) > 0; end if;

  if v_operator in ('on', 'before', 'after', 'between') then
    select coalesce(array_agg(substring(value from 1 for 10)), array[]::text[])
      into v_days
    from unnest(v_filled) value
    where substring(value from 1 for 10) ~ '^\d{4}-\d{2}-\d{2}$';

    if cardinality(v_days) = 0 then return false; end if;
    v_start := case when substring(v_query from 1 for 10) ~ '^\d{4}-\d{2}-\d{2}$' then substring(v_query from 1 for 10) end;
    v_end := case when substring(v_query_to from 1 for 10) ~ '^\d{4}-\d{2}-\d{2}$' then substring(v_query_to from 1 for 10) end;

    if v_operator = 'before' then return v_start is null or exists(select 1 from unnest(v_days) day where day < v_start); end if;
    if v_operator = 'after' then return v_start is null or exists(select 1 from unnest(v_days) day where day > v_start); end if;
    if v_operator = 'between' then
      if v_start is null and v_end is null then return true; end if;
      v_start := coalesce(v_start, v_end);
      v_end := coalesce(v_end, v_start);
      return exists(select 1 from unnest(v_days) day where day between least(v_start, v_end) and greatest(v_start, v_end));
    end if;
    return v_start is null or exists(select 1 from unnest(v_days) day where day = v_start);
  end if;

  if v_query = '' then return true; end if;
  if v_operator = 'is-not' then
    return not exists(select 1 from unnest(v_values) value where lower(btrim(value)) = v_query);
  end if;
  if v_operator = 'not-contains' then
    return not exists(select 1 from unnest(v_values) value where strpos(lower(btrim(value)), v_query) > 0);
  end if;
  if v_operator = 'is' then
    return exists(select 1 from unnest(v_values) value where lower(btrim(value)) = v_query);
  end if;
  if v_operator = 'starts-with' then
    return exists(select 1 from unnest(v_values) value where left(lower(btrim(value)), length(v_query)) = v_query);
  end if;
  return exists(select 1 from unnest(v_values) value where strpos(lower(btrim(value)), v_query) > 0);
end;
$$;

create or replace function public.multideck_register_filter_matches(
  p_fields jsonb,
  p_query jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_query_match text := case when p_query ->> 'match' = 'any' then 'any' else 'all' end;
  v_group jsonb;
  v_condition jsonb;
  v_group_match text;
  v_group_result boolean;
  v_condition_result boolean;
  v_active_groups integer := 0;
  v_active_conditions integer;
  v_value text;
  v_value_to text;
  v_operator text;
begin
  if p_query is null or jsonb_typeof(p_query -> 'groups') <> 'array' then return true; end if;

  for v_group in select value from jsonb_array_elements(p_query -> 'groups') loop
    v_group_match := case when v_group ->> 'match' = 'any' then 'any' else 'all' end;
    v_group_result := v_group_match = 'all';
    v_active_conditions := 0;

    if jsonb_typeof(v_group -> 'conditions') = 'array' then
      for v_condition in select value from jsonb_array_elements(v_group -> 'conditions') loop
        v_operator := coalesce(v_condition ->> 'operator', 'contains');
        v_value := btrim(coalesce(v_condition ->> 'value', ''));
        v_value_to := btrim(coalesce(v_condition ->> 'valueTo', ''));
        if v_operator not in ('is-empty', 'is-not-empty')
          and not (v_operator = 'between' and (v_value <> '' or v_value_to <> ''))
          and v_value = '' then
          continue;
        end if;

        v_active_conditions := v_active_conditions + 1;
        v_condition_result := public.multideck_register_condition_matches(
          coalesce(p_fields -> (v_condition ->> 'field'), 'null'::jsonb),
          v_condition
        );
        if v_group_match = 'all' then
          v_group_result := v_group_result and v_condition_result;
        else
          v_group_result := v_group_result or v_condition_result;
        end if;
      end loop;
    end if;

    if v_active_conditions = 0 then continue; end if;
    v_active_groups := v_active_groups + 1;
    if v_query_match = 'all' and not v_group_result then return false; end if;
    if v_query_match = 'any' and v_group_result then return true; end if;
  end loop;

  if v_active_groups = 0 then return true; end if;
  return v_query_match = 'all';
end;
$$;

create or replace function public.multideck_booking_register_page(
  p_search text default null,
  p_scope text default 'All Jobs',
  p_operator_code text default null,
  p_direction text default null,
  p_mode text default null,
  p_shipment_type text default null,
  p_filter_query jsonb default null,
  p_sort text default 'customerCargo',
  p_sort_direction text default 'asc',
  p_limit integer default 10,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_search text := nullif(btrim(p_search), '');
  v_scope text := case when p_scope in ('All Jobs', 'My Jobs', 'Staged Jobs') then p_scope else 'All Jobs' end;
  v_direction text := nullif(btrim(p_direction), '');
  v_mode text := nullif(btrim(p_mode), '');
  v_shipment_type text := nullif(btrim(p_shipment_type), '');
  v_sort_direction text := case when lower(p_sort_direction) = 'desc' then 'desc' else 'asc' end;
  v_sort text := case when p_sort in (
    'status', 'booking', 'customerCargo', 'mode', 'movement', 'schedule', 'nextAction',
    'ownerActivity', 'progress', 'value', 'customerReference', 'supplierReference', 'invoice'
  ) then p_sort else 'customerCargo' end;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;

  with base as materialized (
    select
      booking."Job_ID",
      booking."Booking_Reference",
      booking."Customer_Name",
      booking."Route",
      booking."Carrier",
      booking."Equipment",
      booking."Mode",
      booking."Direction",
      booking."Shipment_Type",
      booking."Value_Display",
      booking."Eta_Display",
      booking."Time_Display",
      booking."Status",
      booking."Progress",
      booking."Owner_Code",
      booking."Tone",
      booking."Invoice_Reference",
      booking."Job_Reference",
      booking."Customer_Reference",
      booking."Supplier_Reference",
      booking."Origin",
      booking."Destination",
      booking."Vessel",
      booking."Departure_Date",
      booking."Arrival_Date",
      booking."Vin",
      booking."Is_Favourite",
      booking."Custom_Fields",
      booking."Updated_At",
      booking."Departure_At",
      booking."Arrival_At",
      concat_ws(' ',
        booking."Booking_Reference", booking."Customer_Name", booking."Route", booking."Carrier", booking."Equipment",
        booking."Mode", booking."Value_Display", booking."Eta_Display", booking."Time_Display", booking."Status",
        booking."Owner_Code", booking."Invoice_Reference", booking."Job_Reference", booking."Customer_Reference",
        booking."Supplier_Reference", booking."Origin", booking."Destination", booking."Vessel", booking."Vin",
        booking."Custom_Fields"::text
      ) as search_text,
      jsonb_build_object(
        'any', jsonb_build_array(
          booking."Booking_Reference", booking."Customer_Name", booking."Route", booking."Carrier", booking."Equipment",
          booking."Mode", booking."Value_Display", booking."Eta_Display", booking."Time_Display", booking."Status",
          booking."Owner_Code", booking."Invoice_Reference", booking."Job_Reference", booking."Customer_Reference",
          booking."Supplier_Reference", booking."Origin", booking."Destination", booking."Vessel", booking."Vin"
        ) || custom.field_values,
        'invoice', jsonb_build_array(booking."Invoice_Reference"),
        'jobRef', jsonb_build_array(booking."Job_Reference"),
        'customerRef', jsonb_build_array(booking."Customer_Reference"),
        'supplierRef', jsonb_build_array(booking."Supplier_Reference"),
        'date', jsonb_build_array(booking."Departure_Date", booking."Arrival_Date"),
        'destination', jsonb_build_array(booking."Destination", booking."Route"),
        'origin', jsonb_build_array(booking."Origin", booking."Route"),
        'vessel', jsonb_build_array(booking."Vessel", booking."Carrier"),
        'departure', jsonb_build_array(booking."Departure_Date"),
        'arrival', jsonb_build_array(booking."Arrival_Date"),
        'vin', jsonb_build_array(booking."Vin"),
        'customFields', custom.field_values
      ) as filter_fields,
      coalesce(exception_detail.value, case when booking."Status" = 'Exception' then 'Action required' when booking."Status" = 'Delayed' then 'Schedule changed' else 'No open exception' end) as exception_summary,
      case
        when booking."Status" = 'Exception' then coalesce(exception_detail.value, 'Action required')
        when booking."Status" = 'Delayed' then 'Review schedule and update customer'
        when booking."Progress" >= 100 then 'Complete'
        when booking."Progress" < 25 then 'Confirm booking and departure'
        when booking."Progress" < 75 then 'Monitor movement'
        else 'Prepare arrival and delivery'
      end as next_action,
      case
        when regexp_replace(booking."Value_Display", '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then regexp_replace(booking."Value_Display", '[^0-9.-]', '', 'g')::numeric
      end as numeric_value
    from public."App_Live_Bookings" booking
    left join lateral (
      select coalesce(jsonb_agg(value), '[]'::jsonb) as field_values
      from (
        select field ->> 'label' as value from jsonb_array_elements(coalesce(booking."Custom_Fields", '[]'::jsonb)) field
        union all
        select field ->> 'value' from jsonb_array_elements(coalesce(booking."Custom_Fields", '[]'::jsonb)) field
        union all
        select concat_ws(' ', field ->> 'label', field ->> 'value') from jsonb_array_elements(coalesce(booking."Custom_Fields", '[]'::jsonb)) field
      ) items
    ) custom on true
    left join lateral (
      select field ->> 'value' as value
      from jsonb_array_elements(coalesce(booking."Custom_Fields", '[]'::jsonb)) field
      where lower(field ->> 'label') in ('exception', 'delay reason', 'licence', 'blocker', 'tracking')
        and nullif(btrim(field ->> 'value'), '') is not null
      limit 1
    ) exception_detail on true
  ), scoped as materialized (
    select *
    from base
    where (v_scope <> 'My Jobs' or "Owner_Code" = coalesce(nullif(btrim(p_operator_code), ''), ''))
      and (v_scope <> 'Staged Jobs' or "Progress" < 25)
  ), filtered as materialized (
    select *
    from scoped
    where (v_direction is null or "Direction" = v_direction)
      and (v_mode is null or "Mode" = v_mode)
      and (v_shipment_type is null or "Shipment_Type" = v_shipment_type)
      and (v_search is null or strpos(lower(search_text), lower(v_search)) > 0)
      and (p_filter_query is null or public.multideck_register_filter_matches(filter_fields, p_filter_query))
  ), ranked as (
    select *, row_number() over (
      order by
        case when v_sort_direction = 'asc' then case v_sort
          when 'status' then lower(concat_ws(' ', "Status", exception_summary))
          when 'booking' then lower("Booking_Reference")
          when 'customerCargo' then lower("Customer_Name")
          when 'mode' then lower("Mode")
          when 'movement' then lower(concat_ws(' ', "Origin", "Destination", "Carrier"))
          when 'nextAction' then lower(next_action)
          when 'customerReference' then lower("Customer_Reference")
          when 'supplierReference' then lower("Supplier_Reference")
          when 'invoice' then lower("Invoice_Reference")
        end end asc nulls last,
        case when v_sort_direction = 'desc' then case v_sort
          when 'status' then lower(concat_ws(' ', "Status", exception_summary))
          when 'booking' then lower("Booking_Reference")
          when 'customerCargo' then lower("Customer_Name")
          when 'mode' then lower("Mode")
          when 'movement' then lower(concat_ws(' ', "Origin", "Destination", "Carrier"))
          when 'nextAction' then lower(next_action)
          when 'customerReference' then lower("Customer_Reference")
          when 'supplierReference' then lower("Supplier_Reference")
          when 'invoice' then lower("Invoice_Reference")
        end end desc nulls last,
        case when v_sort_direction = 'asc' then case v_sort
          when 'schedule' then "Arrival_Date"::timestamptz
          when 'ownerActivity' then "Updated_At"
        end end asc nulls last,
        case when v_sort_direction = 'desc' then case v_sort
          when 'schedule' then "Arrival_Date"::timestamptz
          when 'ownerActivity' then "Updated_At"
        end end desc nulls last,
        case when v_sort_direction = 'asc' then case v_sort when 'progress' then "Progress" when 'value' then numeric_value end end asc nulls last,
        case when v_sort_direction = 'desc' then case v_sort when 'progress' then "Progress" when 'value' then numeric_value end end desc nulls last,
        lower("Customer_Name"), "Booking_Reference"
    ) as ordinal
    from filtered
  ), page as (
    select * from ranked where ordinal > v_offset and ordinal <= v_offset + v_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(
      to_jsonb(item) - 'search_text' - 'filter_fields' - 'exception_summary' - 'next_action' - 'numeric_value' - 'ordinal'
      order by item.ordinal
    ) from page item), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'summary', coalesce((select jsonb_build_object(
      'active', count(*) filter (where "Progress" < 100),
      'inTransit', count(*) filter (where "Progress" >= 25 and "Progress" < 75),
      'atDestination', count(*) filter (where "Progress" >= 75 and "Progress" < 100),
      'exceptions', count(*) filter (where "Status" = 'Exception'),
      'complete', count(*) filter (where "Progress" >= 100),
      'total', count(*)
    ) from scoped), '{}'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.multideck_quote_register_page(
  p_search text default null,
  p_filter_query jsonb default null,
  p_sort text default 'updatedAt',
  p_sort_direction text default 'desc',
  p_limit integer default 10,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_search text := nullif(btrim(p_search), '');
  v_sort_direction text := case when lower(p_sort_direction) = 'asc' then 'asc' else 'desc' end;
  v_sort text := case when p_sort in (
    'reference', 'status', 'customer', 'origin', 'destination', 'estimatedDeparture', 'estimatedArrival',
    'transportTime', 'transportMode', 'equipmentLoad', 'pickup', 'delivery', 'routingVia', 'incoterms',
    'incotermsPlace', 'serviceLevel', 'shipmentType', 'carrier', 'supplier', 'salesOwner', 'operationsOwner',
    'quoteType', 'direction', 'customerPurchaseOrder', 'shipperReference', 'validity', 'estimatedQuote',
    'sellValue', 'estimatedProfit', 'estimatedCost', 'estimatedMargin', 'documentStatus', 'workflowStage',
    'priority', 'quoteSource', 'createdAt', 'updatedAt'
  ) then p_sort else 'updatedAt' end;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;

  with base as materialized (
    select
      quote."CusQuoteHeader_ID",
      quote."Quote_Reference",
      quote."Quote_Status",
      quote."Quote_Status_Tone",
      quote."Customer_Name",
      quote."Origin",
      quote."Destination",
      quote."Estimated_Departure",
      quote."Estimated_Arrival",
      quote."Transport_Time",
      quote."Transport_Mode",
      quote."Equipment_Load",
      quote."Pickup",
      quote."Delivery",
      quote."Routing_Via",
      quote."Incoterms",
      quote."Incoterms_Place",
      quote."Service_Level",
      quote."Shipment_Type",
      quote."Carrier",
      quote."Supplier",
      quote."Sales_Owner",
      quote."Operations_Owner",
      quote."Quote_Type",
      quote."Direction",
      quote."Customer_Purchase_Order",
      quote."Shipper_Reference",
      quote."Validity",
      quote."Estimated_Quote",
      quote."Sell_Value",
      quote."Estimated_Profit",
      quote."Estimated_Cost",
      quote."Estimated_Margin",
      quote."Currency",
      quote."Document_Status",
      quote."Workflow_Stage",
      quote."Priority",
      quote."Priority_Tone",
      quote."Quote_Source",
      quote."Created_At",
      quote."Updated_At",
      concat_ws(' ',
        quote."Quote_Reference", quote."Quote_Status", quote."Customer_Name", quote."Origin", quote."Destination",
        quote."Estimated_Departure", quote."Estimated_Arrival", quote."Transport_Time", quote."Transport_Mode",
        quote."Equipment_Load", quote."Pickup", quote."Delivery", quote."Routing_Via", quote."Incoterms",
        quote."Incoterms_Place", quote."Service_Level", quote."Shipment_Type", quote."Carrier", quote."Supplier",
        quote."Sales_Owner", quote."Operations_Owner", quote."Quote_Type", quote."Direction",
        quote."Customer_Purchase_Order", quote."Shipper_Reference", quote."Validity", quote."Estimated_Quote",
        quote."Sell_Value", quote."Estimated_Profit", quote."Estimated_Cost", quote."Estimated_Margin", quote."Currency",
        quote."Document_Status", quote."Workflow_Stage", quote."Priority", quote."Quote_Source", quote."Created_At"
      ) as search_text,
      jsonb_build_object(
        'any', jsonb_build_array(
          quote."Quote_Reference", quote."Quote_Status", quote."Customer_Name", quote."Origin", quote."Destination",
          quote."Estimated_Departure", quote."Estimated_Arrival", quote."Transport_Time", quote."Transport_Mode",
          quote."Equipment_Load", quote."Pickup", quote."Delivery", quote."Routing_Via", quote."Incoterms",
          quote."Incoterms_Place", quote."Service_Level", quote."Shipment_Type", quote."Carrier", quote."Supplier",
          quote."Sales_Owner", quote."Operations_Owner", quote."Quote_Type", quote."Direction",
          quote."Customer_Purchase_Order", quote."Shipper_Reference", quote."Validity", quote."Estimated_Quote",
          quote."Sell_Value", quote."Estimated_Profit", quote."Estimated_Cost", quote."Estimated_Margin", quote."Currency",
          quote."Document_Status", quote."Workflow_Stage", quote."Priority", quote."Quote_Source", quote."Created_At"
        ),
        'reference', to_jsonb(quote."Quote_Reference"),
        'status', to_jsonb(quote."Quote_Status"),
        'customer', to_jsonb(quote."Customer_Name"),
        'origin', to_jsonb(quote."Origin"),
        'destination', to_jsonb(quote."Destination"),
        'estimatedDeparture', to_jsonb(quote."Estimated_Departure"),
        'estimatedArrival', to_jsonb(quote."Estimated_Arrival"),
        'transportTime', to_jsonb(quote."Transport_Time"),
        'transportMode', to_jsonb(quote."Transport_Mode"),
        'equipmentLoad', to_jsonb(quote."Equipment_Load"),
        'pickup', to_jsonb(quote."Pickup"),
        'delivery', to_jsonb(quote."Delivery"),
        'routingVia', to_jsonb(quote."Routing_Via"),
        'incoterms', to_jsonb(quote."Incoterms"),
        'incotermsPlace', to_jsonb(quote."Incoterms_Place"),
        'serviceLevel', to_jsonb(quote."Service_Level"),
        'shipmentType', to_jsonb(quote."Shipment_Type"),
        'carrier', to_jsonb(quote."Carrier"),
        'supplier', to_jsonb(quote."Supplier"),
        'salesOwner', to_jsonb(quote."Sales_Owner"),
        'operationsOwner', to_jsonb(quote."Operations_Owner"),
        'quoteType', to_jsonb(quote."Quote_Type"),
        'direction', to_jsonb(quote."Direction"),
        'customerPurchaseOrder', to_jsonb(quote."Customer_Purchase_Order"),
        'shipperReference', to_jsonb(quote."Shipper_Reference"),
        'validity', to_jsonb(quote."Validity"),
        'estimatedQuote', to_jsonb(quote."Estimated_Quote"),
        'sellValue', to_jsonb(quote."Sell_Value"),
        'estimatedProfit', to_jsonb(quote."Estimated_Profit"),
        'estimatedCost', to_jsonb(quote."Estimated_Cost"),
        'estimatedMargin', to_jsonb(quote."Estimated_Margin"),
        'documentStatus', to_jsonb(quote."Document_Status"),
        'workflowStage', to_jsonb(quote."Workflow_Stage"),
        'priority', to_jsonb(quote."Priority"),
        'quoteSource', to_jsonb(quote."Quote_Source")
      ) as filter_fields
    from public."App_Live_Quotes" quote
  ), filtered as materialized (
    select *
    from base
    where (v_search is null or strpos(lower(search_text), lower(v_search)) > 0)
      and (p_filter_query is null or public.multideck_register_filter_matches(filter_fields, p_filter_query))
  ), ranked as (
    select *, row_number() over (
      order by
        case when v_sort_direction = 'asc' then case v_sort
          when 'reference' then lower("Quote_Reference") when 'status' then lower("Quote_Status")
          when 'customer' then lower("Customer_Name") when 'origin' then lower("Origin") when 'destination' then lower("Destination")
          when 'transportTime' then lower("Transport_Time") when 'transportMode' then lower("Transport_Mode")
          when 'equipmentLoad' then lower("Equipment_Load") when 'pickup' then lower("Pickup") when 'delivery' then lower("Delivery")
          when 'routingVia' then lower("Routing_Via") when 'incoterms' then lower("Incoterms") when 'incotermsPlace' then lower("Incoterms_Place")
          when 'serviceLevel' then lower("Service_Level") when 'shipmentType' then lower("Shipment_Type") when 'carrier' then lower("Carrier")
          when 'supplier' then lower("Supplier") when 'salesOwner' then lower("Sales_Owner") when 'operationsOwner' then lower("Operations_Owner")
          when 'quoteType' then lower("Quote_Type") when 'direction' then lower("Direction")
          when 'customerPurchaseOrder' then lower("Customer_Purchase_Order") when 'shipperReference' then lower("Shipper_Reference")
          when 'validity' then lower("Validity") when 'estimatedQuote' then lower("Estimated_Quote")
          when 'documentStatus' then lower("Document_Status") when 'workflowStage' then lower("Workflow_Stage")
          when 'priority' then lower("Priority") when 'quoteSource' then lower("Quote_Source")
        end end asc nulls last,
        case when v_sort_direction = 'desc' then case v_sort
          when 'reference' then lower("Quote_Reference") when 'status' then lower("Quote_Status")
          when 'customer' then lower("Customer_Name") when 'origin' then lower("Origin") when 'destination' then lower("Destination")
          when 'transportTime' then lower("Transport_Time") when 'transportMode' then lower("Transport_Mode")
          when 'equipmentLoad' then lower("Equipment_Load") when 'pickup' then lower("Pickup") when 'delivery' then lower("Delivery")
          when 'routingVia' then lower("Routing_Via") when 'incoterms' then lower("Incoterms") when 'incotermsPlace' then lower("Incoterms_Place")
          when 'serviceLevel' then lower("Service_Level") when 'shipmentType' then lower("Shipment_Type") when 'carrier' then lower("Carrier")
          when 'supplier' then lower("Supplier") when 'salesOwner' then lower("Sales_Owner") when 'operationsOwner' then lower("Operations_Owner")
          when 'quoteType' then lower("Quote_Type") when 'direction' then lower("Direction")
          when 'customerPurchaseOrder' then lower("Customer_Purchase_Order") when 'shipperReference' then lower("Shipper_Reference")
          when 'validity' then lower("Validity") when 'estimatedQuote' then lower("Estimated_Quote")
          when 'documentStatus' then lower("Document_Status") when 'workflowStage' then lower("Workflow_Stage")
          when 'priority' then lower("Priority") when 'quoteSource' then lower("Quote_Source")
        end end desc nulls last,
        case when v_sort_direction = 'asc' then case v_sort
          when 'estimatedDeparture' then "Estimated_Departure"::timestamptz when 'estimatedArrival' then "Estimated_Arrival"::timestamptz
          when 'createdAt' then "Created_At" when 'updatedAt' then "Updated_At"
        end end asc nulls last,
        case when v_sort_direction = 'desc' then case v_sort
          when 'estimatedDeparture' then "Estimated_Departure"::timestamptz when 'estimatedArrival' then "Estimated_Arrival"::timestamptz
          when 'createdAt' then "Created_At" when 'updatedAt' then "Updated_At"
        end end desc nulls last,
        case when v_sort_direction = 'asc' then case v_sort
          when 'sellValue' then "Sell_Value" when 'estimatedProfit' then "Estimated_Profit"
          when 'estimatedCost' then "Estimated_Cost" when 'estimatedMargin' then "Estimated_Margin"
        end end asc nulls last,
        case when v_sort_direction = 'desc' then case v_sort
          when 'sellValue' then "Sell_Value" when 'estimatedProfit' then "Estimated_Profit"
          when 'estimatedCost' then "Estimated_Cost" when 'estimatedMargin' then "Estimated_Margin"
        end end desc nulls last,
        "Updated_At" desc, "Quote_Reference"
    ) as ordinal
    from filtered
  ), page as (
    select * from ranked where ordinal > v_offset and ordinal <= v_offset + v_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(item) - 'search_text' - 'filter_fields' - 'ordinal' order by item.ordinal) from page item), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'availableTotal', (select count(*) from base)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.multideck_register_condition_matches(jsonb,jsonb) from public, anon;
revoke all on function public.multideck_register_filter_matches(jsonb,jsonb) from public, anon;
revoke all on function public.multideck_booking_register_page(text,text,text,text,text,text,jsonb,text,text,integer,integer) from public, anon;
revoke all on function public.multideck_quote_register_page(text,jsonb,text,text,integer,integer) from public, anon;
grant execute on function public.multideck_register_condition_matches(jsonb,jsonb) to authenticated, service_role;
grant execute on function public.multideck_register_filter_matches(jsonb,jsonb) to authenticated, service_role;
grant execute on function public.multideck_booking_register_page(text,text,text,text,text,text,jsonb,text,text,integer,integer) to authenticated, service_role;
grant execute on function public.multideck_quote_register_page(text,jsonb,text,text,integer,integer) to authenticated, service_role;

comment on function public.multideck_booking_register_page(text,text,text,text,text,text,jsonb,text,text,integer,integer)
is 'RLS-preserving, maximum-50-row Bookings register read with exact filtered total and scope summary.';
comment on function public.multideck_quote_register_page(text,jsonb,text,text,integer,integer)
is 'RLS-preserving, maximum-50-row Quotes register read with exact filtered total.';

-- Dexter exception: these functions only bound existing Bookings and Quotes
-- reads. Existing Dexter read/write domains and event-driven watches remain the
-- capability surfaces; this migration adds no new data or mutation semantics.

commit;
