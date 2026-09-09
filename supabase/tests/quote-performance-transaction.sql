-- Development-only, rollback-only lifecycle checks. Requires the dedicated
-- PERF benchmark quote; never creates, sends or removes an operational record.
begin;
do $$
declare
  quote_id uuid;
  caller_id uuid;
  company_id uuid;
  quote_revision timestamptz;
  payload jsonb;
  result jsonb;
  original_intelligence jsonb;
  published jsonb;
  version_count integer;
begin
  select quote."CusQuoteHeader_ID", actor."Auth_User_ID", actor."Company_ID"
    into strict quote_id, caller_id, company_id
  from public."CusQuote_Header" quote
  join public."cmp_Users" actor on actor."User_ID" = quote."CusQuoteHeader_CreatedBy"
  where quote."CusQuoteHeader_CustomerReference" = 'JQ20018'
    and quote."CusQuoteHeader_ShipmentFactsJSON"::text like '%PERF-%';
  select "CusQuoteVersion_SnapshotJSON" -> 'quote' into strict payload
  from public."CusQuote_Versions" where "CusQuoteHeader_ID" = quote_id and "CusQuoteVersion_IsCurrent";
  select count(*) into version_count from public."CusQuote_Versions" where "CusQuoteHeader_ID" = quote_id;

  result := public.quote_workflow_save_quote(caller_id, quote_id, payload);
  assert (result ->> 'quoteId')::uuid = quote_id, 'Save returned a different quote';
  assert (result #>> '{version,CusQuoteVersion_Number}')::integer = version_count + 1, 'Missing committed version';
  assert result #>> '{version,CusQuoteVersion_ID}' = result ->> 'versionId', 'Version identifiers differ';
  assert jsonb_array_length(result -> 'events') = 1, 'Save must have exactly one audit event';
  assert result #>> '{events,0,CusQuoteEvent_TypeCode}' = 'saved', 'Wrong committed audit event';
  assert result -> 'readiness' = public.quote_workflow_readiness(caller_id, quote_id), 'Readiness differs from authoritative calculation';
  assert (select count(*) from public."CusQuote_Versions" where "CusQuoteHeader_ID" = quote_id and "CusQuoteVersion_IsCurrent") = 1, 'Multiple current versions';

  begin
    perform public.quote_workflow_save_quote(null, quote_id, payload);
    raise exception 'Anonymous save unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.quote_workflow_save_quote(gen_random_uuid(), quote_id, payload);
    raise exception 'Unrecognised caller unexpectedly saved';
  exception when insufficient_privilege then null;
  end;

  select coalesce("CusQuoteHeader_LastEditedDate", "CusQuoteHeader_CreatedDate") into quote_revision
  from public."CusQuote_Header" where "CusQuoteHeader_ID" = quote_id;
  select to_jsonb(snapshot) into strict original_intelligence from public."CusQuote_Intelligence" snapshot
  where "CusQuoteIntelligence_QuoteID" = quote_id;
  published := public.quote_intelligence_publish_snapshot(company_id, quote_id, quote_revision,
    original_intelligence -> 'CusQuoteIntelligence_DeterministicJSON', clock_timestamp());
  assert published = original_intelligence, 'Unchanged evidence must not publish or reset AI state';
  published := public.quote_intelligence_publish_snapshot(company_id, quote_id, quote_revision,
    (original_intelligence -> 'CusQuoteIntelligence_DeterministicJSON') || '{"algorithmVersion":"rollback-test"}'::jsonb, clock_timestamp());
  assert published ->> 'CusQuoteIntelligence_AlgorithmVersion' = 'rollback-test', 'Changed evidence was not published';
  assert published -> 'CusQuoteIntelligence_AIJSON' = original_intelligence -> 'CusQuoteIntelligence_AIJSON', 'Deterministic refresh changed the AI result';
  result := public.quote_intelligence_publish_snapshot(company_id, quote_id, quote_revision - interval '1 second',
    (original_intelligence -> 'CusQuoteIntelligence_DeterministicJSON') || '{"algorithmVersion":"stale-test"}'::jsonb, clock_timestamp());
  assert result = published, 'A stale quote revision overwrote current intelligence';
  begin
    perform public.quote_intelligence_publish_snapshot(gen_random_uuid(), quote_id, quote_revision,
      original_intelligence -> 'CusQuoteIntelligence_DeterministicJSON', clock_timestamp());
    raise exception 'Another company published quote intelligence';
  exception when insufficient_privilege then null;
  end;
  assert not has_function_privilege('anon', 'public.quote_intelligence_publish_snapshot(uuid,uuid,timestamptz,jsonb,timestamptz)', 'execute'), 'Anonymous publication grant';
  assert not has_function_privilege('authenticated', 'public.quote_intelligence_publish_snapshot(uuid,uuid,timestamptz,jsonb,timestamptz)', 'execute'), 'Browser publication grant';
end;
$$;
select 'Quote save, audit, readiness, unchanged intelligence, stale revision and access checks passed; test writes rolled back.' as verification;
rollback;
