-- Rates and contracts workspace: company scope, immutable versions, source archive,
-- quote pricing snapshots, and deterministic Dexter read/watch parity.

begin;

alter table public."RATE_Contracts" add column if not exists "Company_ID" uuid references public."cmp_Company"("Company_ID") on delete cascade;
alter table public."RATE_ImportBatches" add column if not exists "Company_ID" uuid references public."cmp_Company"("Company_ID") on delete cascade;
alter table public."RATE_AuditEvents" add column if not exists "Company_ID" uuid references public."cmp_Company"("Company_ID") on delete cascade;

create index if not exists "IX_RATE_Contracts_Company_Status_Validity"
  on public."RATE_Contracts" ("Company_ID", "RATEContract_StatusCode", "RATEContract_ValidTo")
  where not "RATEContract_IsDeleted";
create index if not exists "IX_RATE_ImportBatches_Company_Created"
  on public."RATE_ImportBatches" ("Company_ID", "RATEImport_CreatedAt" desc);
create index if not exists "IX_RATE_AuditEvents_Company_Created"
  on public."RATE_AuditEvents" ("Company_ID", "RATEAudit_CreatedAt" desc);

create table if not exists public."RATE_QuoteSelections" (
  "RATEQuoteSelection_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Quote_ID" uuid not null references public."CusQuote_Header"("CusQuoteHeader_ID") on delete cascade,
  "RATEContract_ID" uuid not null references public."RATE_Contracts"("RATEContract_ID"),
  "RATEContractVer_ID" uuid not null references public."RATE_ContractVersions"("RATEContractVer_ID"),
  "SnapshotJSON" jsonb not null,
  "Current" boolean not null default true,
  "AppliedAt" timestamptz not null default now(),
  "AppliedBy" uuid references public."cmp_Users"("User_ID"),
  constraint "CK_RATE_QuoteSelections_Snapshot" check (jsonb_typeof("SnapshotJSON") = 'object')
);

create unique index if not exists "UX_RATE_QuoteSelections_Current"
  on public."RATE_QuoteSelections" ("Company_ID", "Quote_ID") where "Current";
create index if not exists "IX_RATE_QuoteSelections_RateVersion"
  on public."RATE_QuoteSelections" ("RATEContractVer_ID", "AppliedAt" desc);

alter table public."RATE_Contracts" enable row level security;
alter table public."RATE_ImportBatches" enable row level security;
alter table public."RATE_AuditEvents" enable row level security;
alter table public."RATE_QuoteSelections" enable row level security;

revoke all on public."RATE_Contracts", public."RATE_ContractVersions", public."RATE_ImportBatches", public."RATE_AuditEvents", public."RATE_QuoteSelections" from anon, authenticated;
grant select on public."RATE_Contracts", public."RATE_ContractVersions", public."RATE_ImportBatches", public."RATE_AuditEvents", public."RATE_QuoteSelections" to service_role;
grant insert, update on public."RATE_Contracts", public."RATE_ContractVersions", public."RATE_ImportBatches", public."RATE_AuditEvents", public."RATE_QuoteSelections" to service_role;

insert into public."sys_Permissions" (
  "sys_Permission_Value", "sys_Permission_Group", "sys_Permission_Name", "sys_Permission_Description", "sys_Permission_IsDangerous"
) values
  ('Rates.View', 'Rates & Contracts', 'View rates and contracts', 'View company-scoped contracts, tariffs, source history and eligible quote matches.', false),
  ('Rates.Manage', 'Rates & Contracts', 'Manage rates and contracts', 'Create versions, archive source files, expire rates and apply reviewed pricing snapshots to quotes.', true)
on conflict ("sys_Permission_Value") do update set
  "sys_Permission_Group" = excluded."sys_Permission_Group",
  "sys_Permission_Name" = excluded."sys_Permission_Name",
  "sys_Permission_Description" = excluded."sys_Permission_Description",
  "sys_Permission_IsDangerous" = excluded."sys_Permission_IsDangerous";

with role_permissions(role_name, permission_value) as (
  values
    ('Administrator', 'Rates.View'), ('Administrator', 'Rates.Manage'),
    ('Operations manager', 'Rates.View'), ('Operations manager', 'Rates.Manage'),
    ('Operator', 'Rates.View'), ('Viewer', 'Rates.View')
)
insert into public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
select role."sys_UserRole_ID", permission."sys_Permission_ID"
from role_permissions mapping
join public."sys_UserRoles" role on role."sys_UserRole_Name" = mapping.role_name
join public."sys_Permissions" permission on permission."sys_Permission_Value" = mapping.permission_value
on conflict do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rate-source-files', 'rate-source-files', false, 15728640,
  array['text/csv','text/tab-separated-values','text/plain','message/rfc822','application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- No browser storage policy is created for this bucket. The Rates Edge Function
-- checks the JWT and permission, then archives via service_role.

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
      'type', contract."RATEContract_TypeCode",
      'status', contract."RATEContract_StatusCode",
      'mode', contract."RATEContract_MetadataJSON"->>'mode',
      'carrier', contract."RATEContract_MetadataJSON"->>'carrier',
      'supplier', contract."RATEContract_MetadataJSON"->>'supplier',
      'customer', contract."RATEContract_MetadataJSON"->>'customer',
      'origin', contract."RATEContract_MetadataJSON"->>'origin',
      'destination', contract."RATEContract_MetadataJSON"->>'destination',
      'cargo', contract."RATEContract_MetadataJSON"->>'cargo',
      'service', contract."RATEContract_MetadataJSON"->>'service',
      'currency', contract."RATEContract_CurrencyCodeSnapshot",
      'validFrom', contract."RATEContract_ValidFrom",
      'validTo', contract."RATEContract_ValidTo",
      'buyTotal', contract."RATEContract_MetadataJSON"->'buyTotal',
      'sellTotal', contract."RATEContract_MetadataJSON"->'sellTotal',
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
    where contract."Company_ID" = p_company_id
      and not contract."RATEContract_IsDeleted"
      and (
        nullif(btrim(p_search), '') is null
        or concat_ws(' ', contract."RATEContract_Code", contract."RATEContract_Name", contract."RATEContract_TypeCode",
          contract."RATEContract_MetadataJSON"->>'mode', contract."RATEContract_MetadataJSON"->>'carrier',
          contract."RATEContract_MetadataJSON"->>'supplier', contract."RATEContract_MetadataJSON"->>'customer',
          contract."RATEContract_MetadataJSON"->>'origin', contract."RATEContract_MetadataJSON"->>'destination',
          contract."RATEContract_MetadataJSON"->>'cargo') ilike '%' || btrim(p_search) || '%'
      )
    order by contract."RATEContract_UpdatedAt" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) result;
$$;

revoke all on function public.multideck_dexter_domain_rates(uuid, text, integer) from public, anon, authenticated;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code", "AIDexterDomain_Name", "AIDexterDomain_Description", "AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder", "AIDexterDomain_IsActive", "AIDexterDomain_UpdatedAt"
) values (
  'rates', 'Rates and contracts',
  'Company-scoped freight contracts and tariffs, including mode, lane, eligibility, validity, commercial totals, current immutable version and source evidence.',
  'multideck_dexter_domain_rates', 18, true, now()
)
on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name" = excluded."AIDexterDomain_Name",
  "AIDexterDomain_Description" = excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction" = excluded."AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder" = excluded."AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive" = true,
  "AIDexterDomain_UpdatedAt" = now();

insert into public."sys_AIDexterWatchCapabilities" (
  "AIDexterWatchCapability_Code", "AIDexterWatchCapability_Name", "AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON", "AIDexterWatchCapability_SortOrder"
) values (
  'rates', 'Rates and contracts', 'Rate status, validity, route, totals, margin and current version changes.',
  '["status","validFrom","validTo","mode","origin","destination","carrier","supplier","customer","buyTotal","sellTotal","versionNo"]'::jsonb, 18
)
on conflict ("AIDexterWatchCapability_Code") do update set
  "AIDexterWatchCapability_Name" = excluded."AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description" = excluded."AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON" = excluded."AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_IsActive" = true,
  "AIDexterWatchCapability_SortOrder" = excluded."AIDexterWatchCapability_SortOrder",
  "AIDexterWatchCapability_UpdatedAt" = now();

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
      'versionId', old."RATEContract_CurrentVersionID"
    );
  end if;
  v_new := jsonb_build_object(
    'rateCode', new."RATEContract_Code", 'name', new."RATEContract_Name", 'status', new."RATEContract_StatusCode",
    'validFrom', new."RATEContract_ValidFrom", 'validTo', new."RATEContract_ValidTo", 'mode', new."RATEContract_MetadataJSON"->>'mode',
    'origin', new."RATEContract_MetadataJSON"->>'origin', 'destination', new."RATEContract_MetadataJSON"->>'destination',
    'carrier', new."RATEContract_MetadataJSON"->>'carrier', 'supplier', new."RATEContract_MetadataJSON"->>'supplier',
    'customer', new."RATEContract_MetadataJSON"->>'customer', 'buyTotal', new."RATEContract_MetadataJSON"->'buyTotal',
    'sellTotal', new."RATEContract_MetadataJSON"->'sellTotal', 'versionId', new."RATEContract_CurrentVersionID"
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

revoke all on function public._multideck_dexter_rate_watch_source_change() from public, anon, authenticated;
drop trigger if exists "TR_RATE_Contracts_dexter_watch" on public."RATE_Contracts";
create trigger "TR_RATE_Contracts_dexter_watch"
after insert or update of "RATEContract_StatusCode", "RATEContract_ValidFrom", "RATEContract_ValidTo", "RATEContract_MetadataJSON", "RATEContract_CurrentVersionID"
on public."RATE_Contracts"
for each row execute function public._multideck_dexter_rate_watch_source_change();

commit;
