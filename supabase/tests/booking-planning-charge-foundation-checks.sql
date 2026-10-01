-- Executed only in the disposable local PostgreSQL regression database.
do $$declare
 actor uuid:=gen_random_uuid(); reader uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 company uuid:=gen_random_uuid(); office uuid:=gen_random_uuid(); job uuid:=gen_random_uuid();
 rows jsonb:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'description','Internal planning test',
   'cost',100,'sell',150,'costCurrency','GBP','sellCurrency','EUR','costRoe',1,'sellRoe',1.2,'quantity',1));
 result jsonb; original jsonb; bad jsonb; role_name text; stamp timestamptz;
begin
 insert into public."cmp_Users"("Auth_User_ID","Company_ID","User_AccessStatus",can_write)
 values(actor,company,'active',true),(reader,company,'active',false),(outsider,gen_random_uuid(),'active',true);
 insert into public."cmp_Offices" values(office,company);
 insert into public."Job_Header"("Job_ID","Job_Status","Job_OfficeID","Job_Customer","Job_TransportModeSummary","Job_OriginNameSnapshot","Job_DestinationNameSnapshot")
 values(job,'draft',office,gen_random_uuid(),'road','Leeds','London');
 select to_jsonb(j) into original from public."Job_Header" j where "Job_ID"=job;
 foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(role_name,'booking_api.save_planning_charge_foundation(uuid,uuid,bigint,text,jsonb)','execute')
     or has_table_privilege(role_name,'booking_api.planning_charge_sets','select')
     or has_table_privilege(role_name,'booking_api.planning_charge_history','insert') then
     raise exception 'Unreleased foundation is exposed to %',role_name;
   end if;
 end loop;
 begin perform booking_api.save_planning_charge_foundation(reader,job,0,'GBP',rows);raise exception 'Reader wrote';exception when sqlstate '42501' then null;end;
 begin perform booking_api.save_planning_charge_foundation(outsider,job,0,'GBP',rows);raise exception 'Foreign user wrote';exception when sqlstate '42501' then null;end;
 begin perform booking_api.save_planning_charge_foundation(actor,job,null,'GBP',rows);raise exception 'Missing revision accepted';exception when sqlstate '40001' then null;end;
 for bad in select value from jsonb_array_elements(jsonb_build_array(
   '{}'::jsonb,rows||rows,jsonb_set(rows,'{0,cost}','-1'),jsonb_set(rows,'{0,cost}','"100"'),
   jsonb_set(rows,'{0,sellRoe}','0'),jsonb_set(rows,'{0,description}','""'),
   jsonb_set(rows,'{0,costCurrency}','"bad"'),jsonb_set(rows,'{0,supplierId}','"unvalidated"')
 )) loop
   begin perform booking_api.save_planning_charge_foundation(actor,job,0,'GBP',bad);raise exception 'Invalid row accepted: %',bad;exception when sqlstate '22023' then null;end;
 end loop;
 if exists(select 1 from booking_api.planning_charge_sets where job_id=job) then raise exception 'Failed validation wrote state';end if;
 result:=booking_api.save_planning_charge_foundation(actor,job,0,'GBP',rows);
 if result->>'revision'<>'1' or result->'rows'<>rows then raise exception 'First save lost data';end if;
 if (select s.rows from booking_api.planning_charge_sets s where s.job_id=job)<>rows then raise exception 'Saved data cannot be read back';end if;
 perform booking_api.save_planning_charge_foundation(actor,job,1,'GBP',rows);
 if (select count(*) from booking_api.planning_charge_history h where h.job_id=job)<>1 then raise exception 'Unchanged save duplicated audit';end if;
 begin perform booking_api.save_planning_charge_foundation(actor,job,0,'GBP',rows);raise exception 'Stale overwrite accepted';exception when sqlstate '40001' then null;end;
 if exists(select 1 from public."Job_Costing_Lines" where "Job_ID"=job)
   or exists(select 1 from public."FIN_JobFinanceSummary" where "Job_ID"=job)
   or exists(select 1 from public."FIN_JobChargeFinanceSummary" where "FINChargeState_JobID"=job) then
   raise exception 'Planning save leaked into finance';
 end if;
 if (select to_jsonb(j) from public."Job_Header" j where "Job_ID"=job)<>original then raise exception 'Planning save changed Booking details';end if;
 begin perform public.booking_workflow_save(actor,job,'{"status":"open"}');raise exception 'Unreleased progression accepted';exception when sqlstate '22023' then null;end;
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 begin perform public.booking_provisional_action(actor,job,'cancel','Test',stamp);raise exception 'Cancellation overlooked manual charges';exception when sqlstate '22023' then null;end;
 if exists(select 1 from booking_api.provisional_cancellation_history where job_id=job) then raise exception 'Blocked cancellation wrote audit';end if;
 begin update booking_api.planning_charge_history set after_state='{}' where job_id=job;raise exception 'History overwritten';exception when sqlstate '22023' then null;end;
 begin delete from booking_api.planning_charge_history where job_id=job;raise exception 'History deleted';exception when sqlstate '22023' then null;end;
 perform booking_api.save_planning_charge_foundation(actor,job,1,'GBP','[]');
 if not exists(select 1 from booking_api.planning_charge_history h where h.job_id=job and revision=2 and before_state->'rows'=rows and after_state->'rows'='[]') then raise exception 'Removal lost history';end if;
 perform public.booking_workflow_save(actor,job,'{"status":"open"}');
 begin perform booking_api.save_planning_charge_foundation(actor,job,2,'GBP',rows);raise exception 'In progress planning edit accepted';exception when sqlstate '22023' then null;end;
 raise notice 'Planning foundation: validation, scope, persistence, revisions, audit, finance exclusion and lifecycle hold passed';
end $$;
