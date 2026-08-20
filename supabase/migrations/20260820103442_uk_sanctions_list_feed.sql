-- Replace the retired OFSI Consolidated List with the current UK Sanctions
-- List (UKSL), published by the FCDO. Historic OFSI snapshots remain for the
-- audit trail but cannot be treated as a current source after 28 January 2026.

begin;

insert into public."sys_ScreeningListSources" (
  "ScreeningListSource_Code",
  "ScreeningListSource_Name",
  "ScreeningListSource_Publisher",
  "ScreeningListSource_DownloadUrl",
  "ScreeningListSource_IsActive",
  "ScreeningListSource_RefreshIntervalHours"
) values (
  'uk_sanctions_list',
  'UK Sanctions List',
  'Foreign, Commonwealth & Development Office',
  'https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.csv',
  true,
  12
)
on conflict ("ScreeningListSource_Code") do update set
  "ScreeningListSource_Name" = excluded."ScreeningListSource_Name",
  "ScreeningListSource_Publisher" = excluded."ScreeningListSource_Publisher",
  "ScreeningListSource_DownloadUrl" = excluded."ScreeningListSource_DownloadUrl",
  "ScreeningListSource_IsActive" = true,
  "ScreeningListSource_RefreshIntervalHours" = excluded."ScreeningListSource_RefreshIntervalHours";

update public."sys_ScreeningListSources"
set "ScreeningListSource_IsActive" = false,
    "ScreeningListSource_LastError" = 'Retired source: OFSI Consolidated List stopped updating on 28 January 2026. UK Sanctions List is now used.'
where "ScreeningListSource_Code" = 'uk_ofsi_consolidated';

-- A fresh download timestamp of the retired feed did not make its historic
-- contents current. Existing automatic clearances must be re-screened.
update public."CMP_ScreeningChecks" check_row
set
  "ScreeningCheck_ListStale" = true,
  "ScreeningCheck_DecisionCode" = case
    when check_row."ScreeningCheck_DecisionCode" = 'automatic_clear' then 'unavailable'
    else check_row."ScreeningCheck_DecisionCode"
  end,
  "ScreeningCheck_RescreenDueAt" = now()
where exists (
  select 1
  from public."sys_ScreeningListSnapshots" snapshot
  where snapshot."ScreeningListSnapshot_ID" = check_row."ScreeningCheck_SnapshotID"
    and snapshot."ScreeningListSnapshot_SourceCode" = 'uk_ofsi_consolidated'
);

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
  where source."ScreeningListSource_Code" = 'uk_sanctions_list';

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
    'stale', v_row.downloaded_at is null or v_row.downloaded_at < now() - interval '36 hours'
  );
end;
$$;

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
  if p_org_id is not null and not exists (select 1 from public."Org_Master" organisation where organisation."Org_id" = p_org_id) then
    raise exception 'That organisation is not available in this workspace.' using errcode = '22023';
  end if;

  select snapshot."ScreeningListSnapshot_ID" as snapshot_id, snapshot."ScreeningListSnapshot_DownloadedAt" as downloaded_at
  into v_snapshot
  from public."sys_ScreeningListSnapshots" snapshot
  where snapshot."ScreeningListSnapshot_SourceCode" = 'uk_sanctions_list'
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
        'entryId', grouped."ScreeningListEntry_ID",
        'groupId', grouped."ScreeningListEntry_GroupId",
        'listedName', grouped."ScreeningListEntry_Name",
        'matchKind', case when grouped.is_exact then 'exact' else 'similar' end,
        'score', round(grouped.score::numeric, 4),
        'regime', grouped."ScreeningListEntry_Regime",
        'groupType', grouped."ScreeningListEntry_GroupType",
        'listedOn', grouped."ScreeningListEntry_ListedOn",
        'ukRef', grouped."ScreeningListEntry_UkRef",
        'country', grouped."ScreeningListEntry_Country",
        'listingNotes', grouped."ScreeningListEntry_OtherInformation"
      ) as match_row
      from (
        select distinct on (candidate."ScreeningListEntry_GroupId") candidate.*
        from (
          select
            entry.*,
            entry."ScreeningListEntry_NormalizedName" = v_normalized as is_exact,
            case when entry."ScreeningListEntry_NormalizedName" = v_normalized then 1::numeric
              else greatest(extensions.similarity(v_normalized, entry."ScreeningListEntry_NormalizedName"), extensions.word_similarity(v_normalized, entry."ScreeningListEntry_NormalizedName")) end as score
          from public."sys_ScreeningListEntries" entry
          where entry."ScreeningListEntry_SnapshotID" = v_snapshot.snapshot_id
            and (
              entry."ScreeningListEntry_NormalizedName" = v_normalized
              or (coalesce(p_include_similar, false) and (entry."ScreeningListEntry_NormalizedName" % v_normalized or v_normalized <% entry."ScreeningListEntry_NormalizedName"))
            )
        ) candidate
        order by candidate."ScreeningListEntry_GroupId", candidate.is_exact desc, candidate.score desc, candidate."ScreeningListEntry_Name"
      ) grouped
    ) results;

    v_match_count := jsonb_array_length(v_matches);
    v_outcome := case
      when exists (select 1 from jsonb_array_elements(v_matches) item where item->>'matchKind' = 'exact') then 'match'
      when v_match_count > 0 then 'possible_match'
      else 'clear'
    end;
    v_decision := case when v_stale then 'unavailable' when v_match_count > 0 then 'review_required' else 'automatic_clear' end;
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

update public."sys_AIDexterDataDomains"
set "AIDexterDomain_Description" = 'UK Sanctions List freshness and party-screening controls, including workflow context, review decisions and rescreen dates.',
    "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'screening';

revoke all on function public.cmp_screening_list_status() from public, anon, authenticated;
revoke all on function public.cmp_run_screening_check_v2(uuid, uuid, text, text, uuid, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.cmp_screening_list_status() to service_role;
grant execute on function public.cmp_run_screening_check_v2(uuid, uuid, text, text, uuid, text, text, text, text, boolean) to service_role;

commit;
