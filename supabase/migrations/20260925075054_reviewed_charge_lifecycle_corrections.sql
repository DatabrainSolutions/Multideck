begin;

create table public."FIN_ChargeCorrections" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  charge_id uuid not null references public."Job_Costing_Lines"("JobCostingLine_ID"),
  kind text not null check(kind in ('cost','revenue')),
  status text not null default 'prepared' check(status in ('prepared','posting','posted')),
  source_hash text not null,
  snapshot jsonb not null,
  target_balance numeric(18,4) not null,
  delta numeric(18,4) not null check(delta<>0),
  period_id uuid not null references public."FIN_Periods"("FINPeriod_ID"),
  prepared_by uuid not null references public."cmp_Users"("User_ID"),
  prepared_at timestamptz not null default now(),
  prepared_reason text not null check(length(trim(prepared_reason)) between 10 and 2000),
  approved_by uuid references public."cmp_Users"("User_ID"),
  approved_at timestamptz,
  approval_reason text,
  close_run_id uuid references public."FIN_PeriodCloseRuns"("FINCloseRun_ID"),
  close_item_id uuid references public."FIN_PeriodCloseRunItems"("FINCloseItem_ID"),
  posting_batch_id uuid references public."FIN_PostingBatches"("FINPostBatch_ID")
);
create index on public."FIN_ChargeCorrections"(legal_entity_id,charge_id,prepared_at desc);
create unique index fin_one_posted_charge_correction_per_source on public."FIN_ChargeCorrections"(legal_entity_id,charge_id,kind,source_hash)
  where status='posted';
create table public."FIN_ChargeCorrectionMovements" (
  id uuid primary key default gen_random_uuid(),
  correction_id uuid not null references public."FIN_ChargeCorrections"(id),
  accrual_id uuid references public."FIN_Accruals"("FINAccrual_ID"),
  wip_id uuid references public."FIN_WIPItems"("FINWIP_ID"),
  direction text not null check(direction in ('increase','release')),
  amount_local numeric(18,4) not null check(amount_local>0),
  expense_account_id uuid not null references public."FIN_NominalAccounts"("FINNom_ID"),
  control_account_id uuid not null references public."FIN_NominalAccounts"("FINNom_ID"),
  posting_batch_id uuid not null references public."FIN_PostingBatches"("FINPostBatch_ID"),
  created_at timestamptz not null default now(),
  check ((accrual_id is null) <> (wip_id is null))
);
create index on public."FIN_ChargeCorrectionMovements"(correction_id,created_at);
alter table public."FIN_ChargeCorrections" enable row level security;
alter table public."FIN_ChargeCorrectionMovements" enable row level security;
revoke all on public."FIN_ChargeCorrections",public."FIN_ChargeCorrectionMovements" from public,anon,authenticated;
grant select,insert,update on public."FIN_ChargeCorrections" to service_role;
grant select,insert on public."FIN_ChargeCorrectionMovements" to service_role;

-- Proposal and approval call this same server snapshot. Current subledger
-- balance, every original posting pair, source documents, evidence, mapping,
-- period and mirror readiness all participate in the stale-approval check.
create function public._multideck_charge_correction_snapshot(p_entity uuid,p_charge uuid,p_kind text)
returns jsonb language plpgsql volatile security invoker set search_path=pg_catalog,public as $$
declare source jsonb; v_hash text; v_job uuid; v_charge_code uuid; v_estimate numeric; v_actual numeric:=0;
  v_current numeric:=0; v_target numeric; v_delta numeric; v_evidence uuid; v_evidence_hash text;
  v_service date; v_disputed boolean; v_is_final boolean:=false; v_period public."FIN_Periods";
  v_cutover public."FIN_ChargeMappingCutovers"; v_mapped jsonb; v_group jsonb;
  v_origins jsonb:='[]'; v_origin record; v_expense uuid; v_control uuid;
  v_pending integer:=0; v_invalid integer:=0; v_currency text; v_mode text; v_connected boolean; v_native boolean;
  v_reasons text[]:='{}'; v_queue_revision bigint;
begin
  if p_kind not in ('cost','revenue') then raise exception 'Unknown correction kind.' using errcode='22023'; end if;
  source:=public._multideck_cost_source(p_entity,p_charge);
  v_hash:=md5(source::text);
  select source_revision into v_queue_revision from public."FIN_ChargeLifecycleQueue"
    where legal_entity_id=p_entity and charge_id=p_charge;
  v_job:=(source#>>'{job,id}')::uuid;
  v_charge_code:=(source#>>'{charge,JobCostingLine_ChargeCodeID}')::uuid;
  v_estimate:=case when p_kind='cost' then (source#>>'{charge,JobCostingLine_CostAmountLocal}')::numeric
    else (source#>>'{charge,JobCostingLine_RevenueAmountLocal}')::numeric end;
  if v_estimate is null or v_estimate<0 or source#>>'{job,status}' in ('draft','provisional','cancelled')
    or coalesce((source#>>'{job,deleted}')::boolean,false) then
    v_reasons:=array_append(v_reasons,'Charge estimate or job eligibility requires review'); end if;
  if p_kind='cost' then
    select e.id,e.source_revision,e.service_completed_on,e.disputed,e.is_final
      into v_evidence,v_evidence_hash,v_service,v_disputed,v_is_final from public."FIN_CostEvidence" e
      where e.legal_entity_id=p_entity and e.charge_id=p_charge order by e.recorded_at desc,e.id desc limit 1;
  else
    select e.id,e.source_revision,e.service_completed_on,e.disputed into v_evidence,v_evidence_hash,v_service,v_disputed
      from public."FIN_RevenueServiceEvidence" e where e.legal_entity_id=p_entity and e.charge_id=p_charge
      order by e.recorded_at desc,e.id desc limit 1;
  end if;
  if v_evidence is null or v_evidence_hash is distinct from v_hash or v_disputed then
    v_reasons:=array_append(v_reasons,'Fresh undisputed completed-service evidence is required'); end if;
  if v_is_final then v_reasons:=array_append(v_reasons,'Use controlled final-invoice residual finalisation'); end if;
  select count(*) filter(where d->'document'->>'FINDoc_NativePostingStatusCode' not in ('posted','reversed')),
    count(*) filter(where d->'document'->>'FINDoc_LegalEntityID' is distinct from p_entity::text
      or (p_kind='cost' and d->'document'->>'FINDoc_TypeCode' in ('pl_invoice','debit_note')
        and d->'document'->>'FINDoc_PartyOrgID' is distinct from source#>>'{charge,JobCostingLine_SupplierID}')
      or coalesce((d->'link'->>'FINDocLineJob_LocalNetAmount')::numeric,0)<0
      or (d->'document'->>'FINDoc_NativePostingStatusCode'='posted'
        and d->'document'->>'FINDoc_NativePostingBatchID' is null)),
    coalesce(sum(case when d->'document'->>'FINDoc_TypeCode'=case when p_kind='cost' then 'pl_invoice' else 'sl_invoice' end
      then (d->'link'->>'FINDocLineJob_LocalNetAmount')::numeric
      when d->'document'->>'FINDoc_TypeCode'=case when p_kind='cost' then 'debit_note' else 'credit_note' end
      then -abs((d->'link'->>'FINDocLineJob_LocalNetAmount')::numeric) else 0 end)
      filter(where d->'document'->>'FINDoc_NativePostingStatusCode'='posted'),0)
    into v_pending,v_invalid,v_actual from jsonb_array_elements(source->'documents') d;
  if v_pending>0 or v_invalid>0 or v_actual<0 then v_reasons:=array_append(v_reasons,'Linked document state, entity, supplier or amount requires review'); end if;
  v_target:=case when p_kind='cost' and v_is_final then 0
    else greatest(coalesce(v_estimate,0)-v_actual,0) end;
  select * into v_period from public."FIN_Periods" where "FINPeriod_LegalEntityID"=p_entity
    and "FINPeriod_Code"=to_char(current_date,'YYYYMM') and "FINPeriod_StatusCode"='open';
  if not found then v_reasons:=array_append(v_reasons,'Current accounting period must be open'); end if;
  select "LegalEntity_BaseCurrencyCodeSnapshot" into v_currency from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity;
  if v_period."FINPeriod_ID" is not null and v_period."FINPeriod_BaseCurrencyCode" is distinct from v_currency then
    v_reasons:=array_append(v_reasons,'Period currency differs from legal entity'); end if;
  select mirror_mode,active_connection,native_ledger_enabled into v_mode,v_connected,v_native
    from public._multideck_finance_mirror_state(p_entity);
  if not v_native or (v_mode='required' and not v_connected) then
    v_reasons:=array_append(v_reasons,'Native ledger or required mirror is unavailable'); end if;
  if p_kind='cost' then
    for v_origin in select a."FINAccrual_ID" adjustment_id,a."FINAccrual_AccruedAmount"-a."FINAccrual_RelievedAmount" open_balance,
        r."FINCloseRun_PostingBatchID" original_batch from public."FIN_Accruals" a
      join public."FIN_Periods" p on p."FINPeriod_ID"=a."FINAccrual_PeriodID" and p."FINPeriod_LegalEntityID"=p_entity
      left join public."FIN_PeriodCloseRunItems" i on i."FINCloseItem_ID"=a."FINAccrual_CloseRunItemID"
      left join public."FIN_PeriodCloseRuns" r on r."FINCloseRun_ID"=i."FINCloseItem_CloseRunID"
      where a."FINAccrual_JobCostingLineID"=p_charge and a."FINAccrual_AccruedAmount">a."FINAccrual_RelievedAmount"
      order by a."FINAccrual_AccountingDate",a."FINAccrual_ID" loop
      select (max("FINPostLine_NominalAccountID"::text) filter(where "FINPostLine_DebitAmount">0))::uuid,
        (max("FINPostLine_NominalAccountID"::text) filter(where "FINPostLine_CreditAmount">0))::uuid
        into v_expense,v_control from public."FIN_PostingLines"
        where "FINPostLine_BatchID"=v_origin.original_batch and "FINPostLine_AccrualID"=v_origin.adjustment_id;
      if v_expense is null or v_control is null or v_expense=v_control then
        v_reasons:=array_append(v_reasons,'Original cost posting pair requires review'); end if;
      v_origins:=v_origins||jsonb_build_array(jsonb_build_object('id',v_origin.adjustment_id,'open',v_origin.open_balance,
        'expense',v_expense,'control',v_control));
      v_current:=v_current+v_origin.open_balance;
    end loop;
  else
    for v_origin in select w."FINWIP_ID" adjustment_id,w."FINWIP_WIPAmount"-w."FINWIP_RelievedAmount" open_balance,
        r."FINCloseRun_PostingBatchID" original_batch from public."FIN_WIPItems" w
      join public."FIN_Periods" p on p."FINPeriod_ID"=w."FINWIP_PeriodID" and p."FINPeriod_LegalEntityID"=p_entity
      left join public."FIN_PeriodCloseRunItems" i on i."FINCloseItem_ID"=w."FINWIP_CloseRunItemID"
      left join public."FIN_PeriodCloseRuns" r on r."FINCloseRun_ID"=i."FINCloseItem_CloseRunID"
      where w."FINWIP_JobCostingLineID"=p_charge and w."FINWIP_WIPAmount">w."FINWIP_RelievedAmount"
      order by w."FINWIP_AccountingDate",w."FINWIP_ID" loop
      select (max("FINPostLine_NominalAccountID"::text) filter(where "FINPostLine_CreditAmount">0))::uuid,
        (max("FINPostLine_NominalAccountID"::text) filter(where "FINPostLine_DebitAmount">0))::uuid
        into v_expense,v_control from public."FIN_PostingLines"
        where "FINPostLine_BatchID"=v_origin.original_batch and "FINPostLine_WIPID"=v_origin.adjustment_id;
      if v_expense is null or v_control is null or v_expense=v_control then
        v_reasons:=array_append(v_reasons,'Original revenue posting pair requires review'); end if;
      v_origins:=v_origins||jsonb_build_array(jsonb_build_object('id',v_origin.adjustment_id,'open',v_origin.open_balance,
        'expense',v_expense,'control',v_control));
      v_current:=v_current+v_origin.open_balance;
    end loop;
  end if;
  v_delta:=v_target-v_current;
  if v_delta>0 then
    if jsonb_array_length(v_origins)>0 then
      v_expense:=(v_origins->0->>'expense')::uuid; v_control:=(v_origins->0->>'control')::uuid;
    else
      -- A fully relieved original still determines the account pair for a
      -- credit-driven restoration. Mapping may have changed since that invoice.
      if p_kind='cost' then
        select expense."FINPostLine_NominalAccountID",control."FINPostLine_NominalAccountID"
          into v_expense,v_control from public."FIN_Accruals" a
          join public."FIN_Periods" p on p."FINPeriod_ID"=a."FINAccrual_PeriodID" and p."FINPeriod_LegalEntityID"=p_entity
          join public."FIN_PeriodCloseRunItems" i on i."FINCloseItem_ID"=a."FINAccrual_CloseRunItemID"
          join public."FIN_PeriodCloseRuns" r on r."FINCloseRun_ID"=i."FINCloseItem_CloseRunID"
          join public."FIN_PostingLines" expense on expense."FINPostLine_BatchID"=r."FINCloseRun_PostingBatchID"
            and expense."FINPostLine_AccrualID"=a."FINAccrual_ID" and expense."FINPostLine_DebitAmount">0
          join public."FIN_PostingLines" control on control."FINPostLine_BatchID"=r."FINCloseRun_PostingBatchID"
            and control."FINPostLine_AccrualID"=a."FINAccrual_ID" and control."FINPostLine_CreditAmount">0
          where a."FINAccrual_JobCostingLineID"=p_charge order by a."FINAccrual_CreatedAt" desc,a."FINAccrual_ID" desc limit 1;
      else
        select income."FINPostLine_NominalAccountID",control."FINPostLine_NominalAccountID"
          into v_expense,v_control from public."FIN_WIPItems" w
          join public."FIN_Periods" p on p."FINPeriod_ID"=w."FINWIP_PeriodID" and p."FINPeriod_LegalEntityID"=p_entity
          join public."FIN_PeriodCloseRunItems" i on i."FINCloseItem_ID"=w."FINWIP_CloseRunItemID"
          join public."FIN_PeriodCloseRuns" r on r."FINCloseRun_ID"=i."FINCloseItem_CloseRunID"
          join public."FIN_PostingLines" income on income."FINPostLine_BatchID"=r."FINCloseRun_PostingBatchID"
            and income."FINPostLine_WIPID"=w."FINWIP_ID" and income."FINPostLine_CreditAmount">0
          join public."FIN_PostingLines" control on control."FINPostLine_BatchID"=r."FINCloseRun_PostingBatchID"
            and control."FINPostLine_WIPID"=w."FINWIP_ID" and control."FINPostLine_DebitAmount">0
          where w."FINWIP_JobCostingLineID"=p_charge order by w."FINWIP_CreatedAt" desc,w."FINWIP_ID" desc limit 1;
      end if;
    end if;
    if v_expense is null or v_control is null then
      select * into v_cutover from public."FIN_ChargeMappingCutovers" where legal_entity_id=p_entity and status='active'
        and effective_date<=current_date order by effective_date desc limit 1;
      v_mapped:=v_cutover.mapping_snapshot->v_charge_code::text;
      if v_mapped is null or v_mapped->p_kind is null then v_reasons:=array_append(v_reasons,'Approved dated charge mapping is missing');
      else
        v_group:=public._multideck_validate_nominal_group(p_entity,(v_mapped->p_kind->>'id')::uuid,p_kind);
        if v_group is distinct from v_mapped->p_kind then v_reasons:=array_append(v_reasons,'Approved charge mapping drifted');
        else v_expense:=(v_group#>>'{accrued,id}')::uuid; v_control:=(v_group->>'control_account_id')::uuid; end if;
      end if;
    end if;
    if v_expense is null or v_control is null or v_expense=v_control then
      v_reasons:=array_append(v_reasons,'An exact balanced original nominal pair is required'); end if;
  end if;
  if v_delta<0 and jsonb_array_length(v_origins)=0 then v_reasons:=array_append(v_reasons,'No open original balance to relieve'); end if;
  if v_delta=0 then v_reasons:=array_append(v_reasons,'No balance correction is required'); end if;
  if v_delta>0 and v_expense is not null and v_control is not null then
    if (select count(*) from public."FIN_NominalAccounts" where "FINNom_ID" in (v_expense,v_control)
      and "FINNom_LegalEntityID"=p_entity and "FINNom_IsActive")<>2 then
      v_reasons:=array_append(v_reasons,'Original correction accounts must be active in this legal entity'); end if;
  end if;
  if v_delta<0 and exists(select 1 from jsonb_array_elements(v_origins) origin
    where (select count(*) from public."FIN_NominalAccounts" where "FINNom_ID" in ((origin->>'expense')::uuid,(origin->>'control')::uuid)
      and "FINNom_LegalEntityID"=p_entity and "FINNom_IsActive")<>2) then
    v_reasons:=array_append(v_reasons,'Original release accounts must be active in this legal entity'); end if;
  return jsonb_build_object('sourceHash',v_hash,'queueRevision',coalesce(v_queue_revision,0),'source',source,'evidenceId',v_evidence,'serviceDate',v_service,
    'kind',p_kind,'periodId',v_period."FINPeriod_ID",'currency',v_currency,'cutoverId',v_cutover.id,
    'estimate',v_estimate,'actual',v_actual,'target',v_target,'current',v_current,'delta',v_delta,
    'expenseAccountId',v_expense,'controlAccountId',v_control,'origins',v_origins,
    'blockers',to_jsonb(v_reasons));
end; $$;
revoke all on function public._multideck_charge_correction_snapshot(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public._multideck_charge_correction_snapshot(uuid,uuid,text) to service_role;

create function public.multideck_finance_charge_correction(
  p_actor uuid,p_entity uuid,p_charge uuid,p_kind text,p_action text,p_input jsonb default '{}'
) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare c public."FIN_ChargeCorrections"; s jsonb; v_reason text; v_period public."FIN_Periods";
  v_run uuid; v_item uuid; v_batch uuid; v_adjustment uuid; v_job uuid; v_currency text;
  v_delta numeric; v_amount numeric; v_remaining numeric; v_release numeric; v_line integer:=0;
  v_origin jsonb; v_expense uuid; v_control uuid; v_actual_account_count integer;
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
  if c.status<>'prepared' or c.prepared_by=p_actor then raise exception 'An independent finance operator must approve a prepared correction.' using errcode='42501'; end if;
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
      jsonb_build_object('kind',p_kind,'target',c.target_balance,'delta',c.delta,'periodId',c.period_id,'batchId',v_batch,'sourceHash',c.source_hash));
  return jsonb_build_object('status','posted','reviewId',c.id,'kind',p_kind,'target',c.target_balance::text,
    'delta',v_delta::text,'postingBatchId',v_batch,'periodId',c.period_id);
end; $$;
revoke all on function public.multideck_finance_charge_correction(uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_finance_charge_correction(uuid,uuid,uuid,text,text,jsonb) to service_role;

-- A signed correction is the only route through the two original duplication
-- guards. It creates its own dated subledger item and immutable posting batch.
create or replace function public._multideck_event_recognition_duplicate_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_charge uuid; v_kind text; v_item uuid;
begin
  if tg_table_name='FIN_Accruals' then v_charge:=new."FINAccrual_JobCostingLineID"; v_kind:='cost'; v_item:=new."FINAccrual_CloseRunItemID";
  else v_charge:=new."FINWIP_JobCostingLineID"; v_kind:='revenue'; v_item:=new."FINWIP_CloseRunItemID"; end if;
  if v_charge is not null and exists(select 1 from public."FIN_ChargeEventRecognitions" r
    where r.charge_id=v_charge and r.kind=v_kind and r.close_item_id is distinct from v_item)
    and not exists(select 1 from public."FIN_ChargeCorrections" c where c.charge_id=v_charge and c.kind=v_kind
      and c.close_item_id=v_item and c.status='posting') then
    raise exception 'This charge already has event recognition; review the delta before another posting.' using errcode='22023'; end if;
  return new;
end; $$;

create or replace function public._multideck_cost_finalised_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public."FIN_CostFinalisations" where charge_id=new."FINAccrual_JobCostingLineID" and status in ('posted','settled'))
    and not exists(select 1 from public."FIN_ChargeCorrections" c where c.charge_id=new."FINAccrual_JobCostingLineID"
      and c.kind='cost' and c.close_item_id=new."FINAccrual_CloseRunItemID" and c.status='posting') then
    raise exception 'This charge has been finalised. Review a late-invoice correction before creating another accrual.' using errcode='22023'; end if;
  return new;
end; $$;

commit;
