begin;
set local lock_timeout='5s';

-- Warehouse billing foundation
--
-- 1. Workspace billing settings: the time zone and daily cut-off at which
--    stock is counted for storage, and the billing cycle (weekly or monthly).
-- 2. Nightly stock records taken at that cut-off. Storage is charged only on
--    stock that was physically booked in and on hand at a cut-off. Expected
--    receipts, orders, invoices and purchase orders never create storage.
-- 3. A read-only charge statement per customer and billing period that applies
--    the existing warehouse rate cards to real events: each receipt (goods in),
--    each dispatch (goods out) and each recorded night of stock (storage), by
--    pallet, unit, kilogram, cubic metre or fixed charge.
--
-- Nothing here posts invoices or ledger entries. The statement is for review.

create table booking_api.warehouse_billing_settings (
  company_id uuid primary key references public."cmp_Company"("Company_ID"),
  time_zone text not null,
  cutoff_time time not null,
  cycle text not null check (cycle in ('weekly','monthly')),
  week_start smallint not null default 1 check (week_start between 1 and 7),
  month_start smallint not null default 1 check (month_start between 1 and 28),
  version integer not null default 1,
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);
create table booking_api.warehouse_billing_settings_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  actor_auth_id uuid not null,
  previous_settings jsonb,
  settings jsonb not null,
  version integer not null,
  created_at timestamptz not null default now()
);
create table booking_api.warehouse_stock_snapshot_runs (
  company_id uuid not null references public."cmp_Company"("Company_ID"),
  stock_date date not null,
  time_zone text not null,
  cutoff_at timestamptz not null,
  captured_at timestamptz not null default now(),
  balance_count integer not null default 0,
  primary key (company_id, stock_date)
);
create table booking_api.warehouse_stock_snapshots (
  company_id uuid not null,
  stock_date date not null,
  balance_id uuid not null,
  facility_id uuid not null,
  customer_org_id uuid,
  item_id uuid not null,
  location_id uuid,
  lot_id uuid,
  hu_id uuid,
  hu_type_code text,
  quantity numeric(18,6) not null,
  uom_code text not null,
  inventory_status_code text not null,
  first_received_at timestamptz,
  unit_gross_weight_kg numeric(18,6),
  unit_volume_m3 numeric(18,9),
  primary key (company_id, stock_date, balance_id),
  foreign key (company_id, stock_date) references booking_api.warehouse_stock_snapshot_runs(company_id, stock_date) on delete cascade
);
create index warehouse_stock_snapshots_customer on booking_api.warehouse_stock_snapshots(company_id, customer_org_id, stock_date);

alter table booking_api.warehouse_billing_settings enable row level security;
alter table booking_api.warehouse_billing_settings_audit enable row level security;
alter table booking_api.warehouse_stock_snapshot_runs enable row level security;
alter table booking_api.warehouse_stock_snapshots enable row level security;
revoke all on booking_api.warehouse_billing_settings, booking_api.warehouse_billing_settings_audit,
  booking_api.warehouse_stock_snapshot_runs, booking_api.warehouse_stock_snapshots from public, anon, authenticated;
grant all on booking_api.warehouse_billing_settings, booking_api.warehouse_billing_settings_audit,
  booking_api.warehouse_stock_snapshot_runs, booking_api.warehouse_stock_snapshots to service_role;

-- Saved settings, or the documented defaults for a workspace that has not saved any.
create function booking_api.warehouse_billing_settings_for(p_company_id uuid)
returns table(time_zone text, cutoff_time time, cycle text, week_start smallint, month_start smallint, version integer, updated_at timestamptz, is_default boolean)
language sql stable security definer set search_path='' as $$
  select s.time_zone, s.cutoff_time, s.cycle, s.week_start, s.month_start, s.version, s.updated_at, false
  from booking_api.warehouse_billing_settings s where s.company_id=p_company_id
  union all
  select 'Europe/London', time '23:59', 'monthly', 1::smallint, 1::smallint, 0, null::timestamptz, true
  where not exists(select 1 from booking_api.warehouse_billing_settings s where s.company_id=p_company_id)
$$;
revoke all on function booking_api.warehouse_billing_settings_for(uuid) from public, anon, authenticated;

create function public.warehouse_billing_settings(p_settings jsonb default null, p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor public."cmp_Users"%rowtype;
  can_manage boolean;
  cur record;
  saved booking_api.warehouse_billing_settings%rowtype;
  zone text; cutoff time; cycle_code text; week_day integer; month_day integer;
  last_run booking_api.warehouse_stock_snapshot_runs%rowtype;
begin
  select * into actor from public."cmp_Users" where "Auth_User_ID"=auth.uid()
    and coalesce("User_AccessStatus",'active')='active' and "Company_ID" is not null;
  if actor."User_ID" is null then raise exception 'Your active workspace identity is required.' using errcode='42501'; end if;
  can_manage:=coalesce(booking_api.has_permission(auth.uid(),'Warehouse.Write'),false);
  if not can_manage and not coalesce(booking_api.has_permission(auth.uid(),'Warehouse.Read'),false) then
    raise exception 'Warehouse access is required.' using errcode='42501';
  end if;
  select * into cur from booking_api.warehouse_billing_settings_for(actor."Company_ID");

  if p_settings is not null then
    if not can_manage then raise exception 'Warehouse write permission is required.' using errcode='42501'; end if;
    perform pg_advisory_xact_lock(hashtextextended(actor."Company_ID"::text,92230));
    select * into cur from booking_api.warehouse_billing_settings_for(actor."Company_ID");
    if p_expected_version is distinct from cur.version then
      raise exception 'Billing settings changed since you opened them. Reload them before saving again.' using errcode='40001';
    end if;
    if jsonb_typeof(p_settings) is distinct from 'object' then raise exception 'Invalid billing settings.' using errcode='22023'; end if;
    zone:=p_settings->>'timeZone'; cycle_code:=p_settings->>'cycle';
    if zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then
      raise exception 'Choose a valid time zone.' using errcode='22023'; end if;
    if coalesce(p_settings->>'cutoffTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'Enter the daily cut-off as a 24-hour time, for example 23:59.' using errcode='22023'; end if;
    cutoff:=(p_settings->>'cutoffTime')::time;
    if cycle_code not in ('weekly','monthly') then raise exception 'Choose a weekly or monthly billing cycle.' using errcode='22023'; end if;
    if jsonb_typeof(p_settings->'weekStart') is distinct from 'number' or jsonb_typeof(p_settings->'monthStart') is distinct from 'number' then
      raise exception 'Choose when each billing period starts.' using errcode='22023'; end if;
    week_day:=(p_settings->>'weekStart')::numeric; month_day:=(p_settings->>'monthStart')::numeric;
    if week_day::numeric<>(p_settings->>'weekStart')::numeric or week_day not between 1 and 7 then
      raise exception 'Weekly periods start on a day from Monday to Sunday.' using errcode='22023'; end if;
    if month_day::numeric<>(p_settings->>'monthStart')::numeric or month_day not between 1 and 28 then
      raise exception 'Monthly periods start on a day from 1 to 28.' using errcode='22023'; end if;
    insert into booking_api.warehouse_billing_settings_audit(company_id,actor_auth_id,previous_settings,settings,version)
      values(actor."Company_ID",auth.uid(),
        case when cur.is_default then null else jsonb_build_object('timeZone',cur.time_zone,'cutoffTime',to_char(cur.cutoff_time,'HH24:MI'),'cycle',cur.cycle,'weekStart',cur.week_start,'monthStart',cur.month_start) end,
        jsonb_build_object('timeZone',zone,'cutoffTime',to_char(cutoff,'HH24:MI'),'cycle',cycle_code,'weekStart',week_day,'monthStart',month_day),
        cur.version+1);
    insert into booking_api.warehouse_billing_settings(company_id,time_zone,cutoff_time,cycle,week_start,month_start,updated_by)
      values(actor."Company_ID",zone,cutoff,cycle_code,week_day,month_day,auth.uid())
      on conflict(company_id) do update set time_zone=excluded.time_zone,cutoff_time=excluded.cutoff_time,cycle=excluded.cycle,
        week_start=excluded.week_start,month_start=excluded.month_start,version=warehouse_billing_settings.version+1,
        updated_by=excluded.updated_by,updated_at=now()
      returning * into saved;
    select * into cur from booking_api.warehouse_billing_settings_for(actor."Company_ID");
  end if;

  select * into last_run from booking_api.warehouse_stock_snapshot_runs r where r.company_id=actor."Company_ID" order by r.stock_date desc limit 1;
  return jsonb_build_object('timeZone',cur.time_zone,'cutoffTime',to_char(cur.cutoff_time,'HH24:MI'),'cycle',cur.cycle,
    'weekStart',cur.week_start,'monthStart',cur.month_start,'version',cur.version,'isDefault',cur.is_default,
    'updatedAt',cur.updated_at,'canManage',can_manage,
    'lastStockRecord',case when last_run.stock_date is null then null else jsonb_build_object('stockDate',last_run.stock_date,'capturedAt',last_run.captured_at,'balances',last_run.balance_count) end);
end $$;
revoke all on function public.warehouse_billing_settings(jsonb,integer) from public, anon;
grant execute on function public.warehouse_billing_settings(jsonb,integer) to authenticated;

-- Records the stock on hand for every workspace whose daily cut-off has
-- passed and has not been recorded yet. A missed cut-off is only caught up
-- within six hours; after that the day stays unrecorded (and uncharged)
-- rather than being filled with stock counted at the wrong time.
create function booking_api.warehouse_capture_stock_snapshots(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path='' as $$
declare company record; settings record; local_now timestamp; cutoff_local timestamp; cutoff_instant timestamptz; captured integer:=0; balances integer;
begin
  for company in
    select distinct office."Company_ID" company_id
    from public."WMS_Facilities" facility
    join public."cmp_Offices" office on office."Office_ID"=facility."WMSFacility_OrgOfficeID"
    where not facility."WMSFacility_IsDeleted"
  loop
    select * into settings from booking_api.warehouse_billing_settings_for(company.company_id);
    local_now:=p_now at time zone settings.time_zone;
    cutoff_local:=local_now::date+settings.cutoff_time;
    if cutoff_local>local_now then cutoff_local:=cutoff_local-interval '1 day'; end if;
    cutoff_instant:=cutoff_local at time zone settings.time_zone;
    if p_now-cutoff_instant>interval '6 hours' then continue; end if;
    if exists(select 1 from booking_api.warehouse_stock_snapshot_runs r where r.company_id=company.company_id and r.stock_date=cutoff_local::date) then continue; end if;
    insert into booking_api.warehouse_stock_snapshot_runs(company_id,stock_date,time_zone,cutoff_at,captured_at)
      values(company.company_id,cutoff_local::date,settings.time_zone,cutoff_instant,p_now);
    insert into booking_api.warehouse_stock_snapshots(company_id,stock_date,balance_id,facility_id,customer_org_id,item_id,location_id,lot_id,hu_id,hu_type_code,
        quantity,uom_code,inventory_status_code,first_received_at,unit_gross_weight_kg,unit_volume_m3)
      select company.company_id,cutoff_local::date,balance."WMSBalance_ID",balance."WMSBalance_FacilityID",coalesce(balance."WMSBalance_CustomerOrgID",item."WMSItem_CustomerOrgID"),
        balance."WMSBalance_ItemID",balance."WMSBalance_LocationID",balance."WMSBalance_LotID",balance."WMSBalance_HU_ID",hu."WMSHU_TypeCode",
        balance."WMSBalance_OnHandQuantity",balance."WMSBalance_UOMCode",balance."WMSBalance_InventoryStatusCode",
        coalesce(balance."WMSBalance_FirstReceiptAt",balance."WMSBalance_CreatedAt"),item."WMSItem_GrossWeightKG",
        item."WMSItem_LengthM"*item."WMSItem_WidthM"*item."WMSItem_HeightM"
      from public."WMS_InventoryBalances" balance
      join public."WMS_Facilities" facility on facility."WMSFacility_ID"=balance."WMSBalance_FacilityID" and not facility."WMSFacility_IsDeleted"
      join public."cmp_Offices" office on office."Office_ID"=facility."WMSFacility_OrgOfficeID" and office."Company_ID"=company.company_id
      join public."WMS_Items" item on item."WMSItem_ID"=balance."WMSBalance_ItemID"
      left join public."WMS_HandlingUnits" hu on hu."WMSHU_ID"=balance."WMSBalance_HU_ID"
      where balance."WMSBalance_OnHandQuantity">0;
    get diagnostics balances=row_count;
    update booking_api.warehouse_stock_snapshot_runs set balance_count=balances where company_id=company.company_id and stock_date=cutoff_local::date;
    captured:=captured+1;
  end loop;
  return captured;
end $$;
revoke all on function booking_api.warehouse_capture_stock_snapshots(timestamptz) from public, anon, authenticated;
grant execute on function booking_api.warehouse_capture_stock_snapshots(timestamptz) to service_role;

-- Customer rates replace default rates with the same charge code on each date.
create function booking_api.warehouse_rates_on(p_company_id uuid, p_customer_org_id uuid, p_date date)
returns setof jsonb language sql stable security definer set search_path='' as $$
  select distinct on (x.rate->>'code') x.rate||jsonb_build_object('source',x.source)
  from (
    select r.value rate, 1 priority, 'customer' source from booking_api.warehouse_pricing_cards c cross join lateral jsonb_array_elements(c.rates) r
    where c.company_id=p_company_id and c.scope_key=p_customer_org_id::text
    union all
    select r.value, 2, 'default' from booking_api.warehouse_pricing_cards c cross join lateral jsonb_array_elements(c.rates) r
    where c.company_id=p_company_id and c.scope_key='default'
  ) x
  where (x.rate->>'from')::date<=p_date and (coalesce(x.rate->>'to','')='' or (x.rate->>'to')::date>=p_date)
  order by x.rate->>'code', x.priority
$$;
revoke all on function booking_api.warehouse_rates_on(uuid,uuid,date) from public, anon, authenticated;

create function booking_api.warehouse_billing_period_start(p_cycle text, p_week_start integer, p_month_start integer, p_day date)
returns date language sql immutable set search_path='' as $$
  select case when p_cycle='weekly' then p_day-((extract(isodow from p_day)::integer-p_week_start+7)%7)
    when extract(day from p_day)>=p_month_start then make_date(extract(year from p_day)::integer,extract(month from p_day)::integer,p_month_start)
    else (make_date(extract(year from p_day)::integer,extract(month from p_day)::integer,p_month_start)-interval '1 month')::date end
$$;
revoke all on function booking_api.warehouse_billing_period_start(text,integer,integer,date) from public, anon, authenticated;

create function public.warehouse_charge_statement(p_customer_org_id uuid, p_period_start date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  actor public."cmp_Users"%rowtype;
  settings record;
  facilities uuid[];
  today date; period_start date; period_end date; start_at timestamptz; end_at timestamptz;
  customer_name text; lines jsonb:='[]'; warnings jsonb:='[]'; totals jsonb; expected_nights integer; recorded_nights integer;
  pallet_gaps integer; weight_gaps integer; volume_gaps integer;
begin
  select * into actor from public."cmp_Users" where "Auth_User_ID"=auth.uid()
    and coalesce("User_AccessStatus",'active')='active' and "Company_ID" is not null;
  if actor."User_ID" is null then raise exception 'Your active workspace identity is required.' using errcode='42501'; end if;
  if not (coalesce(booking_api.has_permission(auth.uid(),'Warehouse.Read'),false) or coalesce(booking_api.has_permission(auth.uid(),'Warehouse.Write'),false)) then
    raise exception 'Warehouse access is required.' using errcode='42501'; end if;
  if p_customer_org_id is null then raise exception 'Choose a customer.' using errcode='22023'; end if;

  -- The same warehouse scope as the rest of Warehouse: facilities of the
  -- offices this user is assigned to, inside their own company.
  select coalesce(array_agg(distinct facility."WMSFacility_ID"),'{}') into facilities
  from public."cmp_Users_Offices" link
  join public."cmp_Offices" office on office."Office_ID"=link."Office_ID" and office."Company_ID"=actor."Company_ID"
  join public."WMS_Facilities" facility on facility."WMSFacility_OrgOfficeID"=office."Office_ID" and not facility."WMSFacility_IsDeleted"
  where link."User_ID"=actor."User_ID";
  if not exists(select 1 from public."WMS_Orders" o where o."WMSOrder_CustomerOrgID"=p_customer_org_id and o."WMSOrder_FacilityID"=any(facilities) and not o."WMSOrder_IsDeleted")
    and not exists(select 1 from public."WMS_InventoryBalances" b where b."WMSBalance_CustomerOrgID"=p_customer_org_id and b."WMSBalance_FacilityID"=any(facilities)) then
    raise exception 'This customer has no warehouse activity in your warehouses.' using errcode='42501'; end if;
  select "Org_Name" into customer_name from public."Org_Master" where "Org_id"=p_customer_org_id;

  select * into settings from booking_api.warehouse_billing_settings_for(actor."Company_ID");
  today:=(now() at time zone settings.time_zone)::date;
  period_start:=coalesce(p_period_start,booking_api.warehouse_billing_period_start(settings.cycle,settings.week_start,settings.month_start,today));
  if period_start<>booking_api.warehouse_billing_period_start(settings.cycle,settings.week_start,settings.month_start,period_start) then
    raise exception 'Choose a period that starts on your billing cycle start day.' using errcode='22023'; end if;
  period_end:=case when settings.cycle='weekly' then period_start+7 else (period_start+interval '1 month')::date end;
  start_at:=period_start::timestamp at time zone settings.time_zone;
  end_at:=period_end::timestamp at time zone settings.time_zone;

  -- Goods in: one charge per receipt for each goods-in rate on the receipt date.
  with receipts as (
    select rc."WMSReceipt_ID" id, rc."WMSReceipt_ReceiptNumber" reference, o."WMSOrder_OrderNumber" order_number,
      (rc."WMSReceipt_ReceivedAt" at time zone settings.time_zone)::date event_date,
      coalesce(sum(rl."WMSReceiptLine_ReceivedQuantity"),0) units,
      count(distinct rl."WMSReceiptLine_HU_ID") filter (where hu."WMSHU_TypeCode"='pallet') pallets,
      sum(rl."WMSReceiptLine_ReceivedQuantity"*item."WMSItem_GrossWeightKG") kg,
      sum(rl."WMSReceiptLine_ReceivedQuantity"*item."WMSItem_LengthM"*item."WMSItem_WidthM"*item."WMSItem_HeightM") m3
    from public."WMS_Receipts" rc
    join public."WMS_Orders" o on o."WMSOrder_ID"=rc."WMSReceipt_OrderID" and o."WMSOrder_CustomerOrgID"=p_customer_org_id and o."WMSOrder_FacilityID"=any(facilities)
    join public."WMS_ReceiptLines" rl on rl."WMSReceiptLine_ReceiptID"=rc."WMSReceipt_ID"
    join public."WMS_Items" item on item."WMSItem_ID"=rl."WMSReceiptLine_ItemID"
    left join public."WMS_HandlingUnits" hu on hu."WMSHU_ID"=rl."WMSReceiptLine_HU_ID"
    where rc."WMSReceipt_ReceivedAt">=start_at and rc."WMSReceipt_ReceivedAt"<end_at
    group by 1,2,3,4
  ), dispatches as (
    select d."WMSDispatch_ID" id, d."WMSDispatch_DispatchNumber" reference, o."WMSOrder_OrderNumber" order_number,
      (d."WMSDispatch_DispatchedAt" at time zone settings.time_zone)::date event_date,
      coalesce(sum(t."WMSTransaction_Quantity"),0) units,
      count(distinct t."WMSTransaction_HU_ID") filter (where hu."WMSHU_TypeCode"='pallet') pallets,
      sum(t."WMSTransaction_Quantity"*item."WMSItem_GrossWeightKG") kg,
      sum(t."WMSTransaction_Quantity"*item."WMSItem_LengthM"*item."WMSItem_WidthM"*item."WMSItem_HeightM") m3
    from public."WMS_Dispatches" d
    join public."WMS_Orders" o on o."WMSOrder_ID"=d."WMSDispatch_OrderID" and o."WMSOrder_CustomerOrgID"=p_customer_org_id and o."WMSOrder_FacilityID"=any(facilities)
    join public."WMS_InventoryTransactions" t on t."WMSTransaction_SourceTable"='WMS_Dispatches' and t."WMSTransaction_SourceID"=d."WMSDispatch_ID" and t."WMSTransaction_TypeCode"='dispatch'
    join public."WMS_Items" item on item."WMSItem_ID"=t."WMSTransaction_ItemID"
    left join public."WMS_HandlingUnits" hu on hu."WMSHU_ID"=t."WMSTransaction_HU_ID"
    where d."WMSDispatch_DispatchedAt">=start_at and d."WMSDispatch_DispatchedAt"<end_at
    group by 1,2,3,4
  ), events as (
    select 'receipt' stage, * from receipts union all select 'dispatch', * from dispatches
  ), charged as (
    select e.*, r.rate,
      case r.rate->>'basis' when 'unit' then e.units when 'pallet' then e.pallets when 'kg' then coalesce(e.kg,0) when 'm3' then coalesce(e.m3,0) else 1 end quantity
    from events e cross join lateral booking_api.warehouse_rates_on(actor."Company_ID",p_customer_org_id,e.event_date) r(rate)
    where r.rate->>'stage'=e.stage
  )
  select coalesce(jsonb_agg(jsonb_build_object('stage',c.stage,'code',c.rate->>'code','name',c.rate->>'name','basis',c.rate->>'basis','period',c.rate->>'period',
      'reference',c.reference,'orderNumber',c.order_number,'date',c.event_date,'quantity',round(c.quantity,3),'periods',1,
      'rate',(c.rate->>'amount')::numeric,'minimum',(c.rate->>'minimum')::numeric,'currency',c.rate->>'currency','source',c.rate->>'source',
      'amount',case when c.quantity>0 then round(greatest((c.rate->>'minimum')::numeric,c.quantity*(c.rate->>'amount')::numeric),2) else 0 end,
      'minimumApplied',c.quantity>0 and (c.rate->>'minimum')::numeric>c.quantity*(c.rate->>'amount')::numeric)
    order by c.event_date,c.stage,c.reference,c.rate->>'code'),'[]') into lines
  from charged c;

  -- Storage: stock on hand at each recorded cut-off, after the rate's free nights.
  with nights as (
    select r.stock_date from booking_api.warehouse_stock_snapshot_runs r
    where r.company_id=actor."Company_ID" and r.stock_date>=period_start and r.stock_date<period_end
  ), night_rates as (
    select n.stock_date, r.rate from nights n
    cross join lateral booking_api.warehouse_rates_on(actor."Company_ID",p_customer_org_id,n.stock_date) r(rate)
    where r.rate->>'stage'='storage' and r.rate->>'period' in ('night','day','week')
  ), nightly as (
    select nr.stock_date, nr.rate,
      case nr.rate->>'basis'
        when 'unit' then coalesce(sum(s.quantity),0)
        when 'pallet' then count(distinct s.hu_id) filter (where s.hu_type_code='pallet')
        when 'kg' then coalesce(sum(s.quantity*s.unit_gross_weight_kg),0)
        when 'm3' then coalesce(sum(s.quantity*s.unit_volume_m3),0)
        else case when count(s.balance_id)>0 then 1 else 0 end end quantity
    from night_rates nr
    left join booking_api.warehouse_stock_snapshots s on s.company_id=actor."Company_ID" and s.stock_date=nr.stock_date
      and s.customer_org_id=p_customer_org_id and s.facility_id=any(facilities)
      and nr.stock_date-(s.first_received_at at time zone settings.time_zone)::date>=coalesce((nr.rate->>'freePeriods')::integer,0)
    group by nr.stock_date, nr.rate
  ), blocks as (
    -- Nightly rates charge every recorded night. Weekly rates charge the peak
    -- quantity in each started seven-night block of the period.
    select n.rate->>'code' code, n.rate->>'name' name, n.rate->>'basis' basis, n.rate->>'period' period, n.rate->>'currency' currency,
      max(n.rate->>'source') source, max((n.rate->>'minimum')::numeric) minimum, max((n.rate->>'amount')::numeric) rate_amount,
      case when n.rate->>'period'='week' then (n.stock_date-period_start)/7 else n.stock_date-period_start end block,
      max(n.quantity) quantity, max(n.quantity*(n.rate->>'amount')::numeric) amount
    from nightly n group by 1,2,3,4,5,9
  ), storage as (
    select code,name,basis,period,currency,max(source) source,max(minimum) minimum,max(rate_amount) rate_amount,
      sum(quantity) quantity, count(*) filter (where quantity>0) periods, sum(amount) raw_amount
    from blocks group by 1,2,3,4,5
  )
  select lines||coalesce(jsonb_agg(jsonb_build_object('stage','storage','code',code,'name',name,'basis',basis,'period',period,
      'reference',null,'orderNumber',null,'date',period_start,'quantity',round(quantity,3),'periods',periods,
      'rate',rate_amount,'minimum',minimum,'currency',currency,'source',source,
      'amount',case when quantity>0 then round(greatest(minimum,raw_amount),2) else 0 end,
      'minimumApplied',quantity>0 and minimum>raw_amount) order by code),'[]') into lines
  from storage;

  select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'amount',amount) order by currency),'[]') into totals
  from (select l->>'currency' currency, sum((l->>'amount')::numeric) amount from jsonb_array_elements(lines) l group by 1) t;

  -- Plain-language warnings so a reviewer knows exactly what is not charged.
  expected_nights:=greatest(0,least(period_end,today+1)-period_start);
  select count(*) into recorded_nights from booking_api.warehouse_stock_snapshot_runs r
    where r.company_id=actor."Company_ID" and r.stock_date>=period_start and r.stock_date<least(period_end,today+1);
  if recorded_nights<expected_nights then
    warnings:=warnings||jsonb_build_array(format('Stock was not recorded at the cut-off on %s of %s days in this period. Storage is not charged for those days.',expected_nights-recorded_nights,expected_nights));
  end if;
  if period_end>today+1 then
    warnings:=warnings||jsonb_build_array('This period has not finished. Charges will grow until the period ends.');
  end if;
  select count(*) filter (where s.hu_type_code is distinct from 'pallet'),
         count(*) filter (where s.unit_gross_weight_kg is null),
         count(*) filter (where s.unit_volume_m3 is null)
    into pallet_gaps, weight_gaps, volume_gaps
  from booking_api.warehouse_stock_snapshots s
  where s.company_id=actor."Company_ID" and s.customer_org_id=p_customer_org_id and s.facility_id=any(facilities)
    and s.stock_date>=period_start and s.stock_date<period_end;
  if pallet_gaps>0 and exists(select 1 from jsonb_array_elements(lines) l where l->>'basis'='pallet' and l->>'stage'='storage') then
    warnings:=warnings||jsonb_build_array(format('%s recorded stock lines were not on a pallet record, so they are not counted in pallet storage. Pallets are never estimated from units.',pallet_gaps));
  end if;
  if weight_gaps>0 and exists(select 1 from jsonb_array_elements(lines) l where l->>'basis'='kg') then
    warnings:=warnings||jsonb_build_array(format('%s recorded stock lines have items without a gross weight, so they add nothing to weight-based charges.',weight_gaps));
  end if;
  if volume_gaps>0 and exists(select 1 from jsonb_array_elements(lines) l where l->>'basis'='m3') then
    warnings:=warnings||jsonb_build_array(format('%s recorded stock lines have items without dimensions, so they add nothing to cubic-metre charges.',volume_gaps));
  end if;
  if exists(select 1 from booking_api.warehouse_rates_on(actor."Company_ID",p_customer_org_id,period_start) r(rate) where r.rate->>'stage'='transaction') then
    warnings:=warnings||jsonb_build_array('Additional handling (transaction) charges are not calculated automatically. Add them separately.');
  end if;
  if exists(select 1 from booking_api.warehouse_rates_on(actor."Company_ID",p_customer_org_id,period_start) r(rate) where r.rate->>'stage'='storage' and r.rate->>'period'='hour') then
    warnings:=warnings||jsonb_build_array('Hourly storage rates are not calculated from nightly stock records. Use a nightly, daily or weekly storage rate.');
  end if;
  if not exists(select 1 from booking_api.warehouse_rates_on(actor."Company_ID",p_customer_org_id,period_start)) then
    warnings:=warnings||jsonb_build_array('No warehouse rates apply to this customer in this period. This is not a zero-price agreement.');
  end if;

  return jsonb_build_object(
    'customer',jsonb_build_object('id',p_customer_org_id,'name',customer_name),
    'period',jsonb_build_object('start',period_start,'end',period_end-1,'cycle',settings.cycle,
      'previousStart',booking_api.warehouse_billing_period_start(settings.cycle,settings.week_start,settings.month_start,period_start-1),
      'nextStart',period_end,'isCurrent',period_start<=today and today<period_end,'isComplete',period_end<=today),
    'settings',jsonb_build_object('timeZone',settings.time_zone,'cutoffTime',to_char(settings.cutoff_time,'HH24:MI'),'isDefault',settings.is_default),
    'nights',jsonb_build_object('expected',expected_nights,'recorded',recorded_nights),
    'lines',lines,'totals',totals,'warnings',warnings,'generatedAt',now());
end $$;
revoke all on function public.warehouse_charge_statement(uuid,date) from public, anon;
grant execute on function public.warehouse_charge_statement(uuid,date) to authenticated;

-- Customers that can be charged: those with warehouse orders or stock in
-- the caller's warehouses.
create function public.warehouse_charge_customers(p_search text default null, p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public."cmp_Users"%rowtype; facilities uuid[]; search text:=nullif(btrim(p_search),''); result jsonb;
begin
  select * into actor from public."cmp_Users" where "Auth_User_ID"=auth.uid()
    and coalesce("User_AccessStatus",'active')='active' and "Company_ID" is not null;
  if actor."User_ID" is null then raise exception 'Your active workspace identity is required.' using errcode='42501'; end if;
  if not (coalesce(booking_api.has_permission(auth.uid(),'Warehouse.Read'),false) or coalesce(booking_api.has_permission(auth.uid(),'Warehouse.Write'),false)) then
    raise exception 'Warehouse access is required.' using errcode='42501'; end if;
  select coalesce(array_agg(distinct facility."WMSFacility_ID"),'{}') into facilities
  from public."cmp_Users_Offices" link
  join public."cmp_Offices" office on office."Office_ID"=link."Office_ID" and office."Company_ID"=actor."Company_ID"
  join public."WMS_Facilities" facility on facility."WMSFacility_OrgOfficeID"=office."Office_ID" and not facility."WMSFacility_IsDeleted"
  where link."User_ID"=actor."User_ID";
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name),'[]') into result from (
    select organisation."Org_id" id, organisation."Org_Name" name from public."Org_Master" organisation
    where (exists(select 1 from public."WMS_Orders" o where o."WMSOrder_CustomerOrgID"=organisation."Org_id" and o."WMSOrder_FacilityID"=any(facilities) and not o."WMSOrder_IsDeleted")
        or exists(select 1 from public."WMS_InventoryBalances" b where b."WMSBalance_CustomerOrgID"=organisation."Org_id" and b."WMSBalance_FacilityID"=any(facilities)))
      and (search is null or organisation."Org_Name" ilike '%'||replace(replace(replace(search,'\','\\'),'%','\%'),'_','\_')||'%')
    order by organisation."Org_Name" limit greatest(1,least(coalesce(p_limit,50),100))) c;
  return result;
end $$;
revoke all on function public.warehouse_charge_customers(text,integer) from public, anon;
grant execute on function public.warehouse_charge_customers(text,integer) to authenticated;

-- Record stock every ten minutes once a workspace's cut-off has passed.
do $$ begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    execute 'select cron.schedule($1,$2,$3)' using 'multideck-warehouse-stock-records','*/10 * * * *','select booking_api.warehouse_capture_stock_snapshots()';
  end if;
end $$;

commit;
