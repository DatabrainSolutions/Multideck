-- Runs only inside the disposable Postgres fixture, after the prior lifecycle
-- regression checks. No production database or record is used.
do $$declare actor uuid:=gen_random_uuid();reader uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();
 company uuid:=gen_random_uuid();office uuid:=gen_random_uuid();job uuid:=gen_random_uuid();
 stamp timestamptz;result jsonb;original jsonb;ref bigint;count_before int;
begin
 insert into public."cmp_Users"("Auth_User_ID","Company_ID","User_AccessStatus",can_write)
 values(actor,company,'active',true),(reader,company,'active',false),(outsider,gen_random_uuid(),'active',true);
 insert into public."cmp_Offices" values(office,company);
 insert into public."Job_Header"("Job_ID","Job_Status","Job_OfficeID","Job_Customer","Job_TransportModeSummary","Job_OriginNameSnapshot","Job_DestinationNameSnapshot","Job_SourceQuoteID","Job_SourceSnapshotJSON")
 values(job,'draft',office,gen_random_uuid(),'road','Leeds','London',gen_random_uuid(),'{"acceptedSnapshot":{"quote":{"charges":[{"description":"Original rate","costAmount":45,"sellAmount":60}]}},"documents":["preserved"]}');
 select "Job_UpdatedAt","Job_SourceSnapshotJSON","Job_Number" into stamp,original,ref from public."Job_Header" where "Job_ID"=job;
 insert into public."Job_Cargo"("Job_ID",description) values(job,'Preserved cargo');
 result:=public.booking_provisional_state(actor,job);
 if result->>'supported'<>'true' or result->>'planningChargeCount'<>'1' then raise exception 'Missing UI capability/charge count';end if;
 begin perform public.booking_provisional_state(outsider,job);raise exception 'Foreign state read accepted';exception when sqlstate '42501' then null;end;
 begin perform public.booking_provisional_action(reader,job,'cancel','No longer needed',stamp,'keep');raise exception 'Reader accepted';exception when sqlstate '42501' then null;end;
 begin perform public.booking_provisional_action(outsider,job,'cancel','No longer needed',stamp,'keep');raise exception 'Foreign actor accepted';exception when sqlstate '42501' then null;end;
 begin perform public.booking_provisional_action(actor,job,'cancel','No longer needed',null,'keep');raise exception 'Missing revision accepted';exception when sqlstate '40001' then null;end;
 begin perform public.booking_provisional_action(actor,job,'cancel','No longer needed',stamp,null);raise exception 'Implicit charge decision';exception when sqlstate '22023' then null;end;
 if exists(select 1 from booking_api.provisional_cancellation_history where job_id=job) then raise exception 'Failed attempt wrote history';end if;
 result:=public.booking_provisional_action(actor,job,'cancel','Customer postponed',stamp,'keep');
 if result->>'status'<>'cancelled' then raise exception 'Not cancelled';end if;
 result:=public.booking_provisional_state(actor,job);
 if result->>'cancelled'<>'true' or result->>'canReopen'<>'true' then raise exception 'Missing reopen state';end if;
 begin update public."Job_Cargo" set description='Replaced' where "Job_ID"=job;raise exception 'Cancelled cargo edit accepted';exception when sqlstate '22023' then null;end;
 begin delete from public."Job_Cargo" where "Job_ID"=job;raise exception 'Cancelled cargo deleted';exception when sqlstate '22023' then null;end;
 begin update booking_api.provisional_cancellation_history set reason='Rewritten' where job_id=job;raise exception 'History edited';exception when sqlstate '22023' then null;end;
 begin delete from booking_api.provisional_cancellation_history where job_id=job;raise exception 'History deleted';exception when sqlstate '22023' then null;end;
 if exists(select 1 from public."Job_Header" where "Job_ID"=job and not "Job_IsDeleted" and not "Job_ProvisionalCancelled" and "Job_Status" not in ('draft','provisional')) then raise exception 'Cancelled provisional is a month-end candidate';end if;
 if exists(select 1 from public."FIN_JobFinanceSummary" where "Job_ID"=job) or exists(select 1 from public."FIN_JobChargeFinanceSummary" where "FINChargeState_JobID"=job) then raise exception 'Cancelled provisional in reports';end if;
 begin insert into public."FIN_WIPItems" values(job);raise exception 'Cancelled WIP accepted';exception when sqlstate '22023' then null;end;
 begin update public."Job_Header" set "Job_Status"='draft' where "Job_ID"=job;raise exception 'Unreviewed reopen accepted';exception when sqlstate '22023' then null;end;
 begin update public."Job_Header" set "Job_OriginNameSnapshot"='Changed' where "Job_ID"=job;raise exception 'Cancelled edit accepted';exception when sqlstate '22023' then null;end;
 begin delete from public."Job_Header" where "Job_ID"=job;raise exception 'Reference deleted';exception when sqlstate '22023' then null;end;
 begin perform public.booking_provisional_action(actor,job,'reopen','Returned',stamp);raise exception 'Stale reopen accepted';exception when sqlstate '40001' then null;end;
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 result:=public.booking_provisional_action(actor,job,'reopen','Customer returned',stamp);
 if result->>'status'<>'draft' or result->>'reviewPricesAndDates'<>'true' then raise exception 'Wrong reopen state';end if;
 update public."Job_Cargo" set description='Reviewed cargo' where "Job_ID"=job;
 if (select "Job_SourceSnapshotJSON" from public."Job_Header" where "Job_ID"=job)<>original or (select "Job_Number" from public."Job_Header" where "Job_ID"=job)<>ref then raise exception 'Evidence/reference changed';end if;
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'cancel','No longer needed',stamp,'discard');
 if not exists(select 1 from booking_api.provisional_cancellation_history where job_id=job and decision='discard' and snapshot#>>'{planningCharges,0,description}'='Original rate') then raise exception 'Discard evidence lost';end if;
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'reopen','Returned again',stamp);
 -- A second cancellation must not resurrect discarded source charges.
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'cancel','Postponed again',stamp);
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'reopen','Confirmed',stamp);
 perform public.booking_workflow_save(actor,job,'{"status":"open"}');
 if exists(select 1 from public."Job_Costing_Lines" where "Job_ID"=job) then raise exception 'Discarded charges returned on progression';end if;
 if (select count(*) from booking_api.provisional_cancellation_history where job_id=job)<>6 then raise exception 'History count wrong';end if;
 if not exists(select 1 from public."FIN_JobFinanceSummary" where "Job_ID"=job) then raise exception 'Real booking still excluded';end if;
 -- A separate keep journey releases the original rate exactly once.
 job:=gen_random_uuid();
 insert into public."Job_Header"("Job_ID","Job_Status","Job_OfficeID","Job_Customer","Job_TransportModeSummary","Job_OriginNameSnapshot","Job_DestinationNameSnapshot","Job_SourceQuoteID","Job_SourceSnapshotJSON")
 values(job,'draft',office,gen_random_uuid(),'road','Leeds','London',gen_random_uuid(),original);
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'cancel','Postponed',stamp,'keep');
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'reopen','Returned',stamp);
 perform public.booking_workflow_save(actor,job,'{"status":"open"}');
 perform public.booking_workflow_save(actor,job,'{"status":"open"}');
 if (select count(*) from public."Job_Costing_Lines" where "Job_ID"=job)<>1 then raise exception 'Keep did not release once';end if;
 if not exists(select 1 from public."Job_Costing_Lines" where "Job_ID"=job and "JobCostingLine_DomainCode"='freight' and "JobCostingLine_Description"='Original rate' and "JobCostingLine_CostAmountCurrency"=45 and "JobCostingLine_RevenueAmountCurrency"=60) then
  raise exception 'Kept charges lost the colleague freight classification or original amounts';end if;
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 begin perform public.booking_provisional_action(actor,job,'cancel','Discard finance',stamp,'discard');raise exception 'Financial records discarded';exception when sqlstate '22023' then null;end;
 if not exists(select 1 from public."Job_Costing_Lines" where "Job_ID"=job) then raise exception 'Financial evidence removed';end if;
 if has_function_privilege('authenticated','public.booking_provisional_action(uuid,uuid,text,text,timestamptz,text)','execute') then raise exception 'Browser can impersonate actor';end if;
 if has_table_privilege('service_role','booking_api.provisional_cancellation_history','update') then raise exception 'Audit can be rewritten by service';end if;
end $$;
