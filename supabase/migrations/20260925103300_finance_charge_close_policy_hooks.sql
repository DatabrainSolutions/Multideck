begin;

-- This migration depends on the entity-scoped approval policy contract. The
-- older aggregate management WIP journal stays manually reviewed and posted.
-- No policy bypasses source, VAT, period, nominal or tenant controls.
alter table public."FIN_RecognitionMandates"
  add column approval_policy_id uuid references public."FIN_ApprovalPolicies"("FINApprovalPolicy_ID"),
  add column approval_policy_revision integer;
do $$declare v_constraint text; begin
  for v_constraint in select conname from pg_catalog.pg_constraint
    where conrelid='public."FIN_RecognitionMandates"'::regclass and contype='c'
      and pg_catalog.pg_get_constraintdef(oid) like '%approved_by <> prepared_by%'
  loop execute pg_catalog.format('alter table public."FIN_RecognitionMandates" drop constraint %I',v_constraint); end loop;
end$$;
alter table public."FIN_RecognitionMandates" add constraint fin_recognition_mandate_approval_authority
  check ((status='proposed' and approved_by is null and approval_policy_id is null)
    or (status<>'proposed' and approved_by is not null
      and (approved_by<>prepared_by or (approval_policy_id is not null and approval_policy_revision is not null))));

alter table public."FIN_ChargeCaseResolutions"
  add column approval_policy_id uuid references public."FIN_ApprovalPolicies"("FINApprovalPolicy_ID"),
  add column approval_policy_revision integer;
do $$declare v_constraint text; begin
  for v_constraint in select conname from pg_catalog.pg_constraint
    where conrelid='public."FIN_ChargeCaseResolutions"'::regclass and contype='c'
      and pg_catalog.pg_get_constraintdef(oid) like '%approved_by <> prepared_by%'
  loop execute pg_catalog.format('alter table public."FIN_ChargeCaseResolutions" drop constraint %I',v_constraint); end loop;
end$$;
alter table public."FIN_ChargeCaseResolutions" add constraint fin_charge_case_approval_authority
  check ((status='prepared' and approved_by is null and approval_policy_id is null)
    or (status='approved' and approved_by is not null
      and (approved_by<>prepared_by or (approval_policy_id is not null and approval_policy_revision is not null))));

create or replace function public.multideck_finance_recognition_controls(p_actor uuid,p_entity uuid,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare m public."FIN_RecognitionMandates"; p public."FIN_CostPolicies"; e public."FIN_RevenueServiceEvidence";
  v_reason text; v_charge uuid; v_source jsonb; v_date date; v_audit uuid;
  v_company uuid; v_decision jsonb;
begin
  perform public._multideck_journal_access(p_actor,p_entity,
    case when p_action='read' then 'Finance.Management.View'
      when p_action='record_revenue_evidence' then 'Finance.Management.Prepare'
      when p_action='propose' then 'Finance.Management.Prepare'
      else 'Finance.Management.Approve' end);
  if p_action not in ('read','propose','activate','pause','record_revenue_evidence') then
    raise exception 'Unknown recognition control action.' using errcode='22023'; end if;
  if p_action='read' then
    return jsonb_build_object('mandates',coalesce((select jsonb_agg(to_jsonb(x) order by prepared_at desc)
      from (select * from public."FIN_RecognitionMandates" where legal_entity_id=p_entity order by prepared_at desc limit 20) x),'[]'::jsonb),
      'canPrepare',public._multideck_dexter_has_permission(p_actor,'Finance.Management.Prepare'),
      'canApprove',public._multideck_dexter_has_permission(p_actor,'Finance.Management.Approve'),
      'canPost',public._multideck_dexter_has_permission(p_actor,'Finance.Management.Post'),
      'actorId',p_actor);
  end if;
  v_reason:=trim(coalesce(p_input->>'reason',''));
  if length(v_reason) not between 10 and 2000 then raise exception 'Record a reason of 10 to 2000 characters.' using errcode='22023'; end if;
  if p_action='record_revenue_evidence' then
    v_charge:=(p_input->>'chargeId')::uuid;
    v_source:=public._multideck_cost_source(p_entity,v_charge);
    v_date:=(p_input->>'serviceCompletedOn')::date;
    if v_date is null or v_date>current_date then raise exception 'Record an actual completed-service date.' using errcode='22023'; end if;
    insert into public."FIN_RevenueServiceEvidence"(legal_entity_id,charge_id,source_revision,service_completed_on,disputed,reason,recorded_by)
      values(p_entity,v_charge,md5(v_source::text),v_date,coalesce((p_input->>'disputed')::boolean,false),v_reason,p_actor)
      returning * into e;
    perform public._multideck_charge_lifecycle_enqueue(p_entity,v_charge,'service_evidence','FIN_RevenueServiceEvidence',e.id);
    insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_MetadataJSON")
      values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_RevenueServiceEvidence','revenue_service_evidence',e.id,'record_evidence','Revenue service evidence recorded',v_reason,to_jsonb(e));
    return to_jsonb(e);
  end if;
  perform 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity for update;
  if p_action='propose' then
    if exists(select 1 from public."FIN_RecognitionMandates" where legal_entity_id=p_entity and status='active') then
      raise exception 'Pause the active recognition mandate before proposing a replacement.' using errcode='22023'; end if;
    v_date:=(p_input->>'effectiveDate')::date;
    if v_date is null or v_date::text is distinct from p_input->>'effectiveDate' then raise exception 'Choose an exact effective date.' using errcode='22023'; end if;
    if coalesce((p_input->>'costEnabled')::boolean,false) then
      select * into p from public."FIN_CostPolicies" where id=(p_input->>'policyId')::uuid and legal_entity_id=p_entity;
      if not found or p.approved_by is null or exists(select 1 from public."FIN_CostPolicies" where legal_entity_id=p_entity and revision>p.revision) then
        raise exception 'Approve the latest cost recognition policy first.' using errcode='22023'; end if;
      perform public._multideck_journal_access(p.approved_by,p_entity,'Finance.Management.Approve');
    end if;
    insert into public."FIN_RecognitionMandates"(legal_entity_id,policy_id,cost_enabled,revenue_enabled,revenue_service_rule,effective_date,prepared_by)
      values(p_entity,p.id,coalesce((p_input->>'costEnabled')::boolean,false),coalesce((p_input->>'revenueEnabled')::boolean,false),
        nullif(trim(p_input->>'revenueServiceRule'),''),v_date,p_actor) returning * into m;
  else
    select * into m from public."FIN_RecognitionMandates" where id=(p_input->>'id')::uuid and legal_entity_id=p_entity for update;
    if not found then raise exception 'Recognition mandate not found.' using errcode='P0002'; end if;
    if p_action='activate' then
      perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.Post');
      if m.status<>'proposed' then raise exception 'Only a proposed mandate can be activated.' using errcode='22023'; end if;
      if m.prepared_by=p_actor then
        select "Company_ID" into v_company from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity;
        v_decision:=public.multideck_finance_approval_decision(v_company,p_entity,'recognition_mandate',0,
          jsonb_build_object('hardException',false,'advisoryException',true,'variancePercent',0));
        if coalesce((v_decision->>'canAuto')::boolean,false) is not true then
          raise exception 'An independent colleague must activate this mandate: %',v_decision->>'reason' using errcode='42501'; end if;
      end if;
      if m.cost_enabled then
        select * into p from public."FIN_CostPolicies" where id=m.policy_id and legal_entity_id=p_entity;
        if p.approved_by is null or exists(select 1 from public."FIN_CostPolicies" where legal_entity_id=p_entity and revision>p.revision) then
          raise exception 'Cost recognition policy changed; propose a new mandate.' using errcode='22023'; end if;
      end if;
      if not exists(select 1 from public."FIN_ChargeMappingCutovers" where legal_entity_id=p_entity and status='active' and effective_date<=m.effective_date) then
        raise exception 'Activate a charge mapping cutover for this mandate first.' using errcode='22023'; end if;
      update public."FIN_RecognitionMandates" set status='active',approved_by=p_actor,approved_at=now(),approval_reason=v_reason,approval_policy_id=(v_decision->>'policyId')::uuid,
        approval_policy_revision=(v_decision->>'revision')::integer where id=m.id returning * into m;
      -- Existing qualifying charges must be evaluated; a policy change is an
      -- event and never silently backfills the ledger.
      perform public._multideck_charge_lifecycle_enqueue(p_entity,l."JobCostingLine_ID",'service_evidence','FIN_RecognitionMandates',m.id)
        from public."Job_Costing_Lines" l join public."Job_Header" j on j."Job_ID"=l."Job_ID" where j."Job_LegalEntityID"=p_entity;
    else
      if m.status<>'active' then raise exception 'Only an active mandate may be paused.' using errcode='22023'; end if;
      update public."FIN_RecognitionMandates" set status='paused',paused_by=p_actor,paused_at=now(),pause_reason=v_reason where id=m.id returning * into m;
    end if;
  end if;
  insert into public."FIN_CostControlAudit"(legal_entity_id,actor_id,action,record_id,snapshot)
    values(p_entity,p_actor,'recognition_'||p_action,m.id,to_jsonb(m)) returning id into v_audit;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_RecognitionMandates','cost_control',m.id,p_action,'Charge recognition mandate '||p_action,v_reason,to_jsonb(m)||jsonb_build_object('approvalDecision',v_decision));
  return to_jsonb(m);
end; $$;

create or replace function public.multideck_charge_recognise_initial(p_entity uuid,p_charge uuid,p_revision bigint,p_kind text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare mandate public."FIN_RecognitionMandates"; q public."FIN_ChargeLifecycleQueue";
  evidence_id uuid; service_date date; evidence_revision text; v_disputed boolean;
  v_source jsonb; v_hash text; v_estimate numeric; v_actual numeric; v_amount numeric;
  v_job uuid; v_job_status text; v_job_deleted boolean; v_charge_code uuid;
  v_currency text; v_period public."FIN_Periods"; v_cutover public."FIN_ChargeMappingCutovers";
  v_mapped jsonb; v_group jsonb; v_expense uuid; v_control uuid;
  v_open numeric; v_existing integer; v_bad_documents integer; v_bad_matches integer; v_reason text;
  v_run uuid; v_item uuid; v_batch uuid; v_adjustment uuid; v_actor uuid;
  v_company uuid; v_decision jsonb;
begin
  if p_kind not in ('cost','revenue') then raise exception 'Unknown recognition kind.' using errcode='22023'; end if;
  perform set_config('lock_timeout','2s',true);
  perform set_config('statement_timeout','15s',true);
  -- Source writers reach the queue only after their own rows. Take those
  -- table locks first to avoid reversing their lock order. They also prevent
  -- invoice/link phantoms while the native posting is committed.
  lock table public."FIN_Documents",public."FIN_DocumentLineJobLinks",public."Job_Costing_Lines",
    public."Job_Header",public."FIN_Accruals",public."FIN_WIPItems" in share row exclusive mode;
  select * into q from public."FIN_ChargeLifecycleQueue" where legal_entity_id=p_entity and charge_id=p_charge for update;
  if not found then raise exception 'Charge event not found.' using errcode='P0002'; end if;
  if q.source_revision<>p_revision or q.status<>'pending' then return jsonb_build_object('status','newer_event'); end if;
  select * into mandate from public."FIN_RecognitionMandates" where legal_entity_id=p_entity and status='active'
    and effective_date<=current_date order by effective_date desc limit 1 for share;
  if not found or (p_kind='cost' and not mandate.cost_enabled) or (p_kind='revenue' and not mandate.revenue_enabled) then
    return jsonb_build_object('status','disabled'); end if;
  v_actor:=mandate.approved_by;
  perform public._multideck_journal_access(v_actor,p_entity,'Finance.Management.Post');
  perform public._multideck_journal_access(v_actor,p_entity,'Finance.Management.Approve');
  if p_kind='cost' then
    if not exists(select 1 from public."FIN_CostPolicies" p where p.id=mandate.policy_id and p.legal_entity_id=p_entity
      and p.approved_by is not null and not exists(select 1 from public."FIN_CostPolicies" n where n.legal_entity_id=p_entity and n.revision>p.revision)) then
      v_reason:='Cost recognition policy is no longer current'; end if;
    select e.id,e.service_completed_on,e.source_revision,e.disputed into evidence_id,service_date,evidence_revision,v_disputed
      from public."FIN_CostEvidence" e where e.legal_entity_id=p_entity and e.charge_id=p_charge
      order by recorded_at desc,id desc limit 1;
  else
    select e.id,e.service_completed_on,e.source_revision,e.disputed into evidence_id,service_date,evidence_revision,v_disputed
      from public."FIN_RevenueServiceEvidence" e where e.legal_entity_id=p_entity and e.charge_id=p_charge
      order by recorded_at desc,id desc limit 1;
  end if;
  if evidence_id is null then return jsonb_build_object('status','no_service_evidence'); end if;
  if exists(select 1 from public."FIN_ChargeEventRecognitions" where legal_entity_id=p_entity and charge_id=p_charge and kind=p_kind) then
    return jsonb_build_object('status','already_recognised'); end if;
  v_source:=public._multideck_cost_source(p_entity,p_charge);
  v_hash:=md5(v_source::text);
  v_job:=(v_source#>>'{job,id}')::uuid;
  v_job_status:=v_source#>>'{job,status}';
  v_job_deleted:=coalesce((v_source#>>'{job,deleted}')::boolean,false);
  v_charge_code:=(v_source#>>'{charge,JobCostingLine_ChargeCodeID}')::uuid;
  v_estimate:=case when p_kind='cost' then (v_source#>>'{charge,JobCostingLine_CostAmountLocal}')::numeric
    else (v_source#>>'{charge,JobCostingLine_RevenueAmountLocal}')::numeric end;
  select count(*) filter(where (p_kind='cost' and d->'document'->>'FINDoc_TypeCode' in ('pl_invoice','debit_note'))
        or (p_kind='revenue' and d->'document'->>'FINDoc_TypeCode' in ('sl_invoice','credit_note'))),
    coalesce(sum((d->'link'->>'FINDocLineJob_LocalNetAmount')::numeric)
      filter(where d->'document'->>'FINDoc_NativePostingStatusCode'='posted'
        and ((p_kind='cost' and d->'document'->>'FINDoc_TypeCode'='pl_invoice')
          or (p_kind='revenue' and d->'document'->>'FINDoc_TypeCode'='sl_invoice'))),0)
    into v_bad_documents,v_actual from jsonb_array_elements(v_source->'documents') d
    where d->'document'->>'FINDoc_NativePostingStatusCode'='reversed'
      or d->'document'->>'FINDoc_TypeCode' in ('credit_note','debit_note');
  -- The preceding filter identifies correction documents only; normal posted
  -- invoices are summed independently so a zero-correction charge is accurate.
  select coalesce(sum((d->'link'->>'FINDocLineJob_LocalNetAmount')::numeric),0) into v_actual
    from jsonb_array_elements(v_source->'documents') d
    where d->'document'->>'FINDoc_NativePostingStatusCode'='posted'
      and d->'document'->>'FINDoc_TypeCode'=case when p_kind='cost' then 'pl_invoice' else 'sl_invoice' end;
  select count(*) into v_bad_matches from jsonb_array_elements(v_source->'documents') d
    where d->'document'->>'FINDoc_LegalEntityID' is distinct from p_entity::text
      or (p_kind='cost' and d->'document'->>'FINDoc_TypeCode' in ('pl_invoice','debit_note')
        and d->'document'->>'FINDoc_PartyOrgID' is distinct from v_source#>>'{charge,JobCostingLine_SupplierID}')
      or coalesce((d->'link'->>'FINDocLineJob_LocalNetAmount')::numeric,0)<0;
  if coalesce(v_bad_documents,0)>0 then v_reason:='Credit or reversed invoice needs reviewed recognition'; end if;
  if v_bad_matches>0 then v_reason:='Linked document entity, supplier or amount needs review'; end if;
  if evidence_revision is distinct from v_hash or v_disputed then v_reason:='Completed-service evidence is stale or disputed'; end if;
  if v_job_deleted or v_job_status in ('draft','provisional','cancelled') then v_reason:='Job status does not permit recognition'; end if;
  if v_estimate is null or v_estimate<0 or v_actual<0 then v_reason:='Estimate or invoice allocation needs review'; end if;
  v_amount:=greatest(coalesce(v_estimate,0)-coalesce(v_actual,0),0);
  if v_amount=0 and v_reason is null then return jsonb_build_object('status','fully_invoiced'); end if;
  if mandate.approval_policy_id is not null and v_reason is null then
    perform 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity for share;
    select "Company_ID" into v_company from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity;
    v_decision:=public.multideck_finance_approval_decision(v_company,p_entity,'recognition_mandate',v_amount,
      jsonb_build_object('hardException',false,'advisoryException',true,'variancePercent',0));
    if coalesce((v_decision->>'canAuto')::boolean,false) is not true
      or v_decision->>'policyId' is distinct from mandate.approval_policy_id::text
      or v_decision->>'revision' is distinct from mandate.approval_policy_revision::text then
      v_reason:='Recognition approval policy changed or charge amount exceeds its limit';
    end if;
  end if;
  select * into v_period from public."FIN_Periods" where "FINPeriod_LegalEntityID"=p_entity
    and "FINPeriod_Code"=to_char(current_date,'YYYYMM') and "FINPeriod_StatusCode"='open' for update;
  if not found then v_reason:='Current accounting period is not open'; end if;
  if v_period."FINPeriod_ID" is not null and (service_date<v_period."FINPeriod_StartDate" or service_date>v_period."FINPeriod_EndDate") then
    v_reason:='Completed service belongs to another accounting period'; end if;
  if v_period."FINPeriod_ID" is not null then
    select * into v_cutover from public."FIN_ChargeMappingCutovers" where legal_entity_id=p_entity and status='active'
      and effective_date<=current_date order by effective_date desc limit 1 for share;
    if not found then v_reason:='No active dated charge mapping cutover'; end if;
  end if;
  if v_cutover.id is not null and v_charge_code is not null then
    v_mapped:=v_cutover.mapping_snapshot->v_charge_code::text;
    if v_mapped is null or v_mapped->p_kind is null then v_reason:='Charge is absent from approved mapping';
    else
      v_group:=public._multideck_validate_nominal_group(p_entity,(v_mapped->p_kind->>'id')::uuid,p_kind);
      if v_group is distinct from v_mapped->p_kind then v_reason:='Approved charge nominal mapping has drifted';
      else
        v_expense:=(v_group#>>'{accrued,id}')::uuid;
        v_control:=(v_group->>'control_account_id')::uuid;
      end if;
    end if;
  else v_reason:=coalesce(v_reason,'Charge code or approved mapping is missing'); end if;
  select "LegalEntity_BaseCurrencyCodeSnapshot" into v_currency from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity;
  if v_period."FINPeriod_ID" is not null and v_period."FINPeriod_BaseCurrencyCode" is distinct from v_currency then
    v_reason:='Accounting period currency differs from the legal entity'; end if;
  if p_kind='cost' then
    select count(*),coalesce(sum("FINAccrual_AccruedAmount"-"FINAccrual_RelievedAmount"),0)
      into v_existing,v_open from public."FIN_Accruals" a join public."FIN_Periods" p on p."FINPeriod_ID"=a."FINAccrual_PeriodID"
      where a."FINAccrual_JobCostingLineID"=p_charge and p."FINPeriod_LegalEntityID"=p_entity;
  else
    select count(*),coalesce(sum("FINWIP_WIPAmount"-"FINWIP_RelievedAmount"),0)
      into v_existing,v_open from public."FIN_WIPItems" w join public."FIN_Periods" p on p."FINPeriod_ID"=w."FINWIP_PeriodID"
      where w."FINWIP_JobCostingLineID"=p_charge and p."FINPeriod_LegalEntityID"=p_entity;
  end if;
  if v_existing>0 then
    if v_open=v_amount and v_reason is null then return jsonb_build_object('status','existing_period_recognition'); end if;
    v_reason:='Existing recognition needs a reviewed delta, not a duplicate initial posting';
  end if;
  if v_reason is not null then
    update public."FIN_ChargeLifecycleQueue" set status='review',reason=v_reason,
      next_action='Review current source evidence and post a dated correction in an open period',
      amount_local=v_amount,attempted_revision=p_revision,attempted_at=now(),attempts=attempts+1
      where legal_entity_id=p_entity and charge_id=p_charge;
    return jsonb_build_object('status','review','reason',v_reason,'amountLocal',v_amount::text);
  end if;
  -- The run/item preserve the original batch relationship consumed by exact
  -- native invoice relief. This is one charge, one kind, one native posting.
  insert into public."FIN_PeriodCloseRuns"("FINCloseRun_PeriodID","FINCloseRun_RunTypeCode","FINCloseRun_StatusCode",
    "FINCloseRun_StartedBy","FINCloseRun_ApprovedAt","FINCloseRun_ApprovedBy","FINCloseRun_LegalEntityID",
    "FINCloseRun_Reason","FINCloseRun_PostedAt","FINCloseRun_PostedBy","FINCloseRun_ControlTotalsJSON")
    values(v_period."FINPeriod_ID",'event_recognition','posted',v_actor,mandate.approved_at,v_actor,p_entity,
      'Approved completed-service event',now(),v_actor,jsonb_build_object('sourceRevision',p_revision,'kind',p_kind,'mandateId',mandate.id))
    returning "FINCloseRun_ID" into v_run;
  insert into public."FIN_PeriodCloseRunItems"("FINCloseItem_CloseRunID","FINCloseItem_ItemTypeCode","FINCloseItem_SourceTable",
    "FINCloseItem_SourceID","FINCloseItem_JobID","FINCloseItem_StatusCode","FINCloseItem_Amount","FINCloseItem_LocalAmount",
    "FINCloseItem_CurrencyCodeSnapshot","FINCloseItem_Explanation","FINCloseItem_ExpectedCost","FINCloseItem_ExpectedRevenue",
    "FINCloseItem_ApprovedAccrual","FINCloseItem_ApprovedWIP","FINCloseItem_MetadataJSON","FINCloseItem_UpdatedBy")
    values(v_run,'event_recognition','Job_Costing_Lines',p_charge,v_job,'posted',v_amount,v_amount,v_currency,
      'Completed-service charge recognition',case when p_kind='cost' then v_estimate else 0 end,
      case when p_kind='revenue' then v_estimate else 0 end,case when p_kind='cost' then v_amount else 0 end,
      case when p_kind='revenue' then v_amount else 0 end,jsonb_build_object('evidenceId',evidence_id,'mandateId',mandate.id),v_actor)
    returning "FINCloseItem_ID" into v_item;
  insert into public."FIN_PostingBatches"("FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable","FINPostBatch_SourceID",
    "FINPostBatch_PeriodID","FINPostBatch_LegalEntityID","FINPostBatch_DebitTotal","FINPostBatch_CreditTotal",
    "FINPostBatch_CurrencyCodeSnapshot","FINPostBatch_PostedAt","FINPostBatch_PostedBy","FINPostBatch_CreatedBy")
    values('EV-'||left(v_run::text,20),'posted','FIN_PeriodCloseRuns',v_run,v_period."FINPeriod_ID",p_entity,
      v_amount,v_amount,v_currency,now(),v_actor,v_actor) returning "FINPostBatch_ID" into v_batch;
  if p_kind='cost' then
    insert into public."FIN_Accruals"("FINAccrual_JobID","FINAccrual_JobCostingLineID","FINAccrual_PeriodID","FINAccrual_StatusCode",
      "FINAccrual_AccountingDate","FINAccrual_ExpectedAmount","FINAccrual_AccruedAmount","FINAccrual_LocalAccruedAmount",
      "FINAccrual_CurrencyCodeSnapshot","FINAccrual_CreatedBy","FINAccrual_CloseRunItemID","FINAccrual_Description",
      "FINAccrual_ApprovedAt","FINAccrual_ApprovedBy","FINAccrual_PostedAt","FINAccrual_PostedBy")
      values(v_job,p_charge,v_period."FINPeriod_ID",'posted',current_date,v_estimate,v_amount,v_amount,v_currency,v_actor,v_item,
        'Completed-service cost accrual',mandate.approved_at,v_actor,now(),v_actor) returning "FINAccrual_ID" into v_adjustment;
    insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_AccrualID",
      "FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_JobID")
      values(v_batch,1,v_expense,v_adjustment,'Completed-service cost',v_amount,0,v_currency,v_job),
        (v_batch,2,v_control,v_adjustment,'Accrued cost liability',0,v_amount,v_currency,v_job);
  else
    insert into public."FIN_WIPItems"("FINWIP_JobID","FINWIP_JobCostingLineID","FINWIP_PeriodID","FINWIP_StatusCode",
      "FINWIP_AccountingDate","FINWIP_ExpectedAmount","FINWIP_WIPAmount","FINWIP_LocalWIPAmount",
      "FINWIP_CurrencyCodeSnapshot","FINWIP_CreatedBy","FINWIP_CloseRunItemID","FINWIP_Description",
      "FINWIP_ApprovedAt","FINWIP_ApprovedBy","FINWIP_PostedAt","FINWIP_PostedBy")
      values(v_job,p_charge,v_period."FINPeriod_ID",'posted',current_date,v_estimate,v_amount,v_amount,v_currency,v_actor,v_item,
        'Completed-service revenue WIP',mandate.approved_at,v_actor,now(),v_actor) returning "FINWIP_ID" into v_adjustment;
    insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_WIPID",
      "FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_JobID")
      values(v_batch,1,v_control,v_adjustment,'Unbilled revenue WIP',v_amount,0,v_currency,v_job),
        (v_batch,2,v_expense,v_adjustment,'Completed-service revenue',0,v_amount,v_currency,v_job);
  end if;
  update public."FIN_PeriodCloseRuns" set "FINCloseRun_PostingBatchID"=v_batch,
    "FINCloseRun_ControlTotalsJSON"="FINCloseRun_ControlTotalsJSON"||jsonb_build_object('postedTotal',v_amount,'cutoverId',v_cutover.id)
    where "FINCloseRun_ID"=v_run;
  insert into public."FIN_ChargeEventRecognitions"(legal_entity_id,charge_id,kind,source_revision,source_hash,mandate_id,
    evidence_id,cutover_id,period_id,close_run_id,close_item_id,posting_batch_id,amount_local,source_snapshot,posted_by)
    values(p_entity,p_charge,p_kind,p_revision,v_hash,mandate.id,evidence_id,v_cutover.id,v_period."FINPeriod_ID",
      v_run,v_item,v_batch,v_amount,jsonb_build_object('source',v_source,'mapping',v_mapped,'serviceDate',service_date),v_actor);
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON")
    values('finance_lifecycle',v_actor,p_entity,'multideck-app','finance','public','FIN_ChargeEventRecognitions','cost_control',v_run,
      'post_initial_recognition','Completed-service charge recognition posted',true,1,
      jsonb_build_object('chargeId',p_charge,'kind',p_kind,'amount',v_amount,'periodId',v_period."FINPeriod_ID",'batchId',v_batch,'cutoverId',v_cutover.id,'approvalDecision',v_decision));
  return jsonb_build_object('status','posted','kind',p_kind,'amountLocal',v_amount::text,'periodId',v_period."FINPeriod_ID",'batchId',v_batch);
end; $$;

create or replace function public.multideck_finance_charge_correction(
  p_actor uuid,p_entity uuid,p_charge uuid,p_kind text,p_action text,p_input jsonb default '{}'
) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare c public."FIN_ChargeCorrections"; s jsonb; v_reason text; v_period public."FIN_Periods";
  v_run uuid; v_item uuid; v_batch uuid; v_adjustment uuid; v_job uuid; v_currency text;
  v_delta numeric; v_amount numeric; v_remaining numeric; v_release numeric; v_line integer:=0;
  v_origin jsonb; v_expense uuid; v_control uuid; v_actual_account_count integer;
  v_company uuid; v_decision jsonb; v_variance numeric;
begin
  perform public._multideck_journal_access(p_actor,p_entity,case when p_action='read' then 'Finance.Management.View'
    when p_action='prepare' then 'Finance.Management.Prepare' else 'Finance.Management.Approve' end);
  if p_kind not in ('cost','revenue') or p_action not in ('read','prepare','approve') then
    raise exception 'Unknown charge correction action.' using errcode='22023'; end if;
  if p_action='read' then
    perform public._multideck_cost_source(p_entity,p_charge);
    return jsonb_build_object('snapshot',public._multideck_charge_correction_snapshot(p_entity,p_charge,p_kind),
      'reviews',coalesce((select jsonb_agg(to_jsonb(x) order by prepared_at desc) from
        (select id,kind,status,target_balance,delta,period_id,prepared_by,prepared_at,prepared_reason,
          approved_by,approved_at,approval_reason,posting_batch_id from public."FIN_ChargeCorrections"
          where legal_entity_id=p_entity and charge_id=p_charge and kind=p_kind order by prepared_at desc limit 20) x),'[]'::jsonb));
  end if;
  v_reason:=trim(coalesce(p_input->>'reason',''));
  if length(v_reason) not between 10 and 2000 then raise exception 'Record a correction reason of 10 to 2000 characters.' using errcode='22023'; end if;
  perform set_config('lock_timeout','2s',true);
  perform set_config('statement_timeout','15s',true);
  lock table public."FIN_Documents",public."FIN_DocumentLineJobLinks",public."Job_Costing_Lines",
    public."Job_Header",public."FIN_Accruals",public."FIN_WIPItems" in share row exclusive mode;
  s:=public._multideck_charge_correction_snapshot(p_entity,p_charge,p_kind);
  if jsonb_array_length(s->'blockers')>0 then
    raise exception 'Resolve correction blockers: %',s->'blockers' using errcode='22023'; end if;
  v_delta:=(s->>'delta')::numeric;
  if v_delta=0 then raise exception 'No charge balance correction is required.' using errcode='22023'; end if;
  if p_action='prepare' then
    if exists(select 1 from public."FIN_ChargeCorrections" where legal_entity_id=p_entity and charge_id=p_charge
      and kind=p_kind and source_hash=s->>'sourceHash' and status='posted') then
      raise exception 'The current source has already been corrected.' using errcode='22023'; end if;
    insert into public."FIN_ChargeCorrections"(legal_entity_id,charge_id,kind,source_hash,snapshot,target_balance,delta,
      period_id,prepared_by,prepared_reason)
      values(p_entity,p_charge,p_kind,s->>'sourceHash',s,(s->>'target')::numeric,v_delta,(s->>'periodId')::uuid,p_actor,v_reason)
      returning * into c;
    insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp",
      "AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode",
      "AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_MetadataJSON")
      values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_ChargeCorrections','cost_control',c.id,
        'prepare_charge_correction','Charge balance correction prepared',v_reason,
        jsonb_build_object('kind',p_kind,'target',c.target_balance,'delta',c.delta,'sourceHash',c.source_hash));
    return to_jsonb(c);
  end if;
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.Post');
  select * into c from public."FIN_ChargeCorrections" where id=(p_input->>'reviewId')::uuid
    and legal_entity_id=p_entity and charge_id=p_charge and kind=p_kind for update;
  if not found then raise exception 'Charge correction review was not found.' using errcode='P0002'; end if;
  if c.status<>'prepared' then raise exception 'Only a prepared correction can be approved.' using errcode='22023'; end if;
  if c.prepared_by=p_actor then
    perform 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity for share;
    select "Company_ID" into v_company from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity;
    v_variance:=abs((s->>'delta')::numeric)*100/greatest(abs(coalesce((s->>'estimate')::numeric,0)),1);
    v_decision:=public.multideck_finance_approval_decision(v_company,p_entity,'charge_correction',abs((s->>'delta')::numeric),
      jsonb_build_object('hardException',false,'advisoryException',true,'variancePercent',v_variance));
    if coalesce((v_decision->>'canAuto')::boolean,false) is not true then
      raise exception 'An independent colleague must approve this correction: %',v_decision->>'reason' using errcode='42501'; end if;
  end if;
  if c.snapshot is distinct from s then raise exception 'Charge correction evidence changed; prepare a new review.' using errcode='40001'; end if;
  select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=c.period_id and "FINPeriod_LegalEntityID"=p_entity for update;
  if not found or v_period."FINPeriod_StatusCode"<>'open' then raise exception 'Correction period must remain open.' using errcode='22023'; end if;
  v_amount:=abs(v_delta); v_remaining:=v_amount; v_currency:=s->>'currency';
  v_job:=(s#>>'{source,job,id}')::uuid;
  insert into public."FIN_PeriodCloseRuns"("FINCloseRun_PeriodID","FINCloseRun_RunTypeCode","FINCloseRun_StatusCode",
    "FINCloseRun_StartedBy","FINCloseRun_ApprovedAt","FINCloseRun_ApprovedBy","FINCloseRun_LegalEntityID",
    "FINCloseRun_Reason","FINCloseRun_PostedAt","FINCloseRun_PostedBy","FINCloseRun_ControlTotalsJSON")
    values(v_period."FINPeriod_ID",'charge_correction','posted',c.prepared_by,now(),p_actor,p_entity,
      v_reason,now(),p_actor,jsonb_build_object('correctionId',c.id,'target',c.target_balance,'delta',v_delta))
    returning "FINCloseRun_ID" into v_run;
  insert into public."FIN_PeriodCloseRunItems"("FINCloseItem_CloseRunID","FINCloseItem_ItemTypeCode","FINCloseItem_SourceTable",
    "FINCloseItem_SourceID","FINCloseItem_JobID","FINCloseItem_StatusCode","FINCloseItem_Amount","FINCloseItem_LocalAmount",
    "FINCloseItem_CurrencyCodeSnapshot","FINCloseItem_Explanation","FINCloseItem_MetadataJSON","FINCloseItem_UpdatedBy")
    values(v_run,'charge_correction','FIN_ChargeCorrections',c.id,v_job,'posted',v_amount,v_amount,v_currency,
      v_reason,jsonb_build_object('kind',p_kind,'delta',v_delta,'sourceHash',c.source_hash),p_actor)
    returning "FINCloseItem_ID" into v_item;
  insert into public."FIN_PostingBatches"("FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable","FINPostBatch_SourceID",
    "FINPostBatch_PeriodID","FINPostBatch_LegalEntityID","FINPostBatch_DebitTotal","FINPostBatch_CreditTotal",
    "FINPostBatch_CurrencyCodeSnapshot","FINPostBatch_PostedAt","FINPostBatch_PostedBy","FINPostBatch_CreatedBy")
    values('CC-'||left(c.id::text,20),'posted','FIN_PeriodCloseRuns',v_run,v_period."FINPeriod_ID",p_entity,
      v_amount,v_amount,v_currency,now(),p_actor,c.prepared_by) returning "FINPostBatch_ID" into v_batch;
  update public."FIN_PeriodCloseRuns" set "FINCloseRun_PostingBatchID"=v_batch where "FINCloseRun_ID"=v_run;
  update public."FIN_ChargeCorrections" set status='posting',approved_by=p_actor,approved_at=now(),approval_reason=v_reason,
    close_run_id=v_run,close_item_id=v_item,posting_batch_id=v_batch where id=c.id;
  if v_delta>0 then
    v_expense:=(s->>'expenseAccountId')::uuid; v_control:=(s->>'controlAccountId')::uuid;
    if p_kind='cost' then
      insert into public."FIN_Accruals"("FINAccrual_JobID","FINAccrual_JobCostingLineID","FINAccrual_PeriodID","FINAccrual_StatusCode",
        "FINAccrual_AccountingDate","FINAccrual_ExpectedAmount","FINAccrual_AccruedAmount","FINAccrual_LocalAccruedAmount",
        "FINAccrual_CurrencyCodeSnapshot","FINAccrual_CreatedBy","FINAccrual_CloseRunItemID","FINAccrual_Description",
        "FINAccrual_ApprovedAt","FINAccrual_ApprovedBy","FINAccrual_PostedAt","FINAccrual_PostedBy")
        values(v_job,p_charge,v_period."FINPeriod_ID",'posted',current_date,(s->>'estimate')::numeric,v_amount,v_amount,
          v_currency,c.prepared_by,v_item,'Reviewed charge cost correction',now(),p_actor,now(),p_actor)
        returning "FINAccrual_ID" into v_adjustment;
      insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_AccrualID",
        "FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_JobID")
        values(v_batch,1,v_expense,v_adjustment,'Reviewed cost restoration',v_amount,0,v_currency,v_job),
          (v_batch,2,v_control,v_adjustment,'Reviewed accrued liability',0,v_amount,v_currency,v_job);
    else
      insert into public."FIN_WIPItems"("FINWIP_JobID","FINWIP_JobCostingLineID","FINWIP_PeriodID","FINWIP_StatusCode",
        "FINWIP_AccountingDate","FINWIP_ExpectedAmount","FINWIP_WIPAmount","FINWIP_LocalWIPAmount",
        "FINWIP_CurrencyCodeSnapshot","FINWIP_CreatedBy","FINWIP_CloseRunItemID","FINWIP_Description",
        "FINWIP_ApprovedAt","FINWIP_ApprovedBy","FINWIP_PostedAt","FINWIP_PostedBy")
        values(v_job,p_charge,v_period."FINPeriod_ID",'posted',current_date,(s->>'estimate')::numeric,v_amount,v_amount,
          v_currency,c.prepared_by,v_item,'Reviewed revenue WIP correction',now(),p_actor,now(),p_actor)
        returning "FINWIP_ID" into v_adjustment;
      insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_WIPID",
        "FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_JobID")
        values(v_batch,1,v_control,v_adjustment,'Reviewed unbilled revenue WIP',v_amount,0,v_currency,v_job),
          (v_batch,2,v_expense,v_adjustment,'Reviewed revenue restoration',0,v_amount,v_currency,v_job);
    end if;
    insert into public."FIN_ChargeCorrectionMovements"(correction_id,accrual_id,wip_id,direction,amount_local,
      expense_account_id,control_account_id,posting_batch_id)
      values(c.id,case when p_kind='cost' then v_adjustment end,case when p_kind='revenue' then v_adjustment end,
        'increase',v_amount,v_expense,v_control,v_batch);
  else
    for v_origin in select value from jsonb_array_elements(s->'origins') loop
      exit when v_remaining<=0;
      v_release:=least(v_remaining,(v_origin->>'open')::numeric);
      v_expense:=(v_origin->>'expense')::uuid; v_control:=(v_origin->>'control')::uuid;
      if v_release<=0 then continue; end if;
      if p_kind='cost' then
        v_adjustment:=(v_origin->>'id')::uuid;
        update public."FIN_Accruals" set "FINAccrual_RelievedAmount"="FINAccrual_RelievedAmount"+v_release,
          "FINAccrual_StatusCode"=case when "FINAccrual_RelievedAmount"+v_release>="FINAccrual_AccruedAmount" then 'reversed' else 'partially_reversed' end,
          "FINAccrual_ReversalPeriodID"=v_period."FINPeriod_ID","FINAccrual_ReversedAt"=case when "FINAccrual_RelievedAmount"+v_release>="FINAccrual_AccruedAmount" then now() else "FINAccrual_ReversedAt" end,
          "FINAccrual_ReversedBy"=p_actor where "FINAccrual_ID"=v_adjustment;
        insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_AccrualID",
          "FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_JobID")
          values(v_batch,v_line+1,v_control,v_adjustment,'Reviewed accrued liability release',v_release,0,v_currency,v_job),
            (v_batch,v_line+2,v_expense,v_adjustment,'Reviewed cost estimate reduction',0,v_release,v_currency,v_job);
      else
        v_adjustment:=(v_origin->>'id')::uuid;
        update public."FIN_WIPItems" set "FINWIP_RelievedAmount"="FINWIP_RelievedAmount"+v_release,
          "FINWIP_StatusCode"=case when "FINWIP_RelievedAmount"+v_release>="FINWIP_WIPAmount" then 'reversed' else 'partially_reversed' end,
          "FINWIP_ReversalPeriodID"=v_period."FINPeriod_ID","FINWIP_ReversedAt"=case when "FINWIP_RelievedAmount"+v_release>="FINWIP_WIPAmount" then now() else "FINWIP_ReversedAt" end,
          "FINWIP_ReversedBy"=p_actor where "FINWIP_ID"=v_adjustment;
        insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_WIPID",
          "FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_JobID")
          values(v_batch,v_line+1,v_expense,v_adjustment,'Reviewed revenue WIP release',v_release,0,v_currency,v_job),
            (v_batch,v_line+2,v_control,v_adjustment,'Reviewed WIP asset reduction',0,v_release,v_currency,v_job);
      end if;
      insert into public."FIN_ChargeCorrectionMovements"(correction_id,accrual_id,wip_id,direction,amount_local,
        expense_account_id,control_account_id,posting_batch_id)
        values(c.id,case when p_kind='cost' then v_adjustment end,case when p_kind='revenue' then v_adjustment end,
          'release',v_release,v_expense,v_control,v_batch);
      v_line:=v_line+2; v_remaining:=v_remaining-v_release;
    end loop;
    if v_remaining<>0 then raise exception 'Original open balances changed; prepare the correction again.' using errcode='40001'; end if;
  end if;
  update public."FIN_ChargeCorrections" set status='posted' where id=c.id;
  update public."FIN_ChargeLifecycleQueue" set status='settled',reason=null,next_action=null,amount_local=null,
    attempted_revision=source_revision,attempted_at=now(),event_types='{}'
    where legal_entity_id=p_entity and charge_id=p_charge;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp",
    "AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode",
    "AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_ChargeCorrections','cost_control',c.id,
      'post_charge_correction','Reviewed charge balance correction posted',v_reason,
      jsonb_build_object('kind',p_kind,'target',c.target_balance,'delta',c.delta,'periodId',c.period_id,'batchId',v_batch,'sourceHash',c.source_hash,'approvalDecision',v_decision));
  return jsonb_build_object('status','posted','reviewId',c.id,'kind',p_kind,'target',c.target_balance::text,
    'delta',v_delta::text,'postingBatchId',v_batch,'periodId',c.period_id);
end; $$;

create or replace function public.multideck_finance_charge_case_resolution(
  p_actor uuid,p_entity uuid,p_charge uuid,p_action text,p_input jsonb default '{}'
) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public."FIN_ChargeCaseResolutions"; s jsonb; v_reason text; v_company uuid; v_decision jsonb;
begin
  if p_action not in ('read','prepare','approve') then raise exception 'Unknown case resolution action.' using errcode='22023'; end if;
  perform public._multideck_journal_access(p_actor,p_entity,case when p_action='read' then 'Finance.Management.View'
    when p_action='prepare' then 'Finance.Management.Prepare' else 'Finance.Management.Approve' end);
  if p_action='read' then
    return jsonb_build_object('snapshot',public._multideck_charge_case_no_balance_snapshot(p_entity,p_charge),
      'actorId',p_actor,
      'reviews',coalesce((select jsonb_agg(to_jsonb(x) order by prepared_at desc) from
        (select * from public."FIN_ChargeCaseResolutions" where legal_entity_id=p_entity and charge_id=p_charge
          order by prepared_at desc limit 20) x),'[]'::jsonb));
  end if;
  v_reason:=btrim(coalesce(p_input->>'reason',''));
  if length(v_reason) not between 10 and 2000 then raise exception 'Record a reason of 10 to 2000 characters.' using errcode='22023'; end if;
  perform set_config('lock_timeout','2s',true);
  perform set_config('statement_timeout','15s',true);
  lock table public."FIN_Documents",public."FIN_DocumentLineJobLinks",public."Job_Costing_Lines",
    public."Job_Header",public."FIN_Accruals",public."FIN_WIPItems" in share row exclusive mode;
  perform 1 from public."FIN_ChargeLifecycleQueue" where legal_entity_id=p_entity and charge_id=p_charge for update;
  s:=public._multideck_charge_case_no_balance_snapshot(p_entity,p_charge);
  if jsonb_array_length(s->'blockers')>0 then raise exception 'Resolve case blockers: %',s->'blockers' using errcode='22023'; end if;
  if p_action='prepare' then
    insert into public."FIN_ChargeCaseResolutions"(legal_entity_id,charge_id,queue_revision,snapshot,prepared_by,prepared_reason)
      values(p_entity,p_charge,(s->>'queueRevision')::bigint,s,p_actor,v_reason) returning * into r;
    insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
      "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
      "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_MetadataJSON")
      values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_ChargeCaseResolutions',
        'charge_case_resolution',r.id,'prepare_no_balance_resolution','No-balance charge case resolution prepared',v_reason,s);
    return to_jsonb(r);
  end if;
  select * into r from public."FIN_ChargeCaseResolutions" where id=(p_input->>'reviewId')::uuid
    and legal_entity_id=p_entity and charge_id=p_charge for update;
  if not found then raise exception 'Case resolution review not found.' using errcode='P0002'; end if;
  if r.status<>'prepared' then raise exception 'Only a prepared case resolution can be approved.' using errcode='22023'; end if;
  if r.prepared_by=p_actor then
    perform 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity for share;
    select "Company_ID" into v_company from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity;
    v_decision:=public.multideck_finance_approval_decision(v_company,p_entity,'charge_case_resolution',0,
      jsonb_build_object('hardException',false,'advisoryException',true,'variancePercent',0));
    if coalesce((v_decision->>'canAuto')::boolean,false) is not true then
      raise exception 'An independent colleague must approve this case: %',v_decision->>'reason' using errcode='42501'; end if;
  end if;
  if r.snapshot is distinct from s then raise exception 'Charge case evidence changed; prepare a new review.' using errcode='40001'; end if;
  update public."FIN_ChargeCaseResolutions" set status='approved',approved_by=p_actor,approved_at=now(),approval_reason=v_reason,
    approval_policy_id=(v_decision->>'policyId')::uuid,approval_policy_revision=(v_decision->>'revision')::integer
    where id=r.id;
  update public."FIN_ChargeLifecycleQueue" set status='settled',reason=null,next_action=null,amount_local=null,
    attempted_revision=source_revision,attempted_at=now() where legal_entity_id=p_entity and charge_id=p_charge;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
    "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_ChargeCaseResolutions',
      'charge_case_resolution',r.id,'approve_no_balance_resolution','No-balance charge case resolution approved',v_reason,
      s||jsonb_build_object('approvalDecision',v_decision));
  return jsonb_build_object('status','approved','reviewId',r.id,'chargeId',p_charge,'queueRevision',r.queue_revision);
end; $$;

create or replace function public.multideck_finance_accounting_vat_control(
  p_actor uuid,p_entity uuid,p_period uuid,p_action text,p_input jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_Periods"; v_inventory jsonb; v_review public."FIN_AccountingVatControlReviews";
  v_approval public."FIN_AccountingVatControlApprovals"; v_reason text; v_status jsonb;
  v_company uuid; v_decision jsonb; v_amount numeric;
begin
  if p_action not in ('read','prepare','approve') then raise exception 'Unknown accounting VAT control action.' using errcode='22023'; end if;
  perform public._multideck_journal_access(p_actor,p_entity,case when p_action='read' then 'Finance.Management.View'
    when p_action='prepare' then 'Finance.Management.Prepare' else 'Finance.Management.Approve' end);
  if to_regprocedure('public.multideck_uk_vat_accounting_period_inventory(uuid,uuid,uuid)') is null
    or to_regprocedure('public._multideck_uk_vat_read_access(uuid,uuid)') is null
    or to_regprocedure('public._multideck_uk_vat_access(uuid,uuid)') is null then
    raise exception 'Monthly UK VAT source control is unavailable.' using errcode='22023'; end if;
  execute 'select public._multideck_uk_vat_read_access($1,$2)' using p_actor,p_entity;
  if p_action<>'read' then execute 'select public._multideck_uk_vat_access($1,$2)' using p_actor,p_entity; end if;
  select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=p_period and "FINPeriod_LegalEntityID"=p_entity
    for update;
  if not found then raise exception 'Accounting period not found in this legal entity.' using errcode='P0002'; end if;
  execute 'select public.multideck_uk_vat_accounting_period_inventory($1,$2,$3)'
    into v_inventory using p_actor,p_entity,p_period;
  if p_action='read' then
    v_status:=public.multideck_finance_accounting_vat_control_status(p_actor,p_entity,p_period);
    return jsonb_build_object('inventory',v_inventory,'control',v_status,'actorId',p_actor,
      'canPrepare',public._multideck_dexter_has_permission(p_actor,'Finance.Management.Prepare')
        and public._multideck_dexter_has_permission(p_actor,'Finance.Compliance.Manage'),
      'canApprove',public._multideck_dexter_has_permission(p_actor,'Finance.Management.Approve')
        and public._multideck_dexter_has_permission(p_actor,'Finance.Compliance.Manage'),
      'reviews',coalesce((select jsonb_agg(to_jsonb(review) order by prepared_at desc) from
        (select * from public."FIN_AccountingVatControlReviews" where legal_entity_id=p_entity and period_id=p_period
          order by prepared_at desc limit 20) review),'[]'::jsonb),
      'approvals',coalesce((select jsonb_agg(to_jsonb(approval) order by approved_at desc) from
        (select * from public."FIN_AccountingVatControlApprovals" where legal_entity_id=p_entity and period_id=p_period
          order by approved_at desc limit 20) approval),'[]'::jsonb));
  end if;
  if v_period."FINPeriod_StatusCode"<>'open' then raise exception 'The accounting period must be open for VAT sign-off.' using errcode='22023'; end if;
  if not public._multideck_accounting_vat_inventory_ready(v_inventory) then
    raise exception 'Resolve monthly VAT control exceptions before sign-off.' using errcode='22023'; end if;
  v_reason:=btrim(coalesce(p_input->>'reason',''));
  if length(v_reason) not between 10 and 2000 then raise exception 'Record a VAT control reason of 10 to 2000 characters.' using errcode='22023'; end if;
  if p_action='prepare' then
    insert into public."FIN_AccountingVatControlReviews"(legal_entity_id,period_id,source_digest,inventory,prepared_by,reason)
      values(p_entity,p_period,v_inventory->>'sourceDigest',v_inventory,p_actor,v_reason) returning * into v_review;
    insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
      "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
      "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_MetadataJSON")
      values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_AccountingVatControlReviews',
        'accounting_vat_control',v_review.id,'prepare_accounting_vat_control','Accounting-period VAT control prepared',v_reason,
        jsonb_build_object('periodId',p_period,'sourceDigest',v_review.source_digest,'lineCount',v_inventory->'lineCount'));
    return to_jsonb(v_review);
  end if;
  select * into v_review from public."FIN_AccountingVatControlReviews" where id=(p_input->>'reviewId')::uuid
    and legal_entity_id=p_entity and period_id=p_period;
  if not found then raise exception 'Accounting VAT control review not found.' using errcode='P0002'; end if;
  if v_review.prepared_by=p_actor then
    perform 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity for share;
    select "Company_ID" into v_company from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity;
    select coalesce(sum(abs(e.signed_tax_reporting)),0) into v_amount
      from public."FIN_IndirectTaxEvidence" e join public."FIN_PostingBatches" b
        on b."FINPostBatch_ID"=e.source_posting_batch_id
      where e.legal_entity_id=p_entity and b."FINPostBatch_LegalEntityID"=p_entity
        and b."FINPostBatch_PeriodID"=p_period and b."FINPostBatch_StatusCode"='posted';
    v_decision:=public.multideck_finance_approval_decision(v_company,p_entity,'vat_control',v_amount,
      jsonb_build_object('hardException',false,'advisoryException',false,'variancePercent',0));
    if coalesce((v_decision->>'canAuto')::boolean,false) is not true then
      raise exception 'A second authorised finance operator must approve this VAT control: %',v_decision->>'reason' using errcode='42501'; end if;
  end if;
  if v_review.source_digest is distinct from v_inventory->>'sourceDigest' or v_review.inventory is distinct from v_inventory then
    raise exception 'Monthly VAT control evidence changed; prepare a new review.' using errcode='40001'; end if;
  insert into public."FIN_AccountingVatControlApprovals"(review_id,legal_entity_id,period_id,source_digest,approved_by,reason)
    values(v_review.id,p_entity,p_period,v_review.source_digest,p_actor,v_reason) returning * into v_approval;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
    "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_AccountingVatControlApprovals',
      'accounting_vat_control',v_approval.id,'approve_accounting_vat_control','Accounting-period VAT control approved',v_reason,
      jsonb_build_object('periodId',p_period,'sourceDigest',v_approval.source_digest,'reviewId',v_review.id,'approvalDecision',v_decision));
  return to_jsonb(v_approval);
end; $$;

create or replace function public.multideck_finance_accounting_close(p_actor uuid,p_entity uuid,p_period uuid,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_Periods"; v_snapshot jsonb; v_digest text; v_review public."FIN_AccountingCloseReviews";
  v_pack public."FIN_AccountingClosedPacks"; v_reason text;
  v_company uuid; v_decision jsonb; v_amount numeric;
begin
  perform public._multideck_journal_access(p_actor,p_entity,case when p_action='read' then 'Finance.Management.View'
    when p_action='prepare' then 'Finance.Management.Prepare' else 'Finance.Management.Approve' end);
  if p_action not in ('read','prepare','close') then raise exception 'Unknown accounting close action.' using errcode='22023'; end if;
  if p_action='close' then perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.Post'); end if;
  select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=p_period and "FINPeriod_LegalEntityID"=p_entity
    for update;
  if not found then raise exception 'Accounting period not found in this legal entity.' using errcode='P0002'; end if;
  if p_action='close' and to_regclass('public."FIN_IndirectTaxEvidence"') is not null
    and to_regclass('public."FIN_IndirectTaxDecisions"') is not null
    and to_regclass('public."FIN_IndirectTaxReconciliations"') is not null then
    -- Retain the exact signed monthly VAT snapshot until the period lock
    -- commits; ordinary posting already shares this period row lock.
    execute 'lock table public."FIN_IndirectTaxEvidence",public."FIN_IndirectTaxDecisions",public."FIN_IndirectTaxReconciliations" in share mode';
  end if;
  v_snapshot:=public._multideck_finance_close_snapshot(p_actor,p_entity,p_period);
  v_digest:=md5(v_snapshot::text);
  if p_action='read' then
    return jsonb_build_object('snapshot',v_snapshot,'sourceDigest',v_digest,
      'reviews',coalesce((select jsonb_agg(to_jsonb(review) order by prepared_at desc) from
        (select * from public."FIN_AccountingCloseReviews" where period_id=p_period order by prepared_at desc limit 10) review),'[]'::jsonb),
      'closedPack',(select to_jsonb(pack) from public."FIN_AccountingClosedPacks" pack where pack.period_id=p_period));
  end if;
  if v_period."FINPeriod_StatusCode" not in ('open','soft_closed') then raise exception 'Only an open accounting period can be prepared or closed.' using errcode='22023'; end if;
  v_reason:=btrim(p_input->>'reason');
  if coalesce(length(v_reason),0) not between 10 and 2000 then raise exception 'Record the accounting close reason.' using errcode='22023'; end if;
  if p_action='prepare' then
    insert into public."FIN_AccountingCloseReviews"(legal_entity_id,period_id,source_digest,snapshot,prepared_by,reason)
      values(p_entity,p_period,v_digest,v_snapshot,p_actor,v_reason) returning * into v_review;
    insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_MetadataJSON")
      values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_AccountingCloseReviews','accounting_period_close',v_review.id,'prepare_close','Accounting close prepared',v_reason,jsonb_build_object('periodId',p_period,'sourceDigest',v_digest,'blockers',v_snapshot->'blockers'));
    return to_jsonb(v_review);
  end if;
  select * into v_review from public."FIN_AccountingCloseReviews" where id=(p_input->>'reviewId')::uuid
    and legal_entity_id=p_entity and period_id=p_period;
  if not found then raise exception 'Accounting close review not found.' using errcode='P0002'; end if;
  if v_review.prepared_by=p_actor then
    perform 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity for share;
    select "Company_ID" into v_company from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity;
    select coalesce(sum(b."FINPostBatch_DebitTotal"),0) into v_amount from public."FIN_PostingBatches" b
      where b."FINPostBatch_LegalEntityID"=p_entity and b."FINPostBatch_PeriodID"=p_period
        and b."FINPostBatch_StatusCode"='posted';
    v_decision:=public.multideck_finance_approval_decision(v_company,p_entity,'period_close',v_amount,
      jsonb_build_object('hardException',jsonb_array_length(v_snapshot->'blockers')>0,
        'advisoryException',false,'variancePercent',0));
    if coalesce((v_decision->>'canAuto')::boolean,false) is not true then
      raise exception 'Another authorised finance operator must close this period: %',v_decision->>'reason' using errcode='42501'; end if;
  end if;
  if v_review.source_digest<>v_digest or v_review.snapshot is distinct from v_snapshot then
    raise exception 'Accounting source changed; prepare a fresh close review.' using errcode='40001'; end if;
  if jsonb_array_length(v_snapshot->'blockers')>0 then raise exception 'Resolve the close pack blockers before locking the period: %',v_snapshot->'blockers' using errcode='22023'; end if;
  insert into public."FIN_AccountingClosedPacks"(review_id,legal_entity_id,period_id,source_digest,snapshot,closed_by,reason)
    values(v_review.id,p_entity,p_period,v_digest,v_snapshot,p_actor,v_reason) returning * into v_pack;
  update public."FIN_Periods" set "FINPeriod_StatusCode"='locked',"FINPeriod_LockedAt"=now(),"FINPeriod_LockedBy"=p_actor
    where "FINPeriod_ID"=p_period;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_AccountingClosedPacks','accounting_period_close',v_pack.id,'close_period','Accounting period locked',v_reason,jsonb_build_object('periodId',p_period,'sourceDigest',v_digest,'reviewId',v_review.id,'approvalDecision',v_decision));
  return to_jsonb(v_pack);
end; $$;
-- All replacements retain the original service-only execution boundary.
revoke all on function public.multideck_finance_recognition_controls(uuid,uuid,text,jsonb),
  public.multideck_charge_recognise_initial(uuid,uuid,bigint,text),
  public.multideck_finance_charge_correction(uuid,uuid,uuid,text,text,jsonb),
  public.multideck_finance_charge_case_resolution(uuid,uuid,uuid,text,jsonb),
  public.multideck_finance_accounting_vat_control(uuid,uuid,uuid,text,jsonb),
  public.multideck_finance_accounting_close(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_finance_recognition_controls(uuid,uuid,text,jsonb),
  public.multideck_charge_recognise_initial(uuid,uuid,bigint,text),
  public.multideck_finance_charge_correction(uuid,uuid,uuid,text,text,jsonb),
  public.multideck_finance_charge_case_resolution(uuid,uuid,uuid,text,jsonb),
  public.multideck_finance_accounting_vat_control(uuid,uuid,uuid,text,jsonb),
  public.multideck_finance_accounting_close(uuid,uuid,uuid,text,jsonb) to service_role;

commit;
