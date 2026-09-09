-- Synthetic records only. Executed exclusively inside the disposable cluster.
-- Keep all real application triggers, foreign keys and constraints enabled.
create schema freight_rehearsal;
insert into public."cmp_Company"("Company_ID","Company_Name")
values('10000000-0000-4000-8000-000000000001','Synthetic freight rehearsal');
insert into public."cmp_Users"("User_ID","Company_ID","User_Email")
values('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','rehearsal@example.test');
insert into public."CusQuote_Header"("CusQuoteHeader_ID","Org_ID","CusQuoteHeader_Number",
  "CusQuoteHeader_CreatedDate","CusQuoteHeader_CreatedBy","CusQuoteHeader_CustomerReference")
values('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',900001,
  '2026-09-01','10000000-0000-4000-8000-000000000002','REHEARSAL-900001');

insert into public."CusQuote_Versions"("CusQuoteVersion_ID","Company_ID","CusQuoteHeader_ID",
  "CusQuoteVersion_Number","CusQuoteVersion_IsSubmitted","CusQuoteVersion_StatusCode","CusQuoteVersion_SnapshotJSON")
select ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  '10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003',n,
  n in (1,3),case when n in (1,3) then 'submitted' else 'draft' end,
  case when n<3 then '{"quote":{"shipmentFacts":{"goodsDescription":"Legacy evidence","packages":"450","grossWeight":"1500"}}}'::jsonb
  else '{"quote":{"shipmentFacts":{"cargoLines":[
    {"id":"30000000-0000-4000-8000-000000000001","description":"  Original text  ","packageQuantity":"450","grossWeightKg":"1500.1234","countryOfOrigin":"gb"},
    {"id":"30000000-0000-4000-8000-000000000002","description":"Second line","packageQuantity":0,"volumeCbm":"0.0001","isHazardous":true}
  ]}}}'::jsonb end
from generate_series(1,4) n;

insert into public."cmp_Offices"("Office_ID","Office_Name","Company_ID")
values('10000000-0000-4000-8000-000000000004','Rehearsal office','10000000-0000-4000-8000-000000000001');
insert into public."sys_JobStatuses"("JS_Code","JS_Name") values('draft','Draft');
insert into public."sys_JobTransportModes"("JTM_Code","JTM_Name") values('sea','Sea');
insert into public."sys_JobLegStatuses"("JLS_Code","JLS_Name") values('planned','Planned');
insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description")
values('bookings','Bookings','Existing general Booking capability');
insert into public."Job_Header"("Job_ID","Job_Number","Job_Period","Job_CreatedBy","Job_OfficeID","Job_Status",
  "Job_BookingReference","Job_TransportModeSummary","Job_SourceQuoteID","Job_SourceQuoteVersionID","Job_SourceSnapshotJSON")
values('40000000-0000-4000-8000-000000000001',900001,'202609','10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000004','draft','REHEARSAL-JOB-900001','sea',
  '10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','{"goodsValue":"60000","currency":"GBP"}');
insert into public."Job_Cargo"("JobCargo_ID","JobCargo_JobID","JobCargo_Description","JobCargo_PackageQty","JobCargo_GrossKilos","JobCargo_CargoJSON")
values('40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','Original goods',450,1500.12,'{"legacyNote":"Keep me"}');
insert into public."Job_Containers"("JobContainers_ID","Job_ID","JobContainer_TypeCodeSnapshot","JobContainer_VGMKilos","JobContainer_ReeferSetPoint","JobContainer_JSON")
values('40000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001','40GP',1900.123456,-18.125,'{"legacyNote":"Do not infer weights"}');
insert into public."Job_Routing"("JobRoute_ID","Job_ID","JobRoute_ModeCode","JobRoute_PlannedDepartureAt","JobRoute_ActualDepartureAt","JobRoute_Vessel")
values('40000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001','sea',
  '2026-09-02T12:30:45.123456Z','2026-09-02T14:30:00Z','Original vessel');
insert into public."Job_PackCargoContainer"("JobCargo_ID","JobContainer_ID")
values('40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000003');

-- Exercise the actual ON CONFLICT branches, including disabled existing rows.
-- Unrelated registry values must remain untouched.
insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_IsActive")
values('booking_cargo','Legacy cargo','Old description','multideck_dexter_domain_booking_cargo',false),
 ('rehearsal_unrelated','Unrelated','Preserve','multideck_dexter_domain_rehearsal_unrelated',false);
insert into public."sys_AIDexterActions"("AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description","AIDexterAction_Function","AIDexterAction_ParametersJSON","AIDexterAction_IsActive")
values('update_booking_cargo','booking_cargo','Old action','Old description','multideck_dexter_action_update_booking_cargo','{}',false);
insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description","AIDexterWatchCapability_IsActive")
values('booking_cargo','Old watch','Old description',false);

create table freight_rehearsal.versions_before as select * from public."CusQuote_Versions";
create table freight_rehearsal.headers_before as select * from public."CusQuote_Header";
create table freight_rehearsal.unrelated_before as select * from public."sys_AIDexterDataDomains" where "AIDexterDomain_Code"='rehearsal_unrelated';
create table freight_rehearsal.jobs_before as select * from public."Job_Header";
create table freight_rehearsal.cargo_before as select * from public."Job_Cargo";
create table freight_rehearsal.containers_before as select * from public."Job_Containers";
create table freight_rehearsal.routes_before as select * from public."Job_Routing";
create table freight_rehearsal.memberships_before as select * from public."Job_PackCargoContainer";
create table freight_rehearsal.signals_before as select * from public."AI_DexterWatchSignals";
