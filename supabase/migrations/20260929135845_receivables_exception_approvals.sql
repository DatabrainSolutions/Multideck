begin;

-- Receivables are configured separately; existing document policies continue
-- to govern payables and remain the fallback until an AR policy is saved.
alter table public."FIN_ApprovalPolicies"
  drop constraint "FIN_ApprovalPolicies_FINApprovalPolicy_WorkflowCode_check",
  add constraint "FIN_ApprovalPolicies_FINApprovalPolicy_WorkflowCode_check" check ("FINApprovalPolicy_WorkflowCode" in (
    'receivables','document','cash','payment_run','purchase_order','supplier_match',
    'charge_correction','charge_case_resolution','recognition_mandate','vat_control',
    'period_close','opening_balance','opening_fx','bank_match')),
  add column "FINApprovalPolicy_MinExpectedMarginPercent" numeric(9,4)
    check ("FINApprovalPolicy_MinExpectedMarginPercent" between 0 and 100),
  add constraint "CK_FIN_ApprovalPolicies_receivables" check (
    "FINApprovalPolicy_WorkflowCode"<>'receivables' or (
      "FINApprovalPolicy_ModeCode" in ('always_review','exception_review')
      and "FINApprovalPolicy_MinExpectedMarginPercent" is not null
      and "FINApprovalPolicy_MaxVariancePercent" is null));

drop function public.multideck_finance_save_approval_policy(uuid,uuid,uuid,text,text,numeric,numeric,text);

create function public.multideck_finance_save_approval_policy(
  p_company_id uuid,p_user_id uuid,p_entity_id uuid,p_workflow text,p_mode text,
  p_max_auto_amount numeric,p_max_variance_percent numeric,p_reason text,p_min_expected_margin_percent numeric default null
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_revision integer; v_policy public."FIN_ApprovalPolicies"%rowtype;
begin
  perform public._multideck_journal_access(p_user_id,p_entity_id,'Finance.Configuration.Manage');
  if not exists(select 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity_id and "Company_ID"=p_company_id and "LegalEntity_IsActive") then
    raise exception 'Approval policy entity is outside this workspace.' using errcode='42501';
  end if;
  if p_workflow not in ('receivables','document','cash','payment_run','purchase_order','supplier_match','charge_correction',
    'charge_case_resolution','recognition_mandate','vat_control','period_close','opening_balance','opening_fx','bank_match')
    or p_mode not in ('always_review','exception_review','automatic') then
    raise exception 'Choose a supported approval workflow and mode.' using errcode='22023';
  end if;
  if p_mode<>'always_review' and (p_max_auto_amount is null or p_max_auto_amount<0 or p_max_auto_amount>=1000000000000
    or p_max_auto_amount::text in ('NaN','Infinity','-Infinity') or p_max_auto_amount<>round(p_max_auto_amount,4)) then
    raise exception 'Automatic approval needs a finite base-currency amount limit.' using errcode='22023';
  end if;
  if p_max_variance_percent is not null and (p_max_variance_percent<0 or p_max_variance_percent>100
    or p_max_variance_percent::text in ('NaN','Infinity','-Infinity') or p_max_variance_percent<>round(p_max_variance_percent,4)) then
    raise exception 'The variance limit must be between zero and 100 percent.' using errcode='22023';
  end if;
  if p_workflow='receivables' and p_mode='automatic' then
    raise exception 'Receivables use exception review or always review.' using errcode='22023';
  end if;
  if p_min_expected_margin_percent is not null and (p_workflow<>'receivables'
    or p_min_expected_margin_percent::text in ('NaN','Infinity','-Infinity')
    or p_min_expected_margin_percent<0 or p_min_expected_margin_percent>100
    or p_min_expected_margin_percent<>round(p_min_expected_margin_percent,4)) then
    raise exception 'The minimum expected job margin must be between zero and 100 percent, for receivables only.' using errcode='22023';
  end if;
  if p_workflow='receivables' and p_max_variance_percent is not null then
    raise exception 'Use the expected job margin for receivables, not a posted-value variance.' using errcode='22023';
  end if;
  if length(btrim(coalesce(p_reason,''))) not between 1 and 500 then
    raise exception 'Explain the approval policy change.' using errcode='22023';
  end if;
  -- Lock the entity to serialise policy revisions without changing a prior revision.
  perform 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity_id for update;
  select coalesce(max("FINApprovalPolicy_Revision"),0)+1 into v_revision
  from public."FIN_ApprovalPolicies" where "FINApprovalPolicy_LegalEntityID"=p_entity_id and "FINApprovalPolicy_WorkflowCode"=p_workflow;
  insert into public."FIN_ApprovalPolicies"("FINApprovalPolicy_LegalEntityID","FINApprovalPolicy_WorkflowCode",
    "FINApprovalPolicy_Revision","FINApprovalPolicy_ModeCode","FINApprovalPolicy_MaxAutoAmount",
    "FINApprovalPolicy_MaxVariancePercent","FINApprovalPolicy_MinExpectedMarginPercent","FINApprovalPolicy_Reason","FINApprovalPolicy_CreatedBy")
  values(p_entity_id,p_workflow,v_revision,p_mode,case when p_mode='always_review' then null else p_max_auto_amount end,
    case when p_mode='always_review' then null else p_max_variance_percent end,case when p_workflow='receivables' then coalesce(p_min_expected_margin_percent,0) else null end,btrim(p_reason),p_user_id)
  returning * into v_policy;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
    "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
  values('finance_lifecycle',p_user_id,p_entity_id,'multideck-app','finance','public','FIN_ApprovalPolicies',
    'finance_approval_policy',v_policy."FINApprovalPolicy_ID",'save_approval_policy','Finance approval policy changed',
    jsonb_build_object('workflow',p_workflow,'mode',p_mode,'revision',v_revision,'maxAutoAmount',v_policy."FINApprovalPolicy_MaxAutoAmount",
      'maxVariancePercent',v_policy."FINApprovalPolicy_MaxVariancePercent",'minExpectedMarginPercent',v_policy."FINApprovalPolicy_MinExpectedMarginPercent",'reason',btrim(p_reason)));
  return jsonb_build_object('policyId',v_policy."FINApprovalPolicy_ID",'entityId',p_entity_id,'workflow',p_workflow,
    'mode',p_mode,'revision',v_revision,'maxAutoAmount',v_policy."FINApprovalPolicy_MaxAutoAmount",
    'maxVariancePercent',v_policy."FINApprovalPolicy_MaxVariancePercent",'minExpectedMarginPercent',v_policy."FINApprovalPolicy_MinExpectedMarginPercent");
end; $$;
revoke all on function public.multideck_finance_save_approval_policy(uuid,uuid,uuid,text,text,numeric,numeric,text,numeric) from public,anon,authenticated;
grant execute on function public.multideck_finance_save_approval_policy(uuid,uuid,uuid,text,text,numeric,numeric,text,numeric) to service_role;

create or replace function public.multideck_finance_list_approval_policies(p_company_id uuid,p_entity_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_policies jsonb;
begin
  if not exists(select 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity_id and "Company_ID"=p_company_id and "LegalEntity_IsActive") then
    raise exception 'Approval policy entity is outside this workspace.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('policyId',policy."FINApprovalPolicy_ID",'entityId',policy."FINApprovalPolicy_LegalEntityID",
    'workflow',policy."FINApprovalPolicy_WorkflowCode",'mode',policy."FINApprovalPolicy_ModeCode",'revision',policy."FINApprovalPolicy_Revision",
    'maxAutoAmount',policy."FINApprovalPolicy_MaxAutoAmount",'maxVariancePercent',policy."FINApprovalPolicy_MaxVariancePercent",
    'minExpectedMarginPercent',policy."FINApprovalPolicy_MinExpectedMarginPercent",'reason',policy."FINApprovalPolicy_Reason",'createdAt',policy."FINApprovalPolicy_CreatedAt") order by policy."FINApprovalPolicy_WorkflowCode"),'[]'::jsonb)
  into v_policies from (
    select distinct on ("FINApprovalPolicy_WorkflowCode") * from public."FIN_ApprovalPolicies"
    where "FINApprovalPolicy_LegalEntityID"=p_entity_id
    order by "FINApprovalPolicy_WorkflowCode","FINApprovalPolicy_Revision" desc
  ) policy;
  return v_policies;
end; $$;
revoke all on function public.multideck_finance_list_approval_policies(uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_finance_list_approval_policies(uuid,uuid) to service_role;

-- The benchmark is the current, complete expected costing, excluding tax.
-- Posting this document does not add its sales to that forecast a second time.
create function public._multideck_receivables_expected_jobs(
  p_company uuid,p_entity uuid,p_document uuid,p_min_margin numeric
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_job_id uuid; v_job public."Job_Header"%rowtype; v_sales numeric; v_cost numeric;
  v_count integer; v_complete boolean; v_margin numeric; v_reason text;
  v_jobs jsonb:='[]'::jsonb; v_reasons jsonb:='[]'::jsonb;
begin
  if not exists(select 1 from public."FIN_Documents" d
    join public."cmp_LegalEntities" e on e."LegalEntity_ID"=d."FINDoc_LegalEntityID"
    where d."FINDoc_ID"=p_document and e."LegalEntity_ID"=p_entity and e."Company_ID"=p_company and e."LegalEntity_IsActive") then
    raise exception 'Finance document not found in this workspace.' using errcode='42501';
  end if;
  -- Source links and their parent job/expected lines stay stable until posting.
  perform 1 from public."FIN_DocumentLineJobLinks" where "FINDocLineJob_DocumentID"=p_document for share;
  for v_job_id in
    select "FINDoc_SourceJobID" from public."FIN_Documents" where "FINDoc_ID"=p_document and "FINDoc_SourceJobID" is not null
    union
    select "FINDocLineJob_JobID" from public."FIN_DocumentLineJobLinks" where "FINDocLineJob_DocumentID"=p_document
    order by 1
  loop
    select * into v_job from public."Job_Header"
    where "Job_ID"=v_job_id and "Job_LegalEntityID"=p_entity and not "Job_IsDeleted"
      and exists(select 1 from public."cmp_Offices" office where office."Company_ID"=p_company
        and office."Office_ID" in ("Job_Header"."Job_OfficeID","Job_Header"."Job_OrgOfficeID")) for update;
    if not found then
      -- Do not disclose any foreign or unassigned job's financial evidence.
      v_reasons:=v_reasons||jsonb_build_array('job_scope_unverified');
      continue;
    end if;
    perform 1 from public."Job_Costing_Lines" where "Job_ID"=v_job_id for share;
    select count(*),sum("JobCostingLine_RevenueAmountLocal"),sum("JobCostingLine_CostAmountLocal"),
      bool_and("JobCostingLine_RevenueAmountLocal" is not null and "JobCostingLine_CostAmountLocal" is not null
        and "JobCostingLine_RevenueAmountLocal"::text not in ('NaN','Infinity','-Infinity')
        and "JobCostingLine_CostAmountLocal"::text not in ('NaN','Infinity','-Infinity'))
    into v_count,v_sales,v_cost,v_complete from public."Job_Costing_Lines" where "Job_ID"=v_job_id;
    v_reason:=null; v_margin:=null;
    if v_count=0 or not coalesce(v_complete,false) then
      v_reason:='expected_costing_incomplete'; v_sales:=null; v_cost:=null;
    else
      v_margin:=case when v_sales>0 then (v_sales-v_cost)/v_sales*100 when v_sales=v_cost then 0 else null end;
      if v_sales-v_cost<0 then v_reason:='expected_job_loss';
      elsif v_margin is null then v_reason:='expected_margin_unavailable';
      elsif v_margin<p_min_margin then v_reason:='expected_margin_limit'; end if;
    end if;
    if v_reason is not null then v_reasons:=v_reasons||jsonb_build_array(v_reason); end if;
    v_jobs:=v_jobs||jsonb_build_array(jsonb_build_object('jobId',v_job_id,
      'reference',concat(v_job."Job_Period",'-',v_job."Job_Number"),
      'expectedSales',v_sales,'expectedCosts',v_cost,'expectedProfit',v_sales-v_cost,
      'expectedMarginPercent',v_margin,'reason',v_reason,'sourceTable','Job_Costing_Lines','lineCount',v_count));
  end loop;
  if jsonb_array_length(v_jobs)=0 and exists(select 1 from public."FIN_Documents"
    where "FINDoc_ID"=p_document and "FINDoc_SourceKindCode"='job') then
    v_reasons:=v_reasons||jsonb_build_array('expected_costing_incomplete');
  end if;
  return jsonb_build_object('jobs',v_jobs,'reasons',(select coalesce(jsonb_agg(distinct value),'[]'::jsonb) from jsonb_array_elements(v_reasons)),
    'benchmark','expected_sales_and_costs','minExpectedMarginPercent',p_min_margin);
end; $$;
revoke all on function public._multideck_receivables_expected_jobs(uuid,uuid,uuid,numeric) from public,anon,authenticated;

create or replace function public.multideck_finance_submit_document(
  p_company_id uuid,p_user_id uuid,p_document_id uuid,p_reason text default null
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_document public."FIN_Documents"%rowtype; v_decision jsonb; v_result jsonb;
  v_period_open boolean; v_mirror record; v_policy public."FIN_ApprovalPolicies"%rowtype;
  v_receivables boolean; v_currency text; v_evidence jsonb; v_reasons jsonb:='[]'::jsonb;
  v_workflow text:='document';
begin
  select document.* into v_document from public."FIN_Documents" document
  join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=document."FINDoc_LegalEntityID"
  where document."FINDoc_ID"=p_document_id and entity."Company_ID"=p_company_id and entity."LegalEntity_IsActive"
  for update of document;
  if not found then raise exception 'Finance document not found in this workspace.' using errcode='P0002'; end if;
  v_receivables:=v_document."FINDoc_TypeCode" in ('sl_invoice','credit_note');
  perform public._multideck_journal_access(p_user_id,v_document."FINDoc_LegalEntityID",
    case when v_receivables then 'Finance.Receivables.Draft' else 'Finance.Payables.Draft' end);
  -- The policy save takes FOR UPDATE on this entity. Resolve it under the same
  -- lock held through evaluation and posting, including the fallback decision.
  select "LegalEntity_BaseCurrencyCodeSnapshot" into v_currency from public."cmp_LegalEntities"
  where "LegalEntity_ID"=v_document."FINDoc_LegalEntityID" for share;
  if v_receivables then
    select * into v_policy from public."FIN_ApprovalPolicies"
    where "FINApprovalPolicy_LegalEntityID"=v_document."FINDoc_LegalEntityID" and "FINApprovalPolicy_WorkflowCode"='receivables'
    order by "FINApprovalPolicy_Revision" desc limit 1;
    if found then v_workflow:='receivables'; end if;
  end if;
  v_result:=public.multideck_finance_transition_document(p_company_id,p_user_id,p_document_id,'request_review',p_reason);
  select * into v_document from public."FIN_Documents" where "FINDoc_ID"=p_document_id;
  select exists(select 1 from public."FIN_Periods" where "FINPeriod_LegalEntityID"=v_document."FINDoc_LegalEntityID"
    and v_document."FINDoc_AccountingDate" between "FINPeriod_StartDate" and "FINPeriod_EndDate"
    and "FINPeriod_StatusCode"='open') into v_period_open;
  select * into v_mirror from public._multideck_finance_mirror_state(v_document."FINDoc_LegalEntityID");
  if not v_period_open then v_reasons:=v_reasons||'"accounting_period_closed"'::jsonb; end if;
  if not coalesce(v_mirror.native_ledger_enabled,false) then v_reasons:=v_reasons||'"native_ledger_unavailable"'::jsonb; end if;
  if v_mirror.mirror_mode='required' and not coalesce(v_mirror.active_connection,false) then
    v_reasons:=v_reasons||'"required_mirror_unavailable"'::jsonb;
  end if;
  if v_document."FINDoc_CurrencyCodeSnapshot" is distinct from v_currency then v_reasons:=v_reasons||'"foreign_currency_review"'::jsonb; end if;
  if v_workflow='receivables' then
    v_evidence:=public._multideck_receivables_expected_jobs(p_company_id,v_document."FINDoc_LegalEntityID",p_document_id,v_policy."FINApprovalPolicy_MinExpectedMarginPercent");
    v_reasons:=v_reasons||(v_evidence->'reasons');
  elsif v_document."FINDoc_TypeCode" not in ('sl_invoice','pl_invoice') then
    v_reasons:=v_reasons||'"document_type_review"'::jsonb;
  end if;
  v_decision:=public.multideck_finance_approval_decision(p_company_id,v_document."FINDoc_LegalEntityID",v_workflow,
    abs(v_document."FINDoc_LocalGrossAmount"),jsonb_build_object(
      'hardException',jsonb_array_length(v_reasons)>0,
      'advisoryException',v_document."FINDoc_SourceKindCode" is null));
  if v_workflow='receivables' and v_decision->>'reason'='hard_exception' then
    v_decision:=v_decision||jsonb_build_object('reason',v_reasons->>0);
  end if;
  if v_decision->>'canAuto'<>'true' then
    v_reasons:=v_reasons||jsonb_build_array(v_decision->>'reason');
  end if;
  v_decision:=v_decision||coalesce(v_evidence,'{}'::jsonb)||jsonb_build_object('workflow',v_workflow,
    'reasons',(select coalesce(jsonb_agg(distinct value),'[]'::jsonb) from jsonb_array_elements(v_reasons)),
    'baseCurrency',v_currency,'amount',abs(v_document."FINDoc_LocalGrossAmount"),
    'maxAutoAmount',v_policy."FINApprovalPolicy_MaxAutoAmount",'evaluatedAt',now());
  update public."FIN_Documents" set "FINDoc_MetadataJSON"=coalesce("FINDoc_MetadataJSON",'{}'::jsonb)||jsonb_build_object('approvalPolicyDecision',v_decision)
  where "FINDoc_ID"=p_document_id;
  if v_decision->>'canAuto'='true' then
    v_result:=public.multideck_finance_transition_document(p_company_id,p_user_id,p_document_id,'approve','Completed by the legal entity approval policy');
  end if;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
    "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
  values('finance_lifecycle',p_user_id,v_document."FINDoc_LegalEntityID",'multideck-app','finance','public','FIN_Documents',
    v_document."FINDoc_TypeCode",p_document_id,case when v_decision->>'canAuto'='true' then 'automatic_approval' else 'approval_exception' end,
    'Finance document approval policy evaluated',jsonb_build_object('policy',v_decision,'submittedBy',p_user_id));
  return v_result||jsonb_build_object('approvalPolicyDecision',v_decision);
end; $$;

create or replace function public._multideck_dexter_finance_approval_policy_watch_change()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_company uuid; v_previous public."FIN_ApprovalPolicies"%rowtype;
begin
  select "Company_ID" into v_company from public."cmp_LegalEntities"
  where "LegalEntity_ID"=new."FINApprovalPolicy_LegalEntityID";
  if v_company is null or not exists(select 1 from public."AI_DexterWatches" watch
    join public."cmp_Users" owner on owner."User_ID"=watch."AIDexterWatch_OwnerUserID"
    where watch."AIDexterWatch_CompanyID"=v_company and watch."AIDexterWatch_CapabilityCode"='finance'
      and watch."AIDexterWatch_StatusCode"='active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID"=new."FINApprovalPolicy_LegalEntityID")
      and owner."Company_ID"=v_company and owner."User_AccessStatus"='active'
      and (public._multideck_dexter_has_permission(owner."User_ID",'Finance.Receivables.View')
        or public._multideck_dexter_has_permission(owner."User_ID",'Finance.Payables.View')))
  then return new; end if;
  select * into v_previous from public."FIN_ApprovalPolicies"
  where "FINApprovalPolicy_LegalEntityID"=new."FINApprovalPolicy_LegalEntityID"
    and "FINApprovalPolicy_WorkflowCode"=new."FINApprovalPolicy_WorkflowCode"
    and "FINApprovalPolicy_Revision"=new."FINApprovalPolicy_Revision"-1;
  insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode",
    "AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
  values(v_company,'finance','FIN_ApprovalPolicies',new."FINApprovalPolicy_LegalEntityID",
    case when v_previous."FINApprovalPolicy_ID" is null then '{}'::jsonb else jsonb_build_object(
      'approvalWorkflow',v_previous."FINApprovalPolicy_WorkflowCode",'approvalMode',v_previous."FINApprovalPolicy_ModeCode",
      'approvalRevision',v_previous."FINApprovalPolicy_Revision",'maxAutoAmount',v_previous."FINApprovalPolicy_MaxAutoAmount",
      'maxVariancePercent',v_previous."FINApprovalPolicy_MaxVariancePercent",'minExpectedMarginPercent',v_previous."FINApprovalPolicy_MinExpectedMarginPercent") end,
    jsonb_build_object('approvalWorkflow',new."FINApprovalPolicy_WorkflowCode",'approvalMode',new."FINApprovalPolicy_ModeCode",
      'approvalRevision',new."FINApprovalPolicy_Revision",'maxAutoAmount',new."FINApprovalPolicy_MaxAutoAmount",
      'maxVariancePercent',new."FINApprovalPolicy_MaxVariancePercent",'minExpectedMarginPercent',new."FINApprovalPolicy_MinExpectedMarginPercent",'policyId',new."FINApprovalPolicy_ID"));
  return new;
end; $$;
revoke all on function public._multideck_dexter_finance_approval_policy_watch_change() from public,anon,authenticated;

-- Enrich existing finance reads without dropping later domain extensions.
alter function public.multideck_dexter_domain_finance(uuid,text,integer)
  rename to _multideck_dexter_finance_before_receivables_exceptions;
revoke all on function public._multideck_dexter_finance_before_receivables_exceptions(uuid,text,integer) from public,anon,authenticated;
create function public.multideck_dexter_domain_finance(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg(record.value||case
    when policy."FINApprovalPolicy_ID" is not null then jsonb_build_object(
      'minExpectedMarginPercent',policy."FINApprovalPolicy_MinExpectedMarginPercent",'benchmark','expected_sales_and_costs')
    when document."FINDoc_ID" is not null then jsonb_build_object('approvalPolicyDecision',document."FINDoc_MetadataJSON"->'approvalPolicyDecision')
    else '{}'::jsonb end order by record.ordinality),'[]'::jsonb)
  from jsonb_array_elements(public._multideck_dexter_finance_before_receivables_exceptions(p_company_id,p_search,p_take)) with ordinality record(value,ordinality)
  left join public."FIN_ApprovalPolicies" policy on policy."FINApprovalPolicy_ID"::text=record.value->>'recordId'
    and exists(select 1 from public."cmp_LegalEntities" e where e."LegalEntity_ID"=policy."FINApprovalPolicy_LegalEntityID" and e."Company_ID"=p_company_id and e."LegalEntity_IsActive")
  left join public."FIN_Documents" document on document."FINDoc_ID"::text=record.value->>'recordId'
    and exists(select 1 from public."cmp_LegalEntities" e where e."LegalEntity_ID"=document."FINDoc_LegalEntityID" and e."Company_ID"=p_company_id and e."LegalEntity_IsActive")
$$;
revoke all on function public.multideck_dexter_domain_finance(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_finance(uuid,text,integer) to service_role;

create function public._multideck_receivables_decision_watch_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_company uuid; v_old jsonb:=old."FINDoc_MetadataJSON"->'approvalPolicyDecision';
  v_new jsonb:=new."FINDoc_MetadataJSON"->'approvalPolicyDecision';
begin
  if v_new is null or v_new->>'workflow'<>'receivables' or v_old is not distinct from v_new then return new; end if;
  select "Company_ID" into v_company from public."cmp_LegalEntities" where "LegalEntity_ID"=new."FINDoc_LegalEntityID" and "LegalEntity_IsActive";
  if not exists(select 1 from public."AI_DexterWatches" watch
    join public."cmp_Users" owner on owner."User_ID"=watch."AIDexterWatch_OwnerUserID"
    where watch."AIDexterWatch_CompanyID"=v_company and watch."AIDexterWatch_CapabilityCode"='finance'
      and watch."AIDexterWatch_StatusCode"='active' and owner."Company_ID"=v_company and owner."User_AccessStatus"='active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID"=new."FINDoc_ID")
      and public._multideck_dexter_has_permission(owner."User_ID",'Finance.Receivables.View')) then return new; end if;
  insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode",
    "AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
  values(v_company,'finance','FIN_Documents',new."FINDoc_ID",
    jsonb_build_object('approvalRequired',case when v_old is null then null else not (v_old->>'canAuto')::boolean end,
      'approvalReason',v_old->>'reason'),
    jsonb_build_object('approvalRequired',not (v_new->>'canAuto')::boolean,'approvalReason',v_new->>'reason',
      'approvalWorkflow','receivables','approvalRevision',v_new->'revision','approvalReasons',v_new->'reasons'));
  return new;
end; $$;
revoke all on function public._multideck_receivables_decision_watch_change() from public,anon,authenticated;
create trigger "TR_FIN_Documents_approval_decision_watch" after update of "FINDoc_MetadataJSON" on public."FIN_Documents"
for each row execute function public._multideck_receivables_decision_watch_change();
update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_FieldsJSON"=coalesce("AIDexterWatchCapability_FieldsJSON",'[]'::jsonb)||'["minExpectedMarginPercent","approvalRequired","approvalReason"]'::jsonb,
  "AIDexterWatchCapability_Description"='Event-driven Finance changes, including receivables approval exceptions and configured amount and expected job margin thresholds.',
  "AIDexterWatchCapability_UpdatedAt"=now() where "AIDexterWatchCapability_Code"='finance';
update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Tenant-safe finance and approval policy evidence, including receivables exception reasons and whole-job expected sales and costs. Configure thresholds and approve exceptions in Finance; Dexter cannot change approval policies or post documents.',
  "AIDexterDomain_UpdatedAt"=now() where "AIDexterDomain_Code"='finance';

-- Check each recipient, not just whether some authorised watcher caused a signal.
do $approval_watch_access$
declare definition text; marker text:=E'      and watch_row."AIDexterWatch_StatusCode" = ''active''';
begin
  definition:=pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then
    raise exception 'Review finance approval watch access guard before applying';
  end if;
  definition:=replace(definition,marker,marker||$guard$
      and (watch_row."AIDexterWatch_CapabilityCode"<>'finance'
        or not (new."AIDexterWatchSignal_NewJSON" ? 'approvalRequired' or new."AIDexterWatchSignal_SourceTable"='FIN_ApprovalPolicies')
        or exists(select 1 from public."cmp_Users" approval_owner
          where approval_owner."User_ID"=watch_row."AIDexterWatch_OwnerUserID"
            and approval_owner."Company_ID"=watch_row."AIDexterWatch_CompanyID"
            and approval_owner."User_AccessStatus"='active' and approval_owner."Auth_User_ID" is not null
            and (public._multideck_dexter_has_permission(approval_owner."User_ID",'Finance.Receivables.View')
              or (new."AIDexterWatchSignal_SourceTable"='FIN_ApprovalPolicies'
                and public._multideck_dexter_has_permission(approval_owner."User_ID",'Finance.Payables.View')))))$guard$);
  execute definition;
end $approval_watch_access$;

commit;
