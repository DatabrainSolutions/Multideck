-- Automatic refresh is tenant-local maintenance. Only service_role can claim or
-- publish a download; callers retain the existing Screening permissions.
alter table public."sys_ScreeningListSources"
  add column if not exists "ScreeningListSource_RefreshToken" uuid,
  add column if not exists "ScreeningListSource_RefreshExpiresAt" timestamptz;
alter table public."sys_ScreeningListSnapshots"
  add column if not exists "ScreeningListSnapshot_FeedUrl" text;

-- Preserve the source identity already deployed in this tenant. A retired source
-- is never reactivated, renamed or re-labelled by this compatibility migration.
-- This supersedes the unapplied legacy-only 20260903120000 prerequisite.
create or replace function public._cmp_screening_refresh_source_code()
returns text language sql stable security definer
set search_path = pg_catalog, public as $$
  select "ScreeningListSource_Code" from public."sys_ScreeningListSources"
  where "ScreeningListSource_Code" in ('uk_sanctions_list','uk_ofsi_consolidated')
    and "ScreeningListSource_IsActive"
    and "ScreeningListSource_DownloadUrl" = 'https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.csv'
  order by ("ScreeningListSource_Code" = 'uk_sanctions_list') desc
  limit 1;
$$;
revoke all on function public._cmp_screening_refresh_source_code() from public, anon, authenticated;
grant execute on function public._cmp_screening_refresh_source_code() to service_role;

create or replace function public.cmp_screening_list_status()
returns jsonb language sql stable security definer
set search_path = pg_catalog, public as $$
  select coalesce((select jsonb_build_object(
    'loaded', snapshot."ScreeningListSnapshot_ID" is not null,
    'sourceCode', source."ScreeningListSource_Code",
    'sourceName', source."ScreeningListSource_Name",
    'publisher', source."ScreeningListSource_Publisher",
    'snapshotId', snapshot."ScreeningListSnapshot_ID",
    'downloadedAt', snapshot."ScreeningListSnapshot_DownloadedAt",
    'checkedAt', snapshot."ScreeningListSnapshot_CheckedAt",
    'lastAttemptAt', source."ScreeningListSource_LastAttemptAt",
    'lastSuccessAt', source."ScreeningListSource_LastSuccessAt",
    'lastError', source."ScreeningListSource_LastError",
    'entryCount', coalesce(snapshot."ScreeningListSnapshot_EntryCount", 0),
    'groupCount', coalesce(snapshot."ScreeningListSnapshot_GroupCount", 0),
    'refreshing', coalesce(source."ScreeningListSource_RefreshExpiresAt" > now(), false),
    'stale', snapshot."ScreeningListSnapshot_ID" is null
      or snapshot."ScreeningListSnapshot_FeedUrl" is distinct from source."ScreeningListSource_DownloadUrl"
      or snapshot."ScreeningListSnapshot_CheckedAt" < now() - make_interval(hours => least(12, greatest(1, source."ScreeningListSource_RefreshIntervalHours")))
      or snapshot."ScreeningListSnapshot_EntryCount" <= 0
      or source."ScreeningListSource_LastError" is not null
      or not source."ScreeningListSource_IsActive"
  ) from public."sys_ScreeningListSources" source
  left join public."sys_ScreeningListSnapshots" snapshot
    on snapshot."ScreeningListSnapshot_SourceCode" = source."ScreeningListSource_Code"
    and snapshot."ScreeningListSnapshot_StatusCode" = 'current'
  where source."ScreeningListSource_Code" = public._cmp_screening_refresh_source_code()), '{"loaded":false,"stale":true}'::jsonb);
$$;

create or replace function public.cmp_claim_screening_refresh(p_token uuid)
returns text language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_source public."sys_ScreeningListSources"; v_status jsonb;
begin
  select * into v_source from public."sys_ScreeningListSources"
  where "ScreeningListSource_Code" = public._cmp_screening_refresh_source_code() for update;
  if not found or not v_source."ScreeningListSource_IsActive" then
    raise exception 'The UK Sanctions List source is unavailable.';
  end if;
  if v_source."ScreeningListSource_RefreshExpiresAt" > now() then return 'busy'; end if;
  v_status := public.cmp_screening_list_status();
  if not (v_status->>'stale')::boolean then return 'current'; end if;
  -- A shared cooldown also covers a crashed/expired worker, not just HTTP errors.
  if v_source."ScreeningListSource_LastAttemptAt" > now() - interval '1 minute' then return 'cooldown'; end if;
  update public."sys_ScreeningListSources" set
    "ScreeningListSource_RefreshToken" = p_token,
    "ScreeningListSource_RefreshExpiresAt" = now() + interval '5 minutes',
    "ScreeningListSource_LastAttemptAt" = now()
  where "ScreeningListSource_Code" = public._cmp_screening_refresh_source_code();
  return 'acquired';
end;
$$;

create or replace function public.cmp_finish_screening_refresh(p_token uuid, p_snapshot_id uuid, p_hash text, p_entry_count integer, p_group_count integer)
returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_source public."sys_ScreeningListSources"; v_snapshot public."sys_ScreeningListSnapshots"; v_count integer;
begin
  select * into v_source from public."sys_ScreeningListSources"
  where "ScreeningListSource_Code" = public._cmp_screening_refresh_source_code() for update;
  if v_source."ScreeningListSource_RefreshToken" is distinct from p_token
    or v_source."ScreeningListSource_RefreshExpiresAt" is null
    or v_source."ScreeningListSource_RefreshExpiresAt" <= now() then
    raise exception 'The sanctions refresh lease expired. Retry the check.';
  end if;
  select * into v_snapshot from public."sys_ScreeningListSnapshots"
  where "ScreeningListSnapshot_ID" = p_snapshot_id and "ScreeningListSnapshot_SourceCode" = public._cmp_screening_refresh_source_code() for update;
  if not found or v_snapshot."ScreeningListSnapshot_StatusCode" not in ('importing', 'current')
    or v_snapshot."ScreeningListSnapshot_FeedUrl" is distinct from v_source."ScreeningListSource_DownloadUrl" then
    raise exception 'The downloaded sanctions snapshot is not valid.';
  end if;
  select count(*) into v_count from public."sys_ScreeningListEntries" where "ScreeningListEntry_SnapshotID" = p_snapshot_id;
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_entry_count is null or p_group_count is null
    or p_entry_count <= 0 or p_group_count <= 0 or v_count <> p_entry_count then
    raise exception 'The sanctions download is incomplete. The previous list was preserved.';
  end if;
  if v_snapshot."ScreeningListSnapshot_StatusCode" = 'current' and v_snapshot."ScreeningListSnapshot_ContentSha256" <> p_hash then
    raise exception 'The sanctions content changed and must be imported.';
  end if;
  -- Publication and success evidence commit together. Readers never see half an import.
  update public."sys_ScreeningListSnapshots" set "ScreeningListSnapshot_StatusCode" = 'superseded'
    where "ScreeningListSnapshot_SourceCode" = public._cmp_screening_refresh_source_code()
      and "ScreeningListSnapshot_StatusCode" = 'current' and "ScreeningListSnapshot_ID" <> p_snapshot_id;
  update public."sys_ScreeningListSnapshots" set
    "ScreeningListSnapshot_StatusCode" = 'current', "ScreeningListSnapshot_ContentSha256" = p_hash,
    "ScreeningListSnapshot_EntryCount" = p_entry_count, "ScreeningListSnapshot_GroupCount" = p_group_count,
    "ScreeningListSnapshot_CheckedAt" = now()
    where "ScreeningListSnapshot_ID" = p_snapshot_id;
  update public."sys_ScreeningListSources" set
    "ScreeningListSource_LastSuccessAt" = now(), "ScreeningListSource_LastError" = null,
    "ScreeningListSource_RefreshToken" = null, "ScreeningListSource_RefreshExpiresAt" = null
    where "ScreeningListSource_Code" = public._cmp_screening_refresh_source_code();
end;
$$;

create or replace function public.cmp_fail_screening_refresh(p_token uuid, p_message text)
returns void language sql security definer set search_path = pg_catalog, public as $$
  update public."sys_ScreeningListSources" set
    "ScreeningListSource_LastError" = left(coalesce(p_message, 'The sanctions list could not be checked.'), 500),
    "ScreeningListSource_RefreshToken" = null, "ScreeningListSource_RefreshExpiresAt" = null
  where "ScreeningListSource_Code" = public._cmp_screening_refresh_source_code() and "ScreeningListSource_RefreshToken" = p_token;
$$;

revoke all on function public.cmp_claim_screening_refresh(uuid), public.cmp_finish_screening_refresh(uuid, uuid, text, integer, integer), public.cmp_fail_screening_refresh(uuid, text) from public, anon, authenticated;
grant execute on function public.cmp_claim_screening_refresh(uuid), public.cmp_finish_screening_refresh(uuid, uuid, text, integer, integer), public.cmp_fail_screening_refresh(uuid, text) to service_role;

update public."sys_AIDexterDataDomains" set "AIDexterDomain_Description" = 'UK Sanctions List freshness and completed screening evidence. Automatic refresh failure or an expired check prevents a reliable no-match result.' where "AIDexterDomain_Code" = 'screening';
update public."sys_AIDexterActions" set "AIDexterAction_Description" = 'Screen a party against the UK Sanctions List. The approved action automatically checks list freshness before recording an audited result. A failed refresh returns unavailable, never clearance.' where "AIDexterAction_Code" = 'run_screening_check';
update public."sys_AIDexterWatchCapabilities" set "AIDexterWatchCapability_Description" = 'New screening outcomes, decisions, rescreen due dates and successfully published UK Sanctions List changes. Unchanged list checks do not fire an event.' where "AIDexterWatchCapability_Code" = 'screening';

-- Every caller, including Dexter and the legacy wrapper, shares the same safety gate.
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
  v_list jsonb;
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

  -- Lock source state through the check, so publication/failure cannot race this result.
  perform 1 from public."sys_ScreeningListSources" where "ScreeningListSource_Code" = public._cmp_screening_refresh_source_code() for share;
  v_list := public.cmp_screening_list_status();
  select snapshot."ScreeningListSnapshot_ID" as snapshot_id, snapshot."ScreeningListSnapshot_CheckedAt" as checked_at
  into v_snapshot
  from public."sys_ScreeningListSnapshots" snapshot
  where snapshot."ScreeningListSnapshot_SourceCode" = public._cmp_screening_refresh_source_code()
    and snapshot."ScreeningListSnapshot_StatusCode" = 'current';

  if v_snapshot.snapshot_id is not null and not coalesce((v_list->>'stale')::boolean, true) then
    perform set_config('pg_trgm.similarity_threshold', '0.82', true);
    perform set_config('pg_trgm.word_similarity_threshold', '0.82', true);
    v_age_hours := round(extract(epoch from (now() - v_snapshot.checked_at)) / 3600.0, 2);
    v_stale := false;

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

-- Retain legacy fuzzy matching while routing it through the same freshness guard.
create or replace function public.cmp_run_screening_check(
  p_company_id uuid, p_user_id uuid, p_subject_name text,
  p_country text default null, p_org_id uuid default null
) returns jsonb language sql volatile security definer
set search_path = pg_catalog, public as $$
  select public.cmp_run_screening_check_v2(p_company_id, p_user_id, p_subject_name, p_country, p_org_id, p_include_similar => true);
$$;

revoke all on function public.cmp_screening_list_status(), public.cmp_run_screening_check(uuid, uuid, text, text, uuid), public.cmp_run_screening_check_v2(uuid, uuid, text, text, uuid, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.cmp_screening_list_status(), public.cmp_run_screening_check(uuid, uuid, text, text, uuid), public.cmp_run_screening_check_v2(uuid, uuid, text, text, uuid, text, text, text, text, boolean) to service_role;
