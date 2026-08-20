-- Incoming cost tariffs vs outgoing customer tariff packs.
-- Contract type records become cost tariffs. Pack items and publications
-- stay company-scoped and service-role-only. Dexter gains allowlisted writes.

begin;

insert into public."sys_RateStatuses" ("RATEST_Code", "RATEST_Name", "RATEST_Description", "RATEST_IsFinal", "RATEST_SortOrder")
values
  ('pending_approval', 'Needs approval', 'A customer tariff pack waiting for commercial review after a linked cost change.', false, 15)
on conflict ("RATEST_Code") do update set
  "RATEST_Name" = excluded."RATEST_Name",
  "RATEST_Description" = excluded."RATEST_Description",
  "RATEST_IsFinal" = excluded."RATEST_IsFinal";

insert into public."sys_RateContractTypes" ("RATECT_Code", "RATECT_Name", "RATECT_Description", "RATECT_IsBuySide", "RATECT_IsSellSide", "RATECT_SortOrder")
values
  ('cost_tariff', 'Cost tariff', 'Incoming carrier or supplier tariff.', true, false, 10),
  ('sales_tariff', 'Customer tariff pack', 'Outgoing customer tariff pack built from cost tariffs.', false, true, 20)
on conflict ("RATECT_Code") do update set
  "RATECT_Name" = excluded."RATECT_Name",
  "RATECT_Description" = excluded."RATECT_Description",
  "RATECT_IsBuySide" = excluded."RATECT_IsBuySide",
  "RATECT_IsSellSide" = excluded."RATECT_IsSellSide";

update public."RATE_Contracts"
set "RATEContract_TypeCode" = 'cost_tariff',
    "RATEContract_UpdatedAt" = now()
where "RATEContract_TypeCode" = 'contract'
  and not "RATEContract_IsDeleted";

create table if not exists public."RATE_CustomerTariffItems" (
  "RATETariffItem_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "RATETariffItem_PackID" uuid not null references public."RATE_Contracts"("RATEContract_ID") on delete cascade,
  "RATETariffItem_SourceCostID" uuid not null references public."RATE_Contracts"("RATEContract_ID"),
  "RATETariffItem_SourceVersionID" uuid references public."RATE_ContractVersions"("RATEContractVer_ID"),
  "RATETariffItem_PricingMode" text not null default 'markup_percent',
  "RATETariffItem_MarkupPercent" numeric(9,4),
  "RATETariffItem_MarkupAmount" numeric(18,4),
  "RATETariffItem_SellSnapshotJSON" jsonb not null default '{}'::jsonb,
  "RATETariffItem_SortOrder" integer not null default 0,
  "RATETariffItem_CreatedAt" timestamptz not null default now(),
  "RATETariffItem_CreatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  "RATETariffItem_UpdatedAt" timestamptz not null default now(),
  "RATETariffItem_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  constraint "CK_RATE_CustomerTariffItems_PricingMode"
    check ("RATETariffItem_PricingMode" in ('markup_percent', 'markup_amount', 'override')),
  constraint "CK_RATE_CustomerTariffItems_Snapshot"
    check (jsonb_typeof("RATETariffItem_SellSnapshotJSON") = 'object'),
  constraint "UX_RATE_CustomerTariffItems_Pack_Source"
    unique ("RATETariffItem_PackID", "RATETariffItem_SourceCostID")
);

create index if not exists "IX_RATE_CustomerTariffItems_Company_Pack"
  on public."RATE_CustomerTariffItems" ("Company_ID", "RATETariffItem_PackID", "RATETariffItem_SortOrder");
create index if not exists "IX_RATE_CustomerTariffItems_SourceCost"
  on public."RATE_CustomerTariffItems" ("RATETariffItem_SourceCostID");

create table if not exists public."RATE_CustomerTariffPublications" (
  "RATETariffPub_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "RATETariffPub_PackID" uuid not null references public."RATE_Contracts"("RATEContract_ID") on delete cascade,
  "RATETariffPub_PackVersionID" uuid references public."RATE_ContractVersions"("RATEContractVer_ID"),
  "RATETariffPub_StatusCode" text not null default 'generated',
  "RATETariffPub_StorageBucket" text,
  "RATETariffPub_StoragePath" text,
  "RATETariffPub_FileName" text,
  "RATETariffPub_MimeType" text,
  "RATETariffPub_SendAfterApproval" boolean not null default false,
  "RATETariffPub_SentAt" timestamptz,
  "RATETariffPub_SentToJSON" jsonb not null default '[]'::jsonb,
  "RATETariffPub_GeneratedDocumentID" uuid,
  "RATETariffPub_ErrorMessage" text,
  "RATETariffPub_CreatedAt" timestamptz not null default now(),
  "RATETariffPub_CreatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  constraint "CK_RATE_CustomerTariffPublications_Status"
    check ("RATETariffPub_StatusCode" in ('generated', 'ready_to_send', 'sent', 'failed')),
  constraint "CK_RATE_CustomerTariffPublications_Recipients"
    check (jsonb_typeof("RATETariffPub_SentToJSON") = 'array')
);

create index if not exists "IX_RATE_CustomerTariffPublications_Company_Pack"
  on public."RATE_CustomerTariffPublications" ("Company_ID", "RATETariffPub_PackID", "RATETariffPub_CreatedAt" desc);

alter table public."RATE_CustomerTariffItems" enable row level security;
alter table public."RATE_CustomerTariffPublications" enable row level security;
revoke all on public."RATE_CustomerTariffItems", public."RATE_CustomerTariffPublications" from anon, authenticated;
grant select, insert, update, delete on public."RATE_CustomerTariffItems", public."RATE_CustomerTariffPublications" to service_role;

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
  if v_scope in ('contracts') then v_scope := 'costs'; end if;
  if v_scope in ('tariffs') then v_scope := 'packs'; end if;
  if v_scope not in ('costs', 'packs') then raise exception 'Choose a valid rate scope.' using errcode = '22023'; end if;
  if v_mode is not null and v_mode not in ('lcl', 'fcl', 'air', 'road') then raise exception 'Choose a valid rate mode.' using errcode = '22023'; end if;
  if v_tariff_type is not null and v_tariff_type not in ('cost_tariff', 'sales_tariff') then raise exception 'Choose a valid tariff type.' using errcode = '22023'; end if;
  if v_expiry is not null and v_expiry not in ('expired', '7', '30', 'active', 'pending_approval') then raise exception 'Choose a valid expiry filter.' using errcode = '22023'; end if;
  if v_sort_direction not in ('asc', 'desc') then raise exception 'Choose a valid sort direction.' using errcode = '22023'; end if;
  if v_sort not in ('name', 'type', 'mode', 'route', 'carrier', 'validity', 'buy', 'version', 'status', 'schedule', 'eligibility', 'sell', 'customer', 'items') then
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
      coalesce(version."RATEContractVer_SnapshotJSON"->>'customer', contract."RATEContract_MetadataJSON"->>'customer', customer_org."Org_Name", '') as customer,
      coalesce(version."RATEContractVer_SnapshotJSON"->>'origin', contract."RATEContract_MetadataJSON"->>'origin', '') as origin,
      coalesce(version."RATEContractVer_SnapshotJSON"->>'destination', contract."RATEContract_MetadataJSON"->>'destination', '') as destination,
      coalesce(version."RATEContractVer_SnapshotJSON"->>'cargo', contract."RATEContract_MetadataJSON"->>'cargo', '') as cargo,
      coalesce(version."RATEContractVer_SnapshotJSON"->>'schedule', contract."RATEContract_MetadataJSON"->>'schedule', 'ad_hoc') as schedule_code,
      coalesce(version."RATEContractVer_VersionNo", 1) as version_no,
      coalesce((select count(*) from public."RATE_CustomerTariffItems" item where item."RATETariffItem_PackID" = contract."RATEContract_ID"), 0) as item_count,
      case when coalesce(version."RATEContractVer_SnapshotJSON"->>'buyTotal', contract."RATEContract_MetadataJSON"->>'buyTotal', '') ~ '^[0-9]+(\.[0-9]+)?$'
        then coalesce(version."RATEContractVer_SnapshotJSON"->>'buyTotal', contract."RATEContract_MetadataJSON"->>'buyTotal')::numeric else 0 end as buy_total,
      case when coalesce(version."RATEContractVer_SnapshotJSON"->>'sellTotal', contract."RATEContract_MetadataJSON"->>'sellTotal', '') ~ '^[0-9]+(\.[0-9]+)?$'
        then coalesce(version."RATEContractVer_SnapshotJSON"->>'sellTotal', contract."RATEContract_MetadataJSON"->>'sellTotal')::numeric else 0 end as sell_total
    from public."RATE_Contracts" contract
    left join public."RATE_ContractVersions" version on version."RATEContractVer_ID" = contract."RATEContract_CurrentVersionID"
    left join public."Org_Master" customer_org on customer_org."Org_id" = contract."RATEContract_CustomerOrgID"
    where contract."Company_ID" = p_company_id
      and not contract."RATEContract_IsDeleted"
      and case
        when v_scope = 'costs' then contract."RATEContract_TypeCode" = 'cost_tariff'
        else contract."RATEContract_TypeCode" = 'sales_tariff'
      end
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
        or (v_expiry = 'active' and status_code = 'active' and (valid_to is null or valid_to > p_today + 30))
        or (v_expiry = 'pending_approval' and status_code = 'pending_approval')
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
        when 'customer' then lower(customer)
      end end asc nulls last,
      case when v_sort_direction = 'desc' then case v_sort
        when 'name' then lower(name) when 'type' then lower(type_code) when 'mode' then lower(mode_code)
        when 'route' then lower(origin || destination) when 'carrier' then lower(coalesce(nullif(carrier, ''), supplier))
        when 'status' then lower(status_code) when 'schedule' then lower(schedule_code)
        when 'eligibility' then lower(coalesce(nullif(customer, ''), cargo))
        when 'customer' then lower(customer)
      end end desc nulls last,
      case when v_sort_direction = 'asc' and v_sort = 'validity' then valid_to end asc nulls last,
      case when v_sort_direction = 'desc' and v_sort = 'validity' then valid_to end desc nulls last,
      case when v_sort_direction = 'asc' then case v_sort when 'buy' then buy_total when 'sell' then sell_total when 'version' then version_no when 'items' then item_count end end asc nulls last,
      case when v_sort_direction = 'desc' then case v_sort when 'buy' then buy_total when 'sell' then sell_total when 'version' then version_no when 'items' then item_count end end desc nulls last,
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
      case when v_sort_direction = 'asc' then case v_sort when 'name' then lower(name) when 'type' then lower(type_code) when 'mode' then lower(mode_code) when 'route' then lower(origin || destination) when 'carrier' then lower(coalesce(nullif(carrier, ''), supplier)) when 'status' then lower(status_code) when 'schedule' then lower(schedule_code) when 'eligibility' then lower(coalesce(nullif(customer, ''), cargo)) when 'customer' then lower(customer) end end asc nulls last,
      case when v_sort_direction = 'desc' then case v_sort when 'name' then lower(name) when 'type' then lower(type_code) when 'mode' then lower(mode_code) when 'route' then lower(origin || destination) when 'carrier' then lower(coalesce(nullif(carrier, ''), supplier)) when 'status' then lower(status_code) when 'schedule' then lower(schedule_code) when 'eligibility' then lower(coalesce(nullif(customer, ''), cargo)) when 'customer' then lower(customer) end end desc nulls last,
      case when v_sort_direction = 'asc' and v_sort = 'validity' then valid_to end asc nulls last,
      case when v_sort_direction = 'desc' and v_sort = 'validity' then valid_to end desc nulls last,
      case when v_sort_direction = 'asc' then case v_sort when 'buy' then buy_total when 'sell' then sell_total when 'version' then version_no when 'items' then item_count end end asc nulls last,
      case when v_sort_direction = 'desc' then case v_sort when 'buy' then buy_total when 'sell' then sell_total when 'version' then version_no when 'items' then item_count end end desc nulls last,
      updated_at desc, id) from page_rows), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'expiryCounts', jsonb_build_object(
      'expired', (select count(*) from scoped where status_code = 'expired' or valid_to < p_today),
      'sevenDays', (select count(*) from scoped where valid_to between p_today and p_today + 7),
      'thirtyDays', (select count(*) from scoped where valid_to > p_today + 7 and valid_to <= p_today + 30),
      'activeCurrent', (select count(*) from scoped where status_code = 'active' and (valid_to is null or valid_to > p_today + 30)),
      'pendingApproval', (select count(*) from scoped where status_code = 'pending_approval')
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
      contract."RATEContract_CustomerOrgID" as customer_org_id,
      coalesce(version."RATEContractVer_SnapshotJSON"->>'customer', contract."RATEContract_MetadataJSON"->>'customer', '') as customer
    from public."RATE_Contracts" contract
    left join public."RATE_ContractVersions" version on version."RATEContractVer_ID" = contract."RATEContract_CurrentVersionID"
    where contract."Company_ID" = p_company_id and not contract."RATEContract_IsDeleted"
  ), costs as materialized (
    select * from scoped where type_code = 'cost_tariff'
  ), packs as materialized (
    select * from scoped where type_code = 'sales_tariff'
  ), attention_ids as materialized (
    select id, current_version_id, updated_at from costs
    where status_code in ('draft', 'expired', 'pending_approval') or valid_to <= p_today + 30
    union all
    select id, current_version_id, updated_at from packs
    where status_code in ('draft', 'expired', 'pending_approval') or valid_to <= p_today + 30
    order by updated_at desc, id limit 6
  ), recent_ids as materialized (
    select id, current_version_id, updated_at from costs order by updated_at desc, id limit 5
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
      'total', (select count(*) from costs),
      'attention', (select count(*) from costs where status_code in ('draft', 'expired', 'pending_approval') or valid_to <= p_today + 30),
      'active', (select count(*) from costs where status_code = 'active' and (valid_to is null or valid_to >= p_today)),
      'drafts', (select count(*) from costs where status_code = 'draft'),
      'costTariffs', (select count(*) from costs),
      'salesTariffs', (select count(*) from packs),
      'customerPacks', (select count(*) from packs),
      'pendingApproval', (select count(*) from packs where status_code = 'pending_approval'),
      'customerSpecific', (select count(*) from costs where customer_org_id is not null or nullif(btrim(customer), '') is not null),
      'expiringTariffs', (select count(*) from packs where valid_to between p_today and p_today + 30),
      'sourcesInReview', (select count(*) from public."RATE_ImportBatches" import_batch where import_batch."Company_ID" = p_company_id and import_batch."RATEImport_StatusCode" = 'review')
    ),
    'attention', coalesce((select jsonb_agg(jsonb_build_object('contract', contract_json, 'version', version_json) order by updated_at desc, id) from attention), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('contract', contract_json, 'version', version_json) order by updated_at desc, id) from recent), '[]'::jsonb)
  )
$$;

create or replace function public.multideck_dexter_domain_rates(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(result.value order by result.updated_at desc), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'recordId', contract."RATEContract_ID",
      'rateCode', contract."RATEContract_Code",
      'name', contract."RATEContract_Name",
      'kind', case when contract."RATEContract_TypeCode" = 'sales_tariff' then 'customer_pack' else 'cost_tariff' end,
      'type', contract."RATEContract_TypeCode",
      'status', contract."RATEContract_StatusCode",
      'mode', contract."RATEContract_MetadataJSON"->>'mode',
      'carrier', contract."RATEContract_MetadataJSON"->>'carrier',
      'supplier', contract."RATEContract_MetadataJSON"->>'supplier',
      'customer', coalesce(customer_org."Org_Name", contract."RATEContract_MetadataJSON"->>'customer'),
      'customerOrgId', contract."RATEContract_CustomerOrgID",
      'origin', contract."RATEContract_MetadataJSON"->>'origin',
      'destination', contract."RATEContract_MetadataJSON"->>'destination',
      'cargo', contract."RATEContract_MetadataJSON"->>'cargo',
      'service', contract."RATEContract_MetadataJSON"->>'service',
      'currency', contract."RATEContract_CurrencyCodeSnapshot",
      'validFrom', contract."RATEContract_ValidFrom",
      'validTo', contract."RATEContract_ValidTo",
      'buyTotal', case when contract."RATEContract_TypeCode" = 'sales_tariff' then null else contract."RATEContract_MetadataJSON"->'buyTotal' end,
      'sellTotal', contract."RATEContract_MetadataJSON"->'sellTotal',
      'itemCount', (select count(*) from public."RATE_CustomerTariffItems" item where item."RATETariffItem_PackID" = contract."RATEContract_ID"),
      'currentVersion', version."RATEContractVer_VersionNo",
      'sourceReference', version."RATEContractVer_SourceReference",
      'updatedAt', contract."RATEContract_UpdatedAt",
      'evidence', jsonb_build_object(
        'sourceTable', 'RATE_Contracts',
        'sourceId', contract."RATEContract_ID",
        'versionId', contract."RATEContract_CurrentVersionID",
        'immutableVersion', version."RATEContractVer_VersionNo"
      )
    )) as value, contract."RATEContract_UpdatedAt" as updated_at
    from public."RATE_Contracts" contract
    left join public."RATE_ContractVersions" version
      on version."RATEContractVer_ID" = contract."RATEContract_CurrentVersionID"
    left join public."Org_Master" customer_org on customer_org."Org_id" = contract."RATEContract_CustomerOrgID"
    where contract."Company_ID" = p_company_id
      and not contract."RATEContract_IsDeleted"
      and (
        nullif(btrim(p_search), '') is null
        or concat_ws(' ', contract."RATEContract_Code", contract."RATEContract_Name", contract."RATEContract_TypeCode",
          contract."RATEContract_MetadataJSON"->>'mode', contract."RATEContract_MetadataJSON"->>'carrier',
          contract."RATEContract_MetadataJSON"->>'supplier', contract."RATEContract_MetadataJSON"->>'customer',
          customer_org."Org_Name",
          contract."RATEContract_MetadataJSON"->>'origin', contract."RATEContract_MetadataJSON"->>'destination',
          contract."RATEContract_MetadataJSON"->>'cargo') ilike '%' || btrim(p_search) || '%'
      )
    order by contract."RATEContract_UpdatedAt" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) result;
$$;

update public."sys_AIDexterDataDomains"
set
  "AIDexterDomain_Name" = 'Rates',
  "AIDexterDomain_Description" = 'Incoming cost tariffs and outgoing customer tariff packs, including mode, lane, validity, versions, pack items and source evidence. Sell documents never include buy rates.',
  "AIDexterDomain_RequiredPermissionsJSON" = '["Rates.View"]'::jsonb,
  "AIDexterDomain_DataCategoriesJSON" = '["business_record","commercial_amounts"]'::jsonb,
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'rates';

update public."sys_AIDexterWatchCapabilities"
set
  "AIDexterWatchCapability_Name" = 'Rates',
  "AIDexterWatchCapability_Description" = 'Cost tariff changes, customer packs that need approval, published packs and sent tariff documents.',
  "AIDexterWatchCapability_FieldsJSON" = '["status","validFrom","validTo","mode","origin","destination","carrier","supplier","customer","buyTotal","sellTotal","versionNo","kind","publicationStatus"]'::jsonb,
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'rates';

create or replace function public._multideck_dexter_rate_watch_source_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old jsonb := '{}'::jsonb;
  v_new jsonb;
begin
  if new."Company_ID" is null then return new; end if;
  if tg_op <> 'INSERT' then
    v_old := jsonb_build_object(
      'status', old."RATEContract_StatusCode", 'validFrom', old."RATEContract_ValidFrom", 'validTo', old."RATEContract_ValidTo",
      'mode', old."RATEContract_MetadataJSON"->>'mode', 'origin', old."RATEContract_MetadataJSON"->>'origin',
      'destination', old."RATEContract_MetadataJSON"->>'destination', 'carrier', old."RATEContract_MetadataJSON"->>'carrier',
      'supplier', old."RATEContract_MetadataJSON"->>'supplier', 'customer', old."RATEContract_MetadataJSON"->>'customer',
      'buyTotal', old."RATEContract_MetadataJSON"->'buyTotal', 'sellTotal', old."RATEContract_MetadataJSON"->'sellTotal',
      'versionId', old."RATEContract_CurrentVersionID", 'kind', old."RATEContract_TypeCode"
    );
  end if;
  v_new := jsonb_build_object(
    'rateCode', new."RATEContract_Code", 'name', new."RATEContract_Name", 'status', new."RATEContract_StatusCode",
    'validFrom', new."RATEContract_ValidFrom", 'validTo', new."RATEContract_ValidTo", 'mode', new."RATEContract_MetadataJSON"->>'mode',
    'origin', new."RATEContract_MetadataJSON"->>'origin', 'destination', new."RATEContract_MetadataJSON"->>'destination',
    'carrier', new."RATEContract_MetadataJSON"->>'carrier', 'supplier', new."RATEContract_MetadataJSON"->>'supplier',
    'customer', new."RATEContract_MetadataJSON"->>'customer', 'buyTotal', new."RATEContract_MetadataJSON"->'buyTotal',
    'sellTotal', new."RATEContract_MetadataJSON"->'sellTotal', 'versionId', new."RATEContract_CurrentVersionID",
    'kind', new."RATEContract_TypeCode"
  );
  if tg_op = 'INSERT' or v_old is distinct from (v_new - 'rateCode' - 'name') then
    insert into public."AI_DexterWatchSignals" (
      "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode", "AIDexterWatchSignal_SourceTable",
      "AIDexterWatchSignal_SourceID", "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
    ) values (new."Company_ID", 'rates', tg_table_name, new."RATEContract_ID", v_old, v_new);
  end if;
  return new;
end;
$$;

create or replace function public._multideck_dexter_rate_publication_watch()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public."AI_DexterWatchSignals" (
    "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode", "AIDexterWatchSignal_SourceTable",
    "AIDexterWatchSignal_SourceID", "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
  ) values (
    new."Company_ID", 'rates', tg_table_name, new."RATETariffPub_ID",
    case when tg_op = 'INSERT' then '{}'::jsonb else jsonb_build_object('publicationStatus', old."RATETariffPub_StatusCode", 'sentAt', old."RATETariffPub_SentAt") end,
    jsonb_build_object(
      'publicationStatus', new."RATETariffPub_StatusCode",
      'packId', new."RATETariffPub_PackID",
      'fileName', new."RATETariffPub_FileName",
      'sentAt', new."RATETariffPub_SentAt",
      'sentTo', new."RATETariffPub_SentToJSON"
    )
  );
  return new;
end;
$$;

revoke all on function public._multideck_dexter_rate_publication_watch() from public, anon, authenticated;
drop trigger if exists "TR_RATE_CustomerTariffPublications_dexter_watch" on public."RATE_CustomerTariffPublications";
create trigger "TR_RATE_CustomerTariffPublications_dexter_watch"
after insert or update of "RATETariffPub_StatusCode", "RATETariffPub_SentAt"
on public."RATE_CustomerTariffPublications"
for each row execute function public._multideck_dexter_rate_publication_watch();

create or replace function public._multideck_dexter_edge_action_only()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  raise exception 'This action must be completed through its authenticated product runtime.' using errcode = '42501';
end;
$$;

create or replace function public.multideck_dexter_action_create_cost_tariff(uuid, uuid, jsonb)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$ select public._multideck_dexter_edge_action_only() $$;
create or replace function public.multideck_dexter_action_update_cost_tariff(uuid, uuid, jsonb)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$ select public._multideck_dexter_edge_action_only() $$;
create or replace function public.multideck_dexter_action_create_customer_tariff_pack(uuid, uuid, jsonb)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$ select public._multideck_dexter_edge_action_only() $$;
create or replace function public.multideck_dexter_action_update_customer_tariff_pack(uuid, uuid, jsonb)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$ select public._multideck_dexter_edge_action_only() $$;
create or replace function public.multideck_dexter_action_add_customer_tariff_item(uuid, uuid, jsonb)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$ select public._multideck_dexter_edge_action_only() $$;
create or replace function public.multideck_dexter_action_remove_customer_tariff_item(uuid, uuid, jsonb)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$ select public._multideck_dexter_edge_action_only() $$;

revoke all on function public.multideck_dexter_action_create_cost_tariff(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_update_cost_tariff(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_create_customer_tariff_pack(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_update_customer_tariff_pack(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_add_customer_tariff_item(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_remove_customer_tariff_item(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.multideck_dexter_action_create_cost_tariff(uuid, uuid, jsonb) to service_role;
grant execute on function public.multideck_dexter_action_update_cost_tariff(uuid, uuid, jsonb) to service_role;
grant execute on function public.multideck_dexter_action_create_customer_tariff_pack(uuid, uuid, jsonb) to service_role;
grant execute on function public.multideck_dexter_action_update_customer_tariff_pack(uuid, uuid, jsonb) to service_role;
grant execute on function public.multideck_dexter_action_add_customer_tariff_item(uuid, uuid, jsonb) to service_role;
grant execute on function public.multideck_dexter_action_remove_customer_tariff_item(uuid, uuid, jsonb) to service_role;

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code", "AIDexterAction_DomainCode", "AIDexterAction_Name", "AIDexterAction_Description",
  "AIDexterAction_Function", "AIDexterAction_ParametersJSON", "AIDexterAction_SortOrder",
  "AIDexterAction_IsActive", "AIDexterAction_UpdatedAt", "AIDexterAction_RequiredPermissionsJSON"
) values
(
  'create_cost_tariff', 'rates', 'Create cost tariff',
  'Create an incoming carrier or supplier cost tariff through the Rates validation boundary.',
  'multideck_dexter_action_create_cost_tariff',
  '{"type":"object","properties":{"name":{"type":"string"},"mode":{"type":"string","enum":["lcl","fcl","air","road"]},"carrier":{"type":["string","null"]},"supplier":{"type":["string","null"]},"customerOrgId":{"type":["string","null"]},"origin":{"type":"string"},"destination":{"type":"string"},"cargo":{"type":["string","null"]},"service":{"type":["string","null"]},"validFrom":{"type":"string"},"validTo":{"type":"string"},"currency":{"type":"string"},"buyTotal":{"type":"number"},"sourceReference":{"type":["string","null"]},"schedule":{"type":["string","null"],"enum":["weekly","monthly","ad_hoc",null]},"reason":{"type":"string"}},"required":["name","mode","carrier","supplier","customerOrgId","origin","destination","cargo","service","validFrom","validTo","currency","buyTotal","sourceReference","schedule","reason"],"additionalProperties":false}'::jsonb,
  181, true, now(), '["Rates.Manage"]'::jsonb
),
(
  'update_cost_tariff', 'rates', 'Edit cost tariff',
  'Create a new immutable version of an exact incoming cost tariff.',
  'multideck_dexter_action_update_cost_tariff',
  '{"type":"object","properties":{"target_id":{"type":"string"},"name":{"type":["string","null"]},"mode":{"type":["string","null"],"enum":["lcl","fcl","air","road",null]},"carrier":{"type":["string","null"]},"supplier":{"type":["string","null"]},"customerOrgId":{"type":["string","null"]},"origin":{"type":["string","null"]},"destination":{"type":["string","null"]},"validFrom":{"type":["string","null"]},"validTo":{"type":["string","null"]},"currency":{"type":["string","null"]},"buyTotal":{"type":["number","null"]},"sourceReference":{"type":["string","null"]},"reason":{"type":"string"}},"required":["target_id","name","mode","carrier","supplier","customerOrgId","origin","destination","validFrom","validTo","currency","buyTotal","sourceReference","reason"],"additionalProperties":false}'::jsonb,
  182, true, now(), '["Rates.Manage"]'::jsonb
),
(
  'create_customer_tariff_pack', 'rates', 'Create customer tariff pack',
  'Create an outgoing customer tariff pack. Approval and sending stay in Rates.',
  'multideck_dexter_action_create_customer_tariff_pack',
  '{"type":"object","properties":{"name":{"type":"string"},"customerOrgId":{"type":"string"},"validFrom":{"type":"string"},"validTo":{"type":"string"},"currency":{"type":"string"},"schedule":{"type":["string","null"],"enum":["weekly","monthly","ad_hoc",null]},"sendAfterApproval":{"type":"boolean"},"reason":{"type":"string"}},"required":["name","customerOrgId","validFrom","validTo","currency","schedule","sendAfterApproval","reason"],"additionalProperties":false}'::jsonb,
  183, true, now(), '["Rates.Manage"]'::jsonb
),
(
  'update_customer_tariff_pack', 'rates', 'Edit customer tariff pack',
  'Update an exact customer tariff pack header. Approving and sending remain in Rates.',
  'multideck_dexter_action_update_customer_tariff_pack',
  '{"type":"object","properties":{"target_id":{"type":"string"},"name":{"type":["string","null"]},"customerOrgId":{"type":["string","null"]},"validFrom":{"type":["string","null"]},"validTo":{"type":["string","null"]},"currency":{"type":["string","null"]},"schedule":{"type":["string","null"],"enum":["weekly","monthly","ad_hoc",null]},"sendAfterApproval":{"type":["boolean","null"]},"reason":{"type":"string"}},"required":["target_id","name","customerOrgId","validFrom","validTo","currency","schedule","sendAfterApproval","reason"],"additionalProperties":false}'::jsonb,
  184, true, now(), '["Rates.Manage"]'::jsonb
),
(
  'add_customer_tariff_item', 'rates', 'Add cost tariff to customer pack',
  'Include an exact cost tariff in a customer pack with markup or override.',
  'multideck_dexter_action_add_customer_tariff_item',
  '{"type":"object","properties":{"target_id":{"type":"string"},"sourceCostId":{"type":"string"},"pricingMode":{"type":"string","enum":["markup_percent","markup_amount","override"]},"markupPercent":{"type":["number","null"]},"markupAmount":{"type":["number","null"]},"sellTotal":{"type":["number","null"]},"reason":{"type":"string"}},"required":["target_id","sourceCostId","pricingMode","markupPercent","markupAmount","sellTotal","reason"],"additionalProperties":false}'::jsonb,
  185, true, now(), '["Rates.Manage"]'::jsonb
),
(
  'remove_customer_tariff_item', 'rates', 'Remove cost tariff from customer pack',
  'Remove an included cost tariff from an exact customer pack.',
  'multideck_dexter_action_remove_customer_tariff_item',
  '{"type":"object","properties":{"target_id":{"type":"string"},"itemId":{"type":"string"},"reason":{"type":"string"}},"required":["target_id","itemId","reason"],"additionalProperties":false}'::jsonb,
  186, true, now(), '["Rates.Manage"]'::jsonb
)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode" = excluded."AIDexterAction_DomainCode",
  "AIDexterAction_Name" = excluded."AIDexterAction_Name",
  "AIDexterAction_Description" = excluded."AIDexterAction_Description",
  "AIDexterAction_Function" = excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON" = excluded."AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder" = excluded."AIDexterAction_SortOrder",
  "AIDexterAction_IsActive" = true,
  "AIDexterAction_UpdatedAt" = now(),
  "AIDexterAction_RequiredPermissionsJSON" = excluded."AIDexterAction_RequiredPermissionsJSON";

comment on function public.multideck_rates_register_page(uuid, text, text, text, text, text, text, text, date, integer, integer)
is 'Service-role-only, company-scoped Rates table read for cost tariffs or customer packs, with exact totals and a maximum 50-row page.';
comment on function public.multideck_rates_workspace_snapshot(uuid, date)
is 'Service-role-only Rates dashboard read with cost attention/recent queues and customer pack counts.';

commit;
