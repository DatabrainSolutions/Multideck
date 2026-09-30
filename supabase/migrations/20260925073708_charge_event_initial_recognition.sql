begin;

create table public."FIN_ChargeEventRecognitions" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  charge_id uuid not null references public."Job_Costing_Lines"("JobCostingLine_ID"),
  kind text not null check(kind in ('cost','revenue')),
  source_revision bigint not null,
  source_hash text not null,
  mandate_id uuid not null references public."FIN_RecognitionMandates"(id),
  evidence_id uuid not null,
  cutover_id uuid not null references public."FIN_ChargeMappingCutovers"(id),
  period_id uuid not null references public."FIN_Periods"("FINPeriod_ID"),
  close_run_id uuid not null references public."FIN_PeriodCloseRuns"("FINCloseRun_ID"),
  close_item_id uuid not null references public."FIN_PeriodCloseRunItems"("FINCloseItem_ID"),
  posting_batch_id uuid not null references public."FIN_PostingBatches"("FINPostBatch_ID"),
  amount_local numeric(18,4) not null check(amount_local>0),
  source_snapshot jsonb not null,
  posted_by uuid not null references public."cmp_Users"("User_ID"),
  posted_at timestamptz not null default now(),
  unique(legal_entity_id,charge_id,kind)
);
create index on public."FIN_ChargeEventRecognitions"(legal_entity_id,period_id,posted_at);
alter table public."FIN_ChargeEventRecognitions" enable row level security;
revoke all on public."FIN_ChargeEventRecognitions" from public,anon,authenticated;
grant select,insert on public."FIN_ChargeEventRecognitions" to service_role;

create function public.multideck_charge_recognise_initial(p_entity uuid,p_charge uuid,p_revision bigint,p_kind text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare mandate public."FIN_RecognitionMandates"; q public."FIN_ChargeLifecycleQueue";
  evidence_id uuid; service_date date; evidence_revision text; v_disputed boolean;
  v_source jsonb; v_hash text; v_estimate numeric; v_actual numeric; v_amount numeric;
  v_job uuid; v_job_status text; v_job_deleted boolean; v_charge_code uuid;
  v_currency text; v_period public."FIN_Periods"; v_cutover public."FIN_ChargeMappingCutovers";
  v_mapped jsonb; v_group jsonb; v_expense uuid; v_control uuid;
  v_open numeric; v_existing integer; v_bad_documents integer; v_bad_matches integer; v_reason text;
  v_run uuid; v_item uuid; v_batch uuid; v_adjustment uuid; v_actor uuid;
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
      jsonb_build_object('chargeId',p_charge,'kind',p_kind,'amount',v_amount,'periodId',v_period."FINPeriod_ID",'batchId',v_batch,'cutoverId',v_cutover.id));
  return jsonb_build_object('status','posted','kind',p_kind,'amountLocal',v_amount::text,'periodId',v_period."FINPeriod_ID",'batchId',v_batch);
end; $$;
revoke all on function public.multideck_charge_recognise_initial(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.multideck_charge_recognise_initial(uuid,uuid,bigint,text) to service_role;

-- The approved period workflow can still manage all other charges, but may
-- never create a second initial balance for a charge under this event engine.
create function public._multideck_event_recognition_duplicate_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_charge uuid; v_kind text; v_item uuid;
begin
  if tg_table_name='FIN_Accruals' then v_charge:=new."FINAccrual_JobCostingLineID"; v_kind:='cost'; v_item:=new."FINAccrual_CloseRunItemID";
  else v_charge:=new."FINWIP_JobCostingLineID"; v_kind:='revenue'; v_item:=new."FINWIP_CloseRunItemID"; end if;
  if v_charge is not null and exists(select 1 from public."FIN_ChargeEventRecognitions" r
    where r.charge_id=v_charge and r.kind=v_kind and r.close_item_id is distinct from v_item) then
    raise exception 'This charge already has event recognition; review the delta before another posting.' using errcode='22023'; end if;
  return new;
end; $$;
revoke all on function public._multideck_event_recognition_duplicate_guard() from public,anon,authenticated;
create trigger "TR_FIN_Accruals_event_duplicate_guard" before insert on public."FIN_Accruals"
  for each row execute function public._multideck_event_recognition_duplicate_guard();
create trigger "TR_FIN_WIPItems_event_duplicate_guard" before insert on public."FIN_WIPItems"
  for each row execute function public._multideck_event_recognition_duplicate_guard();

commit;
