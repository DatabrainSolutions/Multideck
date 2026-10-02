-- Local disposable database only. Exercise real save/action/state functions.
do $$declare
 actor uuid:=gen_random_uuid();reader uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();
 company uuid:=gen_random_uuid();office uuid:=gen_random_uuid();job uuid:=gen_random_uuid();
 charge_rows jsonb:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'description','Manual planning rate',
   'cost',100,'sell',150,'costCurrency','GBP','sellCurrency','EUR','costRoe',1,'sellRoe',1.2,'quantity',1));
 stamp timestamptz;stale_stamp timestamptz;result jsonb;source jsonb;
begin
 insert into public."cmp_Users"("Auth_User_ID","Company_ID","User_AccessStatus",can_write)
 values(actor,company,'active',true),(reader,company,'active',false),(outsider,gen_random_uuid(),'active',true);
 insert into public."cmp_Offices" values(office,company);
 insert into public."Job_Header"("Job_ID","Job_Status","Job_OfficeID","Job_Customer","Job_TransportModeSummary","Job_OriginNameSnapshot","Job_DestinationNameSnapshot")
 values(job,'draft',office,gen_random_uuid(),'road','Leeds','London');
 select "Job_UpdatedAt" into stale_stamp from public."Job_Header" where "Job_ID"=job;
 perform booking_api.save_planning_charge_foundation(actor,job,0,'GBP',charge_rows);
 begin perform public.booking_provisional_action(actor,job,'cancel','Postponed',stale_stamp,'keep');raise exception 'Planning edit did not invalidate stale cancellation';exception when sqlstate '40001' then null;end;
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 result:=public.booking_provisional_state(actor,job);
 if result->>'planningChargeCount'<>'1' then raise exception 'Manual count missing';end if;
 begin perform public.booking_provisional_state(outsider,job);raise exception 'Foreign read';exception when sqlstate '42501' then null;end;
 begin perform public.booking_provisional_action(reader,job,'cancel','Postponed',stamp,'keep');raise exception 'Reader cancellation';exception when sqlstate '42501' then null;end;
 begin perform public.booking_provisional_action(outsider,job,'cancel','Postponed',stamp,'keep');raise exception 'Foreign cancellation';exception when sqlstate '42501' then null;end;
 begin perform public.booking_provisional_action(actor,job,'cancel','Postponed',stamp);raise exception 'Manual charges did not require decision';exception when sqlstate '22023' then null;end;
 begin update public."Job_Header" set "Job_Status"='cancelled' where "Job_ID"=job;raise exception 'Generic cancellation accepted';exception when sqlstate '22023' then null;end;
 perform public.booking_provisional_action(actor,job,'cancel','Postponed',stamp,'keep');
 if (select rows from booking_api.planning_charge_sets where job_id=job)<>charge_rows then raise exception 'Keep changed charges';end if;
 if not exists(select 1 from booking_api.provisional_cancellation_history where job_id=job and decision='keep'
   and snapshot#>'{manualPlanningSet,rows}'=charge_rows and snapshot#>>'{manualPlanningSet,base_currency}'='GBP') then raise exception 'Manual audit missing values/currency';end if;
 begin perform booking_api.save_planning_charge_foundation(actor,job,1,'GBP','[]');raise exception 'Cancelled charges editable';exception when sqlstate '22023' then null;end;
 if exists(select 1 from public."FIN_JobFinanceSummary" where "Job_ID"=job)
   or exists(select 1 from public."FIN_JobChargeFinanceSummary" where "FINChargeState_JobID"=job) then raise exception 'Cancelled planning in finance';end if;
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'reopen','Returned',stamp);
 if (select rows from booking_api.planning_charge_sets where job_id=job)<>charge_rows then raise exception 'Reopen lost kept rows';end if;
 if public.booking_provisional_state(actor,job)->>'reviewPricesAndDates'<>'true' then raise exception 'Review flag lost';end if;
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'cancel','No longer needed',stamp,'discard');
 if (select rows from booking_api.planning_charge_sets where job_id=job)<>'[]' then raise exception 'Discard kept working rows';end if;
 if not exists(select 1 from booking_api.planning_charge_history where job_id=job and revision=2 and before_state->'rows'=charge_rows and after_state->'rows'='[]') then raise exception 'Discard lost line history';end if;
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'reopen','Returned again',stamp);
 if public.booking_provisional_state(actor,job)->>'planningChargeCount'<>'0' then raise exception 'Discard resurrected rows';end if;
 -- Fresh rows after discard receive a fresh decision, including repeat Keep.
 charge_rows:=jsonb_set(charge_rows,'{0,description}','"Fresh rate after discard"');
 perform booking_api.save_planning_charge_foundation(actor,job,2,'GBP',charge_rows);
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 begin perform public.booking_provisional_action(actor,job,'cancel','Postponed',stamp);raise exception 'Old decision silently reused';exception when sqlstate '22023' then null;end;
 perform public.booking_provisional_action(actor,job,'cancel','Postponed',stamp,'keep');
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'reopen','Returned',stamp);
 if (select rows from booking_api.planning_charge_sets where job_id=job)<>charge_rows then raise exception 'Fresh kept rows lost';end if;
 if public.booking_provisional_state(actor,job)->>'chargeDecision'<>'keep' then raise exception 'Old discard replaced fresh decision';end if;
 begin perform public.booking_workflow_save(actor,job,'{"status":"open"}');raise exception 'Unimplemented manual release allowed';exception when sqlstate '22023' then null;end;
 if exists(select 1 from public."Job_Costing_Lines" where "Job_ID"=job) then raise exception 'Planning created financial lines';end if;
 if (select count(*) from booking_api.provisional_cancellation_history where job_id=job)<>6 then raise exception 'Unexpected cancellation audit count';end if;

 -- Mixed legacy Quote/manual plans: discard Quote once, then keep new manual rows.
 job:=gen_random_uuid();source:='{"acceptedSnapshot":{"quote":{"charges":[{"description":"Quote rate","costLocal":20,"sellLocal":30}]}}}';
 insert into public."Job_Header"("Job_ID","Job_Status","Job_OfficeID","Job_Customer","Job_TransportModeSummary","Job_OriginNameSnapshot","Job_DestinationNameSnapshot","Job_SourceQuoteID","Job_SourceSnapshotJSON")
 values(job,'draft',office,gen_random_uuid(),'road','Leeds','London',gen_random_uuid(),source);
 perform booking_api.save_planning_charge_foundation(actor,job,0,'GBP',charge_rows);
 if public.booking_provisional_state(actor,job)->>'planningChargeCount'<>'2' then raise exception 'Combined count incorrect';end if;
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'cancel','Both discarded',stamp,'discard');
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'reopen','Returned',stamp);
 perform booking_api.save_planning_charge_foundation(actor,job,2,'GBP',charge_rows);
 if public.booking_provisional_state(actor,job)->>'planningChargeCount'<>'1' then raise exception 'Quote charges resurrected on fresh manual save';end if;
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'cancel','Keep fresh only',stamp,'keep');
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'reopen','Returned',stamp);
 perform booking_api.save_planning_charge_foundation(actor,job,3,'GBP','[]');
 perform public.booking_workflow_save(actor,job,'{"status":"open"}');
 if exists(select 1 from public."Job_Costing_Lines" where "Job_ID"=job) then raise exception 'Old Quote discard lost after fresh manual Keep';end if;
 if (select "Job_SourceSnapshotJSON" from public."Job_Header" where "Job_ID"=job)<>source then raise exception 'Quote evidence changed';end if;
 raise notice 'Manual planning cancellation: keep, discard, reopen, fresh decisions, mixed sources, stale confirmation, scope and finance exclusion passed';
end $$;
