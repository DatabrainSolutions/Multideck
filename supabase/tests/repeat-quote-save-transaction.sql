-- Rehearsal only: run after candidate migration within BEGIN, always ROLLBACK.
-- Uses the labelled draft JQ20029, with no submitted-state fabrication or email.
do $test$
declare
  actor uuid := '59bcff90-a1ea-4469-bc64-26430f788a5a';
  quote_id uuid; version_id uuid; payload jsonb; saved jsonb;
  before_sources text; before_bookings text; after_sources text;
begin
  select q."CusQuoteHeader_ID", v."CusQuoteVersion_ID", v."CusQuoteVersion_SnapshotJSON"->'quote'
  into strict quote_id, version_id, payload
  from public."CusQuote_Header" q join public."CusQuote_Versions" v
    on v."CusQuoteHeader_ID"=q."CusQuoteHeader_ID" and v."CusQuoteVersion_IsCurrent"
  where q."CusQuoteHeader_CustomerReference"='JQ20029' and not v."CusQuoteVersion_IsSubmitted";
  if payload #>> '{shipmentFacts,copyReason}' <> 'repeat_quote' then raise exception 'Expected repeat fixture'; end if;
  select md5(string_agg(v."CusQuoteVersion_SnapshotJSON"::text,'' order by v."CusQuoteVersion_ID"))
    into before_sources from public."CusQuote_Versions" v where v."CusQuoteHeader_ID"<>quote_id;
  select md5(string_agg(to_jsonb(j)::text,'' order by j."Job_ID")) into before_bookings from public."Job_Header" j;
  payload := payload || jsonb_build_object('contactEmail','lee@databrain.solutions','_expectedVersionId',version_id);
  saved := public.quote_workflow_save_quote(actor,quote_id,payload);
  if saved->>'versionId' <> version_id::text then raise exception 'Draft version changed unexpectedly'; end if;
  if (select "CusQuoteVersion_SnapshotJSON" #>> '{quote,contactEmail}' from public."CusQuote_Versions" where "CusQuoteVersion_ID"=version_id)
    is distinct from 'lee@databrain.solutions' then raise exception 'Email not saved'; end if;
  -- Repeated saves must continue to work without modifying provenance.
  perform public.quote_workflow_save_quote(actor,quote_id,payload);
  begin
    perform public.quote_workflow_save_quote(actor,quote_id,jsonb_set(payload,'{shipmentFacts,copiedFromQuoteId}',to_jsonb(gen_random_uuid()::text)));
    raise exception 'Changed source accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.quote_workflow_save_quote(actor,quote_id,jsonb_set(payload,'{shipmentFacts,copyReason}','"unsupported"'));
    raise exception 'Unknown reason accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.quote_workflow_save_quote(null,quote_id,payload);
    raise exception 'Anonymous edit accepted';
  exception when sqlstate '42501' then null; end;
  begin
    perform public.quote_workflow_save_quote(actor,quote_id,payload||jsonb_build_object('_expectedVersionId',gen_random_uuid()));
    raise exception 'Stale version accepted';
  exception when sqlstate '40001' then null; end;
  select md5(string_agg(v."CusQuoteVersion_SnapshotJSON"::text,'' order by v."CusQuoteVersion_ID"))
    into after_sources from public."CusQuote_Versions" v where v."CusQuoteHeader_ID"<>quote_id;
  if before_sources is distinct from after_sources then raise exception 'Other Quote modified'; end if;
  if before_bookings is distinct from (select md5(string_agg(to_jsonb(j)::text,'' order by j."Job_ID")) from public."Job_Header" j)
    then raise exception 'Booking modified'; end if;
end;
$test$;
