-- Disposable PostgreSQL only; uses the existing real Finance upsert function.
do $$declare
 actor uuid:=gen_random_uuid();reader uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();
 company uuid:=gen_random_uuid();office uuid:=gen_random_uuid();entity uuid:=gen_random_uuid();job uuid:=gen_random_uuid();
 charge_rows jsonb:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'description','Manual planning rate',
   'cost',120,'sell',250,'costCurrency','EUR','sellCurrency','USD','costRoe',1.2,'sellRoe',1.25,'quantity',3));
 stamp timestamptz;source jsonb;line_id uuid;before_count bigint;
begin
 insert into public."cmp_Users"("Auth_User_ID","Company_ID","User_AccessStatus",can_write)
 values(actor,company,'active',true),(reader,company,'active',false),(outsider,gen_random_uuid(),'active',true);
 insert into public."cmp_Offices" values(office,company);
 insert into public."cmp_LegalEntities" values(entity,company,'GBP',true);
 insert into public."Job_Header"("Job_ID","Job_Status","Job_OfficeID","Job_Customer","Job_TransportModeSummary","Job_OriginNameSnapshot","Job_DestinationNameSnapshot")
 values(job,'draft',office,gen_random_uuid(),'road','Leeds','London');
 perform booking_api.save_planning_charge_foundation(actor,job,0,'GBP',charge_rows);
 begin perform public.booking_workflow_save(actor,job,'{"status":"open"}');raise exception 'Missing entity accepted';exception when sqlstate '22023' then null;end;
 if (select "Job_Status" from public."Job_Header" where "Job_ID"=job)<>'draft'
   or exists(select 1 from public."Job_Costing_Lines" where "Job_ID"=job) then raise exception 'Failed release partially committed';end if;
 update public."Job_Header" set "Job_LegalEntityID"=entity where "Job_ID"=job;
 update public."cmp_LegalEntities" set "LegalEntity_BaseCurrencyCodeSnapshot"='EUR' where "LegalEntity_ID"=entity;
 begin perform public.booking_workflow_save(actor,job,'{"status":"open"}');raise exception 'Wrong base currency accepted';exception when sqlstate '22023' then null;end;
 update public."cmp_LegalEntities" set "LegalEntity_BaseCurrencyCodeSnapshot"='GBP',"Company_ID"=gen_random_uuid() where "LegalEntity_ID"=entity;
 begin perform public.booking_workflow_save(actor,job,'{"status":"open"}');raise exception 'Foreign entity accepted';exception when sqlstate '22023' then null;end;
 update public."cmp_LegalEntities" set "Company_ID"=company where "LegalEntity_ID"=entity;
 begin perform public.booking_workflow_save(reader,job,'{"status":"open"}');raise exception 'Reader progressed';exception when sqlstate '42501' then null;end;
 begin perform public.booking_workflow_save(outsider,job,'{"status":"open"}');raise exception 'Outsider progressed';exception when sqlstate '42501' then null;end;
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'cancel','Keep before confirmation',stamp,'keep');
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'reopen','Confirmed',stamp);
 perform public.booking_workflow_save(actor,job,'{"status":"open"}');
 select "JobCostingLine_ID" into strict line_id from public."Job_Costing_Lines" where "Job_ID"=job;
 if not exists(select 1 from public."Job_Costing_Lines" where "JobCostingLine_ID"=line_id
   and "JobCostingLine_CostAmountLocal"=100 and "JobCostingLine_RevenueAmountLocal"=200
   and "JobCostingLine_CostAmountCurrency"=120 and "JobCostingLine_RevenueAmountCurrency"=250
   and "JobCostingLine_DomainCode"='freight' and "JobCostingLine_SourceLineID"=(charge_rows#>>'{0,id}')::uuid
   and "JobCostingLine_SourceMetadataJSON"#>>'{planningCharge,costCurrency}'='EUR'
   and "JobCostingLine_SourceMetadataJSON"#>>'{planningCharge,sellCurrency}'='USD'
   and "JobCostingLine_SourceMetadataJSON"->>'baseCurrency'='GBP') then raise exception 'Release amounts/currency/source wrong or quantity multiplied twice';end if;
 if not exists(select 1 from booking_api.planning_charge_releases where job_id=job and snapshot->'rows'=charge_rows and costing_line_ids=array[line_id]) then raise exception 'Release evidence missing';end if;
 if not exists(select 1 from public."FIN_JobFinanceSummary" where "Job_ID"=job) then raise exception 'Confirmed job missing from summary';end if;
 perform public.booking_workflow_save(actor,job,'{"status":"open"}');
 perform public.booking_workflow_save(actor,job,'{"status":"complete"}');
 perform public.booking_workflow_save(actor,job,'{"status":"open"}');
 if (select count(*) from public."Job_Costing_Lines" where "Job_ID"=job)<>1
   or (select count(*) from booking_api.events where job_id=job and event_type='planning_charges_released')<>1 then raise exception 'Repeated save/lifecycle duplicated release';end if;
 begin perform public.booking_workflow_save(actor,job,'{"status":"draft"}');raise exception 'Financial job returned to Provisional';exception when sqlstate '22023' then null;end;
 begin update booking_api.planning_charge_releases set snapshot='{}' where job_id=job;raise exception 'Release evidence edited';exception when sqlstate '22023' then null;end;
 begin delete from booking_api.planning_charge_releases where job_id=job;raise exception 'Release evidence deleted';exception when sqlstate '22023' then null;end;

 -- Mixed Quote + manual lines must both transfer; Quote release runs first.
 job:=gen_random_uuid();source:='{"acceptedSnapshot":{"quote":{"charges":[{"description":"Accepted Quote rate","costLocal":20,"sellLocal":30}]}}}';
 insert into public."Job_Header"("Job_ID","Job_Status","Job_OfficeID","Job_Customer","Job_TransportModeSummary","Job_OriginNameSnapshot","Job_DestinationNameSnapshot","Job_SourceQuoteID","Job_SourceSnapshotJSON","Job_LegalEntityID")
 values(job,'draft',office,gen_random_uuid(),'road','Leeds','London',gen_random_uuid(),source,entity);
 perform booking_api.save_planning_charge_foundation(actor,job,0,'GBP',charge_rows);
 perform public.booking_workflow_save(actor,job,'{"status":"open"}');
 if (select count(*) from public."Job_Costing_Lines" where "Job_ID"=job)<>2
   or (select count(distinct "JobCostingLine_Number") from public."Job_Costing_Lines" where "Job_ID"=job)<>2 then raise exception 'Mixed charges skipped or numbered twice';end if;
 if (select "Job_SourceSnapshotJSON"->'acceptedSnapshot' from public."Job_Header" where "Job_ID"=job)<>source->'acceptedSnapshot' then raise exception 'Accepted Quote changed';end if;

 -- A failure on the second manual row rolls back Quote and first manual inserts.
 job:=gen_random_uuid();
 insert into public."Job_Header"("Job_ID","Job_Status","Job_OfficeID","Job_Customer","Job_TransportModeSummary","Job_OriginNameSnapshot","Job_DestinationNameSnapshot","Job_SourceQuoteID","Job_SourceSnapshotJSON","Job_LegalEntityID")
 values(job,'draft',office,gen_random_uuid(),'road','Leeds','London',gen_random_uuid(),source,entity);
 perform booking_api.save_planning_charge_foundation(actor,job,0,'GBP',charge_rows||jsonb_build_array(
   jsonb_set(jsonb_set(charge_rows->0,'{id}',to_jsonb(gen_random_uuid()::text)),'{costCurrency}','"ZZZ"')));
 select count(*) into before_count from booking_api.events where job_id=job;
 begin perform public.booking_workflow_save(actor,job,'{"status":"open"}');raise exception 'Unknown currency accepted';exception when sqlstate '22023' then null;end;
 if exists(select 1 from public."Job_Costing_Lines" where "Job_ID"=job)
   or exists(select 1 from booking_api.planning_charge_releases where job_id=job)
   or (select "Job_Status" from public."Job_Header" where "Job_ID"=job)<>'draft'
   or (select "Job_SourceSnapshotJSON" from public."Job_Header" where "Job_ID"=job)<>source
   or (select count(*) from booking_api.events where job_id=job)<>before_count then raise exception 'Partial release escaped transaction rollback';end if;
 -- Discard all, reopen and confirm: neither source may return.
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'cancel','Discard all',stamp,'discard');
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'reopen','Returned without old prices',stamp);
 perform public.booking_workflow_save(actor,job,'{"status":"open"}');
 if exists(select 1 from public."Job_Costing_Lines" where "Job_ID"=job) then raise exception 'Discarded charges released';end if;
 if has_function_privilege('service_role','booking_api.release_manual_planning_charges()','execute')
   or has_table_privilege('authenticated','booking_api.planning_charge_releases','select') then raise exception 'Private release exposed';end if;
 raise notice 'Planning release: conversion, exact-once, source currencies, amounts, mixed sources, rollback, scope, discard and audit checks passed';
end $$;
