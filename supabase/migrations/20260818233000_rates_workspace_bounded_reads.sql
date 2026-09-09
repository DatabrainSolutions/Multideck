begin;

create or replace function public.multideck_rates_register_page(
  p_company_id uuid,
  p_scope text,
  p_search text default null,
  p_mode text default null,
  p_tariff_type text default null,
  p_expiry text default null,
  p_sort text default 'name',
  p_sort_direction text default 'asc',
  p_today date default current_date,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_scope text := lower(coalesce(nullif(btrim(p_scope), ''), ''));
  v_search text := nullif(btrim(p_search), '');
  v_mode text := lower(nullif(btrim(p_mode), ''));
  v_tariff_type text := lower(nullif(btrim(p_tariff_type), ''));
  v_expiry text := lower(nullif(btrim(p_expiry), ''));
  v_sort text := coalesce(nullif(btrim(p_sort), ''), 'name');
  v_sort_direction text := lower(coalesce(nullif(btrim(p_sort_direction), ''), 'asc'));
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_result jsonb;
begin
  if p_company_id is null then raise exception 'Company is required.' using errcode = '22023'; end if;
  if v_scope not in ('contracts', 'tariffs') then raise exception 'Choose a valid rate scope.' using errcode = '22023'; end if;
  if v_mode is not null and v_mode not in ('lcl', 'fcl', 'air', 'road') then raise exception 'Choose a valid rate mode.' using errcode = '22023'; end if;
  if v_tariff_type is not null and v_tariff_type not in ('cost_tariff', 'sales_tariff') then raise exception 'Choose a valid tariff type.' using errcode = '22023'; end if;
  if v_expiry is not null and v_expiry not in ('expired', '7', '30', 'active') then raise exception 'Choose a valid expiry filter.' using errcode = '22023'; end if;
  if v_sort_direction not in ('asc', 'desc') then raise exception 'Choose a valid sort direction.' using errcode = '22023'; end if;
  if v_sort not in ('name', 'type', 'mode', 'route', 'carrier', 'validity', 'buy', 'version', 'status', 'schedule', 'eligibility', 'sell') then
    raise exception 'Choose a valid rate sort.' using errcode = '22023';
  end if;

  with scoped as materialized (
    select
      contract."RATEContract_ID" as id,
      contract."RATEContract_CurrentVersionID" as current_version_id,
      contract."RATEContract_Code"::text as code,
      contract."RATEContract_Name"::text as name,
      contract."RATEContract_TypeCode"::text as type_code,
      contract."RATEContract_StatusCode"::text as status_code,
      contract."RATEContract_ValidTo" as valid_to,
      contract."RATEContract_UpdatedAt" as updated_at,
      coalesce(version."RATEContractVer_SnapshotJSON"->>'mode', contract."RATEContract_MetadataJSON"->>'mode', 'fcl') as mode_code,
      coalesce(version."RATEContractVer_SnapshotJSON"->>'carrier', contract."RATEContract_MetadataJSON"->>'carrier', '') as carrier,
      coalesce(version."RATEContractVer_SnapshotJSON"->>'supplier', contract."RATEContract_MetadataJSON"->>'supplier', '') as supplier,
      coalesce(version."RATEContractVer_SnapshotJSON"->>'customer', contract."RATEContract_MetadataJSON"->>'customer', '') as customer,
      coalesce(version."RATEContractVer_SnapshotJSON"->>'origin', contract."RATEContract_MetadataJSON"->>'origin', '') as origin,
      coalesce(version."RATEContractVer_SnapshotJSON"->>'destination', contract."RATEContract_MetadataJSON"->>'destination', '') as destination,
      coalesce(version."RATEContractVer_SnapshotJSON"->>'cargo', contract."RATEContract_MetadataJSON"->>'cargo', '') as cargo,
      coalesce(version."RATEContractVer_SnapshotJSON"->>'schedule', contract."RATEContract_MetadataJSON"->>'schedule', 'ad_hoc') as schedule_code,
      coalesce(version."RATEContractVer_VersionNo", 1) as version_no,
      case when coalesce(version."RATEContractVer_SnapshotJSON"->>'buyTotal', contract."RATEContract_MetadataJSON"->>'buyTotal', '') ~ '^[0-9]+(\.[0-9]+)?$'
        then coalesce(version."RATEContractVer_SnapshotJSON"->>'buyTotal', contract."RATEContract_MetadataJSON"->>'buyTotal')::numeric else 0 end as buy_total,
      case when coalesce(version."RATEContractVer_SnapshotJSON"->>'sellTotal', contract."RATEContract_MetadataJSON"->>'sellTotal', '') ~ '^[0-9]+(\.[0-9]+)?$'
        then coalesce(version."RATEContractVer_SnapshotJSON"->>'sellTotal', contract."RATEContract_MetadataJSON"->>'sellTotal')::numeric else 0 end as sell_total
    from public."RATE_Contracts" contract
    left join public."RATE_ContractVersions" version on version."RATEContractVer_ID" = contract."RATEContract_CurrentVersionID"
    where contract."Company_ID" = p_company_id
      and not contract."RATEContract_IsDeleted"
      and case when v_scope = 'contracts' then contract."RATEContract_TypeCode" = 'contract' else contract."RATEContract_TypeCode" <> 'contract' end
  ), filtered as materialized (
    select *
    from scoped
    where (v_mode is null or mode_code = v_mode)
      and (v_tariff_type is null or type_code = v_tariff_type)
      and (
        v_expiry is null
        or (v_expiry = 'expired' and (status_code = 'expired' or valid_to < p_today))
        or (v_expiry = '7' and valid_to between p_today and p_today + 7)
        or (v_expiry = '30' and valid_to > p_today + 7 and valid_to <= p_today + 30)
        or (v_expiry = 'active' and status_code = 'active' and valid_to > p_today + 30)
      )
      and (
        v_search is null
        or strpos(lower(concat_ws(' ', code, name, carrier, supplier, customer, origin, destination, cargo)), lower(v_search)) > 0
      )
  ), page as materialized (
    select *
    from filtered
    order by
      case when v_sort_direction = 'asc' then case v_sort
        when 'name' then lower(name) when 'type' then lower(type_code) when 'mode' then lower(mode_code)
        when 'route' then lower(origin || destination) when 'carrier' then lower(coalesce(nullif(carrier, ''), supplier))
        when 'status' then lower(status_code) when 'schedule' then lower(schedule_code)
        when 'eligibility' then lower(coalesce(nullif(customer, ''), cargo))
      end end asc nulls last,
      case when v_sort_direction = 'desc' then case v_sort
        when 'name' then lower(name) when 'type' then lower(type_code) when 'mode' then lower(mode_code)
        when 'route' then lower(origin || destination) when 'carrier' then lower(coalesce(nullif(carrier, ''), supplier))
        when 'status' then lower(status_code) when 'schedule' then lower(schedule_code)
        when 'eligibility' then lower(coalesce(nullif(customer, ''), cargo))
      end end desc nulls last,
      case when v_sort_direction = 'asc' and v_sort = 'validity' then valid_to end asc nulls last,
      case when v_sort_direction = 'desc' and v_sort = 'validity' then valid_to end desc nulls last,
      case when v_sort_direction = 'asc' then case v_sort when 'buy' then buy_total when 'sell' then sell_total when 'version' then version_no end end asc nulls last,
      case when v_sort_direction = 'desc' then case v_sort when 'buy' then buy_total when 'sell' then sell_total when 'version' then version_no end end desc nulls last,
      updated_at desc,
      id
    limit v_limit offset v_offset
  ), page_rows as materialized (
    select page.*, to_jsonb(contract) as contract_json,
      case when version."RATEContractVer_ID" is null then null else to_jsonb(version) end as version_json
    from page
    join public."RATE_Contracts" contract on contract."RATEContract_ID" = page.id
    left join public."RATE_ContractVersions" version on version."RATEContractVer_ID" = page.current_version_id
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object('contract', contract_json, 'version', version_json) order by
      case when v_sort_direction = 'asc' then case v_sort when 'name' then lower(name) when 'type' then lower(type_code) when 'mode' then lower(mode_code) when 'route' then lower(origin || destination) when 'carrier' then lower(coalesce(nullif(carrier, ''), supplier)) when 'status' then lower(status_code) when 'schedule' then lower(schedule_code) when 'eligibility' then lower(coalesce(nullif(customer, ''), cargo)) end end asc nulls last,
      case when v_sort_direction = 'desc' then case v_sort when 'name' then lower(name) when 'type' then lower(type_code) when 'mode' then lower(mode_code) when 'route' then lower(origin || destination) when 'carrier' then lower(coalesce(nullif(carrier, ''), supplier)) when 'status' then lower(status_code) when 'schedule' then lower(schedule_code) when 'eligibility' then lower(coalesce(nullif(customer, ''), cargo)) end end desc nulls last,
      case when v_sort_direction = 'asc' and v_sort = 'validity' then valid_to end asc nulls last,
      case when v_sort_direction = 'desc' and v_sort = 'validity' then valid_to end desc nulls last,
      case when v_sort_direction = 'asc' then case v_sort when 'buy' then buy_total when 'sell' then sell_total when 'version' then version_no end end asc nulls last,
      case when v_sort_direction = 'desc' then case v_sort when 'buy' then buy_total when 'sell' then sell_total when 'version' then version_no end end desc nulls last,
      updated_at desc, id) from page_rows), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'expiryCounts', jsonb_build_object(
      'expired', (select count(*) from scoped where status_code = 'expired' or valid_to < p_today),
      'sevenDays', (select count(*) from scoped where valid_to between p_today and p_today + 7),
      'thirtyDays', (select count(*) from scoped where valid_to > p_today + 7 and valid_to <= p_today + 30),
      'activeCurrent', (select count(*) from scoped where status_code = 'active' and valid_to > p_today + 30)
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.multideck_rates_workspace_snapshot(p_company_id uuid, p_today date default current_date)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with scoped as materialized (
    select
      contract."RATEContract_ID" as id,
      contract."RATEContract_CurrentVersionID" as current_version_id,
      contract."RATEContract_TypeCode"::text as type_code,
      contract."RATEContract_StatusCode"::text as status_code,
      contract."RATEContract_ValidTo" as valid_to,
      contract."RATEContract_UpdatedAt" as updated_at,
      coalesce(version."RATEContractVer_SnapshotJSON"->>'customer', contract."RATEContract_MetadataJSON"->>'customer', '') as customer
    from public."RATE_Contracts" contract
    left join public."RATE_ContractVersions" version on version."RATEContractVer_ID" = contract."RATEContract_CurrentVersionID"
    where contract."Company_ID" = p_company_id and not contract."RATEContract_IsDeleted"
  ), attention_ids as materialized (
    select id, current_version_id, updated_at from scoped
    where status_code in ('draft', 'expired') or valid_to <= p_today + 30
    order by updated_at desc, id limit 6
  ), recent_ids as materialized (
    select id, current_version_id, updated_at from scoped order by updated_at desc, id limit 5
  ), attention as materialized (
    select ids.id, ids.updated_at, to_jsonb(contract) as contract_json,
      case when version."RATEContractVer_ID" is null then null else to_jsonb(version) end as version_json
    from attention_ids ids
    join public."RATE_Contracts" contract on contract."RATEContract_ID" = ids.id
    left join public."RATE_ContractVersions" version on version."RATEContractVer_ID" = ids.current_version_id
  ), recent as materialized (
    select ids.id, ids.updated_at, to_jsonb(contract) as contract_json,
      case when version."RATEContractVer_ID" is null then null else to_jsonb(version) end as version_json
    from recent_ids ids
    join public."RATE_Contracts" contract on contract."RATEContract_ID" = ids.id
    left join public."RATE_ContractVersions" version on version."RATEContractVer_ID" = ids.current_version_id
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'total', (select count(*) from scoped),
      'attention', (select count(*) from scoped where status_code in ('draft', 'expired') or valid_to <= p_today + 30),
      'active', (select count(*) from scoped where status_code = 'active' and valid_to >= p_today),
      'drafts', (select count(*) from scoped where status_code = 'draft'),
      'costTariffs', (select count(*) from scoped where type_code = 'cost_tariff'),
      'salesTariffs', (select count(*) from scoped where type_code = 'sales_tariff'),
      'customerSpecific', (select count(*) from scoped where type_code <> 'contract' and nullif(btrim(customer), '') is not null),
      'expiringTariffs', (select count(*) from scoped where type_code <> 'contract' and valid_to between p_today and p_today + 30),
      'sourcesInReview', (select count(*) from public."RATE_ImportBatches" import_batch where import_batch."Company_ID" = p_company_id and import_batch."RATEImport_StatusCode" = 'review')
    ),
    'attention', coalesce((select jsonb_agg(jsonb_build_object('contract', contract_json, 'version', version_json) order by updated_at desc, id) from attention), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('contract', contract_json, 'version', version_json) order by updated_at desc, id) from recent), '[]'::jsonb)
  )
$$;

create or replace function public.multideck_rates_quote_candidates(
  p_company_id uuid,
  p_mode text,
  p_origin text,
  p_destination text,
  p_customer text,
  p_today date default current_date,
  p_limit integer default 100
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with scoped as materialized (
    select contract."RATEContract_ID" as id, contract."RATEContract_CurrentVersionID" as current_version_id,
      contract."RATEContract_UpdatedAt" as updated_at,
      coalesce(version."RATEContractVer_SnapshotJSON"->>'mode', contract."RATEContract_MetadataJSON"->>'mode', 'fcl') as mode_code,
      coalesce(version."RATEContractVer_SnapshotJSON"->>'origin', contract."RATEContract_MetadataJSON"->>'origin', '') as origin,
      coalesce(version."RATEContractVer_SnapshotJSON"->>'destination', contract."RATEContract_MetadataJSON"->>'destination', '') as destination,
      coalesce(version."RATEContractVer_SnapshotJSON"->>'customer', contract."RATEContract_MetadataJSON"->>'customer', '') as customer
    from public."RATE_Contracts" contract
    left join public."RATE_ContractVersions" version on version."RATEContractVer_ID" = contract."RATEContract_CurrentVersionID"
    where contract."Company_ID" = p_company_id and not contract."RATEContract_IsDeleted"
      and contract."RATEContract_StatusCode" = 'active'
      and (contract."RATEContract_ValidTo" is null or contract."RATEContract_ValidTo" >= p_today)
  ), scored as materialized (
    select *,
      25
      + case when strpos(lower(coalesce(p_mode, '')), lower(mode_code)) > 0 or (lower(coalesce(p_mode, '')) = 'sea' and mode_code in ('lcl', 'fcl')) then 25 else 0 end
      + case when strpos(lower(coalesce(p_origin, '')), lower(origin)) > 0 or strpos(lower(origin), split_part(lower(coalesce(p_origin, '')), ' · ', 1)) > 0 then 20 else 0 end
      + case when strpos(lower(coalesce(p_destination, '')), lower(destination)) > 0 or strpos(lower(destination), split_part(lower(coalesce(p_destination, '')), ' · ', 1)) > 0 then 20 else 0 end
      + case when nullif(btrim(customer), '') is null or strpos(lower(coalesce(p_customer, '')), lower(customer)) > 0 then 10 else 0 end as match_score,
      array_remove(array[
        case when strpos(lower(coalesce(p_mode, '')), lower(mode_code)) > 0 or (lower(coalesce(p_mode, '')) = 'sea' and mode_code in ('lcl', 'fcl')) then 'mode' end,
        case when strpos(lower(coalesce(p_origin, '')), lower(origin)) > 0 or strpos(lower(origin), split_part(lower(coalesce(p_origin, '')), ' · ', 1)) > 0 then 'origin' end,
        case when strpos(lower(coalesce(p_destination, '')), lower(destination)) > 0 or strpos(lower(destination), split_part(lower(coalesce(p_destination, '')), ' · ', 1)) > 0 then 'destination' end,
        case when nullif(btrim(customer), '') is null or strpos(lower(coalesce(p_customer, '')), lower(customer)) > 0 then case when nullif(btrim(customer), '') is null then 'eligible customers' else 'customer' end end
      ], null) as match_reasons
    from scoped
  ), candidates as materialized (
    select * from scored where match_score >= 60
    order by match_score desc, updated_at desc, id
    limit greatest(1, least(coalesce(p_limit, 100), 100))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'contract', to_jsonb(contract),
    'version', case when version."RATEContractVer_ID" is null then null else to_jsonb(version) end,
    'matchScore', candidates.match_score,
    'matchReasons', to_jsonb(candidates.match_reasons)
  ) order by candidates.match_score desc, candidates.updated_at desc, candidates.id), '[]'::jsonb)
  from candidates
  join public."RATE_Contracts" contract on contract."RATEContract_ID" = candidates.id
  left join public."RATE_ContractVersions" version on version."RATEContractVer_ID" = candidates.current_version_id
$$;

create or replace function public.multideck_rates_quote_picker(p_company_id uuid, p_limit integer default 100)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'CusQuoteHeader_ID', quote."CusQuoteHeader_ID", 'Quote_Reference', 'Q-' || quote."CusQuoteHeader_Number",
    'Customer_Name', customer."Org_Name", 'Origin', coalesce(quote."CusQuoteHeader_OriginExtra", ''),
    'Destination', coalesce(quote."CusQuoteHeader_DestinationExtra", ''),
    'Transport_Mode', initcap(coalesce(quote."CusQuoteHeader_ModeCode", '')),
    'Equipment_Load', coalesce(quote."CusQuoteHeader_ShipmentTypeCode", ''),
    'Currency', coalesce(quote."CusQuoteHeader_CurrencyCode", 'GBP')
  ) order by coalesce(quote."CusQuoteHeader_LastEditedDate", quote."CusQuoteHeader_CreatedDate") desc, quote."CusQuoteHeader_ID"), '[]'::jsonb)
  from (
    select source.* from public."CusQuote_Header" source
    join public."cmp_Offices" office on office."Office_ID" = coalesce(source."CusQuoteHeader_OrgOfficeID", source."OrgOffice_ID")
    where office."Company_ID" = p_company_id and not source."CusQuoteHeader_IsDeleted"
    order by coalesce(source."CusQuoteHeader_LastEditedDate", source."CusQuoteHeader_CreatedDate") desc, source."CusQuoteHeader_ID"
    limit greatest(1, least(coalesce(p_limit, 100), 100))
  ) quote
  join public."Org_Master" customer on customer."Org_id" = quote."CusQuoteHeader_CustomerID"
$$;

revoke all on function public.multideck_rates_register_page(uuid, text, text, text, text, text, text, text, date, integer, integer) from public, anon, authenticated;
revoke all on function public.multideck_rates_workspace_snapshot(uuid, date) from public, anon, authenticated;
revoke all on function public.multideck_rates_quote_candidates(uuid, text, text, text, text, date, integer) from public, anon, authenticated;
revoke all on function public.multideck_rates_quote_picker(uuid, integer) from public, anon, authenticated;
grant execute on function public.multideck_rates_register_page(uuid, text, text, text, text, text, text, text, date, integer, integer) to service_role;
grant execute on function public.multideck_rates_workspace_snapshot(uuid, date) to service_role;
grant execute on function public.multideck_rates_quote_candidates(uuid, text, text, text, text, date, integer) to service_role;
grant execute on function public.multideck_rates_quote_picker(uuid, integer) to service_role;

comment on function public.multideck_rates_register_page(uuid, text, text, text, text, text, text, text, date, integer, integer)
is 'Service-role-only, company-scoped Rates table read with exact totals, expiry counts and a maximum 50-row page.';
comment on function public.multideck_rates_workspace_snapshot(uuid, date)
is 'Service-role-only Rates dashboard read with exact summary and attention/recent queues capped at six and five rows.';
comment on function public.multideck_rates_quote_candidates(uuid, text, text, text, text, date, integer)
is 'Service-role-only company-scoped quote matching with deterministic scoring and at most 100 eligible rate candidates.';
comment on function public.multideck_rates_quote_picker(uuid, integer)
is 'Service-role-only company-scoped quote picker capped at 100 recent quotes.';

-- Dexter already has explicit company-scoped Rates read, allowlisted writes and
-- event-driven watches. These RPCs only bound the existing operator workspace.

commit;
