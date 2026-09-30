begin;

-- Read-only evidence for a possible six-month input-tax repayment. This does
-- not post an adjustment or make a draft VAT return eligible for filing.
create function public.multideck_uk_vat_clawback_source_snapshot(
  p_actor uuid,p_entity uuid,p_period uuid,p_document uuid
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare
  v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_document public."FIN_Documents"%rowtype;
  v_count integer; v_missing integer; v_periods integer; v_tax_points integer;
  v_original_period uuid; v_tax_point date; v_input_vat numeric;
  v_first_date date; v_paid_first numeric; v_paid_end numeric;
  v_payments jsonb; v_sources jsonb; v_fingerprint text;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=p_period and legal_entity_id=p_entity and jurisdiction_code='GB';
  if not found or v_period.status<>'draft'
    or v_period.scheme_code not in ('standard','annual')
    or v_period.reporting_currency<>'GBP' then
    raise exception 'Choose a draft UK invoice-basis VAT period.' using errcode='22023';
  end if;
  select * into v_document from public."FIN_Documents"
    where "FINDoc_ID"=p_document and "FINDoc_LegalEntityID"=p_entity;
  if not found or v_document."FINDoc_TypeCode"<>'pl_invoice'
    or v_document."FINDoc_NativePostingStatusCode"<>'posted'
    or v_document."FINDoc_GrossAmount"<=0
    or v_document."FINDoc_CurrencyCodeSnapshot" is null then
    raise exception 'Choose a posted supplier invoice in this legal entity.' using errcode='22023';
  end if;
  if exists(
    select 1 from public."FIN_IndirectTaxEvidence" evidence
    where evidence.source_document_id=p_document
      and (evidence.legal_entity_id<>p_entity
        or evidence.jurisdiction_code<>'GB'
        or evidence.source_kind<>'posted_document_line'
        or evidence.reverses_evidence_id is not null
        or exists(select 1 from public."FIN_IndirectTaxEvidence" reversal
          where reversal.reverses_evidence_id=evidence.id)
        or exists(select 1 from public."FIN_IndirectTaxCreditLinks" linked
          where linked.original_evidence_id=evidence.id
            or linked.credit_evidence_id=evidence.id))
  ) then
    raise exception 'Credited or reversed supplier invoices need a reviewed VAT adjustment.' using errcode='22023';
  end if;
  if exists(select 1 from public."FIN_CashAllocations" allocation
    where allocation."FINCashAlloc_DocumentID"=p_document
      and allocation."FINCashAlloc_AllocationStatusCode"='pending') then
    raise exception 'Resolve pending supplier payment allocations first.' using errcode='22023';
  end if;

  with source as (
    select evidence.id,evidence.source_document_line_id,evidence.signed_tax_reporting,
      decision.id decision_id,decision.tax_point,assignment.period_id,
      original_period.end_date original_end,
      exists(
        select 1 from public."FIN_IndirectTaxReconciliations" signed
        join public."FIN_IndirectTaxCalculationLines" box4
          on box4.calculation_id=signed.calculation_id
          and box4.period_id=signed.period_id and box4.evidence_id=signed.evidence_id
          and box4.decision_id=signed.decision_id and box4.box_number=4
          and box4.signed_amount=evidence.signed_tax_reporting
        join public."FIN_IndirectTaxPeriodReviewLocks" lock
          on lock.calculation_id=signed.calculation_id
          and lock.period_id=signed.period_id and lock.source_digest=signed.source_digest
        join public."FIN_IndirectTaxFilingApprovals" approval
          on approval.review_lock_id=lock.id and approval.period_id=signed.period_id
          and approval.lock_fingerprint=lock.lock_fingerprint
          and approval.registration_id=original_period.registration_id
        join public."FIN_HmrcVatSubmissionAttempts" attempt
          on attempt.approval_id=approval.id and attempt.period_id=signed.period_id
          and attempt.environment='production'
          and approval.environment='production'
          and approval.tenant_project_ref=attempt.tenant_project_ref
          and approval.registration_id=attempt.registration_id
          and approval.vrn=attempt.vrn
          and approval.period_key=attempt.period_key
          and ((attempt.status='accepted' and exists(
            select 1 from public."FIN_HmrcVatSubmissionReceipts" receipt
            where receipt.attempt_id=attempt.id and receipt.period_id=attempt.period_id
              and receipt.tenant_project_ref=attempt.tenant_project_ref
              and receipt.payload_sha256=attempt.payload_sha256))
            or (attempt.status='accepted_readback' and exists(
              select 1 from public."FIN_HmrcVatReturnReadbackChecks" readback
              where readback.attempt_id=attempt.id and readback.period_id=attempt.period_id
                and readback.tenant_project_ref=attempt.tenant_project_ref
                and readback.environment='production' and readback.result='matched'
                and readback.payload_sha256=attempt.payload_sha256)))
        where signed.evidence_id=evidence.id and signed.decision_id=decision.id
          and signed.period_id=assignment.period_id
          and original_period.jurisdiction_code='GB'
          and original_period.reporting_currency='GBP'
          and original_period.scheme_code in ('standard','annual')
      ) accepted_claim
    from public."FIN_IndirectTaxEvidence" evidence
    join lateral (
      select latest.id,latest.tax_point,latest.treatment_code
      from public."FIN_IndirectTaxDecisions" latest
      where latest.evidence_id=evidence.id
      order by latest.revision desc limit 1
    ) decision on true
    left join public."FIN_IndirectTaxEvidencePeriods" assignment
      on assignment.evidence_id=evidence.id
    left join public."FIN_IndirectTaxPeriods" original_period
      on original_period.id=assignment.period_id
        and original_period.legal_entity_id=p_entity
    where evidence.source_document_id=p_document
      and evidence.legal_entity_id=p_entity
      and evidence.jurisdiction_code='GB'
      and evidence.source_kind='posted_document_line'
      and evidence.signed_tax_reporting>0
      and decision.treatment_code='domestic_purchase'
  )
  select count(*)::integer,
    count(*) filter (where not accepted_claim or period_id is null
      or original_end>=v_period.start_date)::integer,
    count(distinct period_id)::integer,count(distinct tax_point)::integer,
    min(period_id::text)::uuid,min(tax_point),sum(signed_tax_reporting),
    jsonb_agg(jsonb_build_object('evidenceId',id,'decisionId',decision_id,
      'lineId',source_document_line_id,'taxPoint',tax_point,
      'claimedInputVatGbp',signed_tax_reporting) order by id)
  into v_count,v_missing,v_periods,v_tax_points,v_original_period,
    v_tax_point,v_input_vat,v_sources
  from source;
  if v_count=0 or v_missing<>0 or v_periods<>1 or v_tax_points<>1
    or v_input_vat<=0 then
    raise exception 'A single earlier production-filed UK input VAT claim is required.' using errcode='22023';
  end if;
  if exists(
    select 1 from public."FIN_DocumentLines" line
    where line."FINDocLine_DocumentID"=p_document
      and line."FINDocLine_LocalTaxAmount">0
      and not exists(select 1 from public."FIN_IndirectTaxEvidence" evidence
        where evidence.source_document_line_id=line."FINDocLine_ID"
          and evidence.source_document_id=p_document
          and evidence.legal_entity_id=p_entity)
  ) or exists(
    select 1 from public."FIN_IndirectTaxEvidence" evidence
    where evidence.source_document_id=p_document
      and evidence.signed_tax_reporting>0
      and not exists(select 1 from public."FIN_IndirectTaxDecisions" decision
        where decision.evidence_id=evidence.id
          and decision.revision=(select max(latest.revision)
            from public."FIN_IndirectTaxDecisions" latest where latest.evidence_id=evidence.id)
          and decision.treatment_code='domestic_purchase')
  ) then
    raise exception 'The supplier invoice has unreviewed or unsupported input VAT lines.' using errcode='22023';
  end if;

  v_first_date:=(greatest(coalesce(v_document."FINDoc_DueDate",
    v_document."FINDoc_DocumentDate"),v_tax_point)+interval '6 months')::date;
  if v_first_date>v_period.end_date then
    raise exception 'The six-month repayment date is after this VAT period.' using errcode='22023';
  end if;
  if exists(
    select 1 from public."FIN_CashAllocations" allocation
    left join public."FIN_CashTransactions" cash
      on cash."FINCash_ID"=allocation."FINCashAlloc_CashID"
    where allocation."FINCashAlloc_DocumentID"=p_document
      and allocation."FINCashAlloc_AllocationStatusCode"='allocated'
      and (allocation."FINCashAlloc_AllocatedAmount"<=0
        or cash."FINCash_ID" is null
        or cash."FINCash_LegalEntityID"<>p_entity
        or cash."FINCash_TypeCode"<>'supplier_payment'
        or cash."FINCash_NativePostingStatusCode"<>'posted')
  ) then
    raise exception 'Supplier payment evidence is incomplete or inconsistent.' using errcode='22023';
  end if;
  select coalesce(sum(allocation."FINCashAlloc_AllocatedAmount") filter
      (where greatest(cash."FINCash_TransactionDate",
        (allocation."FINCashAlloc_AllocatedAt" at time zone 'Europe/London')::date)
          <=v_first_date),0),
    coalesce(sum(allocation."FINCashAlloc_AllocatedAmount") filter
      (where greatest(cash."FINCash_TransactionDate",
        (allocation."FINCashAlloc_AllocatedAt" at time zone 'Europe/London')::date)
          <=v_period.end_date),0),
    coalesce(jsonb_agg(jsonb_build_object(
      'cashId',cash."FINCash_ID",'cashDate',cash."FINCash_TransactionDate",
      'allocatedAt',allocation."FINCashAlloc_AllocatedAt",
      'amount',allocation."FINCashAlloc_AllocatedAmount")
      order by cash."FINCash_TransactionDate",cash."FINCash_ID")
      filter (where greatest(cash."FINCash_TransactionDate",
        (allocation."FINCashAlloc_AllocatedAt" at time zone 'Europe/London')::date)
          <=v_period.end_date),'[]'::jsonb)
  into v_paid_first,v_paid_end,v_payments
  from public."FIN_CashAllocations" allocation
  join public."FIN_CashTransactions" cash
    on cash."FINCash_ID"=allocation."FINCashAlloc_CashID"
  where allocation."FINCashAlloc_DocumentID"=p_document
    and allocation."FINCashAlloc_AllocationStatusCode"='allocated';
  if v_paid_first>v_document."FINDoc_GrossAmount"
    or v_paid_end>v_document."FINDoc_GrossAmount" then
    raise exception 'Supplier payments exceed the invoice gross amount.' using errcode='22023';
  end if;
  v_fingerprint:=encode(sha256(convert_to(jsonb_build_object(
    'documentId',p_document,'periodId',p_period,
    'periodStart',v_period.start_date,'periodEnd',v_period.end_date,
    'originalFiledPeriodId',v_original_period,
    'documentDate',v_document."FINDoc_DocumentDate",
    'dueDate',v_document."FINDoc_DueDate",
    'sourceCurrency',v_document."FINDoc_CurrencyCodeSnapshot",
    'grossSourceAmount',v_document."FINDoc_GrossAmount",
    'firstPossibleRepaymentDate',v_first_date,
    'sources',v_sources,'payments',v_payments)::text,'UTF8')),'hex');
  return jsonb_build_object('status','source_verified_only',
    'periodId',p_period,'documentId',p_document,'originalFiledPeriodId',v_original_period,
    'sourceCurrency',v_document."FINDoc_CurrencyCodeSnapshot",
    'grossSourceAmount',v_document."FINDoc_GrossAmount",
    'originallyClaimedInputVatGbp',v_input_vat,'taxPoint',v_tax_point,
    'dueDate',v_document."FINDoc_DueDate",'firstPossibleRepaymentDate',v_first_date,
    'paidByFirstDate',v_paid_first,'paidByPeriodEnd',v_paid_end,
    'unpaidAtFirstDate',v_document."FINDoc_GrossAmount"-v_paid_first,
    'unpaidAtPeriodEnd',v_document."FINDoc_GrossAmount"-v_paid_end,
    'sources',v_sources,'payments',v_payments,'sourceFingerprint',v_fingerprint);
end; $$;
revoke all on function public.multideck_uk_vat_clawback_source_snapshot(uuid,uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_clawback_source_snapshot(uuid,uuid,uuid,uuid)
  to service_role;

commit;
