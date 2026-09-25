begin;

-- Read-only, complete source extraction for an operator cash-basis preview.
-- This is not a Cash Accounting return: unsupported events fail closed in the
-- preview and no indirect-tax evidence, decision or calculation is written.
create function public.multideck_uk_vat_cash_source_snapshot(
  p_actor uuid,p_entity uuid,p_start date,p_end date
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_unreviewed integer; v_period_cash jsonb; v_rows jsonb;
  v_count integer; v_period_count integer; v_line_count integer;
  v_expanded_count integer; v_documents uuid[];
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  if p_start is null or p_end is null or p_start>p_end
    or p_end>=p_start+interval '1 year' then
    raise exception 'Choose one valid VAT year or shorter period.' using errcode='22023';
  end if;
  if not exists(select 1 from public."cmp_LegalEntities" entity
    where entity."LegalEntity_ID"=p_entity and entity."LegalEntity_CountryCode"='GB'
      and upper(entity."LegalEntity_BaseCurrencyCodeSnapshot")='GBP') then
    raise exception 'Cash VAT preview requires a UK GBP legal entity.' using errcode='22023';
  end if;
  -- An unreviewed payment could belong to any VAT period. Never substitute
  -- the ledger transaction date for the evidenced payment date.
  select count(*)::integer into v_unreviewed from public."FIN_CashTransactions" cash
    where cash."FINCash_LegalEntityID"=p_entity
      and cash."FINCash_NativePostingStatusCode"='posted'
      and cash."FINCash_TypeCode" in ('customer_receipt','supplier_payment')
      and not exists(select 1 from public."FIN_IndirectTaxCashPaymentDateReviews" review
        where review.cash_id=cash."FINCash_ID" and review.legal_entity_id=p_entity);
  select count(*)::integer into v_period_count from public."FIN_CashTransactions" cash
    join lateral (select review.vat_payment_date from public."FIN_IndirectTaxCashPaymentDateReviews" review
      where review.cash_id=cash."FINCash_ID" and review.legal_entity_id=p_entity
      order by review.revision desc limit 1) payment_date on true
    where cash."FINCash_LegalEntityID"=p_entity
      and cash."FINCash_NativePostingStatusCode"='posted'
      and cash."FINCash_TypeCode" in ('customer_receipt','supplier_payment')
      and payment_date.vat_payment_date between p_start and p_end;
  if v_period_count>1000 then
    return jsonb_build_object('legalEntityId',p_entity,'startDate',p_start,'endDate',p_end,
      'unreviewedPostedCash',v_unreviewed,'periodCash','[]'::jsonb,
      'allocationCount',0,'allocations','[]'::jsonb,'truncated',true,
      'status','source_only_not_filing');
  end if;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.vat_payment_date,item.cash_id),'[]'::jsonb)
    into v_period_cash from (
    select cash."FINCash_ID" cash_id,cash."FINCash_Number" cash_number,
      cash."FINCash_TypeCode" cash_type,cash."FINCash_Amount" cash_amount,
      cash."FINCash_CurrencyCodeSnapshot" currency_code,
      cash."FINCash_NativePostingBatchID" posting_batch_id,
      review.id payment_review_id,review.vat_payment_date,
      review.source_fingerprint=(encode(sha256(convert_to(
        (to_jsonb(cash)-array['FINCash_StatusCode','FINCash_PostingStatusCode',
          'FINCash_ExportStatusCode','FINCash_UpdatedAt','FINCash_UpdatedBy'])::text||
        coalesce((select jsonb_agg(to_jsonb(allocation) order by allocation."FINCashAlloc_ID")
          from public."FIN_CashAllocations" allocation
          where allocation."FINCashAlloc_CashID"=cash."FINCash_ID"),'[]'::jsonb)::text,
        'UTF8')),'hex')) fingerprint_matches,
      (select coalesce(sum(allocation."FINCashAlloc_AllocatedAmount"),0)
        from public."FIN_CashAllocations" allocation
        where allocation."FINCashAlloc_CashID"=cash."FINCash_ID") allocated_amount,
      (select count(*)::integer from public."FIN_CashAllocations" allocation
        where allocation."FINCashAlloc_CashID"=cash."FINCash_ID") allocation_count
    from public."FIN_CashTransactions" cash
    join lateral (select * from public."FIN_IndirectTaxCashPaymentDateReviews" candidate
      where candidate.cash_id=cash."FINCash_ID" and candidate.legal_entity_id=p_entity
      order by candidate.revision desc limit 1) review on true
    where cash."FINCash_LegalEntityID"=p_entity
      and cash."FINCash_NativePostingStatusCode"='posted'
      and cash."FINCash_TypeCode" in ('customer_receipt','supplier_payment')
      and review.vat_payment_date between p_start and p_end
  ) item;
  select coalesce(array_agg(distinct allocation."FINCashAlloc_DocumentID"),'{}'::uuid[])
    into v_documents
  from public."FIN_CashAllocations" allocation
  join public."FIN_CashTransactions" cash on cash."FINCash_ID"=allocation."FINCashAlloc_CashID"
  join lateral (select review.vat_payment_date from public."FIN_IndirectTaxCashPaymentDateReviews" review
    where review.cash_id=cash."FINCash_ID" and review.legal_entity_id=p_entity
    order by review.revision desc limit 1) payment_date on true
  where cash."FINCash_LegalEntityID"=p_entity
    and cash."FINCash_NativePostingStatusCode"='posted'
    and cash."FINCash_TypeCode" in ('customer_receipt','supplier_payment')
    and payment_date.vat_payment_date between p_start and p_end
    and allocation."FINCashAlloc_DocumentID" is not null;
  select count(*)::integer into v_count from public."FIN_CashAllocations" allocation
    join public."FIN_CashTransactions" cash on cash."FINCash_ID"=allocation."FINCashAlloc_CashID"
    join lateral (select review.vat_payment_date from public."FIN_IndirectTaxCashPaymentDateReviews" review
      where review.cash_id=cash."FINCash_ID" and review.legal_entity_id=p_entity
      order by review.revision desc limit 1) payment_date on true
    where allocation."FINCashAlloc_DocumentID"=any(v_documents)
      and cash."FINCash_LegalEntityID"=p_entity
      and cash."FINCash_NativePostingStatusCode"='posted'
      and payment_date.vat_payment_date<=p_end;
  if v_count>1000 then
    return jsonb_build_object('legalEntityId',p_entity,'startDate',p_start,'endDate',p_end,
      'unreviewedPostedCash',v_unreviewed,'periodCash',v_period_cash,
      'allocationCount',v_count,'allocations','[]'::jsonb,'truncated',true,
      'status','source_only_not_filing');
  end if;
  select count(*)::integer into v_line_count from public."FIN_DocumentLines" line
    join public."FIN_Documents" document
      on document."FINDoc_ID"=line."FINDocLine_DocumentID"
      and document."FINDoc_LegalEntityID"=p_entity
    where line."FINDocLine_DocumentID"=any(v_documents);
  select count(*)::integer into v_expanded_count from public."FIN_CashAllocations" allocation
    join public."FIN_CashTransactions" cash on cash."FINCash_ID"=allocation."FINCashAlloc_CashID"
    join lateral (select review.vat_payment_date from public."FIN_IndirectTaxCashPaymentDateReviews" review
      where review.cash_id=cash."FINCash_ID" and review.legal_entity_id=p_entity
      order by review.revision desc limit 1) payment_date on true
    join public."FIN_Documents" document
      on document."FINDoc_ID"=allocation."FINCashAlloc_DocumentID"
      and document."FINDoc_LegalEntityID"=p_entity
    join public."FIN_DocumentLines" line
      on line."FINDocLine_DocumentID"=allocation."FINCashAlloc_DocumentID"
    where allocation."FINCashAlloc_DocumentID"=any(v_documents)
      and cash."FINCash_LegalEntityID"=p_entity
      and cash."FINCash_NativePostingStatusCode"='posted'
      and payment_date.vat_payment_date<=p_end;
  if v_line_count>5000 or v_expanded_count>20000 then
    return jsonb_build_object('legalEntityId',p_entity,'startDate',p_start,'endDate',p_end,
      'unreviewedPostedCash',v_unreviewed,'periodCash',v_period_cash,
      'allocationCount',v_count,'allocations','[]'::jsonb,'truncated',true,
      'status','source_only_not_filing');
  end if;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.vat_payment_date,item.cash_id,item.allocation_id),'[]'::jsonb)
    into v_rows from (
    select allocation."FINCashAlloc_ID" allocation_id,
      allocation."FINCashAlloc_AllocatedAmount" allocated_amount,
      allocation."FINCashAlloc_AllocationStatusCode" allocation_status,
      allocation."FINCashAlloc_DocumentLineID" document_line_id,
      cash."FINCash_ID" cash_id,cash."FINCash_TypeCode" cash_type,
      cash."FINCash_CurrencyCodeSnapshot" cash_currency_code,
      cash."FINCash_NativePostingBatchID" cash_posting_batch_id,
      review.id payment_review_id,review.vat_payment_date,
      document."FINDoc_ID" document_id,document."FINDoc_TypeCode" document_type,
      document."FINDoc_LegalEntityID" document_entity_id,
      document."FINDoc_DocumentDate" document_date,
      document."FINDoc_DueDate" document_due_date,
      (document."FINDoc_DueDate" is not null
        and document."FINDoc_DueDate"<=document."FINDoc_DocumentDate"+interval '6 months')
        due_within_six_months,
      document."FINDoc_CurrencyCodeSnapshot" document_currency_code,
      document."FINDoc_ExchangeRate" document_exchange_rate,
      document."FINDoc_NativePostingStatusCode" document_posting_status,
      document."FINDoc_NativePostingBatchID" document_posting_batch_id,
      document."FINDoc_GrossAmount" document_gross_amount,
      document."FINDoc_LocalGrossAmount" document_local_gross_amount,
      (select coalesce(jsonb_agg(jsonb_build_object(
        'lineId',line."FINDocLine_ID",'netGbp',line."FINDocLine_LocalNetAmount",
        'vatGbp',line."FINDocLine_LocalTaxAmount",
        'grossGbp',line."FINDocLine_LocalGrossAmount",
        'evidenceId',evidence.id,'evidenceBatchId',evidence.source_posting_batch_id,
        'evidenceNetGbp',evidence.signed_net_reporting,
        'evidenceVatGbp',evidence.signed_tax_reporting,
        'standardVatReconciledAt',(
          select min(reconciliation.reconciled_at)
          from public."FIN_IndirectTaxReconciliations" reconciliation
          join public."FIN_IndirectTaxPeriods" accounted_period
            on accounted_period.id=reconciliation.period_id
          where reconciliation.evidence_id=evidence.id
            and accounted_period.legal_entity_id=p_entity
            and accounted_period.scheme_code in ('standard','annual')),
        'standardProductionAcceptedAt',(
          select min(attempt.accepted_at)
          from public."FIN_IndirectTaxReconciliations" reconciliation
          join public."FIN_IndirectTaxPeriods" accounted_period
            on accounted_period.id=reconciliation.period_id
          join public."FIN_HmrcVatSubmissionAttempts" attempt
            on attempt.period_id=accounted_period.id
            and attempt.environment='production'
            and attempt.status in ('accepted','accepted_readback')
          join public."FIN_IndirectTaxFilingApprovals" approval
            on approval.id=attempt.approval_id
            and approval.period_id=accounted_period.id
            and approval.environment='production'
            and approval.tenant_project_ref=attempt.tenant_project_ref
            and approval.registration_id=attempt.registration_id
          join public."FIN_IndirectTaxPeriodReviewLocks" filed_lock
            on filed_lock.id=approval.review_lock_id
            and filed_lock.period_id=accounted_period.id
            and filed_lock.source_digest=reconciliation.source_digest
          join public."FIN_IndirectTaxCalculationLines" filed_line
            on filed_line.calculation_id=filed_lock.calculation_id
            and filed_line.evidence_id=evidence.id
            and filed_line.decision_id=reconciliation.decision_id
          where reconciliation.evidence_id=evidence.id
            and accounted_period.legal_entity_id=p_entity
            and accounted_period.scheme_code in ('standard','annual')),
        'reviewId',decision.id,'treatment',decision.treatment_code,
        'decisionScheme',decision.scheme_code,'reviewedRuleId',decision.reviewed_rule_reference)
        order by line."FINDocLine_LineNo",line."FINDocLine_ID"),'[]'::jsonb)
       from public."FIN_DocumentLines" line
       left join lateral (select * from public."FIN_IndirectTaxEvidence" candidate
         where candidate.source_document_line_id=line."FINDocLine_ID"
           and candidate.source_posting_batch_id=document."FINDoc_NativePostingBatchID"
           and candidate.legal_entity_id=p_entity and candidate.jurisdiction_code='GB'
           and candidate.source_kind='posted_document_line'
         order by candidate.recorded_at desc,candidate.id desc limit 1) evidence on true
       left join lateral (select * from public."FIN_IndirectTaxDecisions" candidate
         where candidate.evidence_id=evidence.id
         order by candidate.revision desc limit 1) decision on true
       where line."FINDocLine_DocumentID"=document."FINDoc_ID") lines
    from public."FIN_CashAllocations" allocation
    join public."FIN_CashTransactions" cash on cash."FINCash_ID"=allocation."FINCashAlloc_CashID"
    join lateral (select * from public."FIN_IndirectTaxCashPaymentDateReviews" candidate
      where candidate.cash_id=cash."FINCash_ID" and candidate.legal_entity_id=p_entity
      order by candidate.revision desc limit 1) review on true
    left join public."FIN_Documents" document
      on document."FINDoc_ID"=allocation."FINCashAlloc_DocumentID"
      and document."FINDoc_LegalEntityID"=p_entity
    where allocation."FINCashAlloc_DocumentID"=any(v_documents)
      and cash."FINCash_LegalEntityID"=p_entity
      and cash."FINCash_NativePostingStatusCode"='posted'
      and cash."FINCash_TypeCode" in ('customer_receipt','supplier_payment')
      and review.vat_payment_date<=p_end
  ) item;
  return jsonb_build_object('legalEntityId',p_entity,'startDate',p_start,'endDate',p_end,
    'unreviewedPostedCash',v_unreviewed,'periodCash',v_period_cash,
    'allocationCount',v_count,'allocations',v_rows,'truncated',false,
    'status','source_only_not_filing');
end; $$;
revoke all on function public.multideck_uk_vat_cash_source_snapshot(uuid,uuid,date,date)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_source_snapshot(uuid,uuid,date,date)
  to service_role;

commit;
