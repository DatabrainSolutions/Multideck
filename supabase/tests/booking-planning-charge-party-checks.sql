do $$declare
 actor uuid:=gen_random_uuid();company uuid:=gen_random_uuid();office uuid:=gen_random_uuid();entity uuid:=gen_random_uuid();job uuid:=gen_random_uuid();
 supplier uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();wrong_role uuid:=gen_random_uuid();type_id uuid:=gen_random_uuid();
 rows jsonb;result jsonb;stamp timestamptz;
begin
 insert into public."cmp_Users"("Auth_User_ID","Company_ID","User_AccessStatus",can_write) values(actor,company,'active',true);
 insert into public."cmp_Offices" values(office,company);
 insert into public."cmp_LegalEntities" values(entity,company,'GBP',true);
 insert into public."Org_Master" values(supplier,'Scoped supplier','SUP'),(customer,'Booking customer','CUS'),(outsider,'Other company','OUT'),(wrong_role,'Non-supplier','NO');
 insert into public."CRM_AccountProfiles"("CRMAccount_OrgID","CRMAccount_CompanyID") values(supplier,company),(customer,company),(outsider,gen_random_uuid()),(wrong_role,company);
 insert into public."Org_Types" values(type_id,'Carrier');
 insert into public."Org_Master_Type" values(supplier,type_id),(outsider,type_id);
 insert into public."Job_Header"("Job_ID","Job_Status","Job_OfficeID","Job_LegalEntityID","Job_Customer","Job_TransportModeSummary","Job_OriginNameSnapshot","Job_DestinationNameSnapshot")
 values(job,'draft',office,entity,customer,'road','Leeds','London');
 result:=public.booking_planning_charge_workspace(actor,job);
 if jsonb_array_length(result->'parties')<>2 then raise exception 'Incorrect accessible party scope';end if;
 if not (public.booking_provisional_state(actor,job)->>'planningEditorSupported')::boolean then raise exception 'Editor not advertised';end if;
 rows:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'description','Party charge','cost',100,'sell',150,'costCurrency','GBP','sellCurrency','GBP','costRoe',1,'sellRoe',1,'quantity',1,'supplierId',supplier,'customerId',customer));
 begin perform public.booking_planning_charges_save(actor,job,0,'GBP',jsonb_set(rows,'{0,supplierId}',to_jsonb(outsider)));raise exception 'Foreign supplier accepted';exception when sqlstate '22023' then null;end;
 begin perform public.booking_planning_charges_save(actor,job,0,'GBP',jsonb_set(rows,'{0,supplierId}',to_jsonb(wrong_role)));raise exception 'Wrong supplier role accepted';exception when sqlstate '22023' then null;end;
 begin perform public.booking_planning_charges_save(actor,job,0,'GBP',jsonb_set(rows,'{0,customerId}',to_jsonb(supplier)));raise exception 'Changed charge customer';exception when sqlstate '22023' then null;end;
 update public."CRM_AccountProfiles" set "CRMAccount_MetadataJSON"='{"developmentFixture":true}' where "CRMAccount_OrgID"=supplier;
 begin perform public.booking_planning_charges_save(actor,job,0,'GBP',rows);raise exception 'Excluded fixture accepted';exception when sqlstate '22023' then null;end;
 update public."CRM_AccountProfiles" set "CRMAccount_MetadataJSON"='{}' where "CRMAccount_OrgID"=supplier;
 result:=public.booking_planning_charges_save(actor,job,0,'GBP',rows);
 if result#>'{chargeSet,rows}'<>rows then raise exception 'Party identity lost';end if;
 update public."CRM_AccountProfiles" set "CRMAccount_IsDeleted"=true where "CRMAccount_OrgID"=supplier;
 begin perform public.booking_planning_charges_save(actor,job,1,'GBP',rows);raise exception 'Deleted supplier accepted';exception when sqlstate '22023' then null;end;
 begin perform public.booking_workflow_save(actor,job,'{"status":"open"}');raise exception 'Deleted supplier released';exception when sqlstate '22023' then null;end;
 update public."CRM_AccountProfiles" set "CRMAccount_IsDeleted"=false where "CRMAccount_OrgID"=supplier;
 perform public.booking_workflow_save(actor,job,'{"status":"open"}');
 if not exists(select 1 from public."Job_Costing_Lines" where "Job_ID"=job and "JobCostingLine_SupplierID"=supplier
   and "JobCostingLine_SourceMetadataJSON"#>>'{planningCharge,customerId}'=customer::text) then raise exception 'Operational party mapping lost';end if;
 -- A later discarded plan retains party IDs in audit, never in working rows.
 job:=gen_random_uuid();
 insert into public."Job_Header"("Job_ID","Job_Status","Job_OfficeID","Job_LegalEntityID","Job_Customer") values(job,'draft',office,entity,customer);
 perform public.booking_planning_charges_save(actor,job,0,'GBP',rows);
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'cancel','Discard party plan',stamp,'discard');
 select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
 perform public.booking_provisional_action(actor,job,'reopen','Fresh plan',stamp);
 result:=public.booking_planning_charge_workspace(actor,job);
 if result#>'{chargeSet,rows}'<>'[]'::jsonb then raise exception 'Party plan resurrected';end if;
 if not exists(select 1 from booking_api.planning_charge_history where job_id=job and before_state->'rows'=rows and after_state->'rows'='[]') then raise exception 'Party audit lost';end if;
 if has_function_privilege('service_role','booking_api.planning_charge_parties(uuid,uuid)','execute') then raise exception 'Arbitrary company lookup exposed';end if;
end $$;
