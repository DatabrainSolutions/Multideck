begin;

insert into public."sys_WorkflowRecordTypes"("WorkflowRecordType_Code","WorkflowRecordType_Name",
  "WorkflowRecordType_SourceTable","WorkflowRecordType_Description")
values('opening_fx','Opening FX settlement','FIN_OpeningFXSettlements',
  'Reviewed control reclassification and realised FX for imported opening invoices.')
on conflict("WorkflowRecordType_Code") do nothing;

-- A normal cash batch uses its configured trade control. An imported opening
-- document may carry a different CargoWise control. A reviewed settlement
-- corrects the allocated slice of that cash batch and recognises realised FX.
create table public."FIN_OpeningFXSettlements" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  package_id uuid not null references public."FIN_OpeningBalancePackages"(id) on delete restrict,
  allocation_id uuid not null unique references public."FIN_CashAllocations"("FINCashAlloc_ID") on delete restrict,
  cash_id uuid not null references public."FIN_CashTransactions"("FINCash_ID") on delete restrict,
  document_id uuid not null references public."FIN_Documents"("FINDoc_ID") on delete restrict,
  cash_control_nominal_id uuid not null references public."FIN_NominalAccounts"("FINNom_ID") on delete restrict,
  source_control_nominal_id uuid not null references public."FIN_NominalAccounts"("FINNom_ID") on delete restrict,
  fx_nominal_id uuid references public."FIN_NominalAccounts"("FINNom_ID") on delete restrict,
  source_amount numeric(18,4) not null check(source_amount>0),
  cash_rate numeric(20,10) not null check(cash_rate>0),
  document_rate numeric(20,10) not null check(document_rate>0),
  cash_local numeric(18,4) not null check(cash_local>0),
  document_local numeric(18,4) not null check(document_local>0),
  gain_loss_amount numeric(18,4) not null,
  status text not null default 'proposed' check(status in ('proposed','posted')),
  reason text not null check(length(btrim(reason)) between 8 and 500),
  proposed_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  proposed_at timestamptz not null default now(),
  posted_by uuid references public."cmp_Users"("User_ID") on delete restrict,
  posted_at timestamptz,
  correction_date date,
  posting_batch_id uuid unique references public."FIN_PostingBatches"("FINPostBatch_ID") on delete restrict,
  check((status='proposed' and posted_by is null and posted_at is null and correction_date is null and posting_batch_id is null)
    or (status='posted' and posted_by is not null and posted_at is not null and correction_date is not null and posting_batch_id is not null))
);
create index on public."FIN_OpeningFXSettlements"(legal_entity_id,package_id,status);
alter table public."FIN_OpeningFXSettlements" enable row level security;
revoke all on public."FIN_OpeningFXSettlements" from public,anon,authenticated;
grant select,insert,update on public."FIN_OpeningFXSettlements" to service_role;

create function public._multideck_finance_opening_fx_candidate(p_allocation uuid,p_entity uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public."FIN_CashAllocations"; cash public."FIN_CashTransactions";
  doc public."FIN_Documents"; source_item public."FIN_OpeningSourceItems";
  package public."FIN_OpeningBalancePackages"; v_line public."FIN_PostingLines";
  v_period public."FIN_Periods"; v_cash_local numeric; v_doc_local numeric;
  v_prior numeric; v_total_allocated numeric; v_last uuid; v_delta numeric; v_gain numeric;
begin
  select * into a from public."FIN_CashAllocations" where "FINCashAlloc_ID"=p_allocation for update;
  if not found or a."FINCashAlloc_AllocationStatusCode"<>'allocated'
    or a."FINCashAlloc_DocumentID" is null or a."FINCashAlloc_AllocatedAmount"<=0 then
    raise exception 'Choose an allocated opening invoice settlement.' using errcode='22023'; end if;
  select * into doc from public."FIN_Documents" where "FINDoc_ID"=a."FINCashAlloc_DocumentID" for share;
  select * into cash from public."FIN_CashTransactions" where "FINCash_ID"=a."FINCashAlloc_CashID" for share;
  if doc."FINDoc_ID" is null or cash."FINCash_ID" is null
    or doc."FINDoc_LegalEntityID" is distinct from p_entity
    or cash."FINCash_LegalEntityID" is distinct from p_entity
    or doc."FINDoc_PartyOrgID" is distinct from cash."FINCash_PartyOrgID"
    or doc."FINDoc_CurrencyCodeSnapshot" is distinct from cash."FINCash_CurrencyCodeSnapshot"
    or doc."FINDoc_TypeCode" is distinct from
      (case cash."FINCash_TypeCode" when 'customer_receipt' then 'sl_invoice'
        when 'supplier_payment' then 'pl_invoice' else null end)
    or doc."FINDoc_NativePostingStatusCode"<>'posted'
    or cash."FINCash_NativePostingStatusCode"<>'posted' then
    raise exception 'Opening settlement cash and invoice are not one posted party, currency and legal entity.' using errcode='22023'; end if;
  select * into source_item from public."FIN_OpeningSourceItems" where operational_document_id=doc."FINDoc_ID";
  select * into package from public."FIN_OpeningBalancePackages" where id=source_item.package_id;
  if source_item.id is null or package.id is null or package.legal_entity_id<>p_entity
    or package.status<>'posted' or doc."FINDoc_OpeningBalancePackageID" is distinct from package.id
    or source_item.kind is distinct from (case cash."FINCash_TypeCode"
      when 'customer_receipt' then 'customer_invoice' else 'supplier_invoice' end)
    or source_item.party_org_id is distinct from doc."FINDoc_PartyOrgID"
    or cash."FINCash_AccountingDate"<package.opening_date then
    raise exception 'The allocation has no reviewed posted CargoWise opening invoice.' using errcode='22023'; end if;
  select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=cash."FINCash_PeriodID"
    and "FINPeriod_LegalEntityID"=p_entity for share;
  if not found or cash."FINCash_AccountingDate" not between v_period."FINPeriod_StartDate" and v_period."FINPeriod_EndDate" then
    raise exception 'The cash posting has no matching accounting period.' using errcode='22023'; end if;
  select line.* into v_line from public."FIN_PostingLines" line
    join public."FIN_PostingBatches" batch on batch."FINPostBatch_ID"=line."FINPostLine_BatchID"
    where line."FINPostLine_BatchID"=cash."FINCash_NativePostingBatchID"
      and line."FINPostLine_LineNo"=2 and line."FINPostLine_CashID"=cash."FINCash_ID"
      and batch."FINPostBatch_StatusCode"='posted' and batch."FINPostBatch_SourceTable"='FIN_CashTransactions'
      and batch."FINPostBatch_SourceID"=cash."FINCash_ID" and batch."FINPostBatch_LegalEntityID"=p_entity;
  if not found or v_line."FINPostLine_NominalAccountID" is null
    or (case cash."FINCash_TypeCode" when 'customer_receipt' then v_line."FINPostLine_CreditAmount"
      else v_line."FINPostLine_DebitAmount" end) is distinct from cash."FINCash_LocalAmount" then
    raise exception 'The native cash control posting cannot be traced exactly.' using errcode='22023'; end if;
  if not exists(select 1 from public."FIN_NominalAccounts" n where n."FINNom_ID"=source_item.control_nominal_id
      and n."FINNom_LegalEntityID"=p_entity and n."FINNom_IsActive" and n."FINNom_IsControlAccount")
    or not exists(select 1 from public."FIN_NominalAccounts" n where n."FINNom_ID"=v_line."FINPostLine_NominalAccountID"
      and n."FINNom_LegalEntityID"=p_entity and n."FINNom_IsActive" and n."FINNom_IsControlAccount") then
    raise exception 'The source and posted cash controls must remain active in this legal entity.' using errcode='22023'; end if;
  if a."FINCashAlloc_LocalAllocatedAmount" is distinct from
      round(a."FINCashAlloc_AllocatedAmount"*doc."FINDoc_ExchangeRate",4)
    or a."FINCashAlloc_AllocatedAmount">cash."FINCash_Amount"
    or doc."FINDoc_ExchangeRate"<=0 or cash."FINCash_ExchangeRate"<=0 then
    raise exception 'The allocation changed from its reviewed source carrying and cash rates.' using errcode='22023'; end if;
  select coalesce(sum("FINCashAlloc_AllocatedAmount"),0) into v_total_allocated
    from public."FIN_CashAllocations" where "FINCashAlloc_DocumentID"=doc."FINDoc_ID"
      and "FINCashAlloc_AllocationStatusCode"='allocated';
  if v_total_allocated>source_item.outstanding_amount then
    raise exception 'Opening allocations exceed the imported invoice outstanding amount.' using errcode='22023'; end if;
  v_cash_local:=round(a."FINCashAlloc_AllocatedAmount"*cash."FINCash_ExchangeRate",4);
  select coalesce(sum("FINCashAlloc_AllocatedAmount"),0),
    (array_agg("FINCashAlloc_ID" order by "FINCashAlloc_ID" desc))[1]
    into v_total_allocated,v_last from public."FIN_CashAllocations"
    where "FINCashAlloc_CashID"=cash."FINCash_ID" and "FINCashAlloc_AllocationStatusCode"='allocated';
  if v_total_allocated=cash."FINCash_Amount" and p_allocation=v_last then
    select coalesce(sum(round("FINCashAlloc_AllocatedAmount"*cash."FINCash_ExchangeRate",4)),0)
      into v_prior from public."FIN_CashAllocations"
      where "FINCashAlloc_CashID"=cash."FINCash_ID" and "FINCashAlloc_AllocationStatusCode"='allocated'
        and "FINCashAlloc_ID"<>p_allocation;
    v_cash_local:=cash."FINCash_LocalAmount"-v_prior;
  end if;
  v_doc_local:=a."FINCashAlloc_LocalAllocatedAmount";
  if v_cash_local<=0 then raise exception 'The cash allocation has no positive posted base value.' using errcode='22023'; end if;
  v_delta:=v_cash_local-v_doc_local;
  v_gain:=case when cash."FINCash_TypeCode"='customer_receipt' then v_delta else -v_delta end;
  return jsonb_build_object('allocationId',p_allocation,'entityId',p_entity,'packageId',package.id,
    'cashId',cash."FINCash_ID",'cashReference',cash."FINCash_Number",
    'documentId',doc."FINDoc_ID",'sourceReference',source_item.source_reference,
    'periodId',v_period."FINPeriod_ID",
    'sourceControlNominalId',source_item.control_nominal_id,
    'sourceControlCode',(select "FINNom_Code" from public."FIN_NominalAccounts" where "FINNom_ID"=source_item.control_nominal_id),
    'cashControlNominalId',v_line."FINPostLine_NominalAccountID",
    'cashControlCode',(select "FINNom_Code" from public."FIN_NominalAccounts" where "FINNom_ID"=v_line."FINPostLine_NominalAccountID"),
    'cashType',cash."FINCash_TypeCode",'currency',cash."FINCash_CurrencyCodeSnapshot",
    'baseCurrency',(select "LegalEntity_BaseCurrencyCodeSnapshot" from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity),
    'sourceAmount',a."FINCashAlloc_AllocatedAmount",'cashRate',cash."FINCash_ExchangeRate",
    'documentRate',doc."FINDoc_ExchangeRate",'cashLocal',v_cash_local,'documentLocal',v_doc_local,
    'cashAccountingDate',cash."FINCash_AccountingDate",
    'gainLoss',v_gain,'needed',v_delta<>0 or v_line."FINPostLine_NominalAccountID"<>source_item.control_nominal_id);
end; $$;
revoke all on function public._multideck_finance_opening_fx_candidate(uuid,uuid) from public,anon,authenticated;

create function public.multideck_finance_opening_fx_settlement(p_actor uuid,p_entity uuid,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare s public."FIN_OpeningFXSettlements"; candidate jsonb; v_nominal public."FIN_NominalAccounts";
  v_allocation uuid; v_batch uuid; v_cash_local numeric; v_doc_local numeric; v_gain numeric;
  v_total numeric; v_period public."FIN_Periods"; v_cash_period public."FIN_Periods";
  v_type text; v_currency text; v_correction_date date; v_target_period uuid;
  v_work record; v_result jsonb:='[]'::jsonb; v_offset integer; v_count bigint;
begin
  perform public._multideck_journal_access(p_actor,p_entity,
    case p_action when 'read' then 'Finance.Management.View' when 'propose' then 'Finance.Management.Prepare'
      else 'Finance.Management.Post' end);
  if p_action='read' then
    v_offset:=coalesce((p_input->>'offset')::integer,0);
    if v_offset<0 or v_offset>50000 then
      raise exception 'Choose a valid opening settlement page.' using errcode='22023'; end if;
    select count(*) into v_count from public."FIN_CashAllocations" a
      join public."FIN_Documents" d on d."FINDoc_ID"=a."FINCashAlloc_DocumentID"
      join public."FIN_CashTransactions" c on c."FINCash_ID"=a."FINCashAlloc_CashID"
      where d."FINDoc_LegalEntityID"=p_entity and c."FINCash_LegalEntityID"=p_entity
        and d."FINDoc_OpeningBalancePackageID" is not null
        and (nullif(p_input->>'packageId','') is null
          or d."FINDoc_OpeningBalancePackageID"=(p_input->>'packageId')::uuid)
        and a."FINCashAlloc_AllocationStatusCode"='allocated'
        and c."FINCash_NativePostingStatusCode"='posted';
    for v_work in select a."FINCashAlloc_ID" allocation_id from public."FIN_CashAllocations" a
      join public."FIN_Documents" d on d."FINDoc_ID"=a."FINCashAlloc_DocumentID"
      join public."FIN_CashTransactions" c on c."FINCash_ID"=a."FINCashAlloc_CashID"
      where d."FINDoc_LegalEntityID"=p_entity and c."FINCash_LegalEntityID"=p_entity
        and d."FINDoc_OpeningBalancePackageID" is not null
        and (nullif(p_input->>'packageId','') is null
          or d."FINDoc_OpeningBalancePackageID"=(p_input->>'packageId')::uuid)
        and a."FINCashAlloc_AllocationStatusCode"='allocated'
        and c."FINCash_NativePostingStatusCode"='posted'
      order by a."FINCashAlloc_AllocatedAt",a."FINCashAlloc_ID" limit 200 offset v_offset loop
      candidate:=public._multideck_finance_opening_fx_candidate(v_work.allocation_id,p_entity);
      select * into s from public."FIN_OpeningFXSettlements" where allocation_id=v_work.allocation_id;
      v_result:=v_result||jsonb_build_array(candidate||jsonb_build_object('settlement',
        case when s.id is null then null else to_jsonb(s) end));
    end loop;
    return jsonb_build_object('rows',v_result,'total',v_count,'offset',v_offset);
  end if;
  if p_action not in ('propose','post') then raise exception 'Choose an opening settlement action.' using errcode='22023'; end if;
  if p_action='propose' then
    v_allocation:=(p_input->>'allocationId')::uuid;
    candidate:=public._multideck_finance_opening_fx_candidate(v_allocation,p_entity);
    if not (candidate->>'needed')::boolean then
      raise exception 'This opening allocation already matches its source control and rate.' using errcode='22023'; end if;
    if coalesce(length(btrim(p_input->>'reason')),0) not between 8 and 500 then
      raise exception 'Record the reviewed cash and document rate evidence.' using errcode='22023'; end if;
    if (candidate->>'gainLoss')::numeric<>0 then
      select * into v_nominal from public."FIN_NominalAccounts" where "FINNom_ID"=(p_input->>'fxNominalId')::uuid
        and "FINNom_LegalEntityID"=p_entity and "FINNom_IsActive" and not "FINNom_IsControlAccount" for share;
      if not found or v_nominal."FINNom_ReportCategoryCode" not in ('finance','income','expense') then
        raise exception 'Choose an active, non-control FX gain/loss nominal in this legal entity.' using errcode='22023'; end if;
    end if;
    insert into public."FIN_OpeningFXSettlements"(legal_entity_id,package_id,allocation_id,cash_id,document_id,
      cash_control_nominal_id,source_control_nominal_id,fx_nominal_id,source_amount,cash_rate,document_rate,
      cash_local,document_local,gain_loss_amount,reason,proposed_by)
      values(p_entity,(candidate->>'packageId')::uuid,v_allocation,(candidate->>'cashId')::uuid,
        (candidate->>'documentId')::uuid,(candidate->>'cashControlNominalId')::uuid,
        (candidate->>'sourceControlNominalId')::uuid,v_nominal."FINNom_ID",(candidate->>'sourceAmount')::numeric,
        (candidate->>'cashRate')::numeric,(candidate->>'documentRate')::numeric,
        (candidate->>'cashLocal')::numeric,(candidate->>'documentLocal')::numeric,
        (candidate->>'gainLoss')::numeric,btrim(p_input->>'reason'),p_actor)
      returning * into s;
  else
    select * into s from public."FIN_OpeningFXSettlements"
      where id=(p_input->>'id')::uuid and legal_entity_id=p_entity for update;
    if not found or s.status<>'proposed' then raise exception 'Proposed opening FX settlement not found.' using errcode='P0002'; end if;
    if s.proposed_by=p_actor then raise exception 'A second finance operator must post the settlement.' using errcode='42501'; end if;
    candidate:=public._multideck_finance_opening_fx_candidate(s.allocation_id,p_entity);
    if not (candidate->>'needed')::boolean or s.package_id is distinct from (candidate->>'packageId')::uuid
      or s.cash_id is distinct from (candidate->>'cashId')::uuid
      or s.document_id is distinct from (candidate->>'documentId')::uuid
      or s.cash_control_nominal_id is distinct from (candidate->>'cashControlNominalId')::uuid
      or s.source_control_nominal_id is distinct from (candidate->>'sourceControlNominalId')::uuid
      or s.source_amount is distinct from (candidate->>'sourceAmount')::numeric
      or s.cash_rate is distinct from (candidate->>'cashRate')::numeric
      or s.document_rate is distinct from (candidate->>'documentRate')::numeric
      or s.cash_local is distinct from (candidate->>'cashLocal')::numeric
      or s.document_local is distinct from (candidate->>'documentLocal')::numeric
      or s.gain_loss_amount is distinct from (candidate->>'gainLoss')::numeric then
      raise exception 'Opening settlement changed after review; stage a new proposal.' using errcode='22023'; end if;
    if s.gain_loss_amount<>0 and not exists(select 1 from public."FIN_NominalAccounts"
      where "FINNom_ID"=s.fx_nominal_id and "FINNom_LegalEntityID"=p_entity and "FINNom_IsActive"
        and not "FINNom_IsControlAccount" and "FINNom_ReportCategoryCode" in ('finance','income','expense')) then
      raise exception 'The approved FX gain/loss nominal is no longer active.' using errcode='22023'; end if;
    select * into v_cash_period from public."FIN_Periods" where "FINPeriod_ID"=(candidate->>'periodId')::uuid for update;
    if not found then raise exception 'The original cash period is unavailable.' using errcode='22023'; end if;
    if v_cash_period."FINPeriod_StatusCode"='open' then
      if nullif(p_input->>'correctionDate','') is not null then
        raise exception 'Post in the original open cash period; a later correction date is unnecessary.' using errcode='22023'; end if;
      v_period:=v_cash_period;
      v_correction_date:=(candidate->>'cashAccountingDate')::date;
    else
      v_correction_date:=nullif(p_input->>'correctionDate','')::date;
      if v_correction_date is null or v_correction_date::text is distinct from p_input->>'correctionDate'
        or v_correction_date<=v_cash_period."FINPeriod_EndDate" then
        raise exception 'Choose a dated correction after the closed cash period.' using errcode='22023'; end if;
      v_target_period:=public._multideck_finance_ensure_period(p_entity,to_char(v_correction_date,'YYYYMM'),p_actor);
      select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=v_target_period
        and "FINPeriod_LegalEntityID"=p_entity and "FINPeriod_StatusCode"='open' for update;
      if not found then raise exception 'The dated correction period must be open.' using errcode='22023'; end if;
    end if;
    v_cash_local:=s.cash_local; v_doc_local:=s.document_local; v_gain:=s.gain_loss_amount;
    v_total:=greatest(v_cash_local,v_doc_local);
    v_type:=candidate->>'cashType'; v_currency:=candidate->>'baseCurrency';
    insert into public."FIN_PostingBatches"("FINPostBatch_Number","FINPostBatch_StatusCode",
      "FINPostBatch_SourceTable","FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID",
      "FINPostBatch_DebitTotal","FINPostBatch_CreditTotal","FINPostBatch_CurrencyCodeSnapshot",
      "FINPostBatch_PostedAt","FINPostBatch_PostedBy","FINPostBatch_CreatedBy")
      values('OPEN-FX-'||left(s.id::text,8),'posted','FIN_OpeningFXSettlements',s.id,
        v_period."FINPeriod_ID",p_entity,v_total,v_total,v_currency,now(),p_actor,p_actor)
      returning "FINPostBatch_ID" into v_batch;
    insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo",
      "FINPostLine_NominalAccountID","FINPostLine_CashID","FINPostLine_DocumentID",
      "FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount",
      "FINPostLine_CurrencyCodeSnapshot") values
      (v_batch,1,s.cash_control_nominal_id,s.cash_id,s.document_id,
        'Opening cash control reclassification · '||left(s.reason,100),
        case when v_type='customer_receipt' then v_cash_local else 0 end,
        case when v_type='supplier_payment' then v_cash_local else 0 end,v_currency),
      (v_batch,2,s.source_control_nominal_id,s.cash_id,s.document_id,
        'CargoWise source control settlement · '||left(s.reason,100),
        case when v_type='supplier_payment' then v_doc_local else 0 end,
        case when v_type='customer_receipt' then v_doc_local else 0 end,v_currency);
    if v_gain<>0 then
      insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo",
        "FINPostLine_NominalAccountID","FINPostLine_CashID","FINPostLine_DocumentID",
        "FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount",
        "FINPostLine_CurrencyCodeSnapshot") values
        (v_batch,3,s.fx_nominal_id,s.cash_id,s.document_id,'Realised opening FX · '||left(s.reason,100),
          case when v_gain<0 then -v_gain else 0 end,
          case when v_gain>0 then v_gain else 0 end,v_currency);
      insert into public."FIN_FXGainLossEvents"("FINFXEvent_TypeCode","FINFXEvent_DocumentID",
        "FINFXEvent_CashAllocationID","FINFXEvent_FromCurrencyCode","FINFXEvent_ToCurrencyCode",
        "FINFXEvent_OriginalRate","FINFXEvent_FinalRate","FINFXEvent_SourceAmount",
        "FINFXEvent_GainLossAmount","FINFXEvent_PeriodID")
        values(case when v_gain>0 then 'realised_gain' else 'realised_loss' end,s.document_id,
          s.allocation_id,candidate->>'currency',v_currency,s.document_rate,s.cash_rate,
          s.source_amount,v_gain,v_period."FINPeriod_ID");
    end if;
    update public."FIN_OpeningFXSettlements" set status='posted',posted_by=p_actor,posted_at=now(),
      correction_date=v_correction_date,
      posting_batch_id=v_batch where id=s.id returning * into s;
    update public."FIN_CashAllocations" set "FINCashAlloc_CashRate"=s.cash_rate,
      "FINCashAlloc_DocumentRate"=s.document_rate,"FINCashAlloc_FXGainLossAmount"=v_gain
      where "FINCashAlloc_ID"=s.allocation_id;
  end if;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
    "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title",
    "AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_OpeningFXSettlements',
      'opening_fx',s.id,p_action,'CargoWise opening settlement '||p_action,true,1,
      jsonb_build_object('allocationId',s.allocation_id,'cashLocal',s.cash_local,
        'documentLocal',s.document_local,'gainLoss',s.gain_loss_amount,'postingBatchId',s.posting_batch_id));
  return to_jsonb(s);
end; $$;
revoke all on function public.multideck_finance_opening_fx_settlement(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_finance_opening_fx_settlement(uuid,uuid,text,jsonb) to service_role;

create function public._multideck_finance_opening_fx_immutable() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='DELETE' or old.status='posted' then
    raise exception 'Posted opening settlements cannot change; use a controlled reversal.' using errcode='22023';
  end if;
  if row(new.legal_entity_id,new.package_id,new.allocation_id,new.cash_id,new.document_id,
      new.cash_control_nominal_id,new.source_control_nominal_id,new.fx_nominal_id,new.source_amount,
      new.cash_rate,new.document_rate,new.cash_local,new.document_local,new.gain_loss_amount,
      new.reason,new.proposed_by,new.proposed_at)
    is distinct from row(old.legal_entity_id,old.package_id,old.allocation_id,old.cash_id,old.document_id,
      old.cash_control_nominal_id,old.source_control_nominal_id,old.fx_nominal_id,old.source_amount,
      old.cash_rate,old.document_rate,old.cash_local,old.document_local,old.gain_loss_amount,
      old.reason,old.proposed_by,old.proposed_at)
    or new.status<>'posted' then
    raise exception 'Reviewed opening settlement evidence is immutable.' using errcode='22023'; end if;
  return new;
end; $$;
revoke all on function public._multideck_finance_opening_fx_immutable() from public,anon,authenticated;
create trigger opening_fx_immutable before update or delete on public."FIN_OpeningFXSettlements"
for each row execute function public._multideck_finance_opening_fx_immutable();

create function public._multideck_finance_opening_allocation_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public."FIN_OpeningFXSettlements";
begin
  select * into s from public."FIN_OpeningFXSettlements" where allocation_id=old."FINCashAlloc_ID" and status='posted';
  if not found then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_op='DELETE' then
    raise exception 'A settled opening cash allocation cannot be deleted.' using errcode='22023'; end if;
  if row(new."FINCashAlloc_CashID",new."FINCashAlloc_DocumentID",new."FINCashAlloc_AllocationStatusCode",
      new."FINCashAlloc_AllocatedAmount",new."FINCashAlloc_LocalAllocatedAmount")
    is distinct from row(old."FINCashAlloc_CashID",old."FINCashAlloc_DocumentID",old."FINCashAlloc_AllocationStatusCode",
      old."FINCashAlloc_AllocatedAmount",old."FINCashAlloc_LocalAllocatedAmount")
    or new."FINCashAlloc_CashRate" is distinct from s.cash_rate
    or new."FINCashAlloc_DocumentRate" is distinct from s.document_rate
    or new."FINCashAlloc_FXGainLossAmount" is distinct from s.gain_loss_amount then
    raise exception 'A posted opening cash allocation and its FX correction are immutable.' using errcode='22023'; end if;
  return new;
end; $$;
revoke all on function public._multideck_finance_opening_allocation_guard() from public,anon,authenticated;
create trigger opening_allocation_settlement_guard before update or delete on public."FIN_CashAllocations"
for each row execute function public._multideck_finance_opening_allocation_guard();

commit;
