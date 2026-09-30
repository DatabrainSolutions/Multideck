begin;

-- A source/cash-rate difference is cleared only by the exact independently
-- posted control reclassification and realised-FX batch for that allocation.
create function public._multideck_opening_fx_settlement_proven(p_entity uuid,p_period uuid,p_allocation uuid)
returns boolean language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare s public."FIN_OpeningFXSettlements"; a public."FIN_CashAllocations";
  cash public."FIN_CashTransactions"; doc public."FIN_Documents";
  item public."FIN_OpeningSourceItems"; package public."FIN_OpeningBalancePackages";
  batch public."FIN_PostingBatches"; cash_batch public."FIN_PostingBatches";
  v_period public."FIN_Periods"; posted_period public."FIN_Periods";
  line1 public."FIN_PostingLines"; line2 public."FIN_PostingLines"; line3 public."FIN_PostingLines";
  cash_line public."FIN_PostingLines"; v_type text; v_gain numeric;
begin
  select * into s from public."FIN_OpeningFXSettlements" where allocation_id=p_allocation and legal_entity_id=p_entity;
  if not found or s.status<>'posted' or s.proposed_by is null or s.posted_by is null
    or s.posted_by=s.proposed_by or s.posting_batch_id is null then return false; end if;
  select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=p_period and "FINPeriod_LegalEntityID"=p_entity;
  select * into a from public."FIN_CashAllocations" where "FINCashAlloc_ID"=p_allocation;
  select * into cash from public."FIN_CashTransactions" where "FINCash_ID"=s.cash_id;
  select * into doc from public."FIN_Documents" where "FINDoc_ID"=s.document_id;
  select * into item from public."FIN_OpeningSourceItems" where operational_document_id=s.document_id;
  select * into package from public."FIN_OpeningBalancePackages" where id=s.package_id;
  select * into batch from public."FIN_PostingBatches" where "FINPostBatch_ID"=s.posting_batch_id;
  select * into cash_batch from public."FIN_PostingBatches" where "FINPostBatch_ID"=cash."FINCash_NativePostingBatchID";
  select * into posted_period from public."FIN_Periods" where "FINPeriod_ID"=batch."FINPostBatch_PeriodID";
  if v_period."FINPeriod_ID" is null or a."FINCashAlloc_ID" is null or cash."FINCash_ID" is null
    or doc."FINDoc_ID" is null or item.id is null or package.id is null or batch."FINPostBatch_ID" is null
    or cash_batch."FINPostBatch_ID" is null
    or posted_period."FINPeriod_ID" is null or posted_period."FINPeriod_LegalEntityID"<>p_entity
    or posted_period."FINPeriod_EndDate">v_period."FINPeriod_EndDate"
    or cash."FINCash_AccountingDate">v_period."FINPeriod_EndDate"
    or a."FINCashAlloc_AllocatedAt"::date>v_period."FINPeriod_EndDate"
    or a."FINCashAlloc_AllocationStatusCode"<>'allocated'
    or a."FINCashAlloc_CashID" is distinct from s.cash_id or a."FINCashAlloc_DocumentID" is distinct from s.document_id
    or a."FINCashAlloc_AllocatedAmount" is distinct from s.source_amount
    or a."FINCashAlloc_LocalAllocatedAmount" is distinct from s.document_local
    or cash."FINCash_LegalEntityID" is distinct from p_entity or doc."FINDoc_LegalEntityID" is distinct from p_entity
    or doc."FINDoc_PartyOrgID" is null or doc."FINDoc_CurrencyCodeSnapshot" is null
    or cash."FINCash_PartyOrgID" is distinct from doc."FINDoc_PartyOrgID"
    or cash."FINCash_CurrencyCodeSnapshot" is distinct from doc."FINDoc_CurrencyCodeSnapshot"
    or cash."FINCash_ExchangeRate" is distinct from s.cash_rate
    or doc."FINDoc_ExchangeRate" is distinct from s.document_rate
    or cash."FINCash_NativePostingStatusCode"<>'posted' or doc."FINDoc_NativePostingStatusCode"<>'posted'
    or doc."FINDoc_OpeningBalancePackageID" is distinct from package.id
    or item.package_id is distinct from package.id or item.control_nominal_id is distinct from s.source_control_nominal_id
    or package.legal_entity_id is distinct from p_entity or package.status is distinct from 'posted'
    or batch."FINPostBatch_StatusCode" is distinct from 'posted' or batch."FINPostBatch_LegalEntityID" is distinct from p_entity
    or batch."FINPostBatch_SourceTable" is distinct from 'FIN_OpeningFXSettlements'
    or batch."FINPostBatch_SourceID" is distinct from s.id
    or batch."FINPostBatch_DebitTotal" is distinct from greatest(s.cash_local,s.document_local)
    or batch."FINPostBatch_CreditTotal" is distinct from greatest(s.cash_local,s.document_local)
    or cash_batch."FINPostBatch_SourceTable" is distinct from 'FIN_CashTransactions'
    or cash_batch."FINPostBatch_SourceID" is distinct from cash."FINCash_ID"
    or cash_batch."FINPostBatch_StatusCode" is distinct from 'posted'
    or cash_batch."FINPostBatch_LegalEntityID" is distinct from p_entity then
    return false; end if;
  v_type:=cash."FINCash_TypeCode";
  if v_type not in ('customer_receipt','supplier_payment') or doc."FINDoc_TypeCode" is distinct from
      (case v_type when 'customer_receipt' then 'sl_invoice' else 'pl_invoice' end)
    or item.kind is distinct from (case v_type when 'customer_receipt' then 'customer_invoice' else 'supplier_invoice' end)
    or s.gain_loss_amount is distinct from (case v_type when 'customer_receipt'
        then s.cash_local-s.document_local else s.document_local-s.cash_local end) then return false; end if;
  select * into cash_line from public."FIN_PostingLines" where "FINPostLine_BatchID"=cash_batch."FINPostBatch_ID"
    and "FINPostLine_LineNo"=2 and "FINPostLine_CashID"=cash."FINCash_ID";
  if not found or cash_line."FINPostLine_NominalAccountID" is distinct from s.cash_control_nominal_id
    or (case v_type when 'customer_receipt' then cash_line."FINPostLine_CreditAmount"
      else cash_line."FINPostLine_DebitAmount" end) is distinct from cash."FINCash_LocalAmount" then return false; end if;
  select * into line1 from public."FIN_PostingLines" where "FINPostLine_BatchID"=s.posting_batch_id and "FINPostLine_LineNo"=1;
  select * into line2 from public."FIN_PostingLines" where "FINPostLine_BatchID"=s.posting_batch_id and "FINPostLine_LineNo"=2;
  select * into line3 from public."FIN_PostingLines" where "FINPostLine_BatchID"=s.posting_batch_id and "FINPostLine_LineNo"=3;
  if (select count(*) from public."FIN_PostingLines" where "FINPostLine_BatchID"=s.posting_batch_id)
       <> (case when s.gain_loss_amount=0 then 2 else 3 end)
    or line1."FINPostLine_NominalAccountID" is distinct from s.cash_control_nominal_id
    or line2."FINPostLine_NominalAccountID" is distinct from s.source_control_nominal_id
    or line1."FINPostLine_CashID" is distinct from s.cash_id or line2."FINPostLine_CashID" is distinct from s.cash_id
    or line1."FINPostLine_DocumentID" is distinct from s.document_id
    or line2."FINPostLine_DocumentID" is distinct from s.document_id
    or line1."FINPostLine_DebitAmount" is distinct from (case when v_type='customer_receipt' then s.cash_local else 0 end)
    or line1."FINPostLine_CreditAmount" is distinct from (case when v_type='supplier_payment' then s.cash_local else 0 end)
    or line2."FINPostLine_DebitAmount" is distinct from (case when v_type='supplier_payment' then s.document_local else 0 end)
    or line2."FINPostLine_CreditAmount" is distinct from (case when v_type='customer_receipt' then s.document_local else 0 end) then
    return false; end if;
  if s.gain_loss_amount<>0 then
    if s.fx_nominal_id is null or line3."FINPostLine_NominalAccountID" is distinct from s.fx_nominal_id
      or line3."FINPostLine_CashID" is distinct from s.cash_id
      or line3."FINPostLine_DocumentID" is distinct from s.document_id
      or line3."FINPostLine_DebitAmount" is distinct from greatest(-s.gain_loss_amount,0)
      or line3."FINPostLine_CreditAmount" is distinct from greatest(s.gain_loss_amount,0)
      or not exists(select 1 from public."FIN_FXGainLossEvents" event
        where event."FINFXEvent_CashAllocationID"=p_allocation and event."FINFXEvent_DocumentID"=s.document_id
          and event."FINFXEvent_PeriodID"=posted_period."FINPeriod_ID"
          and event."FINFXEvent_GainLossAmount"=s.gain_loss_amount) then return false; end if;
  end if;
  return true;
end; $$;
revoke all on function public._multideck_opening_fx_settlement_proven(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public._multideck_opening_fx_settlement_proven(uuid,uuid,uuid) to service_role;

alter function public._multideck_finance_opening_trade_control(uuid,uuid)
  rename to _multideck_finance_opening_trade_control_before_fx_settlements;
revoke all on function public._multideck_finance_opening_trade_control_before_fx_settlements(uuid,uuid) from public,anon,authenticated;
grant execute on function public._multideck_finance_opening_trade_control_before_fx_settlements(uuid,uuid) to service_role;
create function public._multideck_finance_opening_trade_control(p_entity uuid,p_period uuid)
returns jsonb language plpgsql volatile security invoker set search_path=pg_catalog,public as $$
declare result jsonb; issue jsonb; issues jsonb:='[]'; v_valid uuid[]:='{}';
  v_allocation record; v_ar_delta numeric:=0; v_ap_delta numeric:=0;
  v_period public."FIN_Periods"; v_account uuid; v_settlement public."FIN_OpeningFXSettlements";
begin
  result:=public._multideck_finance_opening_trade_control_before_fx_settlements(p_entity,p_period);
  select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=p_period and "FINPeriod_LegalEntityID"=p_entity;
  for v_allocation in select a."FINCashAlloc_ID" id,cash."FINCash_TypeCode" cash_type,
      item.control_nominal_id source_control,
      cash."FINCash_NativePostingBatchID" cash_batch,cash."FINCash_ID" cash_id,
      a."FINCashAlloc_LocalAllocatedAmount" document_local,
      round(a."FINCashAlloc_AllocatedAmount"*cash."FINCash_ExchangeRate",4) cash_local
    from public."FIN_OpeningSourceItems" item
    join public."FIN_OpeningBalancePackages" package on package.id=item.package_id
      and package.legal_entity_id=p_entity and package.status='posted' and package.package_kind='full_open_items'
      and package.opening_date<=v_period."FINPeriod_EndDate"
    join public."FIN_CashAllocations" a on a."FINCashAlloc_DocumentID"=item.operational_document_id
      and a."FINCashAlloc_AllocationStatusCode"='allocated'
    join public."FIN_CashTransactions" cash on cash."FINCash_ID"=a."FINCashAlloc_CashID"
      and cash."FINCash_LegalEntityID"=p_entity and cash."FINCash_NativePostingStatusCode"='posted'
      and cash."FINCash_AccountingDate"<=v_period."FINPeriod_EndDate"
    where item.operational_document_id is not null and a."FINCashAlloc_AllocatedAt"::date<=v_period."FINPeriod_EndDate"
  loop
    select "FINPostLine_NominalAccountID" into v_account from public."FIN_PostingLines"
      where "FINPostLine_BatchID"=v_allocation.cash_batch and "FINPostLine_LineNo"=2
        and "FINPostLine_CashID"=v_allocation.cash_id;
    if public._multideck_opening_fx_settlement_proven(p_entity,p_period,v_allocation.id) then
      select * into v_settlement from public."FIN_OpeningFXSettlements" where allocation_id=v_allocation.id;
      v_valid:=array_append(v_valid,v_allocation.id);
      if v_allocation.cash_type='customer_receipt' then
        v_ar_delta:=v_ar_delta+v_settlement.cash_local-v_settlement.document_local;
      else v_ap_delta:=v_ap_delta+v_settlement.cash_local-v_settlement.document_local; end if;
    elsif v_account is distinct from v_allocation.source_control and
      v_allocation.document_local is not distinct from v_allocation.cash_local then
      issues:=issues||jsonb_build_array(jsonb_build_object('reason','opening_control_reclassification_required',
        'allocationId',v_allocation.id,'sourceControl',v_allocation.source_control,'cashControl',v_account));
    end if;
  end loop;
  for issue in select value from jsonb_array_elements(coalesce(result->'issues','[]'::jsonb)) value loop
    if issue->>'reason'='opening_allocation_fx_trueup_required'
      and (issue->>'allocationId')::uuid=any(v_valid) then continue; end if;
    issues:=issues||jsonb_build_array(issue);
  end loop;
  return result||jsonb_build_object('arSource',(result->>'arSource')::numeric+v_ar_delta,
    'apSource',(result->>'apSource')::numeric+v_ap_delta,
    'issueCount',jsonb_array_length(issues),'issues',issues,
    'postedOpeningSettlements',cardinality(v_valid));
end; $$;
revoke all on function public._multideck_finance_opening_trade_control(uuid,uuid) from public,anon,authenticated;
grant execute on function public._multideck_finance_opening_trade_control(uuid,uuid) to service_role;

commit;
