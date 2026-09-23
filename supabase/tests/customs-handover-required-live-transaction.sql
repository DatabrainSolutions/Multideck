-- Internal test JE0991147 only; synthetic completion values are never retained.
-- Run after the readiness migration against the intended development tenant.
begin;
do $test$
declare r jsonb; baseline_docs bigint; baseline_events bigint;
begin
 select count(*) into baseline_docs from public."Customs_Declarations" where "CUST_JobID"='4fd48d17-03db-496e-a562-aeacb748fc4b';
 select count(*) into baseline_events from booking_api.events where job_id='4fd48d17-03db-496e-a562-aeacb748fc4b' and event_type='sent_to_customs';
 r := public.booking_workflow_customs_readiness('59bcff90-a1ea-4469-bc64-26430f788a5a','4fd48d17-03db-496e-a562-aeacb748fc4b');
 if r->>'ready'<>'false' or jsonb_array_length(r->'missing')<>4 or (r->>'percent')::int<>80 then raise exception 'Expected four missing requirements'; end if;
 begin
  perform booking_api.send_to_customs('59bcff90-a1ea-4469-bc64-26430f788a5a','4fd48d17-03db-496e-a562-aeacb748fc4b',gen_random_uuid());
  raise exception 'Existing declaration bypassed readiness';
 exception when invalid_parameter_value then null; end;
 update public."Job_Cargo" set "JobCargo_HSCode"='123456',"JobCargo_NettKilos"=100 where "JobCargo_JobID"='4fd48d17-03db-496e-a562-aeacb748fc4b' and not "JobCargo_IsDeleted";
 update public."Job_Parties" set "JobParty_CountryCodeSnapshot"='GB' where "JobParty_JobID"='4fd48d17-03db-496e-a562-aeacb748fc4b' and lower("JobParty_Role") in ('exporter','shipper','consignor','importer','consignee');
 r := public.booking_workflow_customs_readiness('59bcff90-a1ea-4469-bc64-26430f788a5a','4fd48d17-03db-496e-a562-aeacb748fc4b');
 if r->>'ready'<>'true' or (r->>'percent')::int<>100 then raise exception 'Complete shape did not pass: %',r; end if;
 insert into public."Job_Cargo" ("JobCargo_JobID","JobCargo_LineNo","JobCargo_Description","JobCargo_PackageQty","JobCargo_GrossKilos","JobCargo_NettKilos","JobCargo_HSCode")
 values ('4fd48d17-03db-496e-a562-aeacb748fc4b',987654,'ROLLBACK ONLY missing second cargo',1,10,null,null);
 r := public.booking_workflow_customs_readiness('59bcff90-a1ea-4469-bc64-26430f788a5a','4fd48d17-03db-496e-a562-aeacb748fc4b');
 if r->>'ready'<>'false' or jsonb_array_length(r->'missing')<>2 then raise exception 'Incomplete second cargo line passed'; end if;
 update public."Job_Cargo" set "JobCargo_IsDeleted"=true where "JobCargo_JobID"='4fd48d17-03db-496e-a562-aeacb748fc4b' and "JobCargo_LineNo"=987654;
 r := public.booking_workflow_customs_readiness('59bcff90-a1ea-4469-bc64-26430f788a5a','4fd48d17-03db-496e-a562-aeacb748fc4b');
 if r->>'ready'<>'true' then raise exception 'Archived line incorrectly blocks'; end if;
 update public."Job_Cargo" set "JobCargo_HSCode"='TBC',"JobCargo_NettKilos"=0 where "JobCargo_JobID"='4fd48d17-03db-496e-a562-aeacb748fc4b' and not "JobCargo_IsDeleted";
 r := public.booking_workflow_customs_readiness('59bcff90-a1ea-4469-bc64-26430f788a5a','4fd48d17-03db-496e-a562-aeacb748fc4b');
 if r->>'ready'<>'false' or jsonb_array_length(r->'missing')<>2 then raise exception 'TBC/zero passed'; end if;
 if (select count(*) from public."Customs_Declarations" where "CUST_JobID"='4fd48d17-03db-496e-a562-aeacb748fc4b')<>baseline_docs
 or (select count(*) from booking_api.events where job_id='4fd48d17-03db-496e-a562-aeacb748fc4b' and event_type='sent_to_customs')<>baseline_events then raise exception 'Failed handover wrote data'; end if;
end;
$test$;
rollback;
