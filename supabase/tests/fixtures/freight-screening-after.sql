do $$declare signature text;begin
  if exists(select 1 from public."sys_ScreeningListSnapshots" actual full join freight_rehearsal.screening_snapshots_before previous
    using ("ScreeningListSnapshot_ID") where to_jsonb(actual)-'ScreeningListSnapshot_FeedUrl' is distinct from to_jsonb(previous))
    or exists(select 1 from public."sys_ScreeningListSnapshots" where "ScreeningListSnapshot_FeedUrl" is not null) then
    raise exception 'Screening snapshot history changed or feed provenance was invented';
  end if;
  if exists(select 1 from public."sys_ScreeningListEntries" actual full join freight_rehearsal.screening_entries_before previous
    using ("ScreeningListEntry_ID") where to_jsonb(actual) is distinct from to_jsonb(previous)) then
    raise exception 'Screening list entries changed';
  end if;
  if exists(select 1 from public."sys_ScreeningListSources" actual full join freight_rehearsal.screening_sources_before previous
    using ("ScreeningListSource_Code") where
      to_jsonb(actual)-array['ScreeningListSource_RefreshToken','ScreeningListSource_RefreshExpiresAt']
      is distinct from to_jsonb(previous)) then
    raise exception 'Screening source state changed';
  end if;
  if exists(select 1 from public."sys_ScreeningListSources" actual join freight_rehearsal.screening_sources_before previous
    using ("ScreeningListSource_Code") where actual."ScreeningListSource_Code"='uk_ofsi_consolidated'
    and to_jsonb(actual)-array['ScreeningListSource_RefreshToken','ScreeningListSource_RefreshExpiresAt'] is distinct from to_jsonb(previous)) then
    raise exception 'Unrelated screening source changed';
  end if;
  if exists(select 1 from public."sys_ScreeningListSources" where "ScreeningListSource_RefreshToken" is not null or "ScreeningListSource_RefreshExpiresAt" is not null)
    or public._cmp_screening_refresh_source_code() is distinct from 'uk_sanctions_list' then
    raise exception 'Screening prerequisite metadata incorrect';
  end if;
  if (public.cmp_screening_list_status()->>'stale')::boolean is distinct from true then
    raise exception 'Historical feed cannot become freshly verified during migration';
  end if;
  foreach signature in array array[
    'public.cmp_claim_screening_refresh(uuid)',
    'public.cmp_finish_screening_refresh(uuid,uuid,text,integer,integer)',
    'public.cmp_fail_screening_refresh(uuid,text)'] loop
    if has_function_privilege('anon',signature,'execute') or has_function_privilege('authenticated',signature,'execute')
      or not has_function_privilege('service_role',signature,'execute') then
      raise exception 'Screening refresh must remain service-only: %',signature;
    end if;
  end loop;
end $$;
