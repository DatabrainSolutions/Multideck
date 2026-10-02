-- Rollback-only reproduction using the explicitly internal JQ20031 fixture.
-- Temporarily release its idempotency/source key so the real converter runs.
-- No email/storage action; normal reference allocation may leave a sequence gap.
begin;
do $test$
declare result jsonb; j uuid; snap jsonb;
begin
  select "CusQuoteVersion_SnapshotJSON" into strict snap from public."CusQuote_Versions"
    where "CusQuoteVersion_ID"='96cc7a2b-47df-48ac-827c-c6add970810c';
  update public."Job_Header" set "Job_IsDeleted"=true where "Job_ID"='35939619-304c-4f07-a394-45a169bbe8a1';
  update public."Job_Costing_Lines" set "JobCostingLine_SourceLineID"=gen_random_uuid()
    where "Job_ID"='35939619-304c-4f07-a394-45a169bbe8a1';
  result:=booking_api.convert_accepted_quote('4a9e92cd-af70-4653-8f06-1924330582fe','4467c131-7068-4a7e-8ebc-e51d2d4af01c',null);
  j:=(result->>'jobId')::uuid;
  if j is null or j='35939619-304c-4f07-a394-45a169bbe8a1' then raise exception 'Not a new conversion'; end if;
  if exists(select 1 from public."Job_Containers" where "Job_ID"=j and not "JobContainer_IsDeleted") then raise exception 'Hidden sea equipment leaked into Air Booking'; end if;
  if (select "Job_Status" from public."Job_Header" where "Job_ID"=j)<>'open' then raise exception 'Wrong status'; end if;
  if not exists(select 1 from public."Job_Costing_Lines" where "Job_ID"=j and "JobCostingLine_CostAmountCurrency"=200 and "JobCostingLine_RevenueAmountCurrency"=275) then raise exception 'Charges lost'; end if;
  if snap<>(select "CusQuoteVersion_SnapshotJSON" from public."CusQuote_Versions" where "CusQuoteVersion_ID"='96cc7a2b-47df-48ac-827c-c6add970810c') then raise exception 'Snapshot changed'; end if;
end $test$;
set constraints all immediate;
rollback;
