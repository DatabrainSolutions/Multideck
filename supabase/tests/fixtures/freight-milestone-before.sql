-- Runs after freight-chain-before.sql, only in the disposable current-schema
-- milestone-pair rehearsal. No live records or external provider calls.
insert into public."sys_JobMilestoneTypes"("JMT_Code","JMT_Name") values('departed','Departed');
insert into public."Job_RouteMilestones"(
  "JobRouteMilestone_ID","JobRouteMilestone_JobRouteID","JobRouteMilestone_Type","JobRouteMilestone_Status",
  "JobRouteMilestone_PlannedAt","JobRouteMilestone_EstimatedAt","JobRouteMilestone_ActualAt",
  "JobRouteMilestone_Source","JobRouteMilestone_Notes","JobRouteMilestone_PayloadJSON","JobRouteMilestone_CreatedAt")
select ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  '40000000-0000-4000-8000-000000000004','departed',status,
  '2026-09-02T12:30:45.123456Z','2026-09-02T13:20:00.654321Z','2026-09-02T14:30:00.987654Z',
  source,'  Original legacy text  ','{"externalEvidence":"preserve exactly"}','2026-09-01T09:00:00.123456Z'
from (values(1,'operator','planned'),(2,'carrier-test','completed'),(3,'legacy-unknown','exception'),(4,null,'voided')) records(n,source,status);
create table freight_rehearsal.milestones_before as select * from public."Job_RouteMilestones";
create table freight_rehearsal.domains_before as select * from public."sys_AIDexterDataDomains";
create table freight_rehearsal.actions_before as select * from public."sys_AIDexterActions";
create table freight_rehearsal.capabilities_before as select * from public."sys_AIDexterWatchCapabilities";
create table freight_rehearsal.finance_function_before as select pg_get_functiondef(oid) definition,proacl
  from pg_proc where oid=to_regprocedure('public.multideck_finance_customer_account_snapshot(uuid,uuid[],boolean)');
