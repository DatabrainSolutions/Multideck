begin;

-- Job costing is the operational source for charge-level management accounting.
-- Actuals remain derived from posted finance documents; they are never copied
-- into a second mutable ledger.
alter table public."Job_Costing_Lines"
  add column if not exists "JobCostingLine_CostNominalAccountID" uuid references public."FIN_NominalAccounts"("FINNom_ID") on delete set null,
  add column if not exists "JobCostingLine_RevenueNominalAccountID" uuid references public."FIN_NominalAccounts"("FINNom_ID") on delete set null;

alter table public."FIN_DocumentLineJobLinks"
  add column if not exists "FINDocLineJob_JobCostingLineID" uuid references public."Job_Costing_Lines"("JobCostingLine_ID") on delete set null;

alter table public."FIN_Accruals"
  add column if not exists "FINAccrual_JobCostingLineID" uuid references public."Job_Costing_Lines"("JobCostingLine_ID") on delete restrict;

alter table public."FIN_WIPItems"
  add column if not exists "FINWIP_JobCostingLineID" uuid references public."Job_Costing_Lines"("JobCostingLine_ID") on delete restrict;

alter table public."FIN_AccrualWIPReleases"
  add column if not exists "FINRelease_JobCostingLineID" uuid references public."Job_Costing_Lines"("JobCostingLine_ID") on delete restrict;

create index if not exists "IX_FIN_DocumentLineJobLinks_costing_line" on public."FIN_DocumentLineJobLinks"("FINDocLineJob_JobCostingLineID","FINDocLineJob_DocumentID");
create index if not exists "IX_FIN_Accruals_costing_line" on public."FIN_Accruals"("FINAccrual_JobCostingLineID","FINAccrual_StatusCode");
create index if not exists "IX_FIN_WIPItems_costing_line" on public."FIN_WIPItems"("FINWIP_JobCostingLineID","FINWIP_StatusCode");
create index if not exists "IX_FIN_AccrualWIPReleases_costing_line" on public."FIN_AccrualWIPReleases"("FINRelease_JobCostingLineID","FINRelease_ReleasedAt");

-- Existing lines use the legal entity's standard income and cost accounts until
-- an operator assigns a more specific nominal to the charge line.
update public."Job_Costing_Lines" line set
  "JobCostingLine_CostNominalAccountID"=coalesce(line."JobCostingLine_CostNominalAccountID",cost."FINNom_ID"),
  "JobCostingLine_RevenueNominalAccountID"=coalesce(line."JobCostingLine_RevenueNominalAccountID",income."FINNom_ID")
from public."Job_Header" job
left join lateral (
  select account."FINNom_ID" from public."FIN_NominalAccounts" account
  where account."FINNom_LegalEntityID"=job."Job_LegalEntityID" and account."FINNom_Code"='5000' and account."FINNom_IsActive" limit 1
) cost on true
left join lateral (
  select account."FINNom_ID" from public."FIN_NominalAccounts" account
  where account."FINNom_LegalEntityID"=job."Job_LegalEntityID" and account."FINNom_Code"='4000' and account."FINNom_IsActive" limit 1
) income on true
where job."Job_ID"=line."Job_ID";

create table public."FIN_JobChargePeriodAllocations" (
  "FINChargePeriod_ID" uuid primary key default gen_random_uuid(),
  "FINChargePeriod_CloseRunItemID" uuid not null references public."FIN_PeriodCloseRunItems"("FINCloseItem_ID") on delete cascade,
  "FINChargePeriod_JobID" uuid not null references public."Job_Header"("Job_ID") on delete restrict,
  "FINChargePeriod_JobCostingLineID" uuid not null references public."Job_Costing_Lines"("JobCostingLine_ID") on delete restrict,
  "FINChargePeriod_LineNoSnapshot" integer not null,
  "FINChargePeriod_ChargeCodeSnapshot" varchar(80),
  "FINChargePeriod_DescriptionSnapshot" varchar(240) not null,
  "FINChargePeriod_CostNominalAccountID" uuid references public."FIN_NominalAccounts"("FINNom_ID") on delete restrict,
  "FINChargePeriod_RevenueNominalAccountID" uuid references public."FIN_NominalAccounts"("FINNom_ID") on delete restrict,
  "FINChargePeriod_ExpectedRevenue" numeric(18,4) not null default 0,
  "FINChargePeriod_ExpectedCost" numeric(18,4) not null default 0,
  "FINChargePeriod_ActualRevenue" numeric(18,4) not null default 0,
  "FINChargePeriod_ActualCost" numeric(18,4) not null default 0,
  "FINChargePeriod_OutOfPeriodRevenue" numeric(18,4) not null default 0,
  "FINChargePeriod_OutOfPeriodCost" numeric(18,4) not null default 0,
  "FINChargePeriod_ProposedWIP" numeric(18,4) not null default 0,
  "FINChargePeriod_ProposedAccrual" numeric(18,4) not null default 0,
  "FINChargePeriod_ApprovedWIP" numeric(18,4) not null default 0,
  "FINChargePeriod_ApprovedAccrual" numeric(18,4) not null default 0,
  "FINChargePeriod_CreatedAt" timestamptz not null default now(),
  "FINChargePeriod_UpdatedAt" timestamptz not null default now(),
  "FINChargePeriod_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  constraint "UQ_FIN_JobChargePeriodAllocations_item_line" unique ("FINChargePeriod_CloseRunItemID","FINChargePeriod_JobCostingLineID"),
  constraint "CK_FIN_JobChargePeriodAllocations_nonnegative" check (
    "FINChargePeriod_ExpectedRevenue">=0 and "FINChargePeriod_ExpectedCost">=0 and
    "FINChargePeriod_ProposedWIP">=0 and "FINChargePeriod_ProposedAccrual">=0 and
    "FINChargePeriod_ApprovedWIP">=0 and "FINChargePeriod_ApprovedAccrual">=0
  )
);

create index "IX_FIN_JobChargePeriodAllocations_job" on public."FIN_JobChargePeriodAllocations"("FINChargePeriod_JobID","FINChargePeriod_JobCostingLineID");
alter table public."FIN_JobChargePeriodAllocations" enable row level security;
revoke all on public."FIN_JobChargePeriodAllocations" from public,anon,authenticated;
grant select,insert,update,delete on public."FIN_JobChargePeriodAllocations" to service_role;

-- Resolve a draft's lines to exact job charge lines. A missing mapping is kept
-- deliberately unmatched so it can surface as a genuine GP movement.
create or replace function public.multideck_finance_link_document_charge_lines(
  p_company_id uuid,p_user_id uuid,p_document_id uuid,p_lines jsonb
) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_document public."FIN_Documents"%rowtype; v_entry jsonb; v_line_id uuid; v_costing_line uuid; v_nominal uuid; v_count integer:=0;
begin
  select document.* into v_document
  from public."FIN_Documents" document
  join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=document."FINDoc_LegalEntityID"
  where document."FINDoc_ID"=p_document_id and entity."Company_ID"=p_company_id for update;
  if not found then raise exception 'Finance document not found.' using errcode='P0002'; end if;
  if v_document."FINDoc_StatusCode"<>'draft' or v_document."FINDoc_SourceJobID" is null then
    if v_document."FINDoc_SourceJobID" is null then return jsonb_build_object('documentId',p_document_id,'linkedCount',0); end if;
    raise exception 'Only a job-linked draft can change charge allocations.' using errcode='22023';
  end if;
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and coalesce("User_AccessStatus",'active')='active') then raise exception 'The finance operator is outside this workspace.' using errcode='42501'; end if;
  if jsonb_typeof(p_lines)<>'array' then raise exception 'Charge allocations must be an array.' using errcode='22023'; end if;
  for v_entry in select value from jsonb_array_elements(p_lines) loop
    select line."FINDocLine_ID" into v_line_id from public."FIN_DocumentLines" line
    where line."FINDocLine_DocumentID"=p_document_id and line."FINDocLine_LineNo"=(v_entry->>'lineNo')::integer;
    if v_line_id is null then raise exception 'Finance line % was not found.',v_entry->>'lineNo' using errcode='P0002'; end if;
    v_costing_line:=nullif(v_entry->>'jobCostingLineId','')::uuid;
    if v_costing_line is not null then
      select case when v_document."FINDoc_TypeCode" in ('sl_invoice','credit_note') then line."JobCostingLine_RevenueNominalAccountID" else line."JobCostingLine_CostNominalAccountID" end
      into v_nominal from public."Job_Costing_Lines" line
      where line."JobCostingLine_ID"=v_costing_line and line."Job_ID"=v_document."FINDoc_SourceJobID";
      if not found then raise exception 'A selected charge line does not belong to this job.' using errcode='42501'; end if;
      if v_nominal is null then raise exception 'Assign a nominal code to the selected job charge before review.' using errcode='22023'; end if;
    else v_nominal:=null;
    end if;
    update public."FIN_DocumentLineJobLinks" set "FINDocLineJob_JobCostingLineID"=v_costing_line,"FINDocLineJob_LinkTypeCode"=case when v_costing_line is null then 'source_job' else 'source_charge_line' end
    where "FINDocLineJob_DocumentID"=p_document_id and "FINDocLineJob_DocumentLineID"=v_line_id and "FINDocLineJob_JobID"=v_document."FINDoc_SourceJobID";
    update public."FIN_DocumentLines" set "FINDocLine_NominalAccountID"=v_nominal where "FINDocLine_ID"=v_line_id;
    if v_costing_line is not null then v_count:=v_count+1; end if;
  end loop;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON")
  values('finance_lifecycle',p_user_id,v_document."FINDoc_LegalEntityID",'multideck-app','finance','public','FIN_Documents',v_document."FINDoc_TypeCode",p_document_id,'link_job_charge_lines','Document lines linked to job charges',true,v_count,jsonb_build_object('linkedCount',v_count));
  return jsonb_build_object('documentId',p_document_id,'linkedCount',v_count);
end; $$;
revoke all on function public.multideck_finance_link_document_charge_lines(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_finance_link_document_charge_lines(uuid,uuid,uuid,jsonb) to service_role;

create or replace view public."FIN_JobChargeProfitability" with (security_invoker=true) as
with actual as (
  select link."FINDocLineJob_JobCostingLineID" line_id,
    coalesce(sum(link."FINDocLineJob_LocalNetAmount") filter(where document."FINDoc_TypeCode" in ('sl_invoice','credit_note')),0) actual_revenue,
    coalesce(sum(link."FINDocLineJob_LocalNetAmount") filter(where document."FINDoc_TypeCode" in ('pl_invoice','debit_note')),0) actual_cost
  from public."FIN_DocumentLineJobLinks" link
  join public."FIN_Documents" document on document."FINDoc_ID"=link."FINDocLineJob_DocumentID" and document."FINDoc_PostingStatusCode"='posted'
  where link."FINDocLineJob_JobCostingLineID" is not null
  group by link."FINDocLineJob_JobCostingLineID"
), balances as (
  select line."JobCostingLine_ID" line_id,
    coalesce((select sum(wip."FINWIP_LocalWIPAmount"-wip."FINWIP_RelievedAmount") from public."FIN_WIPItems" wip where wip."FINWIP_JobCostingLineID"=line."JobCostingLine_ID" and wip."FINWIP_StatusCode" in ('posted','partially_reversed')),0) open_wip,
    coalesce((select sum(accrual."FINAccrual_LocalAccruedAmount"-accrual."FINAccrual_RelievedAmount") from public."FIN_Accruals" accrual where accrual."FINAccrual_JobCostingLineID"=line."JobCostingLine_ID" and accrual."FINAccrual_StatusCode" in ('posted','partially_reversed')),0) open_accrual
  from public."Job_Costing_Lines" line
)
select line."JobCostingLine_ID" as "FINChargeProfit_JobCostingLineID",line."Job_ID" as "FINChargeProfit_JobID",line."JobCostingLine_Number" as "FINChargeProfit_LineNo",
  charge."RATECharge_Code" as "FINChargeProfit_ChargeCode",line."JobCostingLine_Description" as "FINChargeProfit_Description",
  line."JobCostingLine_CostNominalAccountID" as "FINChargeProfit_CostNominalAccountID",cost_nominal."FINNom_Code" as "FINChargeProfit_CostNominalCode",
  line."JobCostingLine_RevenueNominalAccountID" as "FINChargeProfit_RevenueNominalAccountID",revenue_nominal."FINNom_Code" as "FINChargeProfit_RevenueNominalCode",
  coalesce(line."JobCostingLine_RevenueAmountLocal",0) as "FINChargeProfit_ExpectedRevenue",
  coalesce(line."JobCostingLine_CostAmountLocal",0) as "FINChargeProfit_ExpectedCost",
  coalesce(actual.actual_revenue,0) as "FINChargeProfit_ActualRevenue",coalesce(actual.actual_cost,0) as "FINChargeProfit_ActualCost",
  coalesce(balances.open_wip,0) as "FINChargeProfit_OpenWIP",coalesce(balances.open_accrual,0) as "FINChargeProfit_OpenAccrual",
  coalesce(actual.actual_revenue,0)+coalesce(balances.open_wip,0) as "FINChargeProfit_RecognisedRevenue",
  coalesce(actual.actual_cost,0)+coalesce(balances.open_accrual,0) as "FINChargeProfit_RecognisedCost",
  coalesce(actual.actual_revenue,0)+coalesce(balances.open_wip,0)-coalesce(actual.actual_cost,0)-coalesce(balances.open_accrual,0) as "FINChargeProfit_GrossProfit",
  coalesce(actual.actual_revenue,0)+coalesce(balances.open_wip,0)-coalesce(line."JobCostingLine_RevenueAmountLocal",0) as "FINChargeProfit_RevenueMovement",
  coalesce(actual.actual_cost,0)+coalesce(balances.open_accrual,0)-coalesce(line."JobCostingLine_CostAmountLocal",0) as "FINChargeProfit_CostMovement"
from public."Job_Costing_Lines" line
left join public."RATE_ChargeCodes" charge on charge."RATECharge_ID"=line."JobCostingLine_ChargeCodeID"
left join public."FIN_NominalAccounts" cost_nominal on cost_nominal."FINNom_ID"=line."JobCostingLine_CostNominalAccountID"
left join public."FIN_NominalAccounts" revenue_nominal on revenue_nominal."FINNom_ID"=line."JobCostingLine_RevenueNominalAccountID"
left join actual on actual.line_id=line."JobCostingLine_ID"
left join balances on balances.line_id=line."JobCostingLine_ID";

revoke all on public."FIN_JobChargeProfitability" from public,anon,authenticated;
grant select on public."FIN_JobChargeProfitability" to service_role;

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
  if v_next='approved' then
    update public."FIN_JobChargePeriodAllocations" allocation set
      "FINChargePeriod_ApprovedWIP"=allocation."FINChargePeriod_ProposedWIP",
      "FINChargePeriod_ApprovedAccrual"=allocation."FINChargePeriod_ProposedAccrual",
      "FINChargePeriod_UpdatedAt"=now(),"FINChargePeriod_UpdatedBy"=p_user_id
    from public."FIN_PeriodCloseRunItems" item
    where item."FINCloseItem_ID"=allocation."FINChargePeriod_CloseRunItemID" and item."FINCloseItem_CloseRunID"=p_run_id;
  end if;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON") values('finance_lifecycle',p_user_id,v_run."FINCloseRun_LegalEntityID",'multideck-app','finance','public','FIN_PeriodCloseRuns','accrual_wip_review',p_run_id,p_action,'Accrual and WIP review '||replace(v_next,'_',' '),nullif(btrim(p_reason),''),true,1,jsonb_build_object('fromStatus',v_run."FINCloseRun_StatusCode",'toStatus',v_next,'basis','job_charge_lines'));
  return jsonb_build_object('runId',p_run_id,'status',v_next);
end; $$;
revoke all on function public.multideck_finance_transition_accrual_wip(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.multideck_finance_transition_accrual_wip(uuid,uuid,uuid,text,text) to service_role;

create or replace function public.multideck_finance_post_accrual_wip(
  p_company_id uuid,p_user_id uuid,p_run_id uuid
) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  v_run public."FIN_PeriodCloseRuns"%rowtype; v_period public."FIN_Periods"%rowtype; v_item public."FIN_PeriodCloseRunItems"%rowtype;
  v_charge public."FIN_JobChargePeriodAllocations"%rowtype; v_batch uuid; v_accrual uuid; v_wip uuid; v_line integer:=0; v_total numeric:=0;
  v_currency text; v_cost uuid; v_income uuid; v_accrual_control uuid; v_wip_control uuid; v_has_charge_rows boolean;
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
  select exists(select 1 from public."FIN_JobChargePeriodAllocations" allocation join public."FIN_PeriodCloseRunItems" item on item."FINCloseItem_ID"=allocation."FINChargePeriod_CloseRunItemID" where item."FINCloseItem_CloseRunID"=p_run_id) into v_has_charge_rows;
  if v_has_charge_rows then
    for v_charge in
      select allocation.* from public."FIN_JobChargePeriodAllocations" allocation join public."FIN_PeriodCloseRunItems" item on item."FINCloseItem_ID"=allocation."FINChargePeriod_CloseRunItemID"
      where item."FINCloseItem_CloseRunID"=p_run_id and (allocation."FINChargePeriod_ApprovedAccrual">0 or allocation."FINChargePeriod_ApprovedWIP">0)
      order by allocation."FINChargePeriod_JobID",allocation."FINChargePeriod_LineNoSnapshot"
    loop
      if v_charge."FINChargePeriod_ApprovedAccrual">0 then
        insert into public."FIN_Accruals"("FINAccrual_JobID","FINAccrual_JobCostingLineID","FINAccrual_PeriodID","FINAccrual_StatusCode","FINAccrual_AccountingDate","FINAccrual_ExpectedAmount","FINAccrual_AccruedAmount","FINAccrual_LocalAccruedAmount","FINAccrual_CurrencyCodeSnapshot","FINAccrual_CreatedBy","FINAccrual_CloseRunItemID","FINAccrual_Description","FINAccrual_ApprovedAt","FINAccrual_ApprovedBy","FINAccrual_PostedAt","FINAccrual_PostedBy") values(v_charge."FINChargePeriod_JobID",v_charge."FINChargePeriod_JobCostingLineID",v_period."FINPeriod_ID",'posted',v_period."FINPeriod_EndDate",v_charge."FINChargePeriod_ExpectedCost",v_charge."FINChargePeriod_ApprovedAccrual",v_charge."FINChargePeriod_ApprovedAccrual",v_currency,p_user_id,v_charge."FINChargePeriod_CloseRunItemID",'Cost accrual · '||v_charge."FINChargePeriod_DescriptionSnapshot",v_run."FINCloseRun_ApprovedAt",v_run."FINCloseRun_ApprovedBy",now(),p_user_id) returning "FINAccrual_ID" into v_accrual;
        v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_AccrualID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID","FINPostLine_JobID") values(v_batch,v_line,coalesce(v_charge."FINChargePeriod_CostNominalAccountID",v_cost),v_accrual,'Accrued job cost · '||v_charge."FINChargePeriod_DescriptionSnapshot",v_charge."FINChargePeriod_ApprovedAccrual",0,v_currency,v_charge."FINChargePeriod_JobID",v_charge."FINChargePeriod_JobID");
        v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_AccrualID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID","FINPostLine_JobID") values(v_batch,v_line,v_accrual_control,v_accrual,'Accrued cost liability · '||v_charge."FINChargePeriod_DescriptionSnapshot",0,v_charge."FINChargePeriod_ApprovedAccrual",v_currency,v_charge."FINChargePeriod_JobID",v_charge."FINChargePeriod_JobID");
        v_total:=v_total+v_charge."FINChargePeriod_ApprovedAccrual";
      end if;
      if v_charge."FINChargePeriod_ApprovedWIP">0 then
        insert into public."FIN_WIPItems"("FINWIP_JobID","FINWIP_JobCostingLineID","FINWIP_PeriodID","FINWIP_StatusCode","FINWIP_AccountingDate","FINWIP_ExpectedAmount","FINWIP_WIPAmount","FINWIP_LocalWIPAmount","FINWIP_CurrencyCodeSnapshot","FINWIP_CreatedBy","FINWIP_CloseRunItemID","FINWIP_Description","FINWIP_ApprovedAt","FINWIP_ApprovedBy","FINWIP_PostedAt","FINWIP_PostedBy") values(v_charge."FINChargePeriod_JobID",v_charge."FINChargePeriod_JobCostingLineID",v_period."FINPeriod_ID",'posted',v_period."FINPeriod_EndDate",v_charge."FINChargePeriod_ExpectedRevenue",v_charge."FINChargePeriod_ApprovedWIP",v_charge."FINChargePeriod_ApprovedWIP",v_currency,p_user_id,v_charge."FINChargePeriod_CloseRunItemID",'Revenue WIP · '||v_charge."FINChargePeriod_DescriptionSnapshot",v_run."FINCloseRun_ApprovedAt",v_run."FINCloseRun_ApprovedBy",now(),p_user_id) returning "FINWIP_ID" into v_wip;
        v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_WIPID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID","FINPostLine_JobID") values(v_batch,v_line,v_wip_control,v_wip,'Accrued income and WIP · '||v_charge."FINChargePeriod_DescriptionSnapshot",v_charge."FINChargePeriod_ApprovedWIP",0,v_currency,v_charge."FINChargePeriod_JobID",v_charge."FINChargePeriod_JobID");
        v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_WIPID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID","FINPostLine_JobID") values(v_batch,v_line,coalesce(v_charge."FINChargePeriod_RevenueNominalAccountID",v_income),v_wip,'Recognised unbilled revenue · '||v_charge."FINChargePeriod_DescriptionSnapshot",0,v_charge."FINChargePeriod_ApprovedWIP",v_currency,v_charge."FINChargePeriod_JobID",v_charge."FINChargePeriod_JobID");
        v_total:=v_total+v_charge."FINChargePeriod_ApprovedWIP";
      end if;
    end loop;
  else
    -- Compatibility for reviews created before charge-level allocation existed.
    for v_item in select * from public."FIN_PeriodCloseRunItems" where "FINCloseItem_CloseRunID"=p_run_id and ("FINCloseItem_ApprovedAccrual">0 or "FINCloseItem_ApprovedWIP">0) order by "FINCloseItem_JobID" loop
      if v_item."FINCloseItem_ApprovedAccrual">0 then
        insert into public."FIN_Accruals"("FINAccrual_JobID","FINAccrual_PeriodID","FINAccrual_StatusCode","FINAccrual_AccountingDate","FINAccrual_ExpectedAmount","FINAccrual_AccruedAmount","FINAccrual_LocalAccruedAmount","FINAccrual_CurrencyCodeSnapshot","FINAccrual_CreatedBy","FINAccrual_CloseRunItemID") values(v_item."FINCloseItem_JobID",v_period."FINPeriod_ID",'posted',v_period."FINPeriod_EndDate",v_item."FINCloseItem_ExpectedCost",v_item."FINCloseItem_ApprovedAccrual",v_item."FINCloseItem_ApprovedAccrual",v_currency,p_user_id,v_item."FINCloseItem_ID") returning "FINAccrual_ID" into v_accrual;
        v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_AccrualID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_JobID") values(v_batch,v_line,v_cost,v_accrual,'Legacy accrued job cost',v_item."FINCloseItem_ApprovedAccrual",0,v_currency,v_item."FINCloseItem_JobID");
        v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_AccrualID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_JobID") values(v_batch,v_line,v_accrual_control,v_accrual,'Legacy accrued cost liability',0,v_item."FINCloseItem_ApprovedAccrual",v_currency,v_item."FINCloseItem_JobID"); v_total:=v_total+v_item."FINCloseItem_ApprovedAccrual";
      end if;
      if v_item."FINCloseItem_ApprovedWIP">0 then
        insert into public."FIN_WIPItems"("FINWIP_JobID","FINWIP_PeriodID","FINWIP_StatusCode","FINWIP_AccountingDate","FINWIP_ExpectedAmount","FINWIP_WIPAmount","FINWIP_LocalWIPAmount","FINWIP_CurrencyCodeSnapshot","FINWIP_CreatedBy","FINWIP_CloseRunItemID") values(v_item."FINCloseItem_JobID",v_period."FINPeriod_ID",'posted',v_period."FINPeriod_EndDate",v_item."FINCloseItem_ExpectedRevenue",v_item."FINCloseItem_ApprovedWIP",v_item."FINCloseItem_ApprovedWIP",v_currency,p_user_id,v_item."FINCloseItem_ID") returning "FINWIP_ID" into v_wip;
        v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_WIPID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_JobID") values(v_batch,v_line,v_wip_control,v_wip,'Legacy accrued income and WIP',v_item."FINCloseItem_ApprovedWIP",0,v_currency,v_item."FINCloseItem_JobID");
        v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_WIPID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_JobID") values(v_batch,v_line,v_income,v_wip,'Legacy recognised unbilled revenue',0,v_item."FINCloseItem_ApprovedWIP",v_currency,v_item."FINCloseItem_JobID"); v_total:=v_total+v_item."FINCloseItem_ApprovedWIP";
      end if;
    end loop;
  end if;
  if v_total<=0 then raise exception 'This review has no approved accrual or WIP amounts to post.' using errcode='22023'; end if;
  update public."FIN_PostingBatches" set "FINPostBatch_DebitTotal"=v_total,"FINPostBatch_CreditTotal"=v_total where "FINPostBatch_ID"=v_batch;
  update public."FIN_PeriodCloseRunItems" set "FINCloseItem_StatusCode"='posted',"FINCloseItem_UpdatedAt"=now(),"FINCloseItem_UpdatedBy"=p_user_id where "FINCloseItem_CloseRunID"=p_run_id;
  update public."FIN_PeriodCloseRuns" set "FINCloseRun_StatusCode"='posted',"FINCloseRun_PostedAt"=now(),"FINCloseRun_PostedBy"=p_user_id,"FINCloseRun_PostingBatchID"=v_batch,"FINCloseRun_UpdatedAt"=now(),"FINCloseRun_UpdatedBy"=p_user_id,"FINCloseRun_ControlTotalsJSON"="FINCloseRun_ControlTotalsJSON"||jsonb_build_object('postedTotal',v_total,'postingBatchId',v_batch,'basis','job_charge_lines') where "FINCloseRun_ID"=p_run_id;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON") values('finance_lifecycle',p_user_id,v_run."FINCloseRun_LegalEntityID",'multideck-app','finance','public','FIN_PeriodCloseRuns','accrual_wip_review',p_run_id,'post_accrual_wip','Charge-level accrual and WIP journal posted',true,1,jsonb_build_object('postingBatchId',v_batch,'total',v_total,'currency',v_currency,'basis','job_charge_lines'));
  return jsonb_build_object('runId',p_run_id,'status','posted','postingBatchId',v_batch,'total',v_total,'currency',v_currency,'basis','job_charge_lines');
end; $$;
revoke all on function public.multideck_finance_post_accrual_wip(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_finance_post_accrual_wip(uuid,uuid,uuid) to service_role;

create or replace function public._multideck_finance_release_document_accrual_wip(p_document_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  v_document public."FIN_Documents"%rowtype; v_period public."FIN_Periods"%rowtype; v_user uuid; v_period_id uuid; v_batch uuid;
  v_charge record; v_adjustment record; v_source_line record; v_available numeric; v_release numeric; v_source_amount numeric;
  v_line integer:=0; v_total numeric:=0; v_wip_total numeric:=0; v_accrual_total numeric:=0; v_kind text; v_company uuid;
begin
  select * into v_document from public."FIN_Documents" where "FINDoc_ID"=p_document_id for update;
  if not found or v_document."FINDoc_PostingStatusCode"<>'posted' or v_document."FINDoc_TypeCode" not in ('sl_invoice','pl_invoice') then return jsonb_build_object('documentId',p_document_id,'released',false,'reason','not_applicable'); end if;
  if v_document."FINDoc_LegalEntityID" is null or v_document."FINDoc_LocalNetAmount"<=0 then return jsonb_build_object('documentId',p_document_id,'released',false,'reason','no_positive_local_net_value'); end if;
  if exists(select 1 from public."FIN_AccrualWIPReleases" where "FINRelease_DocumentID"=p_document_id) then
    select coalesce(sum("FINRelease_LocalAmount") filter(where "FINRelease_ReleaseKindCode"='revenue_wip'),0),coalesce(sum("FINRelease_LocalAmount") filter(where "FINRelease_ReleaseKindCode"='cost_accrual'),0)
    into v_wip_total,v_accrual_total from public."FIN_AccrualWIPReleases" where "FINRelease_DocumentID"=p_document_id;
    return jsonb_build_object('documentId',p_document_id,'released',true,'idempotent',true,'wipReleased',v_wip_total,'accrualReleased',v_accrual_total);
  end if;
  v_user:=coalesce(v_document."FINDoc_PostedBy",v_document."FINDoc_UpdatedBy",v_document."FINDoc_CreatedBy");
  v_kind:=case when v_document."FINDoc_TypeCode"='sl_invoice' then 'revenue_wip' else 'cost_accrual' end;
  if not exists(
    select 1 from public."FIN_DocumentLineJobLinks" link
    where link."FINDocLineJob_DocumentID"=p_document_id and link."FINDocLineJob_JobCostingLineID" is not null and
      ((v_kind='revenue_wip' and exists(select 1 from public."FIN_WIPItems" w where w."FINWIP_JobCostingLineID"=link."FINDocLineJob_JobCostingLineID" and w."FINWIP_StatusCode" in ('posted','partially_reversed') and w."FINWIP_WIPAmount">w."FINWIP_RelievedAmount"))
       or (v_kind='cost_accrual' and exists(select 1 from public."FIN_Accruals" a where a."FINAccrual_JobCostingLineID"=link."FINDocLineJob_JobCostingLineID" and a."FINAccrual_StatusCode" in ('posted','partially_reversed') and a."FINAccrual_AccruedAmount">a."FINAccrual_RelievedAmount")))
  ) then return jsonb_build_object('documentId',p_document_id,'released',false,'reason','unallocated_or_no_matching_charge_balance','grossProfitChanged',true); end if;
  v_period_id:=v_document."FINDoc_PeriodID";
  if v_period_id is not null then select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=v_period_id and "FINPeriod_LegalEntityID"=v_document."FINDoc_LegalEntityID"; if not found then v_period_id:=null; end if; end if;
  if v_period_id is null then v_period_id:=public._multideck_finance_ensure_period(v_document."FINDoc_LegalEntityID",to_char(v_document."FINDoc_AccountingDate",'YYYYMM'),v_user); select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=v_period_id; end if;
  insert into public."FIN_PostingBatches"("FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable","FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID","FINPostBatch_DebitTotal","FINPostBatch_CreditTotal","FINPostBatch_CurrencyCodeSnapshot","FINPostBatch_PostedAt","FINPostBatch_PostedBy","FINPostBatch_CreatedBy") values('AUTO-REL-'||left(coalesce(v_document."FINDoc_Number",p_document_id::text),56),'posted','FIN_Documents',p_document_id,v_period_id,v_document."FINDoc_LegalEntityID",0,0,v_period."FINPeriod_BaseCurrencyCode",now(),v_user,v_user) returning "FINPostBatch_ID" into v_batch;
  for v_charge in
    select link."FINDocLineJob_JobID" job_id,link."FINDocLineJob_JobCostingLineID" costing_line_id,round(abs(sum(link."FINDocLineJob_LocalNetAmount")),4) local_net
    from public."FIN_DocumentLineJobLinks" link
    where link."FINDocLineJob_DocumentID"=p_document_id and link."FINDocLineJob_JobID" is not null and link."FINDocLineJob_JobCostingLineID" is not null
    group by link."FINDocLineJob_JobID",link."FINDocLineJob_JobCostingLineID" order by link."FINDocLineJob_JobID",link."FINDocLineJob_JobCostingLineID"
  loop
    v_available:=v_charge.local_net;
    if v_kind='revenue_wip' then
      for v_adjustment in
        select wip.*,run."FINCloseRun_PostingBatchID" from public."FIN_WIPItems" wip
        join public."FIN_Periods" source_period on source_period."FINPeriod_ID"=wip."FINWIP_PeriodID" and source_period."FINPeriod_LegalEntityID"=v_document."FINDoc_LegalEntityID"
        join public."FIN_PeriodCloseRunItems" item on item."FINCloseItem_ID"=wip."FINWIP_CloseRunItemID"
        join public."FIN_PeriodCloseRuns" run on run."FINCloseRun_ID"=item."FINCloseItem_CloseRunID"
        where wip."FINWIP_JobID"=v_charge.job_id and wip."FINWIP_JobCostingLineID"=v_charge.costing_line_id and wip."FINWIP_WIPAmount">wip."FINWIP_RelievedAmount" and wip."FINWIP_StatusCode" in ('posted','partially_reversed')
        order by wip."FINWIP_AccountingDate",wip."FINWIP_CreatedAt",wip."FINWIP_ID" for update of wip
      loop
        exit when v_available<=0; v_release:=least(v_available,v_adjustment."FINWIP_WIPAmount"-v_adjustment."FINWIP_RelievedAmount"); v_source_amount:=round(v_release/nullif(v_document."FINDoc_ExchangeRate",0),4);
        insert into public."FIN_AccrualWIPReleases"("FINRelease_LegalEntityID","FINRelease_DocumentID","FINRelease_DocumentTypeCode","FINRelease_JobID","FINRelease_JobCostingLineID","FINRelease_CloseRunItemID","FINRelease_WIPID","FINRelease_ReleaseKindCode","FINRelease_PeriodID","FINRelease_PostingBatchID","FINRelease_SourceAmount","FINRelease_LocalAmount","FINRelease_DocumentCurrencyCode","FINRelease_LocalCurrencyCode","FINRelease_ReleasedBy") values(v_document."FINDoc_LegalEntityID",p_document_id,v_document."FINDoc_TypeCode",v_charge.job_id,v_charge.costing_line_id,v_adjustment."FINWIP_CloseRunItemID",v_adjustment."FINWIP_ID",v_kind,v_period_id,v_batch,v_source_amount,v_release,v_document."FINDoc_CurrencyCodeSnapshot",v_period."FINPeriod_BaseCurrencyCode",v_user);
        for v_source_line in select line.* from public."FIN_PostingLines" line where line."FINPostLine_BatchID"=v_adjustment."FINCloseRun_PostingBatchID" and line."FINPostLine_WIPID"=v_adjustment."FINWIP_ID" order by line."FINPostLine_LineNo" loop
          v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_DocumentID","FINPostLine_WIPID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID","FINPostLine_JobID") values(v_batch,v_line,v_source_line."FINPostLine_NominalAccountID",p_document_id,v_adjustment."FINWIP_ID",'Automatic WIP reclassification · '||coalesce(v_document."FINDoc_Number",p_document_id::text),round(v_source_line."FINPostLine_CreditAmount"*v_release/v_adjustment."FINWIP_WIPAmount",4),round(v_source_line."FINPostLine_DebitAmount"*v_release/v_adjustment."FINWIP_WIPAmount",4),v_period."FINPeriod_BaseCurrencyCode",v_charge.job_id,v_charge.job_id);
        end loop;
        update public."FIN_WIPItems" set "FINWIP_RelievedAmount"="FINWIP_RelievedAmount"+v_release,"FINWIP_StatusCode"=case when "FINWIP_RelievedAmount"+v_release>="FINWIP_WIPAmount" then 'reversed' else 'partially_reversed' end,"FINWIP_ReversalPeriodID"=v_period_id,"FINWIP_ReversedAt"=case when "FINWIP_RelievedAmount"+v_release>="FINWIP_WIPAmount" then now() else "FINWIP_ReversedAt" end,"FINWIP_ReversedBy"=case when "FINWIP_RelievedAmount"+v_release>="FINWIP_WIPAmount" then v_user else "FINWIP_ReversedBy" end where "FINWIP_ID"=v_adjustment."FINWIP_ID";
        v_available:=v_available-v_release; v_total:=v_total+v_release; v_wip_total:=v_wip_total+v_release;
      end loop;
    else
      for v_adjustment in
        select accrual.*,run."FINCloseRun_PostingBatchID" from public."FIN_Accruals" accrual
        join public."FIN_Periods" source_period on source_period."FINPeriod_ID"=accrual."FINAccrual_PeriodID" and source_period."FINPeriod_LegalEntityID"=v_document."FINDoc_LegalEntityID"
        join public."FIN_PeriodCloseRunItems" item on item."FINCloseItem_ID"=accrual."FINAccrual_CloseRunItemID"
        join public."FIN_PeriodCloseRuns" run on run."FINCloseRun_ID"=item."FINCloseItem_CloseRunID"
        where accrual."FINAccrual_JobID"=v_charge.job_id and accrual."FINAccrual_JobCostingLineID"=v_charge.costing_line_id and accrual."FINAccrual_AccruedAmount">accrual."FINAccrual_RelievedAmount" and accrual."FINAccrual_StatusCode" in ('posted','partially_reversed')
        order by accrual."FINAccrual_AccountingDate",accrual."FINAccrual_CreatedAt",accrual."FINAccrual_ID" for update of accrual
      loop
        exit when v_available<=0; v_release:=least(v_available,v_adjustment."FINAccrual_AccruedAmount"-v_adjustment."FINAccrual_RelievedAmount"); v_source_amount:=round(v_release/nullif(v_document."FINDoc_ExchangeRate",0),4);
        insert into public."FIN_AccrualWIPReleases"("FINRelease_LegalEntityID","FINRelease_DocumentID","FINRelease_DocumentTypeCode","FINRelease_JobID","FINRelease_JobCostingLineID","FINRelease_CloseRunItemID","FINRelease_AccrualID","FINRelease_ReleaseKindCode","FINRelease_PeriodID","FINRelease_PostingBatchID","FINRelease_SourceAmount","FINRelease_LocalAmount","FINRelease_DocumentCurrencyCode","FINRelease_LocalCurrencyCode","FINRelease_ReleasedBy") values(v_document."FINDoc_LegalEntityID",p_document_id,v_document."FINDoc_TypeCode",v_charge.job_id,v_charge.costing_line_id,v_adjustment."FINAccrual_CloseRunItemID",v_adjustment."FINAccrual_ID",v_kind,v_period_id,v_batch,v_source_amount,v_release,v_document."FINDoc_CurrencyCodeSnapshot",v_period."FINPeriod_BaseCurrencyCode",v_user);
        for v_source_line in select line.* from public."FIN_PostingLines" line where line."FINPostLine_BatchID"=v_adjustment."FINCloseRun_PostingBatchID" and line."FINPostLine_AccrualID"=v_adjustment."FINAccrual_ID" order by line."FINPostLine_LineNo" loop
          v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_DocumentID","FINPostLine_AccrualID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID","FINPostLine_JobID") values(v_batch,v_line,v_source_line."FINPostLine_NominalAccountID",p_document_id,v_adjustment."FINAccrual_ID",'Automatic accrual reclassification · '||coalesce(v_document."FINDoc_Number",p_document_id::text),round(v_source_line."FINPostLine_CreditAmount"*v_release/v_adjustment."FINAccrual_AccruedAmount",4),round(v_source_line."FINPostLine_DebitAmount"*v_release/v_adjustment."FINAccrual_AccruedAmount",4),v_period."FINPeriod_BaseCurrencyCode",v_charge.job_id,v_charge.job_id);
        end loop;
        update public."FIN_Accruals" set "FINAccrual_RelievedAmount"="FINAccrual_RelievedAmount"+v_release,"FINAccrual_StatusCode"=case when "FINAccrual_RelievedAmount"+v_release>="FINAccrual_AccruedAmount" then 'reversed' else 'partially_reversed' end,"FINAccrual_ReversalPeriodID"=v_period_id,"FINAccrual_ReversedAt"=case when "FINAccrual_RelievedAmount"+v_release>="FINAccrual_AccruedAmount" then now() else "FINAccrual_ReversedAt" end,"FINAccrual_ReversedBy"=case when "FINAccrual_RelievedAmount"+v_release>="FINAccrual_AccruedAmount" then v_user else "FINAccrual_ReversedBy" end where "FINAccrual_ID"=v_adjustment."FINAccrual_ID";
        v_available:=v_available-v_release; v_total:=v_total+v_release; v_accrual_total:=v_accrual_total+v_release;
      end loop;
    end if;
  end loop;
  if v_total<=0 then delete from public."FIN_PostingBatches" where "FINPostBatch_ID"=v_batch; return jsonb_build_object('documentId',p_document_id,'released',false,'reason','no_matching_charge_balance','grossProfitChanged',true); end if;
  update public."FIN_PostingBatches" set "FINPostBatch_DebitTotal"=v_total,"FINPostBatch_CreditTotal"=v_total where "FINPostBatch_ID"=v_batch;
  update public."FIN_PeriodCloseRunItems" item set "FINCloseItem_StatusCode"=case when not exists(select 1 from public."FIN_WIPItems" w where w."FINWIP_CloseRunItemID"=item."FINCloseItem_ID" and w."FINWIP_WIPAmount">w."FINWIP_RelievedAmount") and not exists(select 1 from public."FIN_Accruals" a where a."FINAccrual_CloseRunItemID"=item."FINCloseItem_ID" and a."FINAccrual_AccruedAmount">a."FINAccrual_RelievedAmount") then 'reversed' else 'partially_reversed' end,"FINCloseItem_UpdatedAt"=now(),"FINCloseItem_UpdatedBy"=v_user where item."FINCloseItem_ID" in (select "FINRelease_CloseRunItemID" from public."FIN_AccrualWIPReleases" where "FINRelease_DocumentID"=p_document_id);
  select "Company_ID" into v_company from public."cmp_LegalEntities" where "LegalEntity_ID"=v_document."FINDoc_LegalEntityID";
  if exists(select 1 from public."AI_DexterWatches" watch where watch."AIDexterWatch_CompanyID"=v_company and watch."AIDexterWatch_CapabilityCode"='finance' and watch."AIDexterWatch_StatusCode"='active') then
    insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON") values(v_company,'finance','FIN_Documents',p_document_id,jsonb_build_object('chargeReclassification',0),jsonb_build_object('chargeReclassification',v_total,'wipReleased',v_wip_total,'accrualReleased',v_accrual_total,'postingBatchId',v_batch));
  end if;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON") values('finance_lifecycle',v_user,v_document."FINDoc_LegalEntityID",'multideck-app','finance','public','FIN_Documents',v_document."FINDoc_TypeCode",p_document_id,'automatic_charge_reclassification','Posted invoice reclassified the matching job charge balance',true,1,jsonb_build_object('wipReleased',v_wip_total,'accrualReleased',v_accrual_total,'postingBatchId',v_batch,'basis','exact_job_charge_line'));
  return jsonb_build_object('documentId',p_document_id,'released',true,'wipReleased',v_wip_total,'accrualReleased',v_accrual_total,'postingBatchId',v_batch,'grossProfitChanged',false,'basis','exact_job_charge_line');
end; $$;
revoke all on function public._multideck_finance_release_document_accrual_wip(uuid) from public,anon,authenticated;
grant execute on function public._multideck_finance_release_document_accrual_wip(uuid) to service_role;

alter function public.multideck_dexter_domain_finance(uuid,text,integer) rename to _multideck_dexter_domain_finance_before_charge_profitability;
revoke all on function public._multideck_dexter_domain_finance_before_charge_profitability(uuid,text,integer) from public,anon,authenticated;
grant execute on function public._multideck_dexter_domain_finance_before_charge_profitability(uuid,text,integer) to service_role;

create function public.multideck_dexter_domain_finance(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  with records as (
    select value,coalesce((value->'evidence'->>'updatedAt')::timestamptz,'2000-01-01'::timestamptz) updated_at
    from jsonb_array_elements(public._multideck_dexter_domain_finance_before_charge_profitability(p_company_id,p_search,p_take)) value
    union all
    select jsonb_strip_nulls(jsonb_build_object(
      'recordId',profit."FINChargeProfit_JobCostingLineID",'recordKind','job_charge_profitability','jobId',profit."FINChargeProfit_JobID",
      'jobReference',job."Job_Period"||'-'||job."Job_Number",'lineNo',profit."FINChargeProfit_LineNo",'chargeCode',profit."FINChargeProfit_ChargeCode",'description',profit."FINChargeProfit_Description",
      'revenueNominalCode',profit."FINChargeProfit_RevenueNominalCode",'costNominalCode',profit."FINChargeProfit_CostNominalCode",
      'expectedRevenue',profit."FINChargeProfit_ExpectedRevenue",'expectedCost',profit."FINChargeProfit_ExpectedCost",
      'actualRevenue',profit."FINChargeProfit_ActualRevenue",'actualCost',profit."FINChargeProfit_ActualCost",'openWIP',profit."FINChargeProfit_OpenWIP",'openAccrual',profit."FINChargeProfit_OpenAccrual",
      'recognisedRevenue',profit."FINChargeProfit_RecognisedRevenue",'recognisedCost',profit."FINChargeProfit_RecognisedCost",'grossProfit',profit."FINChargeProfit_GrossProfit",
      'grossProfitMovement',profit."FINChargeProfit_RevenueMovement"-profit."FINChargeProfit_CostMovement",
      'evidence',jsonb_build_object('sourceTable','FIN_JobChargeProfitability','sourceId',profit."FINChargeProfit_JobCostingLineID",'legalEntityId',job."Job_LegalEntityID",'updatedAt',line."JobCostingLine_UpdatedAt")
    )),line."JobCostingLine_UpdatedAt"::timestamptz
    from public."FIN_JobChargeProfitability" profit
    join public."Job_Costing_Lines" line on line."JobCostingLine_ID"=profit."FINChargeProfit_JobCostingLineID"
    join public."Job_Header" job on job."Job_ID"=profit."FINChargeProfit_JobID"
    join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=job."Job_LegalEntityID"
    where entity."Company_ID"=p_company_id and (nullif(btrim(p_search),'') is null or concat_ws(' ',job."Job_Period",job."Job_Number",profit."FINChargeProfit_ChargeCode",profit."FINChargeProfit_Description",profit."FINChargeProfit_RevenueNominalCode",profit."FINChargeProfit_CostNominalCode") ilike '%'||btrim(p_search)||'%')
  )
  select coalesce(jsonb_agg(value order by updated_at desc),'[]'::jsonb) from (select * from records order by updated_at desc limit greatest(1,least(coalesce(p_take,10),25))) limited;
$$;
revoke all on function public.multideck_dexter_domain_finance(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_finance(uuid,text,integer) to service_role;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Tenant-safe finance documents, cash, job periods, charge-line expected values, WIP, accruals, actuals, nominal codes, gross profit and exact invoice reclassification evidence.',
  "AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code"='finance';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description"='Event-driven finance documents, charge-line WIP/accrual reclassifications, unmatched actual GP movements, provider sync, postings and reversals.',
  "AIDexterWatchCapability_FieldsJSON"=(select coalesce(jsonb_agg(distinct value),'[]'::jsonb) from jsonb_array_elements(coalesce("AIDexterWatchCapability_FieldsJSON",'[]'::jsonb)||'["jobChargeLine","revenueNominalCode","costNominalCode","openWIP","openAccrual","actualRevenue","actualCost","grossProfit","grossProfitMovement","chargeReclassification"]'::jsonb)),
  "AIDexterWatchCapability_UpdatedAt"=now()
where "AIDexterWatchCapability_Code"='finance';

commit;
