-- Run by screening-freshness-database.test.mjs in a disposable local cluster.
insert into "cmp_Company" values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
insert into "cmp_Users" values ('00000000-0000-0000-0000-000000000001');
insert into "AI_DexterWatches" values ('00000000-0000-0000-0000-000000000001', 'screening', 'active', null);

do $$
declare
  snapshot_id uuid := gen_random_uuid(); token uuid := gen_random_uuid(); replacement uuid := gen_random_uuid();
  company_id uuid := '00000000-0000-0000-0000-000000000001';
  status jsonb; result jsonb; signal_count integer;
begin
  assert (public.cmp_screening_list_status()->>'stale')::boolean, 'empty list must be stale';
  assert public.cmp_claim_screening_refresh(token) = 'acquired';
  assert public.cmp_claim_screening_refresh(replacement) = 'busy', 'concurrent callers must not acquire another lease';

  insert into "sys_ScreeningListSnapshots" ("ScreeningListSnapshot_ID","ScreeningListSnapshot_SourceCode","ScreeningListSnapshot_ContentSha256","ScreeningListSnapshot_DownloadedAt","ScreeningListSnapshot_StatusCode","ScreeningListSnapshot_FeedUrl")
  values (snapshot_id,'uk_ofsi_consolidated',repeat('0',64),now()-interval '14 days','importing','https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.csv');
  insert into "sys_ScreeningListEntries" ("ScreeningListEntry_SnapshotID","ScreeningListEntry_GroupId","ScreeningListEntry_Name","ScreeningListEntry_NormalizedName") values (snapshot_id,'RUS1','Alfa Shipping','alfa shipping');
  begin
    perform public.cmp_finish_screening_refresh(token,snapshot_id,repeat('a',64),2,1);
    raise exception 'incomplete import was published';
  exception when raise_exception then
    if sqlerrm = 'incomplete import was published' then raise; end if;
  end;
  assert (public.cmp_screening_list_status()->>'loaded')::boolean = false;
  perform public.cmp_finish_screening_refresh(token,snapshot_id,repeat('a',64),1,1);
  status := public.cmp_screening_list_status();
  assert not (status->>'stale')::boolean, 'verified old download must be usable';
  assert (status->>'downloadedAt')::timestamptz < now()-interval '13 days', 'download date must remain historical';
  assert (status->>'checkedAt')::timestamptz = now();
  assert public.cmp_claim_screening_refresh(token) = 'current', 'fresh verified list must be reused';
  select count(*) into signal_count from "AI_DexterWatchSignals";
  assert signal_count = 1, 'a published snapshot fires one watch event';
  assert not exists(select 1 from "AI_DexterWatchSignals" where "AIDexterWatchSignal_CompanyID" <> company_id), 'list signals stay in the tenant company';

  result := public.cmp_run_screening_check_v2(company_id,company_id,'Unlisted Example');
  assert result->>'outcome' = 'clear' and result->>'decisionCode' = 'automatic_clear';
  result := public.cmp_run_screening_check_v2(company_id,company_id,'Alfa Shipping');
  assert result->>'outcome' = 'match' and result->>'decisionCode' = 'review_required';

  -- Unchanged content renews evidence but must not trigger list-change watches.
  update "sys_ScreeningListSnapshots" set "ScreeningListSnapshot_CheckedAt" = now()-interval '13 hours' where "ScreeningListSnapshot_ID"=snapshot_id;
  update "sys_ScreeningListSources" set "ScreeningListSource_LastAttemptAt"=now()-interval '2 minutes';
  assert (public.cmp_screening_list_status()->>'stale')::boolean;
  assert public.cmp_claim_screening_refresh(token) = 'acquired';
  perform public.cmp_finish_screening_refresh(token,snapshot_id,repeat('a',64),1,1);
  assert (select count(*) from "AI_DexterWatchSignals" where "AIDexterWatchSignal_SourceTable"='sys_ScreeningListSnapshots') = 1;

  -- Retired content is stale even when recently downloaded or checked.
  update "sys_ScreeningListSnapshots" set "ScreeningListSnapshot_FeedUrl" = null where "ScreeningListSnapshot_ID"=snapshot_id;
  assert (public.cmp_screening_list_status()->>'stale')::boolean;
  result := public.cmp_run_screening_check_v2(company_id,company_id,'Unlisted Example');
  assert result->>'outcome' = 'unavailable', 'old-feed no-match must not be returned';
  update "sys_ScreeningListSnapshots" set "ScreeningListSnapshot_FeedUrl"='https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.csv', "ScreeningListSnapshot_CheckedAt"=now()-interval '13 hours' where "ScreeningListSnapshot_ID"=snapshot_id;
  update "sys_ScreeningListSources" set "ScreeningListSource_LastAttemptAt"=now()-interval '2 minutes';
  assert public.cmp_claim_screening_refresh(token) = 'acquired';
  perform public.cmp_fail_screening_refresh(token,'Provider unavailable');
  assert public.cmp_claim_screening_refresh(replacement) = 'cooldown', 'provider failure must not cause a refresh storm';
  assert (public.cmp_screening_list_status()->>'stale')::boolean;
  result := public.cmp_run_screening_check_v2(company_id,company_id,'Unlisted Example');
  assert result->>'outcome' = 'unavailable' and result->>'decisionCode' = 'unavailable';
  result := public.cmp_run_screening_check(company_id,company_id,'Unlisted Example');
  assert result->>'outcome' = 'unavailable', 'legacy entry point must fail closed too';

  -- A crashed worker may expire, but cannot publish after another worker claims.
  update "sys_ScreeningListSources" set "ScreeningListSource_LastAttemptAt"=now()-interval '2 minutes';
  assert public.cmp_claim_screening_refresh(token) = 'acquired';
  update "sys_ScreeningListSources" set "ScreeningListSource_RefreshExpiresAt"=now()-interval '1 second', "ScreeningListSource_LastAttemptAt"=now()-interval '6 minutes';
  assert public.cmp_claim_screening_refresh(replacement) = 'acquired';
  begin
    perform public.cmp_finish_screening_refresh(token,snapshot_id,repeat('a',64),1,1);
    raise exception 'expired lease published';
  exception when raise_exception then
    if sqlerrm = 'expired lease published' then raise; end if;
  end;
  perform public.cmp_fail_screening_refresh(token,'Old worker error');
  assert (select "ScreeningListSource_RefreshToken" from "sys_ScreeningListSources") = replacement;
  perform public.cmp_finish_screening_refresh(replacement,snapshot_id,repeat('a',64),1,1);
  assert not (public.cmp_screening_list_status()->>'stale')::boolean;

  assert not has_function_privilege('anon','public.cmp_claim_screening_refresh(uuid)','execute');
  assert not has_function_privilege('authenticated','public.cmp_finish_screening_refresh(uuid,uuid,text,integer,integer)','execute');
  assert not has_function_privilege('authenticated','public.cmp_run_screening_check(uuid,uuid,text,text,uuid)','execute');
  assert not has_function_privilege('authenticated','public.cmp_run_screening_check_v2(uuid,uuid,text,text,uuid,text,text,text,text,boolean)','execute');
  assert has_function_privilege('service_role','public.cmp_finish_screening_refresh(uuid,uuid,text,integer,integer)','execute');

  -- Pause blocks matching signal production; unrelated watch targets do not fire.
  update "AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused';
  select count(*) into signal_count from "AI_DexterWatchSignals";
  perform public.cmp_run_screening_check_v2(company_id,company_id,'Unlisted Example');
  assert (select count(*) from "AI_DexterWatchSignals") = signal_count;
  update "AI_DexterWatches" set "AIDexterWatch_StatusCode"='active', "AIDexterWatch_TargetID"=gen_random_uuid();
  perform public.cmp_run_screening_check_v2(company_id,company_id,'Unlisted Example');
  assert (select count(*) from "AI_DexterWatchSignals") = signal_count;
  update "AI_DexterWatches" set "AIDexterWatch_TargetID"=null;
  perform public.cmp_run_screening_check_v2(company_id,company_id,'Unlisted Example');
  assert (select count(*) from "AI_DexterWatchSignals") = signal_count+1;
end;
$$;
