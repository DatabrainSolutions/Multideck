-- Schema-only dumps intentionally omit registry contents. Supply only synthetic
-- surrounding registry state needed by the reviewed additive migrations.
update public."sys_AIDexterActions" set "AIDexterAction_AlwaysRequiresApproval"=true,
  "AIDexterAction_ParametersJSON"='{"properties":{"field":{"enum":["description","grossWeightKg"]}}}'
  where "AIDexterAction_Code"='update_booking_cargo';
update public."sys_AIDexterWatchCapabilities" set "AIDexterWatchCapability_FieldsJSON"='["description","grossWeightKg"]'
  where "AIDexterWatchCapability_Code"='booking_cargo';
insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction")
values('booking_shipment_value','Shipment goods value','Synthetic existing metadata','multideck_dexter_domain_booking_shipment_value');
insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON")
values('booking_shipment_value','Shipment goods value','Synthetic existing metadata','["amount","currency"]');
update public."Job_Cargo" set "JobCargo_CargoJSON"="JobCargo_CargoJSON"||'{"chargeableWeightKg":"12.1234567890123456789"}';
insert into public."Job_Cargo"("JobCargo_JobID","JobCargo_LineNo","JobCargo_Description","JobCargo_CargoJSON") values
('40000000-0000-4000-8000-000000000001',2,'Unknown chargeable weight','{"chargeableWeightKg":null}'),
('40000000-0000-4000-8000-000000000001',3,'Zero chargeable weight','{"chargeableWeightKg":"0"}');
truncate freight_rehearsal.cargo_before;
insert into freight_rehearsal.cargo_before select * from public."Job_Cargo";
-- Canonical schema-qualified signatures, independent of session search_path.
set search_path='';
create table freight_rehearsal.air_functions_before as
select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','booking_api','quote_api','private','document_api') and p.prokind='f';
reset search_path;
