-- Synthetic current-schema preservation fixture; no hosted rows are copied.
insert into public."Job_CargoDangerousGoods"("JobCargoDG_JobCargoID","JobCargoDG_UNNumber","JobCargoDG_ProperShippingName")
values('40000000-0000-4000-8000-000000000002','1234','  Retained supplied text  ');
create table freight_rehearsal.security_dg_before as select * from public."Job_CargoDangerousGoods";
create table freight_rehearsal.security_functions_before as
select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','booking_api','quote_api','private','document_api') and p.prokind='f';
