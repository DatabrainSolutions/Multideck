begin;

-- Activate the existing finance-period, accrual, WIP and posting foundations
-- as a controlled management-accounting lifecycle.
insert into public."sys_Permissions"(
  "sys_Permission_Value", "sys_Permission_Group", "sys_Permission_Name",
  "sys_Permission_Description", "sys_Permission_IsDangerous"
) values
  ('Finance.Management.View','Finance','View management accounting','View job periods, accruals, WIP and management-period reporting.',false),
  ('Finance.Management.Prepare','Finance','Prepare management adjustments','Prepare job-period accrual and WIP reviews.',false),
  ('Finance.Management.Approve','Finance','Approve management adjustments','Approve reviewed accrual and WIP adjustments.',true),
  ('Finance.Management.Post','Finance','Post management adjustments','Post and reverse balanced accrual and WIP journals.',true)
on conflict ("sys_Permission_Value") do update set
  "sys_Permission_Group"=excluded."sys_Permission_Group",
  "sys_Permission_Name"=excluded."sys_Permission_Name",
  "sys_Permission_Description"=excluded."sys_Permission_Description",
  "sys_Permission_IsDangerous"=excluded."sys_Permission_IsDangerous";

with role_permissions(role_name, permission_value) as (
  values
    ('Administrator','Finance.Management.View'),('Administrator','Finance.Management.Prepare'),('Administrator','Finance.Management.Approve'),('Administrator','Finance.Management.Post'),
    ('Finance manager','Finance.Management.View'),('Finance manager','Finance.Management.Prepare'),('Finance manager','Finance.Management.Approve'),('Finance manager','Finance.Management.Post'),
    ('Operations manager','Finance.Management.View'),('Operations manager','Finance.Management.Prepare'),
    ('Operator','Finance.Management.View')
)
insert into public."sys_UserRole_Permissions"("sys_UserRole_ID","sys_Permission_ID")
select role."sys_UserRole_ID",permission."sys_Permission_ID"
from role_permissions mapping
join public."sys_UserRoles" role on lower(role."sys_UserRole_Name")=lower(mapping.role_name)
join public."sys_Permissions" permission on permission."sys_Permission_Value"=mapping.permission_value
on conflict do nothing;

insert into public."sys_WorkflowRecordTypes"(
  "WorkflowRecordType_Code","WorkflowRecordType_Name","WorkflowRecordType_SourceTable",
  "WorkflowRecordType_Description","WorkflowRecordType_IsActive","WorkflowRecordType_SortOrder"
) values
  ('accrual_wip_review','Accrual and WIP review','FIN_PeriodCloseRuns','Management-period accrual, WIP, posting and reversal review.',true,128),
  ('job_management_period','Job management period','Job_Header','Audited assignment of a job to its management-reporting period.',true,129)
on conflict ("WorkflowRecordType_Code") do update set
  "WorkflowRecordType_Name"=excluded."WorkflowRecordType_Name",
  "WorkflowRecordType_SourceTable"=excluded."WorkflowRecordType_SourceTable",
  "WorkflowRecordType_Description"=excluded."WorkflowRecordType_Description",
  "WorkflowRecordType_IsActive"=true,
  "WorkflowRecordType_SortOrder"=excluded."WorkflowRecordType_SortOrder";

create unique index if not exists "UX_FIN_Periods_entity_code"
  on public."FIN_Periods"("FINPeriod_LegalEntityID","FINPeriod_Code")
  where "FINPeriod_LegalEntityID" is not null;

alter table public."Job_Header"
  drop constraint if exists "CK_Job_Header_management_period";
alter table public."Job_Header"
  add constraint "CK_Job_Header_management_period"
  check ("Job_Period" ~ '^[0-9]{6}$') not valid;
alter table public."Job_Header" validate constraint "CK_Job_Header_management_period";

create table if not exists public."FIN_JobPeriodHistory" (
  "FINJobPeriodHistory_ID" uuid primary key default gen_random_uuid(),
  "FINJobPeriodHistory_JobID" uuid not null references public."Job_Header"("Job_ID") on delete cascade,
  "FINJobPeriodHistory_LegalEntityID" uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete cascade,
  "FINJobPeriodHistory_FromPeriodCode" varchar(6),
  "FINJobPeriodHistory_ToPeriodCode" varchar(6) not null,
  "FINJobPeriodHistory_Reason" text not null,
  "FINJobPeriodHistory_AssignedAt" timestamptz not null default now(),
  "FINJobPeriodHistory_AssignedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  constraint "CK_FIN_JobPeriodHistory_from_period" check ("FINJobPeriodHistory_FromPeriodCode" is null or "FINJobPeriodHistory_FromPeriodCode" ~ '^[0-9]{6}$'),
  constraint "CK_FIN_JobPeriodHistory_to_period" check ("FINJobPeriodHistory_ToPeriodCode" ~ '^[0-9]{6}$')
);
create index if not exists "IX_FIN_JobPeriodHistory_job_at" on public."FIN_JobPeriodHistory"("FINJobPeriodHistory_JobID","FINJobPeriodHistory_AssignedAt" desc);

alter table public."FIN_PeriodCloseRuns"
  add column if not exists "FINCloseRun_LegalEntityID" uuid references public."cmp_LegalEntities"("LegalEntity_ID") on delete cascade,
  add column if not exists "FINCloseRun_Reason" text,
  add column if not exists "FINCloseRun_PostedAt" timestamptz,
  add column if not exists "FINCloseRun_PostedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  add column if not exists "FINCloseRun_ReversedAt" timestamptz,
  add column if not exists "FINCloseRun_ReversedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  add column if not exists "FINCloseRun_PostingBatchID" uuid references public."FIN_PostingBatches"("FINPostBatch_ID") on delete set null,
  add column if not exists "FINCloseRun_ReversalBatchID" uuid references public."FIN_PostingBatches"("FINPostBatch_ID") on delete set null,
  add column if not exists "FINCloseRun_UpdatedAt" timestamptz not null default now(),
  add column if not exists "FINCloseRun_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null;

create index if not exists "IX_FIN_PeriodCloseRuns_entity_period_status"
  on public."FIN_PeriodCloseRuns"("FINCloseRun_LegalEntityID","FINCloseRun_PeriodID","FINCloseRun_StatusCode","FINCloseRun_StartedAt" desc);

alter table public."FIN_PeriodCloseRunItems"
  add column if not exists "FINCloseItem_ExpectedRevenue" numeric(18,4) not null default 0,
  add column if not exists "FINCloseItem_ExpectedCost" numeric(18,4) not null default 0,
  add column if not exists "FINCloseItem_ActualRevenue" numeric(18,4) not null default 0,
  add column if not exists "FINCloseItem_ActualCost" numeric(18,4) not null default 0,
  add column if not exists "FINCloseItem_OutOfPeriodRevenue" numeric(18,4) not null default 0,
  add column if not exists "FINCloseItem_OutOfPeriodCost" numeric(18,4) not null default 0,
  add column if not exists "FINCloseItem_ProposedWIP" numeric(18,4) not null default 0,
  add column if not exists "FINCloseItem_ProposedAccrual" numeric(18,4) not null default 0,
  add column if not exists "FINCloseItem_ApprovedWIP" numeric(18,4) not null default 0,
  add column if not exists "FINCloseItem_ApprovedAccrual" numeric(18,4) not null default 0,
  add column if not exists "FINCloseItem_ReviewerNote" text,
  add column if not exists "FINCloseItem_UpdatedAt" timestamptz not null default now(),
  add column if not exists "FINCloseItem_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null;

alter table public."FIN_Accruals"
  add column if not exists "FINAccrual_CloseRunItemID" uuid references public."FIN_PeriodCloseRunItems"("FINCloseItem_ID") on delete set null,
  add column if not exists "FINAccrual_Description" text,
  add column if not exists "FINAccrual_ApprovedAt" timestamptz,
  add column if not exists "FINAccrual_ApprovedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  add column if not exists "FINAccrual_PostedAt" timestamptz,
  add column if not exists "FINAccrual_PostedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  add column if not exists "FINAccrual_ReversedAt" timestamptz,
  add column if not exists "FINAccrual_ReversedBy" uuid references public."cmp_Users"("User_ID") on delete set null;

alter table public."FIN_WIPItems"
  add column if not exists "FINWIP_CloseRunItemID" uuid references public."FIN_PeriodCloseRunItems"("FINCloseItem_ID") on delete set null,
  add column if not exists "FINWIP_Description" text,
  add column if not exists "FINWIP_ApprovedAt" timestamptz,
  add column if not exists "FINWIP_ApprovedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  add column if not exists "FINWIP_PostedAt" timestamptz,
  add column if not exists "FINWIP_PostedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  add column if not exists "FINWIP_ReversedAt" timestamptz,
  add column if not exists "FINWIP_ReversedBy" uuid references public."cmp_Users"("User_ID") on delete set null;

alter table public."FIN_JobPeriodHistory" enable row level security;
revoke all on public."FIN_JobPeriodHistory",public."FIN_Periods",public."FIN_PeriodCloseRuns",public."FIN_PeriodCloseRunItems",public."FIN_Accruals",public."FIN_WIPItems",public."FIN_PostingBatches",public."FIN_PostingLines" from public,anon,authenticated;
grant select,insert,update,delete on public."FIN_JobPeriodHistory",public."FIN_Periods",public."FIN_PeriodCloseRuns",public."FIN_PeriodCloseRunItems",public."FIN_Accruals",public."FIN_WIPItems",public."FIN_PostingBatches",public."FIN_PostingLines" to service_role;

-- Management reporting needs an asset control for earned unbilled revenue.
insert into public."FIN_NominalAccounts"(
  "FINNom_Code","FINNom_Name","FINNom_AccountTypeCode","FINNom_LegalEntityID",
  "FINNom_ExternalMappingHint","FINNom_IsControlAccount","FINNom_ControlTypeCode",
  "FINNom_AllowManualPosting","FINNom_IsActive"
)
select '1400','Accrued income and work in progress','Current Asset',entity."LegalEntity_ID",'1400',true,'work_in_progress',false,true
from public."cmp_LegalEntities" entity
on conflict ("FINNom_LegalEntityID","FINNom_Code") do update set
  "FINNom_Name"=excluded."FINNom_Name","FINNom_IsControlAccount"=true,
  "FINNom_ControlTypeCode"='work_in_progress',"FINNom_IsActive"=true;

update public."FIN_NominalAccounts"
set "FINNom_IsControlAccount"=true,
    "FINNom_ControlTypeCode"='accruals',
    "FINNom_AllowManualPosting"=false,
    "FINNom_IsActive"=true
where "FINNom_Code"='2300' and "FINNom_LegalEntityID" is not null;

create or replace function public._multideck_finance_ensure_period(
  p_legal_entity_id uuid,p_period_code text,p_user_id uuid
) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_period_id uuid; v_start date; v_year integer; v_month integer; v_currency text;
begin
  if p_period_code !~ '^[0-9]{6}$' then raise exception 'Enter a valid YYYYMM management period.' using errcode='22023'; end if;
  v_year:=left(p_period_code,4)::integer; v_month:=right(p_period_code,2)::integer;
  if v_year not between 2000 and 2200 or v_month not between 1 and 12 then raise exception 'Enter a valid YYYYMM management period.' using errcode='22023'; end if;
  select upper(coalesce("LegalEntity_BaseCurrencyCodeSnapshot",'GBP')) into v_currency from public."cmp_LegalEntities" where "LegalEntity_ID"=p_legal_entity_id;
  if not found then raise exception 'Legal entity not found.' using errcode='P0002'; end if;
  v_start:=make_date(v_year,v_month,1);
  insert into public."FIN_Periods"("FINPeriod_LegalEntityID","FINPeriod_Code","FINPeriod_Name","FINPeriod_StartDate","FINPeriod_EndDate","FINPeriod_StatusCode","FINPeriod_BaseCurrencyCode","FINPeriod_CreatedBy")
  values(p_legal_entity_id,p_period_code,to_char(v_start,'Mon YYYY'),v_start,(v_start+interval '1 month-1 day')::date,'open',v_currency,p_user_id)
  on conflict ("FINPeriod_LegalEntityID","FINPeriod_Code") where "FINPeriod_LegalEntityID" is not null do update set "FINPeriod_Name"=excluded."FINPeriod_Name"
  returning "FINPeriod_ID" into v_period_id;
  return v_period_id;
end; $$;
revoke all on function public._multideck_finance_ensure_period(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public._multideck_finance_ensure_period(uuid,text,uuid) to service_role;

create or replace function public.multideck_finance_assign_job_period(
  p_company_id uuid,p_user_id uuid,p_legal_entity_id uuid,p_job_id uuid,p_period_code text,p_reason text
) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_job public."Job_Header"%rowtype; v_from text; v_period_id uuid;
begin
  if nullif(btrim(p_reason),'') is null then raise exception 'Explain why the job period is changing.' using errcode='22023'; end if;
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and coalesce("User_AccessStatus",'active')='active') then raise exception 'The finance operator is outside this workspace.' using errcode='42501'; end if;
  if not exists(select 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_legal_entity_id and "Company_ID"=p_company_id) then raise exception 'That legal entity is outside this workspace.' using errcode='42501'; end if;
  select job.* into v_job from public."Job_Header" job join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID") where job."Job_ID"=p_job_id and office."Company_ID"=p_company_id and not job."Job_IsDeleted" for update;
  if not found then raise exception 'Job not found.' using errcode='P0002'; end if;
  if v_job."Job_LegalEntityID" is not null and v_job."Job_LegalEntityID"<>p_legal_entity_id then raise exception 'That job belongs to another legal entity.' using errcode='42501'; end if;
  v_period_id:=public._multideck_finance_ensure_period(p_legal_entity_id,p_period_code,p_user_id);
  v_from:=v_job."Job_Period";
  if v_from=p_period_code and v_job."Job_LegalEntityID"=p_legal_entity_id then return jsonb_build_object('jobId',p_job_id,'periodCode',p_period_code,'changed',false); end if;
  insert into public."FIN_JobPeriodHistory"("FINJobPeriodHistory_JobID","FINJobPeriodHistory_LegalEntityID","FINJobPeriodHistory_FromPeriodCode","FINJobPeriodHistory_ToPeriodCode","FINJobPeriodHistory_Reason","FINJobPeriodHistory_AssignedBy") values(p_job_id,p_legal_entity_id,v_from,p_period_code,btrim(p_reason),p_user_id);
  update public."Job_Header" set "Job_Period"=p_period_code,"Job_LegalEntityID"=p_legal_entity_id,"Job_UpdatedAt"=now(),"Job_UpdatedBy"=p_user_id where "Job_ID"=p_job_id;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON") values('finance_lifecycle',p_user_id,p_legal_entity_id,'multideck-app','finance','public','Job_Header','job_management_period',p_job_id,'assign_job_management_period','Job management period assigned',btrim(p_reason),true,1,jsonb_build_object('fromPeriod',v_from,'toPeriod',p_period_code,'periodId',v_period_id));
  return jsonb_build_object('jobId',p_job_id,'periodCode',p_period_code,'changed',true);
end; $$;
revoke all on function public.multideck_finance_assign_job_period(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.multideck_finance_assign_job_period(uuid,uuid,uuid,uuid,text,text) to service_role;

create or replace function public.multideck_finance_transition_accrual_wip(
  p_company_id uuid,p_user_id uuid,p_run_id uuid,p_action text,p_reason text default null
) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_run public."FIN_PeriodCloseRuns"%rowtype; v_next text;
begin
  select run.* into v_run from public."FIN_PeriodCloseRuns" run join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=run."FINCloseRun_LegalEntityID" where run."FINCloseRun_ID"=p_run_id and entity."Company_ID"=p_company_id for update;
  if not found then raise exception 'Accrual and WIP review not found.' using errcode='P0002'; end if;
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and coalesce("User_AccessStatus",'active')='active') then raise exception 'The finance operator is outside this workspace.' using errcode='42501'; end if;
  if p_action='request_review' and v_run."FINCloseRun_StatusCode"='draft' then v_next:='awaiting_approval';
  elsif p_action='approve' and v_run."FINCloseRun_StatusCode"='awaiting_approval' then v_next:='approved';
  elsif p_action='reject' and v_run."FINCloseRun_StatusCode" in ('awaiting_approval','approved') then v_next:='rejected';
  else raise exception 'That review cannot make this transition from %.',v_run."FINCloseRun_StatusCode" using errcode='22023'; end if;
  update public."FIN_PeriodCloseRuns" set "FINCloseRun_StatusCode"=v_next,"FINCloseRun_ApprovedAt"=case when v_next='approved' then now() else "FINCloseRun_ApprovedAt" end,"FINCloseRun_ApprovedBy"=case when v_next='approved' then p_user_id else "FINCloseRun_ApprovedBy" end,"FINCloseRun_UpdatedAt"=now(),"FINCloseRun_UpdatedBy"=p_user_id where "FINCloseRun_ID"=p_run_id;
  update public."FIN_PeriodCloseRunItems" set "FINCloseItem_StatusCode"=v_next,"FINCloseItem_ApprovedWIP"=case when v_next='approved' then "FINCloseItem_ProposedWIP" else "FINCloseItem_ApprovedWIP" end,"FINCloseItem_ApprovedAccrual"=case when v_next='approved' then "FINCloseItem_ProposedAccrual" else "FINCloseItem_ApprovedAccrual" end,"FINCloseItem_UpdatedAt"=now(),"FINCloseItem_UpdatedBy"=p_user_id where "FINCloseItem_CloseRunID"=p_run_id;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON") values('finance_lifecycle',p_user_id,v_run."FINCloseRun_LegalEntityID",'multideck-app','finance','public','FIN_PeriodCloseRuns','accrual_wip_review',p_run_id,p_action,'Accrual and WIP review '||replace(v_next,'_',' '),nullif(btrim(p_reason),''),true,1,jsonb_build_object('fromStatus',v_run."FINCloseRun_StatusCode",'toStatus',v_next));
  return jsonb_build_object('runId',p_run_id,'status',v_next);
end; $$;
revoke all on function public.multideck_finance_transition_accrual_wip(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.multideck_finance_transition_accrual_wip(uuid,uuid,uuid,text,text) to service_role;

create or replace function public.multideck_finance_post_accrual_wip(
  p_company_id uuid,p_user_id uuid,p_run_id uuid
) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_run public."FIN_PeriodCloseRuns"%rowtype; v_period public."FIN_Periods"%rowtype; v_item public."FIN_PeriodCloseRunItems"%rowtype; v_batch uuid; v_accrual uuid; v_wip uuid; v_line integer:=0; v_total numeric:=0; v_currency text; v_cost uuid; v_income uuid; v_accrual_control uuid; v_wip_control uuid;
begin
  select run.* into v_run from public."FIN_PeriodCloseRuns" run join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=run."FINCloseRun_LegalEntityID" where run."FINCloseRun_ID"=p_run_id and entity."Company_ID"=p_company_id for update;
  if not found then raise exception 'Accrual and WIP review not found.' using errcode='P0002'; end if;
  if v_run."FINCloseRun_StatusCode"<>'approved' then raise exception 'Approve this review before posting it.' using errcode='22023'; end if;
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and coalesce("User_AccessStatus",'active')='active') then raise exception 'The finance operator is outside this workspace.' using errcode='42501'; end if;
  select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=v_run."FINCloseRun_PeriodID" for update;
  if v_period."FINPeriod_StatusCode" not in ('open','soft_closed') then raise exception 'This management period is locked.' using errcode='22023'; end if;
  v_currency:=v_period."FINPeriod_BaseCurrencyCode";
  select "FINNom_ID" into v_cost from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=v_run."FINCloseRun_LegalEntityID" and "FINNom_Code"='5000' and "FINNom_IsActive" limit 1;
  select "FINNom_ID" into v_income from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=v_run."FINCloseRun_LegalEntityID" and "FINNom_Code"='4000' and "FINNom_IsActive" limit 1;
  select "FINNom_ID" into v_accrual_control from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=v_run."FINCloseRun_LegalEntityID" and "FINNom_Code"='2300' and "FINNom_IsActive" limit 1;
  select "FINNom_ID" into v_wip_control from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=v_run."FINCloseRun_LegalEntityID" and "FINNom_Code"='1400' and "FINNom_IsActive" limit 1;
  if v_cost is null or v_income is null or v_accrual_control is null or v_wip_control is null then raise exception 'Configure active 5000 cost, 4000 income, 2300 accrual and 1400 WIP accounts before posting.' using errcode='22023'; end if;
  insert into public."FIN_PostingBatches"("FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable","FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID","FINPostBatch_DebitTotal","FINPostBatch_CreditTotal","FINPostBatch_CurrencyCodeSnapshot","FINPostBatch_PostedAt","FINPostBatch_PostedBy","FINPostBatch_CreatedBy") values('MA-'||v_period."FINPeriod_Code"||'-'||left(p_run_id::text,8),'posted','FIN_PeriodCloseRuns',p_run_id,v_period."FINPeriod_ID",v_run."FINCloseRun_LegalEntityID",0,0,v_currency,now(),p_user_id,p_user_id) returning "FINPostBatch_ID" into v_batch;
  for v_item in select * from public."FIN_PeriodCloseRunItems" where "FINCloseItem_CloseRunID"=p_run_id and ("FINCloseItem_ApprovedAccrual">0 or "FINCloseItem_ApprovedWIP">0) order by "FINCloseItem_JobID" loop
    if v_item."FINCloseItem_ApprovedAccrual">0 then
      insert into public."FIN_Accruals"("FINAccrual_JobID","FINAccrual_PeriodID","FINAccrual_StatusCode","FINAccrual_AccountingDate","FINAccrual_ExpectedAmount","FINAccrual_AccruedAmount","FINAccrual_LocalAccruedAmount","FINAccrual_CurrencyCodeSnapshot","FINAccrual_CreatedBy","FINAccrual_CloseRunItemID","FINAccrual_Description","FINAccrual_ApprovedAt","FINAccrual_ApprovedBy","FINAccrual_PostedAt","FINAccrual_PostedBy") values(v_item."FINCloseItem_JobID",v_period."FINPeriod_ID",'posted',v_period."FINPeriod_EndDate",v_item."FINCloseItem_ExpectedCost",v_item."FINCloseItem_ApprovedAccrual",v_item."FINCloseItem_ApprovedAccrual",v_currency,p_user_id,v_item."FINCloseItem_ID",'Cost accrual for management period '||v_period."FINPeriod_Code",v_run."FINCloseRun_ApprovedAt",v_run."FINCloseRun_ApprovedBy",now(),p_user_id) returning "FINAccrual_ID" into v_accrual;
      v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_AccrualID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID") values(v_batch,v_line,v_cost,v_accrual,'Accrued job cost',v_item."FINCloseItem_ApprovedAccrual",0,v_currency,v_item."FINCloseItem_JobID");
      v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_AccrualID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID") values(v_batch,v_line,v_accrual_control,v_accrual,'Accrued cost liability',0,v_item."FINCloseItem_ApprovedAccrual",v_currency,v_item."FINCloseItem_JobID");
      v_total:=v_total+v_item."FINCloseItem_ApprovedAccrual";
    end if;
    if v_item."FINCloseItem_ApprovedWIP">0 then
      insert into public."FIN_WIPItems"("FINWIP_JobID","FINWIP_PeriodID","FINWIP_StatusCode","FINWIP_AccountingDate","FINWIP_ExpectedAmount","FINWIP_WIPAmount","FINWIP_LocalWIPAmount","FINWIP_CurrencyCodeSnapshot","FINWIP_CreatedBy","FINWIP_CloseRunItemID","FINWIP_Description","FINWIP_ApprovedAt","FINWIP_ApprovedBy","FINWIP_PostedAt","FINWIP_PostedBy") values(v_item."FINCloseItem_JobID",v_period."FINPeriod_ID",'posted',v_period."FINPeriod_EndDate",v_item."FINCloseItem_ExpectedRevenue",v_item."FINCloseItem_ApprovedWIP",v_item."FINCloseItem_ApprovedWIP",v_currency,p_user_id,v_item."FINCloseItem_ID",'Revenue WIP for management period '||v_period."FINPeriod_Code",v_run."FINCloseRun_ApprovedAt",v_run."FINCloseRun_ApprovedBy",now(),p_user_id) returning "FINWIP_ID" into v_wip;
      v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_WIPID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID") values(v_batch,v_line,v_wip_control,v_wip,'Accrued income and WIP',v_item."FINCloseItem_ApprovedWIP",0,v_currency,v_item."FINCloseItem_JobID");
      v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_WIPID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID") values(v_batch,v_line,v_income,v_wip,'Recognised unbilled revenue',0,v_item."FINCloseItem_ApprovedWIP",v_currency,v_item."FINCloseItem_JobID");
      v_total:=v_total+v_item."FINCloseItem_ApprovedWIP";
    end if;
  end loop;
  if v_total<=0 then raise exception 'This review has no approved accrual or WIP amounts to post.' using errcode='22023'; end if;
  update public."FIN_PostingBatches" set "FINPostBatch_DebitTotal"=v_total,"FINPostBatch_CreditTotal"=v_total where "FINPostBatch_ID"=v_batch;
  update public."FIN_PeriodCloseRunItems" set "FINCloseItem_StatusCode"='posted',"FINCloseItem_UpdatedAt"=now(),"FINCloseItem_UpdatedBy"=p_user_id where "FINCloseItem_CloseRunID"=p_run_id;
  update public."FIN_PeriodCloseRuns" set "FINCloseRun_StatusCode"='posted',"FINCloseRun_PostedAt"=now(),"FINCloseRun_PostedBy"=p_user_id,"FINCloseRun_PostingBatchID"=v_batch,"FINCloseRun_UpdatedAt"=now(),"FINCloseRun_UpdatedBy"=p_user_id,"FINCloseRun_ControlTotalsJSON"="FINCloseRun_ControlTotalsJSON"||jsonb_build_object('postedTotal',v_total,'postingBatchId',v_batch) where "FINCloseRun_ID"=p_run_id;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON") values('finance_lifecycle',p_user_id,v_run."FINCloseRun_LegalEntityID",'multideck-app','finance','public','FIN_PeriodCloseRuns','accrual_wip_review',p_run_id,'post_accrual_wip','Accrual and WIP journal posted',true,1,jsonb_build_object('postingBatchId',v_batch,'total',v_total,'currency',v_currency));
  return jsonb_build_object('runId',p_run_id,'status','posted','postingBatchId',v_batch,'total',v_total,'currency',v_currency);
end; $$;
revoke all on function public.multideck_finance_post_accrual_wip(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_finance_post_accrual_wip(uuid,uuid,uuid) to service_role;

create or replace function public.multideck_finance_reverse_accrual_wip(
  p_company_id uuid,p_user_id uuid,p_run_id uuid,p_reversal_period_code text,p_reason text
) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_run public."FIN_PeriodCloseRuns"%rowtype; v_period_id uuid; v_period public."FIN_Periods"%rowtype; v_batch uuid; v_line integer:=0; v_total numeric:=0; v_row record;
begin
  if nullif(btrim(p_reason),'') is null then raise exception 'Explain why this accrual and WIP journal is being reversed.' using errcode='22023'; end if;
  select run.* into v_run from public."FIN_PeriodCloseRuns" run join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=run."FINCloseRun_LegalEntityID" where run."FINCloseRun_ID"=p_run_id and entity."Company_ID"=p_company_id for update;
  if not found then raise exception 'Accrual and WIP review not found.' using errcode='P0002'; end if;
  if v_run."FINCloseRun_StatusCode"<>'posted' or v_run."FINCloseRun_PostingBatchID" is null then raise exception 'Only a posted review can be reversed.' using errcode='22023'; end if;
  v_period_id:=public._multideck_finance_ensure_period(v_run."FINCloseRun_LegalEntityID",p_reversal_period_code,p_user_id);
  select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=v_period_id for update;
  if v_period."FINPeriod_StatusCode"<>'open' then raise exception 'Choose an open reversal period.' using errcode='22023'; end if;
  insert into public."FIN_PostingBatches"("FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable","FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID","FINPostBatch_DebitTotal","FINPostBatch_CreditTotal","FINPostBatch_CurrencyCodeSnapshot","FINPostBatch_PostedAt","FINPostBatch_PostedBy","FINPostBatch_CreatedBy") values('REV-'||v_period."FINPeriod_Code"||'-'||left(p_run_id::text,8),'posted','FIN_PeriodCloseRuns',p_run_id,v_period_id,v_run."FINCloseRun_LegalEntityID",0,0,v_period."FINPeriod_BaseCurrencyCode",now(),p_user_id,p_user_id) returning "FINPostBatch_ID" into v_batch;
  for v_row in select line.* from public."FIN_PostingLines" line where line."FINPostLine_BatchID"=v_run."FINCloseRun_PostingBatchID" order by line."FINPostLine_LineNo" loop
    v_line:=v_line+1;
    insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_AccrualID","FINPostLine_WIPID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID") values(v_batch,v_line,v_row."FINPostLine_NominalAccountID",v_row."FINPostLine_AccrualID",v_row."FINPostLine_WIPID",'Reversal: '||coalesce(v_row."FINPostLine_Description",''),v_row."FINPostLine_CreditAmount",v_row."FINPostLine_DebitAmount",v_row."FINPostLine_CurrencyCodeSnapshot",v_row."FINPostLine_Dimension1ID");
    v_total:=v_total+v_row."FINPostLine_DebitAmount";
  end loop;
  update public."FIN_PostingBatches" set "FINPostBatch_DebitTotal"=v_total,"FINPostBatch_CreditTotal"=v_total where "FINPostBatch_ID"=v_batch;
  update public."FIN_Accruals" set "FINAccrual_StatusCode"='reversed',"FINAccrual_RelievedAmount"="FINAccrual_AccruedAmount","FINAccrual_ReversalPeriodID"=v_period_id,"FINAccrual_ReversedAt"=now(),"FINAccrual_ReversedBy"=p_user_id where "FINAccrual_CloseRunItemID" in (select "FINCloseItem_ID" from public."FIN_PeriodCloseRunItems" where "FINCloseItem_CloseRunID"=p_run_id);
  update public."FIN_WIPItems" set "FINWIP_StatusCode"='reversed',"FINWIP_RelievedAmount"="FINWIP_WIPAmount","FINWIP_ReversalPeriodID"=v_period_id,"FINWIP_ReversedAt"=now(),"FINWIP_ReversedBy"=p_user_id where "FINWIP_CloseRunItemID" in (select "FINCloseItem_ID" from public."FIN_PeriodCloseRunItems" where "FINCloseItem_CloseRunID"=p_run_id);
  update public."FIN_PeriodCloseRunItems" set "FINCloseItem_StatusCode"='reversed',"FINCloseItem_UpdatedAt"=now(),"FINCloseItem_UpdatedBy"=p_user_id where "FINCloseItem_CloseRunID"=p_run_id;
  update public."FIN_PeriodCloseRuns" set "FINCloseRun_StatusCode"='reversed',"FINCloseRun_ReversedAt"=now(),"FINCloseRun_ReversedBy"=p_user_id,"FINCloseRun_ReversalBatchID"=v_batch,"FINCloseRun_UpdatedAt"=now(),"FINCloseRun_UpdatedBy"=p_user_id where "FINCloseRun_ID"=p_run_id;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON") values('finance_lifecycle',p_user_id,v_run."FINCloseRun_LegalEntityID",'multideck-app','finance','public','FIN_PeriodCloseRuns','accrual_wip_review',p_run_id,'reverse_accrual_wip','Accrual and WIP journal reversed',btrim(p_reason),true,1,jsonb_build_object('reversalBatchId',v_batch,'periodCode',p_reversal_period_code,'total',v_total));
  return jsonb_build_object('runId',p_run_id,'status','reversed','reversalBatchId',v_batch,'total',v_total);
end; $$;
revoke all on function public.multideck_finance_reverse_accrual_wip(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.multideck_finance_reverse_accrual_wip(uuid,uuid,uuid,text,text) to service_role;

-- Extend Dexter's tenant-safe finance evidence with management-period reviews.
alter function public.multideck_dexter_domain_finance(uuid,text,integer)
  rename to _multideck_dexter_domain_finance_before_accrual_wip;
revoke all on function public._multideck_dexter_domain_finance_before_accrual_wip(uuid,text,integer) from public,anon,authenticated;
grant execute on function public._multideck_dexter_domain_finance_before_accrual_wip(uuid,text,integer) to service_role;

create function public.multideck_dexter_domain_finance(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  with records as (
    select value,coalesce((value->'evidence'->>'updatedAt')::timestamptz,'2000-01-01'::timestamptz) updated_at
    from jsonb_array_elements(public._multideck_dexter_domain_finance_before_accrual_wip(p_company_id,p_search,p_take)) value
    union all
    select jsonb_strip_nulls(jsonb_build_object(
      'recordId',run."FINCloseRun_ID",'recordKind','accrual_wip_review','status',run."FINCloseRun_StatusCode",
      'periodCode',period."FINPeriod_Code",'periodName',period."FINPeriod_Name",
      'jobCount',coalesce((run."FINCloseRun_ControlTotalsJSON"->>'jobCount')::integer,0),
      'proposedAccrual',coalesce((run."FINCloseRun_ControlTotalsJSON"->>'proposedAccrual')::numeric,0),
      'proposedWIP',coalesce((run."FINCloseRun_ControlTotalsJSON"->>'proposedWIP')::numeric,0),
      'postedTotal',coalesce((run."FINCloseRun_ControlTotalsJSON"->>'postedTotal')::numeric,0),
      'evidence',jsonb_build_object('sourceTable','FIN_PeriodCloseRuns','sourceId',run."FINCloseRun_ID",'legalEntityId',run."FINCloseRun_LegalEntityID",'updatedAt',run."FINCloseRun_UpdatedAt")
    )),run."FINCloseRun_UpdatedAt"
    from public."FIN_PeriodCloseRuns" run
    join public."FIN_Periods" period on period."FINPeriod_ID"=run."FINCloseRun_PeriodID"
    join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=run."FINCloseRun_LegalEntityID"
    where entity."Company_ID"=p_company_id and (nullif(btrim(p_search),'') is null or concat_ws(' ',period."FINPeriod_Code",period."FINPeriod_Name",run."FINCloseRun_StatusCode",run."FINCloseRun_Reason") ilike '%'||btrim(p_search)||'%')
  )
  select coalesce(jsonb_agg(value order by updated_at desc),'[]'::jsonb) from (select * from records order by updated_at desc limit greatest(1,least(coalesce(p_take,10),25))) limited;
$$;
revoke all on function public.multideck_dexter_domain_finance(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_finance(uuid,text,integer) to service_role;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Tenant-safe finance documents, retained evidence, cash, job management periods, accrual/WIP reviews, postings and reversals.',
  "AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code"='finance';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description"='Event-driven finance document, supplier evidence, tax-readiness, cash, provider-sync, job-period, accrual/WIP review, posting, reversal and approved configuration changes.',
  "AIDexterWatchCapability_FieldsJSON"=(coalesce("AIDexterWatchCapability_FieldsJSON",'[]'::jsonb)||'["managementPeriod","accrualWipStatus","proposedAccrual","proposedWIP","postedTotal"]'::jsonb),
  "AIDexterWatchCapability_UpdatedAt"=now()
where "AIDexterWatchCapability_Code"='finance';

create or replace function public._multideck_dexter_accrual_wip_watch_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_company uuid; v_old jsonb; v_new jsonb;
begin
  select "Company_ID" into v_company from public."cmp_LegalEntities" where "LegalEntity_ID"=new."FINCloseRun_LegalEntityID";
  v_old:=case when tg_op='INSERT' then null else jsonb_build_object('status',old."FINCloseRun_StatusCode",'totals',old."FINCloseRun_ControlTotalsJSON") end;
  v_new:=jsonb_build_object('status',new."FINCloseRun_StatusCode",'totals',new."FINCloseRun_ControlTotalsJSON");
  if v_old is distinct from v_new and v_company is not null and exists(select 1 from public."AI_DexterWatches" watch where watch."AIDexterWatch_CompanyID"=v_company and watch."AIDexterWatch_CapabilityCode"='finance' and watch."AIDexterWatch_StatusCode"='active' and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID"=new."FINCloseRun_ID")) then
    insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON") values(v_company,'finance','FIN_PeriodCloseRuns',new."FINCloseRun_ID",v_old,v_new);
  end if;
  return new;
end; $$;
revoke all on function public._multideck_dexter_accrual_wip_watch_change() from public,anon,authenticated;
drop trigger if exists "TR_FIN_PeriodCloseRuns_dexter_watch" on public."FIN_PeriodCloseRuns";
create trigger "TR_FIN_PeriodCloseRuns_dexter_watch" after insert or update of "FINCloseRun_StatusCode","FINCloseRun_ControlTotalsJSON" on public."FIN_PeriodCloseRuns" for each row execute function public._multideck_dexter_accrual_wip_watch_change();

-- Allow Dexter to propose one exact, audited job-period assignment. Approval
-- remains mandatory and review/post/reversal stay in the finance workspace.
create or replace function public.multideck_dexter_action_assign_job_management_period(uuid,uuid,jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  raise exception 'This action must be completed through the Finance Accruals Edge Function.' using errcode='42501';
end; $$;
revoke all on function public.multideck_dexter_action_assign_job_management_period(uuid,uuid,jsonb) from public,anon,authenticated;

insert into public."sys_AIDexterActions"(
  "AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description","AIDexterAction_Function","AIDexterAction_ParametersJSON","AIDexterAction_SortOrder","AIDexterAction_IsActive","AIDexterAction_UpdatedAt","AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily","AIDexterAction_ScopeStrategy","AIDexterAction_HasExternalEffect"
) values (
  'assign_job_management_period','finance','Assign job management period','Assign one exact job to a legal entity and YYYYMM management period through the audited Finance boundary.','multideck_dexter_action_assign_job_management_period',
  '{"type":"object","properties":{"jobId":{"type":"string"},"legalEntityId":{"type":"string"},"periodCode":{"type":"string","pattern":"^[0-9]{4}(0[1-9]|1[0-2])$"},"reason":{"type":"string","minLength":1}},"required":["jobId","legalEntityId","periodCode","reason"],"additionalProperties":false}'::jsonb,
  262,true,now(),'["Finance.Management.Prepare"]'::jsonb,'finance_job_period','canonical',true
)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode"=excluded."AIDexterAction_DomainCode","AIDexterAction_Name"=excluded."AIDexterAction_Name","AIDexterAction_Description"=excluded."AIDexterAction_Description","AIDexterAction_Function"=excluded."AIDexterAction_Function","AIDexterAction_ParametersJSON"=excluded."AIDexterAction_ParametersJSON","AIDexterAction_SortOrder"=excluded."AIDexterAction_SortOrder","AIDexterAction_IsActive"=true,"AIDexterAction_UpdatedAt"=now(),"AIDexterAction_RequiredPermissionsJSON"=excluded."AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily"=excluded."AIDexterAction_IntentFamily","AIDexterAction_ScopeStrategy"=excluded."AIDexterAction_ScopeStrategy","AIDexterAction_HasExternalEffect"=true;

commit;
