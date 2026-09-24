begin;

-- Pricing configuration is separate from legacy service contracts and posted billing events.
create table booking_api.warehouse_pricing_cards (
  company_id uuid not null references public."cmp_Company"("Company_ID"),
  scope_key text not null,
  customer_org_id uuid references public."Org_Master"("Org_id"),
  rates jsonb not null default '[]' check (jsonb_typeof(rates)='array'),
  version integer not null default 1,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  primary key(company_id,scope_key),
  check(scope_key=coalesce(customer_org_id::text,'default'))
);
create table booking_api.warehouse_pricing_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  scope_key text not null,
  actor_auth_id uuid not null,
  previous_rates jsonb,
  rates jsonb not null,
  version integer not null,
  created_at timestamptz not null default now()
);
alter table booking_api.warehouse_pricing_cards enable row level security;
alter table booking_api.warehouse_pricing_audit enable row level security;
revoke all on booking_api.warehouse_pricing_cards, booking_api.warehouse_pricing_audit from public, anon, authenticated;
grant all on booking_api.warehouse_pricing_cards, booking_api.warehouse_pricing_audit to service_role;

create function public.warehouse_pricing_card(
  p_customer_org_id uuid default null, p_rates jsonb default null,
  p_expected_version integer default null, p_expected_default_version integer default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor public."cmp_Users"%rowtype;
  card booking_api.warehouse_pricing_cards%rowtype;
  defaults booking_api.warehouse_pricing_cards%rowtype;
  can_manage boolean;
  scope text:=coalesce(p_customer_org_id::text,'default');
  rate jsonb;
  field text;
  from_date date;
  to_date date;
begin
  select * into actor from public."cmp_Users" where "Auth_User_ID"=auth.uid()
    and "User_AccessStatus"='active' and "Company_ID" is not null;
  if actor."User_ID" is null then raise exception 'Your active workspace identity is required.' using errcode='42501'; end if;
  can_manage:=coalesce(booking_api.has_permission(auth.uid(),'Warehouse.Write'),false);
  if not can_manage and not coalesce(booking_api.has_permission(auth.uid(),'Warehouse.Read'),false) then
    raise exception 'Warehouse access is required.' using errcode='42501';
  end if;
  if p_customer_org_id is not null and not coalesce(public.multideck_crm_company_can_access_account(actor."Company_ID",p_customer_org_id),false) then
    raise exception 'This account is not available in your company.' using errcode='42501';
  end if;
  if p_rates is not null and not can_manage then raise exception 'Warehouse write permission is required.' using errcode='42501'; end if;
  -- One company lock makes concurrent first saves and default/override saves serializable.
  if p_rates is not null then perform pg_advisory_xact_lock(hashtextextended(actor."Company_ID"::text,92216)); end if;
  select * into defaults from booking_api.warehouse_pricing_cards where company_id=actor."Company_ID" and scope_key='default';
  select * into card from booking_api.warehouse_pricing_cards where company_id=actor."Company_ID" and scope_key=scope;
  if p_rates is not null then
    if p_expected_version is distinct from coalesce(card.version,0)
      or (p_customer_org_id is not null and p_expected_default_version is distinct from coalesce(defaults.version,0)) then
      raise exception 'Pricing changed since you opened it. Reload the saved rates before making your changes again.' using errcode='40001';
    end if;
    if jsonb_typeof(p_rates) is distinct from 'array' or octet_length(p_rates::text)>100000 then
      raise exception 'Invalid rate card.' using errcode='22023';
    end if;
    if jsonb_array_length(p_rates)>100 then raise exception 'Use no more than 100 rates per card.' using errcode='22023'; end if;
    for rate in select value from jsonb_array_elements(p_rates) loop
      if jsonb_typeof(rate) is distinct from 'object' then raise exception 'Invalid rate.' using errcode='22023'; end if;
      foreach field in array array['id','code','name','stage','basis','period','currency','from','to'] loop
        if jsonb_typeof(rate->field) is distinct from 'string' then raise exception 'Rate fields must be text.' using errcode='22023'; end if;
      end loop;
      if rate->>'id' !~ '^[a-zA-Z0-9-]{1,80}$' or rate->>'code' !~ '^[A-Z][A-Z0-9_-]{0,39}$'
        or length(trim(rate->>'name')) not between 1 and 120
        or rate->>'stage' not in ('receipt','storage','dispatch','transaction')
        or rate->>'basis' not in ('pallet','unit','m3','kg','fixed')
        or rate->>'period' not in ('once','night','hour','day','week')
        or rate->>'currency' not in ('GBP','EUR','USD','CAD','AUD')
        or ((rate->>'stage'='storage')=(rate->>'period'='once')) then
        raise exception 'Check the charge code, name, measurement, frequency and currency.' using errcode='22023';
      end if;
      foreach field in array array['amount','minimum','freePeriods'] loop
        if jsonb_typeof(rate->field) is distinct from 'number' then raise exception 'Enter numeric rates and free periods.' using errcode='22023'; end if;
        if (rate->>field)::numeric<0 or (rate->>field)::numeric>1000000 or round((rate->>field)::numeric,4)<>(rate->>field)::numeric then
          raise exception 'Amounts must be between 0 and 1,000,000 with at most four decimal places.' using errcode='22023';
        end if;
      end loop;
      if (rate->>'freePeriods')::numeric<>trunc((rate->>'freePeriods')::numeric) or (rate->>'freePeriods')::numeric>365
        or (rate->>'stage'<>'storage' and (rate->>'freePeriods')::numeric<>0) then
        raise exception 'Free periods must be a whole number from 0 to 365, for storage only.' using errcode='22023';
      end if;
      begin
        if rate->>'from' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (rate->>'to'<>'' and rate->>'to' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
          raise exception 'Enter valid effective dates.' using errcode='22023';
        end if;
        from_date:=(rate->>'from')::date; to_date:=nullif(rate->>'to','')::date;
        if to_date<from_date then raise exception 'End date cannot be before start date.' using errcode='22023'; end if;
      exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Enter valid effective dates.' using errcode='22023'; end;
    end loop;
    if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p_rates)) then raise exception 'Rate identifiers must be unique.' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements(p_rates) with ordinality a(rate,n)
      join jsonb_array_elements(p_rates) with ordinality b(rate,n) on a.n<b.n
      where a.rate->>'code'=b.rate->>'code'
      and a.rate->>'from'<=coalesce(nullif(b.rate->>'to',''),'9999-12-31')
      and b.rate->>'from'<=coalesce(nullif(a.rate->>'to',''),'9999-12-31')) then
      raise exception 'Effective dates overlap for the same charge code.' using errcode='22023';
    end if;
    insert into booking_api.warehouse_pricing_audit(company_id,scope_key,actor_auth_id,previous_rates,rates,version)
      values(actor."Company_ID",scope,auth.uid(),card.rates,p_rates,coalesce(card.version,0)+1);
    insert into booking_api.warehouse_pricing_cards(company_id,scope_key,customer_org_id,rates,updated_by)
      values(actor."Company_ID",scope,p_customer_org_id,p_rates,auth.uid())
      on conflict(company_id,scope_key) do update set rates=excluded.rates,version=warehouse_pricing_cards.version+1,updated_by=auth.uid(),updated_at=now()
      returning * into card;
    if p_customer_org_id is null then defaults:=card; end if;
  end if;
  return jsonb_build_object('rates',coalesce(card.rates,'[]'::jsonb),
    'defaults',case when p_customer_org_id is null then '[]'::jsonb else coalesce(defaults.rates,'[]'::jsonb) end,
    'version',coalesce(card.version,0),'defaultVersion',coalesce(defaults.version,0),'canManage',can_manage,'updatedAt',card.updated_at);
end $$;
revoke all on function public.warehouse_pricing_card(uuid,jsonb,integer,integer) from public,anon;
grant execute on function public.warehouse_pricing_card(uuid,jsonb,integer,integer) to authenticated;
commit;
