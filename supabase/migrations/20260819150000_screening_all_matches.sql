-- Return every exact and similar OFSI hit. Fuzzy matching uses the
-- trigram index and the existing 0.82 threshold, from three letters up.

begin;

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
        'country', entry."ScreeningListEntry_Country",
        'listingNotes', entry."ScreeningListEntry_OtherInformation"
      ) as match_row
      from public."sys_ScreeningListEntries" entry
      where entry."ScreeningListEntry_SnapshotID" = v_snapshot.snapshot_id
        and (
          entry."ScreeningListEntry_NormalizedName" = v_normalized
          or entry."ScreeningListEntry_NormalizedName" % v_normalized
          or v_normalized <% entry."ScreeningListEntry_NormalizedName"
        )
      order by
        (entry."ScreeningListEntry_NormalizedName" = v_normalized) desc,
        greatest(
          extensions.similarity(v_normalized, entry."ScreeningListEntry_NormalizedName"),
          extensions.word_similarity(v_normalized, entry."ScreeningListEntry_NormalizedName")
        ) desc
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
      "ScreeningMatch_UkRef", "ScreeningMatch_Country", "ScreeningMatch_ListingNotes"
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
      item->>'country',
      nullif(item->>'listingNotes', '')
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
    'totalCount', v_match_count,
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
          'totalCount', check_row."ScreeningCheck_MatchCount",
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
          and check_row."ScreeningCheck_CreatedAt" >= now() - interval '3 months'
          and (evidence.value->>'matched')::boolean
        order by search_rank desc, check_row."ScreeningCheck_CreatedAt" desc
        limit greatest(1, least(coalesce(p_take, 10), 25))
      ) ranked
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.multideck_dexter_domain_screening(uuid, text, integer) to service_role;

commit;
