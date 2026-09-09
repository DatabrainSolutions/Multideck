-- Execute inside BEGIN with the candidate migration, then ROLLBACK. Never COMMIT.
do $test$
declare actor uuid; payload jsonb; first_saved jsonb; second_saved jsonb; result jsonb;
  quote_id uuid; v1 uuid; v2 uuid; snapshot1 jsonb; snapshot2 jsonb; fingerprint text; after_fingerprint text; booking_fingerprint text;
begin
  select "Auth_User_ID" into actor from public."cmp_Users"
  where "User_AccessStatus"='active' and quote_api.has_permission("Auth_User_ID",'Quotes.Write') limit 1;
  select v."CusQuoteVersion_SnapshotJSON"->'quote' into payload from public."CusQuote_Versions" v
  join public."cmp_Users" u on u."Company_ID"=v."Company_ID" and u."Auth_User_ID"=actor
  where v."CusQuoteVersion_IsSubmitted" order by v."CusQuoteVersion_Number" desc limit 1;
  if actor is null or payload is null then raise exception 'Fixture source unavailable'; end if;
  payload:=jsonb_set(payload,'{shipmentFacts}',coalesce(payload->'shipmentFacts','{}')-array['copyReason','copiedFromQuoteId','copiedFromQuoteReference']);
  payload:=payload || '{"internalNotes":"Rollback-only discard QA"}'::jsonb;
  select md5(string_agg("CusQuoteVersion_ID"::text||"CusQuoteVersion_SnapshotJSON"::text,'' order by "CusQuoteVersion_ID")) into fingerprint from public."CusQuote_Versions" where "CusQuoteVersion_IsSubmitted";
  select md5(string_agg(to_jsonb(j)::text,'' order by j."Job_ID")) into booking_fingerprint from public."Job_Header" j;
  first_saved:=public.quote_workflow_save_quote(actor,null,payload);
  quote_id:=(first_saved->>'quoteId')::uuid; v1:=(first_saved->>'versionId')::uuid;
  begin
    perform public.quote_workflow_discard_draft(actor,quote_id,v1,(select "CusQuoteVersion_SnapshotJSON" from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v1));
    raise exception 'Original draft was discarded';
  exception when sqlstate '22023' then null; end;
  update public."CusQuote_Versions" set "CusQuoteVersion_IsSubmitted"=true,"CusQuoteVersion_StatusCode"='accepted' where "CusQuoteVersion_ID"=v1;
  select "CusQuoteVersion_SnapshotJSON" into snapshot1 from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v1;
  second_saved:=public.quote_workflow_save_quote(actor,quote_id,payload||jsonb_build_object('internalNotes','Changed draft','_expectedVersionId',v1,'_createVersion',true));
  v2:=(second_saved->>'versionId')::uuid;
  select "CusQuoteVersion_SnapshotJSON" into snapshot2 from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v2;
  begin
    perform public.quote_workflow_discard_draft(null,quote_id,v2,snapshot2);
    raise exception 'Anonymous discard allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.quote_workflow_discard_draft(actor,gen_random_uuid(),v2,snapshot2);
    raise exception 'Foreign Quote accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.quote_workflow_discard_draft(actor,quote_id,v2,'{}');
    raise exception 'Stale discard allowed';
  exception when serialization_failure then null; end;
  result:=public.quote_workflow_discard_draft(actor,quote_id,v2,snapshot2);
  if (result->>'restoredVersionId')::uuid<>v1 then raise exception 'Wrong restored version'; end if;
  if (select md5(string_agg(to_jsonb(j)::text,'' order by j."Job_ID")) from public."Job_Header" j) is distinct from booking_fingerprint then raise exception 'Booking changed during discard'; end if;
  if not (select "CusQuoteVersion_IsCurrent" and "CusQuoteVersion_SnapshotJSON"=snapshot1 from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v1) then raise exception 'Accepted snapshot changed'; end if;
  if not (select not "CusQuoteVersion_IsCurrent" and "CusQuoteVersion_DiscardedAt" is not null and "CusQuoteVersion_SnapshotJSON"=snapshot2 from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v2) then raise exception 'Discarded evidence changed'; end if;
  if (select "CusQuoteHeader_InternalNotes" from public."CusQuote_Header" where "CusQuoteHeader_ID"=quote_id) is distinct from payload->>'internalNotes' then raise exception 'Header not restored'; end if;
  if (select count(*) from public."CusQuote_Events" where "CusQuoteHeader_ID"=quote_id and "CusQuoteEvent_TypeCode"='draft_discarded')<>1 then raise exception 'Audit missing'; end if;
  if (public.quote_workflow_discard_draft(actor,quote_id,v2,snapshot2)->>'alreadyDiscarded')<>'true' then raise exception 'Retry not idempotent'; end if;
  begin
    perform public.quote_workflow_save_quote(actor,quote_id,payload||jsonb_build_object('_expectedVersionId',v2));
    raise exception 'Stale save recreated draft';
  exception when serialization_failure then null; end;
  begin
    perform public.quote_workflow_save_quote(actor,quote_id,payload);
    raise exception 'Old client recreated draft';
  exception when serialization_failure then null; end;
  second_saved:=public.quote_workflow_save_quote(actor,quote_id,payload||jsonb_build_object('_expectedVersionId',v1,'_createVersion',true));
  if (second_saved->>'versionNumber')::int<=2 then raise exception 'Discarded number reused'; end if;
  -- No accepted version: return to the latest submitted version instead.
  update public."CusQuote_Versions" set "CusQuoteVersion_StatusCode"='sent' where "CusQuoteVersion_ID"=v1;
  v2:=(second_saved->>'versionId')::uuid;
  select "CusQuoteVersion_SnapshotJSON" into snapshot2 from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v2;
  result:=public.quote_workflow_discard_draft(actor,quote_id,v2,snapshot2);
  if (result->>'restoredVersionId')::uuid<>v1 then raise exception 'Submitted fallback failed'; end if;
  begin
    perform public.quote_workflow_discard_draft(actor,quote_id,v1,snapshot1);
    raise exception 'Submitted version discarded';
  exception when sqlstate '22023' then null; end;
  select md5(string_agg("CusQuoteVersion_ID"::text||"CusQuoteVersion_SnapshotJSON"::text,'' order by "CusQuoteVersion_ID")) into after_fingerprint from public."CusQuote_Versions" where "CusQuoteVersion_IsSubmitted" and "CusQuoteHeader_ID"<>quote_id;
  if after_fingerprint is distinct from fingerprint then raise exception 'Existing submitted evidence changed'; end if;
end;
$test$;
