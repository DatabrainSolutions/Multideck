-- UK OFSI party screening: keep the official consolidated list in the tenant
-- database and screen names through an allowlisted API. The browser never
-- supplies SQL. List files stay server-side. Screening is operational support,
-- not legal certainty.

begin;

create extension if not exists pg_trgm with schema extensions;

insert into public."sys_Permissions" (
  "sys_Permission_Value",
  "sys_Permission_Group",
  "sys_Permission_Name",
  "sys_Permission_Description",
  "sys_Permission_IsDangerous"
)
values
  ('Screening.Read', 'Customs & Compliance', 'Read party screening', 'View sanctions list freshness and completed screening results.', false),
  ('Screening.Write', 'Customs & Compliance', 'Run party screening', 'Screen a party against the current government list and refresh that list.', false)
on conflict ("sys_Permission_Value") do update
set
  "sys_Permission_Group" = excluded."sys_Permission_Group",
  "sys_Permission_Name" = excluded."sys_Permission_Name",
  "sys_Permission_Description" = excluded."sys_Permission_Description",
  "sys_Permission_IsDangerous" = excluded."sys_Permission_IsDangerous";

with role_permissions(role_name, permission_value) as (
  values
    ('Administrator', 'Screening.Read'),
    ('Administrator', 'Screening.Write'),
    ('Operations manager', 'Screening.Read'),
    ('Operations manager', 'Screening.Write'),
    ('Operator', 'Screening.Read'),
    ('Operator', 'Screening.Write'),
    ('Viewer', 'Screening.Read')
)
insert into public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
select role."sys_UserRole_ID", permission."sys_Permission_ID"
from role_permissions mapping
join public."sys_UserRoles" role
  on role."sys_UserRole_Name" = mapping.role_name
join public."sys_Permissions" permission
  on permission."sys_Permission_Value" = mapping.permission_value
on conflict do nothing;

create table if not exists public."sys_ScreeningListSources" (
  "ScreeningListSource_Code" varchar(40) primary key,
  "ScreeningListSource_Name" varchar(160) not null,
  "ScreeningListSource_Publisher" varchar(160) not null,
  "ScreeningListSource_DownloadUrl" text not null,
  "ScreeningListSource_IsActive" boolean not null default true,
  "ScreeningListSource_RefreshIntervalHours" integer not null default 12,
  "ScreeningListSource_LastAttemptAt" timestamptz,
  "ScreeningListSource_LastSuccessAt" timestamptz,
  "ScreeningListSource_LastError" text,
  constraint "CK_sys_ScreeningListSources_code"
    check ("ScreeningListSource_Code" ~ '^[a-z][a-z0-9_]{2,39}$')
);

create table if not exists public."sys_ScreeningListSnapshots" (
  "ScreeningListSnapshot_ID" uuid primary key default gen_random_uuid(),
  "ScreeningListSnapshot_SourceCode" varchar(40) not null
    references public."sys_ScreeningListSources"("ScreeningListSource_Code") on delete restrict,
  "ScreeningListSnapshot_ContentSha256" varchar(64) not null,
  "ScreeningListSnapshot_DownloadedAt" timestamptz not null default now(),
  "ScreeningListSnapshot_CheckedAt" timestamptz not null default now(),
  "ScreeningListSnapshot_EntryCount" integer not null default 0,
  "ScreeningListSnapshot_GroupCount" integer not null default 0,
  "ScreeningListSnapshot_StatusCode" varchar(20) not null default 'importing',
  "ScreeningListSnapshot_FailureMessage" text,
  constraint "CK_sys_ScreeningListSnapshots_status"
    check ("ScreeningListSnapshot_StatusCode" in ('importing', 'current', 'superseded', 'failed')),
  constraint "CK_sys_ScreeningListSnapshots_hash"
    check ("ScreeningListSnapshot_ContentSha256" ~ '^[0-9a-f]{64}$')
);

create unique index if not exists "UX_sys_ScreeningListSnapshots_current_source"
  on public."sys_ScreeningListSnapshots" ("ScreeningListSnapshot_SourceCode")
  where "ScreeningListSnapshot_StatusCode" = 'current';

create table if not exists public."sys_ScreeningListEntries" (
  "ScreeningListEntry_ID" uuid primary key default gen_random_uuid(),
  "ScreeningListEntry_SnapshotID" uuid not null
    references public."sys_ScreeningListSnapshots"("ScreeningListSnapshot_ID") on delete cascade,
  "ScreeningListEntry_GroupId" varchar(80) not null,
  "ScreeningListEntry_UniqueId" varchar(80),
  "ScreeningListEntry_Name" varchar(500) not null,
  "ScreeningListEntry_NormalizedName" varchar(500) not null,
  "ScreeningListEntry_AliasType" varchar(80),
  "ScreeningListEntry_GroupType" varchar(40),
  "ScreeningListEntry_Regime" varchar(240),
  "ScreeningListEntry_Country" varchar(120),
  "ScreeningListEntry_ListedOn" date,
  "ScreeningListEntry_UkRef" varchar(80),
  "ScreeningListEntry_OtherInformation" text
);

create index if not exists "IX_sys_ScreeningListEntries_snapshot_name"
  on public."sys_ScreeningListEntries" ("ScreeningListEntry_SnapshotID", "ScreeningListEntry_NormalizedName");
create index if not exists "IX_sys_ScreeningListEntries_snapshot_trgm"
  on public."sys_ScreeningListEntries"
  using gin ("ScreeningListEntry_NormalizedName" extensions.gin_trgm_ops);

create table if not exists public."CMP_ScreeningChecks" (
  "ScreeningCheck_ID" uuid primary key default gen_random_uuid(),
  "ScreeningCheck_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "ScreeningCheck_CreatedBy" uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  "ScreeningCheck_OrgID" uuid references public."Org_Master"("Org_id") on delete set null,
  "ScreeningCheck_SnapshotID" uuid references public."sys_ScreeningListSnapshots"("ScreeningListSnapshot_ID") on delete set null,
  "ScreeningCheck_SubjectName" varchar(240) not null,
  "ScreeningCheck_NormalizedName" varchar(240) not null,
  "ScreeningCheck_Country" varchar(80),
  "ScreeningCheck_OutcomeCode" varchar(20) not null,
  "ScreeningCheck_MatchCount" integer not null default 0,
  "ScreeningCheck_ListAgeHours" numeric(10, 2),
  "ScreeningCheck_ListStale" boolean not null default false,
  "ScreeningCheck_CreatedAt" timestamptz not null default now(),
  constraint "CK_CMP_ScreeningChecks_outcome"
    check ("ScreeningCheck_OutcomeCode" in ('clear', 'possible_match', 'match', 'unavailable')),
  constraint "CK_CMP_ScreeningChecks_name"
    check (btrim("ScreeningCheck_SubjectName") <> '')
);

create index if not exists "IX_CMP_ScreeningChecks_company_created"
  on public."CMP_ScreeningChecks" ("ScreeningCheck_CompanyID", "ScreeningCheck_CreatedAt" desc);
create index if not exists "IX_CMP_ScreeningChecks_org_created"
  on public."CMP_ScreeningChecks" ("ScreeningCheck_OrgID", "ScreeningCheck_CreatedAt" desc)
  where "ScreeningCheck_OrgID" is not null;

create table if not exists public."CMP_ScreeningMatches" (
  "ScreeningMatch_ID" uuid primary key default gen_random_uuid(),
  "ScreeningMatch_CheckID" uuid not null
    references public."CMP_ScreeningChecks"("ScreeningCheck_ID") on delete cascade,
  "ScreeningMatch_EntryID" uuid references public."sys_ScreeningListEntries"("ScreeningListEntry_ID") on delete set null,
  "ScreeningMatch_GroupId" varchar(80) not null,
  "ScreeningMatch_ListedName" varchar(500) not null,
  "ScreeningMatch_MatchKind" varchar(20) not null,
  "ScreeningMatch_Score" numeric(6, 4) not null,
  "ScreeningMatch_Regime" varchar(240),
  "ScreeningMatch_GroupType" varchar(40),
  "ScreeningMatch_ListedOn" date,
  "ScreeningMatch_UkRef" varchar(80),
  "ScreeningMatch_Country" varchar(120),
  constraint "CK_CMP_ScreeningMatches_kind"
    check ("ScreeningMatch_MatchKind" in ('exact', 'similar'))
);

create index if not exists "IX_CMP_ScreeningMatches_check"
  on public."CMP_ScreeningMatches" ("ScreeningMatch_CheckID", "ScreeningMatch_Score" desc);

alter table public."sys_ScreeningListSources" enable row level security;
alter table public."sys_ScreeningListSnapshots" enable row level security;
alter table public."sys_ScreeningListEntries" enable row level security;
alter table public."CMP_ScreeningChecks" enable row level security;
alter table public."CMP_ScreeningMatches" enable row level security;

revoke all on table public."sys_ScreeningListSources" from public, anon, authenticated;
revoke all on table public."sys_ScreeningListSnapshots" from public, anon, authenticated;
revoke all on table public."sys_ScreeningListEntries" from public, anon, authenticated;
revoke all on table public."CMP_ScreeningChecks" from public, anon, authenticated;
revoke all on table public."CMP_ScreeningMatches" from public, anon, authenticated;

insert into public."sys_ScreeningListSources" (
  "ScreeningListSource_Code",
  "ScreeningListSource_Name",
  "ScreeningListSource_Publisher",
  "ScreeningListSource_DownloadUrl"
) values (
  'uk_ofsi_consolidated',
  'UK OFSI consolidated list',
  'UK Office of Financial Sanctions Implementation',
  'https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.csv'
)
on conflict ("ScreeningListSource_Code") do update set
  "ScreeningListSource_Name" = excluded."ScreeningListSource_Name",
  "ScreeningListSource_Publisher" = excluded."ScreeningListSource_Publisher",
  "ScreeningListSource_DownloadUrl" = excluded."ScreeningListSource_DownloadUrl",
  "ScreeningListSource_IsActive" = true;

create or replace function public.cmp_normalize_screening_name(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog, public
as $$
  select nullif(btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        translate(
          lower(coalesce(p_name, '')),
          'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ',
          'aaaaaaceeeeiiiinooooouuuuyy'
        ),
        '[^a-z0-9]+',
        ' ',
        'g'
      ),
      '\y(limited|ltd|llc|inc|gmbh|plc|corp|incorporated|company|co|sa|bv|ag|pty|sarl|llp)\y',
      ' ',
      'g'
    ),
    '\s+',
    ' ',
    'g'
  )), '');
$$;

create or replace function public.cmp_screening_list_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row record;
begin
  select
    source."ScreeningListSource_Code" as source_code,
    source."ScreeningListSource_Name" as source_name,
    source."ScreeningListSource_Publisher" as publisher,
    source."ScreeningListSource_LastAttemptAt" as last_attempt_at,
    source."ScreeningListSource_LastSuccessAt" as last_success_at,
    source."ScreeningListSource_LastError" as last_error,
    snapshot."ScreeningListSnapshot_ID" as snapshot_id,
    snapshot."ScreeningListSnapshot_DownloadedAt" as downloaded_at,
    snapshot."ScreeningListSnapshot_CheckedAt" as checked_at,
    snapshot."ScreeningListSnapshot_EntryCount" as entry_count,
    snapshot."ScreeningListSnapshot_GroupCount" as group_count,
    snapshot."ScreeningListSnapshot_StatusCode" as snapshot_status
  into v_row
  from public."sys_ScreeningListSources" source
  left join public."sys_ScreeningListSnapshots" snapshot
    on snapshot."ScreeningListSnapshot_SourceCode" = source."ScreeningListSource_Code"
   and snapshot."ScreeningListSnapshot_StatusCode" = 'current'
  where source."ScreeningListSource_Code" = 'uk_ofsi_consolidated';

  if not found then
    return jsonb_build_object('loaded', false, 'stale', true);
  end if;

  return jsonb_build_object(
    'loaded', v_row.snapshot_id is not null,
    'sourceCode', v_row.source_code,
    'sourceName', v_row.source_name,
    'publisher', v_row.publisher,
    'snapshotId', v_row.snapshot_id,
    'downloadedAt', v_row.downloaded_at,
    'checkedAt', v_row.checked_at,
    'lastAttemptAt', v_row.last_attempt_at,
    'lastSuccessAt', v_row.last_success_at,
    'lastError', v_row.last_error,
    'entryCount', coalesce(v_row.entry_count, 0),
    'groupCount', coalesce(v_row.group_count, 0),
    'stale', v_row.downloaded_at is null
      or v_row.downloaded_at < now() - interval '36 hours'
  );
end;
$$;

create or replace function public.cmp_run_screening_check(
  p_company_id uuid,
  p_user_id uuid,
  p_subject_name text,
  p_country text default null,
  p_org_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_normalized text := public.cmp_normalize_screening_name(p_subject_name);
  v_snapshot record;
  v_check_id uuid := gen_random_uuid();
  v_outcome text := 'unavailable';
  v_match_count integer := 0;
  v_age_hours numeric(10, 2) := null;
  v_stale boolean := true;
  v_matches jsonb := '[]'::jsonb;
begin
  if v_normalized is null or char_length(v_normalized) < 3 then
    raise exception 'Enter a party name with at least three letters.' using errcode = '22023';
  end if;

  if p_org_id is not null and not exists (
    select 1 from public."Org_Master" organisation where organisation."Org_id" = p_org_id
  ) then
    raise exception 'That organisation is not available in this workspace.' using errcode = '22023';
  end if;

  select
    snapshot."ScreeningListSnapshot_ID" as snapshot_id,
    snapshot."ScreeningListSnapshot_DownloadedAt" as downloaded_at
  into v_snapshot
  from public."sys_ScreeningListSnapshots" snapshot
  where snapshot."ScreeningListSnapshot_SourceCode" = 'uk_ofsi_consolidated'
    and snapshot."ScreeningListSnapshot_StatusCode" = 'current';

  if v_snapshot.snapshot_id is null then
    insert into public."CMP_ScreeningChecks" (
      "ScreeningCheck_ID", "ScreeningCheck_CompanyID", "ScreeningCheck_CreatedBy",
      "ScreeningCheck_OrgID", "ScreeningCheck_SubjectName", "ScreeningCheck_NormalizedName",
      "ScreeningCheck_Country", "ScreeningCheck_OutcomeCode", "ScreeningCheck_MatchCount",
      "ScreeningCheck_ListStale"
    ) values (
      v_check_id, p_company_id, p_user_id, p_org_id, btrim(p_subject_name), v_normalized,
      nullif(btrim(p_country), ''), 'unavailable', 0, true
    );
  else
    v_age_hours := round(extract(epoch from (now() - v_snapshot.downloaded_at)) / 3600.0, 2);
    v_stale := v_snapshot.downloaded_at < now() - interval '36 hours';

    select coalesce(jsonb_agg(match_row order by (match_row->>'score')::numeric desc), '[]'::jsonb)
    into v_matches
    from (
      select jsonb_build_object(
        'entryId', entry."ScreeningListEntry_ID",
        'groupId', entry."ScreeningListEntry_GroupId",
        'listedName', entry."ScreeningListEntry_Name",
        'matchKind', case when entry."ScreeningListEntry_NormalizedName" = v_normalized then 'exact' else 'similar' end,
        'score', case
          when entry."ScreeningListEntry_NormalizedName" = v_normalized then 1
          else round(greatest(
            extensions.similarity(v_normalized, entry."ScreeningListEntry_NormalizedName"),
            extensions.word_similarity(v_normalized, entry."ScreeningListEntry_NormalizedName")
          )::numeric, 4)
        end,
        'regime', entry."ScreeningListEntry_Regime",
        'groupType', entry."ScreeningListEntry_GroupType",
        'listedOn', entry."ScreeningListEntry_ListedOn",
        'ukRef', entry."ScreeningListEntry_UkRef",
        'country', entry."ScreeningListEntry_Country"
      ) as match_row
      from public."sys_ScreeningListEntries" entry
      where entry."ScreeningListEntry_SnapshotID" = v_snapshot.snapshot_id
        and (
          entry."ScreeningListEntry_NormalizedName" = v_normalized
          or (
            char_length(v_normalized) >= 5
            and greatest(
              extensions.similarity(v_normalized, entry."ScreeningListEntry_NormalizedName"),
              extensions.word_similarity(v_normalized, entry."ScreeningListEntry_NormalizedName")
            ) >= 0.82
          )
        )
      order by
        (entry."ScreeningListEntry_NormalizedName" = v_normalized) desc,
        greatest(
          extensions.similarity(v_normalized, entry."ScreeningListEntry_NormalizedName"),
          extensions.word_similarity(v_normalized, entry."ScreeningListEntry_NormalizedName")
        ) desc
      limit 12
    ) ranked;

    v_match_count := jsonb_array_length(v_matches);
    v_outcome := case
      when exists (
        select 1 from jsonb_array_elements(v_matches) item
        where item->>'matchKind' = 'exact'
      ) then 'match'
      when v_match_count > 0 then 'possible_match'
      else 'clear'
    end;

    insert into public."CMP_ScreeningChecks" (
      "ScreeningCheck_ID", "ScreeningCheck_CompanyID", "ScreeningCheck_CreatedBy",
      "ScreeningCheck_OrgID", "ScreeningCheck_SnapshotID", "ScreeningCheck_SubjectName",
      "ScreeningCheck_NormalizedName", "ScreeningCheck_Country", "ScreeningCheck_OutcomeCode",
      "ScreeningCheck_MatchCount", "ScreeningCheck_ListAgeHours", "ScreeningCheck_ListStale"
    ) values (
      v_check_id, p_company_id, p_user_id, p_org_id, v_snapshot.snapshot_id, btrim(p_subject_name),
      v_normalized, nullif(btrim(p_country), ''), v_outcome, v_match_count, v_age_hours, v_stale
    );

    insert into public."CMP_ScreeningMatches" (
      "ScreeningMatch_CheckID", "ScreeningMatch_EntryID", "ScreeningMatch_GroupId",
      "ScreeningMatch_ListedName", "ScreeningMatch_MatchKind", "ScreeningMatch_Score",
      "ScreeningMatch_Regime", "ScreeningMatch_GroupType", "ScreeningMatch_ListedOn",
      "ScreeningMatch_UkRef", "ScreeningMatch_Country"
    )
    select
      v_check_id,
      nullif(item->>'entryId', '')::uuid,
      item->>'groupId',
      item->>'listedName',
      item->>'matchKind',
      (item->>'score')::numeric,
      item->>'regime',
      item->>'groupType',
      nullif(item->>'listedOn', '')::date,
      item->>'ukRef',
      item->>'country'
    from jsonb_array_elements(v_matches) item;
  end if;

  return jsonb_build_object(
    'id', v_check_id,
    'subjectName', btrim(p_subject_name),
    'normalizedName', v_normalized,
    'country', nullif(btrim(p_country), ''),
    'orgId', p_org_id,
    'outcome', v_outcome,
    'matchCount', v_match_count,
    'listAgeHours', v_age_hours,
    'listStale', v_stale,
    'createdAt', now(),
    'matches', v_matches
  );
end;
$$;

create or replace function public.multideck_dexter_domain_screening(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select jsonb_build_object(
    'list', public.cmp_screening_list_status(),
    'checks', coalesce((
      select jsonb_agg(row_data order by search_rank desc, created_at desc)
      from (
        select jsonb_build_object(
          'recordId', check_row."ScreeningCheck_ID",
          'subjectName', check_row."ScreeningCheck_SubjectName",
          'outcome', check_row."ScreeningCheck_OutcomeCode",
          'matchCount', check_row."ScreeningCheck_MatchCount",
          'orgId', check_row."ScreeningCheck_OrgID",
          'country', check_row."ScreeningCheck_Country",
          'listStale', check_row."ScreeningCheck_ListStale",
          'listAgeHours', check_row."ScreeningCheck_ListAgeHours",
          'createdAt', check_row."ScreeningCheck_CreatedAt",
          'searchEvidence', evidence.value - 'matched'
        ) as row_data,
        coalesce((evidence.value->>'confidence')::numeric, 0) as search_rank,
        check_row."ScreeningCheck_CreatedAt" as created_at
        from public."CMP_ScreeningChecks" check_row
        join public."cmp_Users" owner
          on owner."User_ID" = check_row."ScreeningCheck_CreatedBy"
         and owner."Company_ID" = p_company_id
        cross join lateral public._multideck_dexter_search_evidence(
          p_search,
          jsonb_build_object(
            'recordId', check_row."ScreeningCheck_ID",
            'subjectName', check_row."ScreeningCheck_SubjectName",
            'outcome', check_row."ScreeningCheck_OutcomeCode",
            'country', check_row."ScreeningCheck_Country"
          ),
          array['recordId']::text[]
        ) evidence(value)
        where check_row."ScreeningCheck_CompanyID" = p_company_id
          and (evidence.value->>'matched')::boolean
        order by search_rank desc, check_row."ScreeningCheck_CreatedAt" desc
        limit greatest(1, least(coalesce(p_take, 10), 25))
      ) ranked
    ), '[]'::jsonb)
  );
$$;

create or replace function public.multideck_dexter_action_run_screening_check(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_org_id uuid;
begin
  if not public._multideck_dexter_has_permission(p_user_id, 'Screening.Write') then
    raise exception 'You do not have permission to run party screening.' using errcode = '42501';
  end if;
  begin
    v_org_id := nullif(btrim(p_arguments->>'org_id'), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'That organisation reference is not valid.' using errcode = '22023';
  end;
  return public.cmp_run_screening_check(
    p_company_id,
    p_user_id,
    p_arguments->>'subject_name',
    p_arguments->>'country',
    v_org_id
  );
end;
$$;

revoke all on function public.cmp_normalize_screening_name(text) from public, anon, authenticated;
revoke all on function public.cmp_screening_list_status() from public, anon, authenticated;
revoke all on function public.cmp_run_screening_check(uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_screening(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_run_screening_check(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.cmp_screening_list_status() to service_role;
grant execute on function public.cmp_run_screening_check(uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.multideck_dexter_domain_screening(uuid, text, integer) to service_role;
grant execute on function public.multideck_dexter_action_run_screening_check(uuid, uuid, jsonb) to service_role;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code",
  "AIDexterDomain_Name",
  "AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive",
  "AIDexterDomain_UpdatedAt",
  "AIDexterDomain_RequiredPermissionsJSON",
  "AIDexterDomain_DataCategoriesJSON"
) values (
  'screening',
  'Party screening',
  'UK OFSI list freshness and completed party screening results for this workspace. Treat hits as operational review items, not legal certainty.',
  'multideck_dexter_domain_screening',
  26,
  true,
  now(),
  '["Screening.Read"]'::jsonb,
  '["business_record","compliance_details"]'::jsonb
)
on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name" = excluded."AIDexterDomain_Name",
  "AIDexterDomain_Description" = excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction" = excluded."AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder" = excluded."AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive" = true,
  "AIDexterDomain_RequiredPermissionsJSON" = excluded."AIDexterDomain_RequiredPermissionsJSON",
  "AIDexterDomain_DataCategoriesJSON" = excluded."AIDexterDomain_DataCategoriesJSON",
  "AIDexterDomain_UpdatedAt" = now();

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code",
  "AIDexterAction_DomainCode",
  "AIDexterAction_Name",
  "AIDexterAction_Description",
  "AIDexterAction_Function",
  "AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder",
  "AIDexterAction_IsActive",
  "AIDexterAction_UpdatedAt",
  "AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_IntentFamily",
  "AIDexterAction_HasExternalEffect"
) values (
  'run_screening_check',
  'screening',
  'Screen a party',
  'Screen one exact name against the current UK OFSI consolidated list stored in this workspace. This records an audit result and does not change a booking or customer record.',
  'multideck_dexter_action_run_screening_check',
  '{"type":"object","properties":{"subject_name":{"type":"string","description":"The party name to screen."},"country":{"type":["string","null"],"description":"Optional country hint."},"org_id":{"type":["string","null"],"description":"Optional customer organisation recordId."},"reason":{"type":"string","description":"Why this screen is being run."}},"required":["subject_name","reason"],"additionalProperties":false}'::jsonb,
  26,
  true,
  now(),
  '["Screening.Write"]'::jsonb,
  'run_screening_check',
  false
)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode" = excluded."AIDexterAction_DomainCode",
  "AIDexterAction_Name" = excluded."AIDexterAction_Name",
  "AIDexterAction_Description" = excluded."AIDexterAction_Description",
  "AIDexterAction_Function" = excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON" = excluded."AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder" = excluded."AIDexterAction_SortOrder",
  "AIDexterAction_IsActive" = true,
  "AIDexterAction_RequiredPermissionsJSON" = excluded."AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_IntentFamily" = excluded."AIDexterAction_IntentFamily",
  "AIDexterAction_HasExternalEffect" = excluded."AIDexterAction_HasExternalEffect",
  "AIDexterAction_UpdatedAt" = now();

insert into public."sys_AIDexterWatchCapabilities" (
  "AIDexterWatchCapability_Code",
  "AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_SortOrder",
  "AIDexterWatchCapability_IsActive",
  "AIDexterWatchCapability_UpdatedAt",
  "AIDexterWatchCapability_RequiredPermissionsJSON"
) values (
  'screening',
  'Party screening',
  'New screening outcomes, possible matches, and UK OFSI list refresh events.',
  '["outcome","subjectName","matchCount","listStatus","entryCount","orgId"]'::jsonb,
  26,
  true,
  now(),
  '["Screening.Read"]'::jsonb
)
on conflict ("AIDexterWatchCapability_Code") do update set
  "AIDexterWatchCapability_Name" = excluded."AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description" = excluded."AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON" = excluded."AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_SortOrder" = excluded."AIDexterWatchCapability_SortOrder",
  "AIDexterWatchCapability_IsActive" = true,
  "AIDexterWatchCapability_RequiredPermissionsJSON" = excluded."AIDexterWatchCapability_RequiredPermissionsJSON",
  "AIDexterWatchCapability_UpdatedAt" = now();

create or replace function public._multideck_dexter_screening_signal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_id uuid;
  v_source_id uuid;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'CMP_ScreeningChecks' then
    v_company_id := new."ScreeningCheck_CompanyID";
    v_source_id := coalesce(new."ScreeningCheck_OrgID", new."ScreeningCheck_ID");
    v_new := jsonb_build_object(
      'outcome', new."ScreeningCheck_OutcomeCode",
      'subjectName', new."ScreeningCheck_SubjectName",
      'matchCount', new."ScreeningCheck_MatchCount",
      'orgId', new."ScreeningCheck_OrgID"
    );
  else
    if new."ScreeningListSnapshot_StatusCode" is distinct from 'current' then
      return new;
    end if;
    if tg_op = 'UPDATE' and old."ScreeningListSnapshot_StatusCode" = 'current' then
      return new;
    end if;
    select company."Company_ID" into v_company_id
    from public."cmp_Company" company
    limit 1;
    v_source_id := new."ScreeningListSnapshot_ID";
    v_new := jsonb_build_object(
      'listStatus', new."ScreeningListSnapshot_StatusCode",
      'entryCount', new."ScreeningListSnapshot_EntryCount"
    );
  end if;

  if v_company_id is not null and v_source_id is not null and exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = v_company_id
      and watch."AIDexterWatch_CapabilityCode" = 'screening'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = v_source_id)
  ) then
    insert into public."AI_DexterWatchSignals" (
      "AIDexterWatchSignal_CompanyID",
      "AIDexterWatchSignal_CapabilityCode",
      "AIDexterWatchSignal_SourceTable",
      "AIDexterWatchSignal_SourceID",
      "AIDexterWatchSignal_OldJSON",
      "AIDexterWatchSignal_NewJSON"
    ) values (v_company_id, 'screening', tg_table_name, v_source_id, v_old, v_new);
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_CMP_ScreeningChecks_dexter_watch" on public."CMP_ScreeningChecks";
create trigger "TR_CMP_ScreeningChecks_dexter_watch"
after insert on public."CMP_ScreeningChecks"
for each row execute function public._multideck_dexter_screening_signal();

drop trigger if exists "TR_sys_ScreeningListSnapshots_dexter_watch" on public."sys_ScreeningListSnapshots";
create trigger "TR_sys_ScreeningListSnapshots_dexter_watch"
after insert or update of "ScreeningListSnapshot_StatusCode" on public."sys_ScreeningListSnapshots"
for each row execute function public._multideck_dexter_screening_signal();

create or replace function public."CMP_GetScreeningListWorkerSecret"()
returns text
language sql
stable
security definer
set search_path = pg_catalog, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'multideck_screening_list_worker_secret'
  limit 1;
$$;

revoke all on function public."CMP_GetScreeningListWorkerSecret"() from public, anon, authenticated;
grant execute on function public."CMP_GetScreeningListWorkerSecret"() to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public."CMP_ConfigureScreeningListWorkerSchedule"()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_endpoint text;
begin
  select decrypted_secret
  into v_endpoint
  from vault.decrypted_secrets
  where name = 'multideck_screening_list_worker_endpoint'
  limit 1;

  if nullif(btrim(v_endpoint), '') is null then
    return false;
  end if;

  perform cron.schedule(
    'multideck-screening-list-worker',
    '20 6,18 * * *',
    format(
      $command$
        select net.http_post(
          url := %L,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-multideck-screening-list-secret', (
              select decrypted_secret
              from vault.decrypted_secrets
              where name = 'multideck_screening_list_worker_secret'
              limit 1
            )
          ),
          body := jsonb_build_object('source', 'cron', 'requestedAt', now()),
          timeout_milliseconds := 120000
        );
      $command$,
      btrim(v_endpoint)
    )
  );

  return true;
end;
$$;

revoke all on function public."CMP_ConfigureScreeningListWorkerSchedule"()
  from public, anon, authenticated, service_role;

select public."CMP_ConfigureScreeningListWorkerSchedule"();

commit;
