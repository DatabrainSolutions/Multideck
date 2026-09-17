create or replace function booking_api.release_provisional_quote_charges() returns trigger
language plpgsql security definer set search_path='' as $$
declare charge jsonb; charge_number integer:=0;job_id uuid:=new."Job_ID";actor_user_id uuid:=new."Job_UpdatedBy";payload jsonb;
begin
 if lower(old."Job_Status") not in ('draft','provisional') or booking_api.lifecycle_label(new."Job_Status") <> 'In progress'
   or new."Job_SourceQuoteID" is null or coalesce((new."Job_SourceSnapshotJSON"->>'provisionalChargesReleased')::boolean,false) then return new;end if;
 if exists(select 1 from public."Job_Costing_Lines" where "Job_ID"=job_id) then return new;end if;
 payload:=coalesce(new."Job_SourceSnapshotJSON"#>'{acceptedSnapshot,quote}','{}'::jsonb);
 for charge in select value from jsonb_array_elements(coalesce(payload->'charges','[]'::jsonb)) loop
  charge_number:=charge_number+1;
  insert into public."Job_Costing_Lines" (
    "Job_ID", "JobCostingLine_Number", "JobCostingLine_SupplierID", "JobCostingLine_Description", "JobCostingLine_InternalNotes",
    "JobCostingLine_CustomerNotes", "JobCostingLine_CostROE", "JobCostingLine_CostAmountCurrency", "JobCostingLine_CostAmountLocal",
    "JobCostingLine_RevenueROE", "JobCostingLine_RevenueAmountCurrency", "JobCostingLine_RevenueAmountLocal",
    "JobCostingLine_ShowToCustomer", "JobCostingLine_CreatedBy", "JobCostingLine_UpdatedBy", "JobCostingLine_DomainCode"
  ) values (
    job_id, charge_number, nullif(charge->>'supplierId', '')::uuid, left(coalesce(nullif(btrim(charge->>'description'), ''), 'Charge'), 240),
    nullif(charge->>'internalNotes', ''), nullif(charge->>'customerNotes', ''), greatest(coalesce(nullif(charge->>'costRoe', '')::numeric, 1), 0.00001),
    coalesce(nullif(charge->>'costAmount', '')::numeric, 0), coalesce(nullif(charge->>'costLocal', '')::numeric, 0),
    greatest(coalesce(nullif(charge->>'sellRoe', '')::numeric, 1), 0.00001), coalesce(nullif(charge->>'sellAmount', '')::numeric, 0),
    coalesce(nullif(charge->>'sellLocal', '')::numeric, 0), coalesce((charge->>'showToCustomer')::boolean, true), actor_user_id, actor_user_id, 'freight'
  );
 end loop;
 update public."Job_Header" set "Job_SourceSnapshotJSON"=coalesce("Job_SourceSnapshotJSON",'{}'::jsonb)||'{"provisionalChargesReleased":true}'::jsonb where "Job_ID"=job_id;
 return new;
end $$;

revoke all on function booking_api.release_provisional_quote_charges() from public,anon,authenticated,service_role;
