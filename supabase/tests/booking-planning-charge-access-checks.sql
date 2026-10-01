-- Disposable local database only; public read/save contracts, no shared writes.
do $$declare
 actor uuid:=gen_random_uuid();reader uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();
 company uuid:=gen_random_uuid();office uuid:=gen_random_uuid();entity uuid:=gen_random_uuid();job uuid:=gen_random_uuid();
 rows jsonb:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'description','Access test',
   'cost',100,'sell',150,'costCurrency','GBP','sellCurrency','EUR','costRoe',1,'sellRoe',1.2,'quantity',1));
 result jsonb; stamp timestamptz; role_name text; bad jsonb;
begin
 insert into public."cmp_Users"("Auth_User_ID","Company_ID","User_AccessStatus",can_write)
 values(actor,company,'active',true),(reader,company,'active',false),(outsider,gen_random_uuid(),'active',true);
 insert into public."cmp_Offices" values(office,company);
 insert into public."cmp_LegalEntities" values(entity,company,'GBP',true);
 insert into public."Job_Header"("Job_ID","Job_Status","Job_OfficeID") values(job,'draft',office);
 result:=public.booking_planning_charge_workspace(actor,job);
 if result->>'editable'<>'false' or result->'chargeSet'<>'null'::jsonb then raise exception 'Missing entity did not fail closed';end if;
 update public."Job_Header" set "Job_LegalEntityID"=entity where "Job_ID"=job;
 result:=public.booking_planning_charge_workspace(actor,job);
 if result->>'editable'<>'false' then raise exception 'Missing currency setup accepted';end if;
 insert into public."FIN_CurrencySettings"("FINCurSet_CurrencyCode","FINCurSet_Name") values('GBP','Pound'),('EUR','Euro');
 result:=public.booking_planning_charge_workspace(actor,job);
 if result->>'editable'<>'true' or result#>>'{chargeSet,revision}'<>'0' or result#>'{chargeSet,rows}'<>'[]'::jsonb then raise exception 'Initial planning contract invalid';end if;
 if exists(select 1 from booking_api.planning_charge_sets where job_id=job) then raise exception 'Read created working data';end if;
 result:=public.booking_planning_charge_workspace(reader,job);
 if result->>'editable'<>'false' then raise exception 'Reader advertised edits';end if;
 begin perform public.booking_planning_charge_workspace(outsider,job);raise exception 'Foreign read';exception when sqlstate '42501' then null;end;
 begin perform public.booking_planning_charges_save(reader,job,0,'GBP',rows);raise exception 'Reader save';exception when sqlstate '42501' then null;end;
 begin perform public.booking_planning_charges_save(outsider,job,0,'GBP',rows);raise exception 'Foreign save';exception when sqlstate '42501' then null;end;
 update public."cmp_Users" set "User_AccessStatus"='inactive' where "Auth_User_ID"=actor;
 begin perform public.booking_planning_charge_workspace(actor,job);raise exception 'Inactive read';exception when sqlstate '42501' then null;end;
 update public."cmp_Users" set "User_AccessStatus"='active' where "Auth_User_ID"=actor;
 foreach role_name in array array['anon','authenticated'] loop
   if has_function_privilege(role_name,'public.booking_planning_charge_workspace(uuid,uuid)','execute')
     or has_function_privilege(role_name,'public.booking_planning_charges_save(uuid,uuid,bigint,text,jsonb)','execute')
     or has_function_privilege(role_name,'booking_api.save_planning_charges(uuid,uuid,bigint,text,jsonb)','execute') then
     raise exception 'Browser can bypass Edge identity verification';end if;
 end loop;
 if not has_function_privilege('service_role','public.booking_planning_charges_save(uuid,uuid,bigint,text,jsonb)','execute')
   or has_function_privilege('service_role','booking_api.save_planning_charge_foundation(uuid,uuid,bigint,text,jsonb)','execute')
   or has_table_privilege('service_role','booking_api.planning_charge_sets','select') then raise exception 'Incorrect service privileges';end if;
 for bad in select value from jsonb_array_elements(jsonb_build_array(
   jsonb_set(rows,'{0,costCurrency}','"ZZZ"'),jsonb_set(rows,'{0,costRoe}','2'),
   jsonb_set(rows,'{0,costRoe}','"1"'),jsonb_set(rows,'{0,supplierId}',to_jsonb(gen_random_uuid())),
   jsonb_set(rows,'{0,cost}','-1'))) loop
   begin perform public.booking_planning_charges_save(actor,job,0,'GBP',bad);raise exception 'Invalid row saved';exception when sqlstate '22023' then null;end;
 end loop;
 insert into public."FIN_CurrencySettings"("FINCurSet_CurrencyCode","FINCurSet_Name","FINCurSet_IsActive","FINCurSet_LegalEntityID") values('EUR','Euro',false,entity);
 begin perform public.booking_planning_charges_save(actor,job,0,'GBP',rows);raise exception 'Disabled entity override ignored';exception when sqlstate '22023' then null;end;
 update public."FIN_CurrencySettings" set "FINCurSet_IsActive"=true where "FINCurSet_LegalEntityID"=entity;
 set local role service_role;
 result:=public.booking_planning_charges_save(actor,job,0,'GBP',rows);
 reset role;
 if result#>>'{chargeSet,revision}'<>'1' or result#>'{chargeSet,rows}'<>rows then raise exception 'Saved set not returned';end if;
 perform public.booking_planning_charges_save(actor,job,1,'GBP',rows);
 if (select count(*) from booking_api.planning_charge_history where job_id=job)<>1 then raise exception 'No-op duplicated audit';end if;
 begin perform public.booking_planning_charges_save(actor,job,0,'GBP','[]');raise exception 'Stale overwrite';exception when sqlstate '40001' then null;end;
 if exists(select 1 from public."Job_Costing_Lines" where "Job_ID"=job) then raise exception 'Planning affected finance';end if;
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'cancel','Keep for later',stamp,'keep');
 result:=public.booking_planning_charge_workspace(actor,job);
 if result->>'editable'<>'false' or result#>'{chargeSet,rows}'<>rows then raise exception 'Cancelled plan lost or editable';end if;
 begin perform public.booking_planning_charges_save(actor,job,1,'GBP','[]');raise exception 'Cancelled write';exception when sqlstate '22023' then null;end;
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'reopen','Resume',stamp);
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'cancel','Discard now',stamp,'discard');
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'reopen','Start fresh',stamp);
 result:=public.booking_planning_charge_workspace(actor,job);
 if result#>'{chargeSet,rows}'<>'[]'::jsonb or result->>'editable'<>'true' then raise exception 'Discard restored rows';end if;
 if not exists(select 1 from booking_api.planning_charge_history where job_id=job and before_state->'rows'=rows and after_state->'rows'='[]'::jsonb) then raise exception 'Discard audit absent';end if;
end $$;
