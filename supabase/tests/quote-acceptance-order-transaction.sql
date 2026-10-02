-- Run against the explicitly approved internal JQ20029 fixture while V1 is sent.
-- Prepend the candidate migration after BEGIN when rehearsing a release.
-- Always ROLLBACK. No email or storage/provider action is performed here.
begin;
do $test$
declare
  target uuid := '7cdc5f80-38fe-46bc-80ca-7bcceef6450d';
  link quote_api.customer_response_links%rowtype;
  before_snapshot jsonb;
  result jsonb;
  target_job_id uuid;
begin
  select * into strict link from quote_api.customer_response_links
  where quote_id=target and status_code='active';
  select "CusQuoteVersion_SnapshotJSON" into strict before_snapshot
  from public."CusQuote_Versions" where "CusQuoteVersion_ID"=link.quote_version_id;
  if exists(select 1 from public."Job_Header" where "Job_SourceQuoteID"=target) then
    raise exception 'Use the unaccepted internal test fixture.';
  end if;
  begin
    perform public.quote_customer_response_submit(link.token_hash,'https://wrong-tenant.example.test','accepted',null,null::uuid,null::text,null::text,null::text);
    raise exception 'Wrong response origin was accepted';
  exception when no_data_found then null;
  end;
  result := public.quote_customer_response_submit(link.token_hash,link.response_origin,'accepted','INTERNAL TEST ONLY — rollback verification',null::uuid,null::text,null::text,null::text);
  target_job_id := (result#>>'{booking,jobId}')::uuid;
  if target_job_id is null or result#>>'{booking,status}' <> 'open' then raise exception 'Conversion did not create an open Booking'; end if;
  if (select count(*) from public."Job_Header" where "Job_SourceQuoteID"=target)<>1 then raise exception 'Duplicate Booking';end if;
  if not exists(select 1 from public."CusQuote_Versions" where "CusQuoteVersion_ID"=link.quote_version_id
    and "CusQuoteVersion_IsSubmitted" and "CusQuoteVersion_StatusCode"='accepted'
    and "CusQuoteVersion_SnapshotJSON"=before_snapshot) then raise exception 'Version status/snapshot incorrect';end if;
  if (select count(*) from booking_api.charge_origins o where o.job_id=target_job_id and origin='quote')<>jsonb_array_length(before_snapshot#>'{quote,charges}') then
    raise exception 'Missing immutable charge origin';end if;
  if not exists(select 1 from public."Job_Costing_Lines" c where c."Job_ID"=target_job_id
    and c."JobCostingLine_CostAmountCurrency"=100 and c."JobCostingLine_RevenueAmountCurrency"=150) then raise exception 'Test prices not transferred';end if;
  begin
    perform public.quote_customer_response_submit(link.token_hash,link.response_origin,'accepted',null,null::uuid,null::text,null::text,null::text);
    raise exception 'Used link was accepted again';
  exception when invalid_parameter_value then null;
  end;
end;
$test$;
set constraints all immediate;
rollback;
