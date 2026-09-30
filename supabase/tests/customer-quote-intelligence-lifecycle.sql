-- Run against the configured development project after opening JQ20035.
-- All watches, state changes, queue entries and notifications are rolled back.
begin;
do $$
declare
  quote_id uuid; company_id uuid; customer_id uuid; caller_id uuid; owner_id uuid; other_id uuid;
  watch_id uuid; missing_watch_id uuid; initial_state text; bundle jsonb; result jsonb; hits integer;
begin
  select quote."CusQuoteHeader_ID", office."Company_ID", quote."CusQuoteHeader_CustomerID", intelligence."CusQuoteIntelligence_StateCode"
    into strict quote_id,company_id,customer_id,initial_state
    from public."CusQuote_Header" quote
    join public."cmp_Offices" office on office."Office_ID"=coalesce(quote."CusQuoteHeader_OrgOfficeID",quote."OrgOffice_ID")
    join public."CusQuote_Intelligence" intelligence on intelligence."CusQuoteIntelligence_QuoteID"=quote."CusQuoteHeader_ID"
    where quote."CusQuoteHeader_CustomerReference"='JQ20035'
      and intelligence."CusQuoteIntelligence_AlgorithmVersion"='quote-intelligence-2026-09-29-v2';
  select actor."Auth_User_ID",actor."User_ID" into strict caller_id,owner_id
    from public."cmp_Users" actor where actor."Company_ID"=company_id
      and actor."Auth_User_ID" is not null and actor."User_AccessStatus"='active'
    order by actor."User_ID" limit 1;
  bundle := public.quote_intelligence_evidence(company_id,quote_id);
  assert bundle->'target'->>'customerId'=customer_id::text;
  assert not exists(select 1 from jsonb_array_elements(bundle->'quotes') q
    where q->>'customerId' is distinct from customer_id::text or q->>'id'=quote_id::text), 'History escaped the customer boundary or counted its target';
  result := public.quote_intelligence_evidence('00000000-0000-0000-0000-000000000000',quote_id);
  assert result->'target'='null'::jsonb and result->'quotes'='[]'::jsonb, 'Another company obtained quote evidence';
  assert not has_function_privilege('anon','public.quote_intelligence_evidence(uuid,uuid)','execute');
  assert not has_function_privilege('authenticated','public.quote_intelligence_evidence(uuid,uuid)','execute');

  perform set_config('request.jwt.claim.sub',caller_id::text,true);
  result := public.multideck_dexter_query_domain('quotes','JQ20035',4);
  assert position(quote_id::text in result::text)>0 and position('metricEvidence' in result::text)>0
    and position('sourceQuoteIds' in result::text)>0, 'Dexter did not receive customer-scoped source evidence';
  result := public.multideck_dexter_create_watch('quotes','Customer insights rollback check','Check calculation state','When this quote updates',quote_id,'JQ20035',
    '{"field":"intelligenceState","operator":"eq","value":"updating"}'::jsonb,null);
  watch_id := (result->>'id')::uuid;
  result := public.multideck_dexter_create_watch('quotes','Unknown baseline rollback check','Unknown is not a zero probability','When the baseline is zero',quote_id,'JQ20035',
    '{"field":"aiWinLikelihood","operator":"lte","value":"0"}'::jsonb,null);
  missing_watch_id := (result->>'id')::uuid;
  update public."CusQuote_Intelligence" set "CusQuoteIntelligence_StateCode"='building_baseline' where "CusQuoteIntelligence_QuoteID"=quote_id;
  perform public.quote_intelligence_enqueue(quote_id,owner_id,'rollback_lifecycle_test',60);
  select count(*) into hits from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watch_id;
  assert hits=1, 'Matching calculation change did not fire exactly once';
  perform public.quote_intelligence_enqueue(quote_id,owner_id,'rollback_lifecycle_test',60);
  select count(*) into hits from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watch_id;
  assert hits=1, 'Unchanged calculation duplicated a watch event';
  update public."CusQuote_Intelligence" set "CusQuoteIntelligence_StateCode"='building_baseline' where "CusQuoteIntelligence_QuoteID"=quote_id;
  assert (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watch_id)=1, 'Non-matching change fired';
  assert (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=missing_watch_id)=0, 'Missing evidence was treated as zero';
  perform public.multideck_dexter_set_watch_status(watch_id,'paused');
  perform public.quote_intelligence_enqueue(quote_id,owner_id,'rollback_lifecycle_test',60);
  assert (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watch_id)=1, 'Paused watch fired';
  perform public.multideck_dexter_set_watch_status(watch_id,'active');
  update public."CusQuote_Intelligence" set "CusQuoteIntelligence_StateCode"='building_baseline' where "CusQuoteIntelligence_QuoteID"=quote_id;
  perform public.quote_intelligence_enqueue(quote_id,owner_id,'rollback_lifecycle_test',60);
  assert (select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watch_id)=2, 'Resumed watch failed';
  assert (select count(*) from public."Comm_Notifications" where "CommNotif_TargetID"=watch_id and "CommNotif_UserID"=owner_id)=2, 'Notification ownership or deduplication failed';

  select "Auth_User_ID" into other_id from public."cmp_Users"
    where "Auth_User_ID" is not null and "Auth_User_ID"<>caller_id limit 1;
  assert other_id is not null, 'A second identity is required for denial verification';
  perform set_config('request.jwt.claim.sub',other_id::text,true);
  assert position(watch_id::text in public.multideck_dexter_list_watches()::text)=0, 'Another user can see the watch';
  begin
    perform public.multideck_dexter_set_watch_status(watch_id,'paused');
    raise exception 'Another user changed the watch';
  exception when no_data_found or insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.multideck_dexter_query_domain('quotes','JQ20035',4);
    raise exception 'Anonymous Dexter read succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select 'Customer-scoped evidence, company/anonymous denial, Dexter sources, watch match/duplicate/non-match, unknown baseline, pause/resume and cross-user denial passed; rolled back.' as verification;
rollback;
