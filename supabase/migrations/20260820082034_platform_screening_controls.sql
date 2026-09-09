-- Platform screening controls. These records are independent of BoxTop and
-- carry their own workflow context so a result can be used from CRM, quotes,
-- bookings, customs, documents or a standalone compliance check.

begin;

insert into public."sys_Permissions" (
  "sys_Permission_Value",
  "sys_Permission_Group",
  "sys_Permission_Name",
  "sys_Permission_Description",
  "sys_Permission_IsDangerous"
)
values (
  'Screening.Decide',
  'Customs & Compliance',
  'Resolve party screening',
  'Manually clear a reviewed name match or mark a credible sanctions concern.',
  true
)
on conflict ("sys_Permission_Value") do update
set
  "sys_Permission_Group" = excluded."sys_Permission_Group",
  "sys_Permission_Name" = excluded."sys_Permission_Name",
  "sys_Permission_Description" = excluded."sys_Permission_Description",
  "sys_Permission_IsDangerous" = excluded."sys_Permission_IsDangerous";

with role_permissions(role_name, permission_value) as (
  values
    ('Administrator', 'Screening.Decide'),
    ('Operations manager', 'Screening.Decide')
)
insert into public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
select role."sys_UserRole_ID", permission."sys_Permission_ID"
from role_permissions mapping
join public."sys_UserRoles" role on role."sys_UserRole_Name" = mapping.role_name
join public."sys_Permissions" permission on permission."sys_Permission_Value" = mapping.permission_value
on conflict do nothing;

alter table public."CMP_ScreeningChecks"
  add column if not exists "ScreeningCheck_IncludeSimilar" boolean not null default false,
  add column if not exists "ScreeningCheck_SourceArea" varchar(30) not null default 'manual',
  add column if not exists "ScreeningCheck_SourceRecordID" varchar(120),
  add column if not exists "ScreeningCheck_SourceLabel" varchar(240),
  add column if not exists "ScreeningCheck_SubjectRole" varchar(40) not null default 'party',
  add column if not exists "ScreeningCheck_DecisionCode" varchar(30),
  add column if not exists "ScreeningCheck_DecisionNote" text,
  add column if not exists "ScreeningCheck_DecidedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  add column if not exists "ScreeningCheck_DecidedAt" timestamptz,
  add column if not exists "ScreeningCheck_RescreenDueAt" timestamptz;

alter table public."CMP_ScreeningChecks"
  drop constraint if exists "CK_CMP_ScreeningChecks_source_area";
alter table public."CMP_ScreeningChecks"
  add constraint "CK_CMP_ScreeningChecks_source_area"
  check ("ScreeningCheck_SourceArea" in ('manual', 'customer', 'crm', 'quote', 'booking', 'customs', 'document', 'other'));

alter table public."CMP_ScreeningChecks"
  drop constraint if exists "CK_CMP_ScreeningChecks_decision";
alter table public."CMP_ScreeningChecks"
  add constraint "CK_CMP_ScreeningChecks_decision"
  check ("ScreeningCheck_DecisionCode" is null or "ScreeningCheck_DecisionCode" in ('automatic_clear', 'manual_clean', 'review_required', 'sanctioned', 'unavailable'));

update public."CMP_ScreeningChecks"
set
  "ScreeningCheck_DecisionCode" = case
    when "ScreeningCheck_OutcomeCode" = 'clear' and not "ScreeningCheck_ListStale" then 'automatic_clear'
    when "ScreeningCheck_OutcomeCode" = 'unavailable' or "ScreeningCheck_ListStale" then 'unavailable'
    else 'review_required'
  end,
  "ScreeningCheck_DecidedAt" = coalesce("ScreeningCheck_DecidedAt", "ScreeningCheck_CreatedAt"),
  "ScreeningCheck_RescreenDueAt" = coalesce(
    "ScreeningCheck_RescreenDueAt",
    "ScreeningCheck_CreatedAt" + case
      when "ScreeningCheck_OutcomeCode" = 'clear' and not "ScreeningCheck_ListStale" then interval '30 days'
      else interval '1 day'
    end
  )
where "ScreeningCheck_DecisionCode" is null;

alter table public."CMP_ScreeningChecks"
  alter column "ScreeningCheck_DecisionCode" set not null,
  alter column "ScreeningCheck_RescreenDueAt" set not null;

create index if not exists "IX_CMP_ScreeningChecks_company_decision_due"
  on public."CMP_ScreeningChecks" (
    "ScreeningCheck_CompanyID",
    "ScreeningCheck_DecisionCode",
    "ScreeningCheck_RescreenDueAt",
    "ScreeningCheck_CreatedAt" desc
  );
create index if not exists "IX_CMP_ScreeningChecks_source"
  on public."CMP_ScreeningChecks" (
    "ScreeningCheck_CompanyID",
    "ScreeningCheck_SourceArea",
    "ScreeningCheck_SourceRecordID",
    "ScreeningCheck_CreatedAt" desc
  );

create table if not exists public."CMP_ScreeningDecisions" (
  "ScreeningDecision_ID" uuid primary key default gen_random_uuid(),
  "ScreeningDecision_CheckID" uuid not null references public."CMP_ScreeningChecks"("ScreeningCheck_ID") on delete cascade,
  "ScreeningDecision_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "ScreeningDecision_ActionCode" varchar(30) not null,
  "ScreeningDecision_Note" text,
  "ScreeningDecision_DecidedBy" uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  "ScreeningDecision_CreatedAt" timestamptz not null default now(),
  constraint "CK_CMP_ScreeningDecisions_action"
    check ("ScreeningDecision_ActionCode" in ('manual_clean', 'sanctioned'))
);
create index if not exists "IX_CMP_ScreeningDecisions_check_created"
  on public."CMP_ScreeningDecisions" ("ScreeningDecision_CheckID", "ScreeningDecision_CreatedAt" desc);

alter table public."CMP_ScreeningDecisions" enable row level security;
revoke all on table public."CMP_ScreeningDecisions" from public, anon, authenticated;

create or replace function public.cmp_run_screening_check_v2(
  p_company_id uuid,
  p_user_id uuid,
  p_subject_name text,
  p_country text default null,
  p_org_id uuid default null,
  p_source_area text default 'manual',
  p_source_record_id text default null,
  p_source_label text default null,
  p_subject_role text default 'party',
  p_include_similar boolean default false
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
  v_decision text := 'unavailable';
  v_match_count integer := 0;
  v_age_hours numeric(10, 2) := null;
  v_stale boolean := true;
  v_matches jsonb := '[]'::jsonb;
  v_source_area text := lower(coalesce(nullif(btrim(p_source_area), ''), 'manual'));
  v_subject_role text := lower(coalesce(nullif(btrim(p_subject_role), ''), 'party'));
  v_rescreen_due_at timestamptz;
begin
  if v_normalized is null or char_length(v_normalized) < 3 then
    raise exception 'Enter a party name with at least three letters.' using errcode = '22023';
  end if;
  if v_source_area not in ('manual', 'customer', 'crm', 'quote', 'booking', 'customs', 'document', 'other') then
    raise exception 'That screening context is not supported.' using errcode = '22023';
  end if;
  if p_org_id is not null and not exists (
    select 1 from public."Org_Master" organisation where organisation."Org_id" = p_org_id
  ) then
    raise exception 'That organisation is not available in this workspace.' using errcode = '22023';
  end if;

  select snapshot."ScreeningListSnapshot_ID" as snapshot_id, snapshot."ScreeningListSnapshot_DownloadedAt" as downloaded_at
  into v_snapshot
  from public."sys_ScreeningListSnapshots" snapshot
  where snapshot."ScreeningListSnapshot_SourceCode" = 'uk_ofsi_consolidated'
    and snapshot."ScreeningListSnapshot_StatusCode" = 'current';

  if v_snapshot.snapshot_id is not null then
    perform set_config('pg_trgm.similarity_threshold', '0.82', true);
    perform set_config('pg_trgm.word_similarity_threshold', '0.82', true);
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
        'score', case when entry."ScreeningListEntry_NormalizedName" = v_normalized then 1 else round(greatest(extensions.similarity(v_normalized, entry."ScreeningListEntry_NormalizedName"), extensions.word_similarity(v_normalized, entry."ScreeningListEntry_NormalizedName"))::numeric, 4) end,
        'regime', entry."ScreeningListEntry_Regime",
        'groupType', entry."ScreeningListEntry_GroupType",
        'listedOn', entry."ScreeningListEntry_ListedOn",
        'ukRef', entry."ScreeningListEntry_UkRef",
        'country', entry."ScreeningListEntry_Country",
        'listingNotes', entry."ScreeningListEntry_OtherInformation"
      ) as match_row
      from public."sys_ScreeningListEntries" entry
      where entry."ScreeningListEntry_SnapshotID" = v_snapshot.snapshot_id
        and (
          entry."ScreeningListEntry_NormalizedName" = v_normalized
          or (coalesce(p_include_similar, false) and (entry."ScreeningListEntry_NormalizedName" % v_normalized or v_normalized <% entry."ScreeningListEntry_NormalizedName"))
        )
      order by
        (entry."ScreeningListEntry_NormalizedName" = v_normalized) desc,
        greatest(extensions.similarity(v_normalized, entry."ScreeningListEntry_NormalizedName"), extensions.word_similarity(v_normalized, entry."ScreeningListEntry_NormalizedName")) desc
    ) ranked;
    v_match_count := jsonb_array_length(v_matches);
    v_outcome := case
      when exists (select 1 from jsonb_array_elements(v_matches) item where item->>'matchKind' = 'exact') then 'match'
      when v_match_count > 0 then 'possible_match'
      else 'clear'
    end;
    v_decision := case
      when v_stale then 'unavailable'
      when v_match_count > 0 then 'review_required'
      else 'automatic_clear'
    end;
  end if;

  v_rescreen_due_at := now() + case when v_decision = 'automatic_clear' then interval '30 days' else interval '1 day' end;
  insert into public."CMP_ScreeningChecks" (
    "ScreeningCheck_ID", "ScreeningCheck_CompanyID", "ScreeningCheck_CreatedBy", "ScreeningCheck_OrgID", "ScreeningCheck_SnapshotID",
    "ScreeningCheck_SubjectName", "ScreeningCheck_NormalizedName", "ScreeningCheck_Country", "ScreeningCheck_OutcomeCode", "ScreeningCheck_MatchCount",
    "ScreeningCheck_ListAgeHours", "ScreeningCheck_ListStale", "ScreeningCheck_IncludeSimilar", "ScreeningCheck_SourceArea", "ScreeningCheck_SourceRecordID",
    "ScreeningCheck_SourceLabel", "ScreeningCheck_SubjectRole", "ScreeningCheck_DecisionCode", "ScreeningCheck_DecidedAt", "ScreeningCheck_RescreenDueAt"
  ) values (
    v_check_id, p_company_id, p_user_id, p_org_id, v_snapshot.snapshot_id, btrim(p_subject_name), v_normalized, nullif(btrim(p_country), ''),
    v_outcome, v_match_count, v_age_hours, v_stale, coalesce(p_include_similar, false), v_source_area, nullif(btrim(p_source_record_id), ''),
    nullif(btrim(p_source_label), ''), v_subject_role, v_decision, now(), v_rescreen_due_at
  );

  insert into public."CMP_ScreeningMatches" (
    "ScreeningMatch_CheckID", "ScreeningMatch_EntryID", "ScreeningMatch_GroupId", "ScreeningMatch_ListedName", "ScreeningMatch_MatchKind",
    "ScreeningMatch_Score", "ScreeningMatch_Regime", "ScreeningMatch_GroupType", "ScreeningMatch_ListedOn", "ScreeningMatch_UkRef", "ScreeningMatch_Country", "ScreeningMatch_ListingNotes"
  )
  select v_check_id, nullif(item->>'entryId', '')::uuid, item->>'groupId', item->>'listedName', item->>'matchKind', (item->>'score')::numeric,
    item->>'regime', item->>'groupType', nullif(item->>'listedOn', '')::date, item->>'ukRef', item->>'country', nullif(item->>'listingNotes', '')
  from jsonb_array_elements(v_matches) item;

  return jsonb_build_object(
    'id', v_check_id, 'subjectName', btrim(p_subject_name), 'country', nullif(btrim(p_country), ''), 'orgId', p_org_id,
    'outcome', v_outcome, 'matchCount', v_match_count, 'totalCount', v_match_count, 'listAgeHours', v_age_hours, 'listStale', v_stale,
    'includeSimilar', coalesce(p_include_similar, false), 'sourceArea', v_source_area, 'sourceRecordId', nullif(btrim(p_source_record_id), ''),
    'sourceLabel', nullif(btrim(p_source_label), ''), 'subjectRole', v_subject_role, 'decisionCode', v_decision,
    'decisionAt', now(), 'rescreenDueAt', v_rescreen_due_at, 'createdAt', now(), 'matches', v_matches
  );
end;
$$;

create or replace function public.cmp_decide_screening_check(
  p_company_id uuid,
  p_user_id uuid,
  p_check_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_check public."CMP_ScreeningChecks"%rowtype;
  v_action text := lower(btrim(p_action));
  v_due_at timestamptz;
begin
  if v_action not in ('manual_clean', 'sanctioned') then
    raise exception 'Choose clean or sanctioned.' using errcode = '22023';
  end if;
  select * into v_check
  from public."CMP_ScreeningChecks"
  where "ScreeningCheck_ID" = p_check_id and "ScreeningCheck_CompanyID" = p_company_id
  for update;
  if not found then
    raise exception 'That screening result is not available.' using errcode = '22023';
  end if;
  if v_check."ScreeningCheck_DecisionCode" not in ('review_required', 'manual_clean', 'sanctioned') then
    raise exception 'Only a review item can be resolved manually.' using errcode = '22023';
  end if;
  v_due_at := now() + case when v_action = 'manual_clean' then interval '30 days' else interval '1 day' end;
  insert into public."CMP_ScreeningDecisions" (
    "ScreeningDecision_CheckID", "ScreeningDecision_CompanyID", "ScreeningDecision_ActionCode", "ScreeningDecision_Note", "ScreeningDecision_DecidedBy"
  ) values (p_check_id, p_company_id, v_action, nullif(btrim(p_note), ''), p_user_id);
  update public."CMP_ScreeningChecks"
  set
    "ScreeningCheck_DecisionCode" = v_action,
    "ScreeningCheck_DecisionNote" = nullif(btrim(p_note), ''),
    "ScreeningCheck_DecidedBy" = p_user_id,
    "ScreeningCheck_DecidedAt" = now(),
    "ScreeningCheck_RescreenDueAt" = v_due_at
  where "ScreeningCheck_ID" = p_check_id;
  return jsonb_build_object('id', p_check_id, 'decisionCode', v_action, 'decisionAt', now(), 'rescreenDueAt', v_due_at);
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
          'decisionCode', check_row."ScreeningCheck_DecisionCode",
          'matchCount', check_row."ScreeningCheck_MatchCount",
          'sourceArea', check_row."ScreeningCheck_SourceArea",
          'sourceRecordId', check_row."ScreeningCheck_SourceRecordID",
          'sourceLabel', check_row."ScreeningCheck_SourceLabel",
          'subjectRole', check_row."ScreeningCheck_SubjectRole",
          'rescreenDueAt', check_row."ScreeningCheck_RescreenDueAt",
          'orgId', check_row."ScreeningCheck_OrgID",
          'country', check_row."ScreeningCheck_Country",
          'listStale', check_row."ScreeningCheck_ListStale",
          'createdAt', check_row."ScreeningCheck_CreatedAt",
          'searchEvidence', evidence.value - 'matched'
        ) as row_data,
        coalesce((evidence.value->>'confidence')::numeric, 0) as search_rank,
        check_row."ScreeningCheck_CreatedAt" as created_at
        from public."CMP_ScreeningChecks" check_row
        cross join lateral public._multideck_dexter_search_evidence(
          p_search,
          jsonb_build_object('recordId', check_row."ScreeningCheck_ID", 'subjectName', check_row."ScreeningCheck_SubjectName", 'sourceLabel', check_row."ScreeningCheck_SourceLabel", 'sourceArea', check_row."ScreeningCheck_SourceArea", 'outcome', check_row."ScreeningCheck_OutcomeCode"),
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
  return public.cmp_run_screening_check_v2(
    p_company_id, p_user_id, p_arguments->>'subject_name', p_arguments->>'country', v_org_id,
    coalesce(p_arguments->>'source_area', 'manual'), p_arguments->>'source_record_id', p_arguments->>'source_label',
    coalesce(p_arguments->>'subject_role', 'party'), coalesce((p_arguments->>'include_similar')::boolean, false)
  );
end;
$$;

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
    v_old := case when tg_op = 'UPDATE' then jsonb_build_object('decisionCode', old."ScreeningCheck_DecisionCode", 'rescreenDueAt', old."ScreeningCheck_RescreenDueAt") else '{}'::jsonb end;
    v_new := jsonb_build_object('outcome', new."ScreeningCheck_OutcomeCode", 'decisionCode', new."ScreeningCheck_DecisionCode", 'subjectName', new."ScreeningCheck_SubjectName", 'matchCount', new."ScreeningCheck_MatchCount", 'sourceArea', new."ScreeningCheck_SourceArea", 'sourceRecordId', new."ScreeningCheck_SourceRecordID", 'subjectRole', new."ScreeningCheck_SubjectRole", 'orgId', new."ScreeningCheck_OrgID", 'rescreenDueAt', new."ScreeningCheck_RescreenDueAt");
  else
    if new."ScreeningListSnapshot_StatusCode" is distinct from 'current' or (tg_op = 'UPDATE' and old."ScreeningListSnapshot_StatusCode" = 'current') then return new; end if;
    select company."Company_ID" into v_company_id from public."cmp_Company" company limit 1;
    v_source_id := new."ScreeningListSnapshot_ID";
    v_new := jsonb_build_object('listStatus', new."ScreeningListSnapshot_StatusCode", 'entryCount', new."ScreeningListSnapshot_EntryCount");
  end if;
  if v_company_id is not null and v_source_id is not null and exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = v_company_id and watch."AIDexterWatch_CapabilityCode" = 'screening' and watch."AIDexterWatch_StatusCode" = 'active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = v_source_id)
  ) then
    insert into public."AI_DexterWatchSignals" ("AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode", "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID", "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON")
    values (v_company_id, 'screening', tg_table_name, v_source_id, v_old, v_new);
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_CMP_ScreeningChecks_dexter_watch" on public."CMP_ScreeningChecks";
create trigger "TR_CMP_ScreeningChecks_dexter_watch"
after insert or update of "ScreeningCheck_DecisionCode", "ScreeningCheck_RescreenDueAt" on public."CMP_ScreeningChecks"
for each row execute function public._multideck_dexter_screening_signal();

update public."sys_AIDexterDataDomains"
set
  "AIDexterDomain_Description" = 'UK sanctions-list freshness and party screening controls, including workflow context, review decisions and rescreen dates.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'screening';

update public."sys_AIDexterActions"
set
  "AIDexterAction_Description" = 'Screen one party using the current UK sanctions list and retain the workflow context. Dexter proposes the action and the user approves it before it runs.',
  "AIDexterAction_ParametersJSON" = '{"type":"object","properties":{"subject_name":{"type":"string","description":"The party name to screen."},"country":{"type":["string","null"],"description":"Optional country hint."},"org_id":{"type":["string","null"],"description":"Optional organisation recordId."},"source_area":{"type":"string","enum":["manual","customer","crm","quote","booking","customs","document","other"]},"source_record_id":{"type":["string","null"]},"source_label":{"type":["string","null"]},"subject_role":{"type":"string"},"include_similar":{"type":"boolean"},"reason":{"type":"string","description":"Why this screen is being run."}},"required":["subject_name","reason"],"additionalProperties":false}'::jsonb,
  "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'run_screening_check';

revoke all on function public.cmp_run_screening_check_v2(uuid, uuid, text, text, uuid, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.cmp_decide_screening_check(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_screening(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_run_screening_check(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.cmp_run_screening_check_v2(uuid, uuid, text, text, uuid, text, text, text, text, boolean) to service_role;
grant execute on function public.cmp_decide_screening_check(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.multideck_dexter_domain_screening(uuid, text, integer) to service_role;
grant execute on function public.multideck_dexter_action_run_screening_check(uuid, uuid, jsonb) to service_role;

commit;
