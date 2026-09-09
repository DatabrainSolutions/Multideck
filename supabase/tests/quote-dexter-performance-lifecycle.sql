-- Development fixture only. Exercise real quote save and deterministic watch
-- adapters inside one transaction; no test notification or mutation is committed.
begin;
do $$
declare
  quote_id uuid; caller_id uuid; other_caller_id uuid; owner_id uuid; company_id uuid;
  watch_id uuid; payload jsonb; result jsonb; hits integer;
begin
  select quote."CusQuoteHeader_ID",actor."Auth_User_ID",actor."User_ID",actor."Company_ID"
  into strict quote_id,caller_id,owner_id,company_id
  from public."CusQuote_Header" quote join public."cmp_Users" actor on actor."User_ID"=quote."CusQuoteHeader_CreatedBy"
  where quote."CusQuoteHeader_CustomerReference"='JQ20018'
    and quote."CusQuoteHeader_ShipmentFactsJSON"::text like '%PERF-%';
  perform set_config('request.jwt.claim.sub',caller_id::text,true);
  result := public.multideck_dexter_query_domain('quotes','JQ20018',4);
  assert position(quote_id::text in result::text)>0, 'Dexter cannot read the saved quote evidence';
  select "CusQuoteVersion_SnapshotJSON"->'quote' into strict payload
  from public."CusQuote_Versions" where "CusQuoteHeader_ID"=quote_id and "CusQuoteVersion_IsCurrent";
  result := public.multideck_dexter_create_watch('quotes','PERF rollback watch','Check one matching origin change','Watch this test quote',quote_id,'PERF quote',
    '{"field":"origin","operator":"eq","value":"PERF-WATCH-MATCH"}'::jsonb,null);
  watch_id := (result->>'id')::uuid;

  perform public.quote_workflow_save_quote(caller_id,quote_id,payload||'{"loadingPoint":"PERF-WATCH-MATCH"}'::jsonb);
  select count(*) into hits from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watch_id;
  assert hits=1, 'Matching quote change must fire exactly once';
  perform public.quote_workflow_save_quote(caller_id,quote_id,payload||'{"loadingPoint":"PERF-WATCH-MATCH"}'::jsonb);
  select count(*) into hits from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watch_id;
  assert hits=1, 'Unchanged save duplicated the watch event';
  perform public.quote_workflow_save_quote(caller_id,quote_id,payload||'{"loadingPoint":"PERF-WATCH-OTHER"}'::jsonb);
  select count(*) into hits from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watch_id;
  assert hits=1, 'Non-matching change fired the watch';
  perform public.multideck_dexter_set_watch_status(watch_id,'paused');
  perform public.quote_workflow_save_quote(caller_id,quote_id,payload||'{"loadingPoint":"PERF-WATCH-MATCH"}'::jsonb);
  select count(*) into hits from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watch_id;
  assert hits=1, 'Paused watch fired';
  perform public.multideck_dexter_set_watch_status(watch_id,'active');
  perform public.quote_workflow_save_quote(caller_id,quote_id,payload||'{"loadingPoint":"PERF-WATCH-OTHER"}'::jsonb);
  perform public.quote_workflow_save_quote(caller_id,quote_id,payload||'{"loadingPoint":"PERF-WATCH-MATCH"}'::jsonb);
  select count(*) into hits from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watch_id;
  assert hits=2, 'Resumed watch did not fire once for the next matching change';
  assert (select count(*) from public."Comm_Notifications" where "CommNotif_TargetID"=watch_id and "CommNotif_UserID"=owner_id)=2,
    'Watch notifications duplicated or targeted the wrong user';

  select "Auth_User_ID" into other_caller_id from public."cmp_Users"
  where "Auth_User_ID" is not null and "Auth_User_ID"<>caller_id limit 1;
  assert other_caller_id is not null, 'A second development identity is required for isolation verification';
  perform set_config('request.jwt.claim.sub',other_caller_id::text,true);
  assert position(watch_id::text in public.multideck_dexter_list_watches()::text)=0, 'Another user can see the watch';
  begin
    perform public.multideck_dexter_set_watch_status(watch_id,'paused');
    raise exception 'Another user changed the watch';
  exception when no_data_found or insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.multideck_dexter_query_domain('quotes','JQ20018',4);
    raise exception 'Anonymous Dexter read succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select 'Dexter quote read, real save, match once, unchanged/non-match, pause/resume, notification ownership and cross-user denial passed; rolled back.' as verification;
rollback;

