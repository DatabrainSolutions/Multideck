begin;

create or replace function public.multideck_uk_vat_clawback_source_snapshot(
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
  if not found or v_period.status not in ('draft','review_locked')
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


create or replace function public.multideck_uk_vat_input_tax_repayment_schedule(
  p_actor uuid,p_entity uuid,p_review uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_review public."FIN_IndirectTaxInputTaxRepaymentReviews"%rowtype;
  v_proposal public."FIN_IndirectTaxInputTaxRepaymentProposals"%rowtype;
  v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_offset public."FIN_NominalAccounts"%rowtype;
  v_snapshot jsonb; v_events jsonb:='[]'::jsonb;
  v_claimed numeric; v_gross numeric; v_paid_first numeric; v_paid_end numeric;
  v_repayment numeric; v_restoration numeric; v_target numeric;
  v_running_paid numeric; v_last_target numeric; v_delta numeric;
  v_payment_date date; v_payment_amount numeric; v_first_date date;
  v_fingerprint text;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  select * into v_review from public."FIN_IndirectTaxInputTaxRepaymentReviews"
    where id=p_review and legal_entity_id=p_entity;
  if not found or exists(select 1 from public."FIN_IndirectTaxInputTaxRepaymentReviewRevocations"
    where review_id=p_review) then
    raise exception 'Choose an active input VAT repayment review.' using errcode='42501';
  end if;
  select * into v_proposal from public."FIN_IndirectTaxInputTaxRepaymentProposals"
    where id=v_review.proposal_id and legal_entity_id=p_entity
      and period_id=v_review.period_id and document_id=v_review.document_id;
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=v_review.period_id and legal_entity_id=p_entity;
  select * into v_offset from public."FIN_NominalAccounts"
    where "FINNom_ID"=v_review.offset_nominal_id
      and "FINNom_LegalEntityID"=p_entity;
  if v_proposal.id is null or v_period.id is null or v_period.status not in ('draft','review_locked')
    or v_period.jurisdiction_code<>'GB' or v_period.scheme_code<>'standard'
    or v_period.reporting_currency<>'GBP' or v_offset."FINNom_ID" is null
    or not v_offset."FINNom_IsActive" or v_offset."FINNom_IsControlAccount"
    or not v_offset."FINNom_AllowManualPosting"
    or lower(coalesce(v_offset."FINNom_ControlTypeCode",'')) like '%vat%'
    or v_review.source_fingerprint is distinct from v_proposal.source_fingerprint
    or v_review.calculation_fingerprint is distinct from v_proposal.calculation_fingerprint
    or p_review is distinct from (select active.id
      from public."FIN_IndirectTaxInputTaxRepaymentReviews" active
      join public."FIN_IndirectTaxInputTaxRepaymentProposals" proposal
        on proposal.id=active.proposal_id
      where active.legal_entity_id=p_entity and active.period_id=v_review.period_id
        and active.document_id=v_review.document_id
        and not exists(select 1 from public."FIN_IndirectTaxInputTaxRepaymentReviewRevocations" revoked
          where revoked.review_id=active.id)
      order by active.reviewed_at desc,active.id desc limit 1) then
    raise exception 'The reviewed input VAT repayment is no longer current or postable.' using errcode='22023';
  end if;
  v_snapshot:=public.multideck_uk_vat_clawback_source_snapshot(
    p_actor,p_entity,v_period.id,v_proposal.document_id);
  v_first_date:=(v_snapshot->>'firstPossibleRepaymentDate')::date;
  v_claimed:=(v_snapshot->>'originallyClaimedInputVatGbp')::numeric;
  v_gross:=(v_snapshot->>'grossSourceAmount')::numeric;
  v_paid_first:=(v_snapshot->>'paidByFirstDate')::numeric;
  v_paid_end:=(v_snapshot->>'paidByPeriodEnd')::numeric;
  if v_snapshot->>'sourceFingerprint' is distinct from v_proposal.source_fingerprint
    or v_snapshot->>'sourceCurrency' is distinct from 'GBP'
    or v_first_date not between v_period.start_date and v_period.end_date
    or v_claimed<=0 or v_gross<=0 or v_paid_first<0 or v_paid_end<v_paid_first
    or v_paid_end>v_gross then
    raise exception 'The original claim, currency or supplier payment source changed.' using errcode='22023';
  end if;
  v_repayment:=trunc(v_claimed*(v_gross-v_paid_first)/v_gross,2);
  v_target:=trunc(v_claimed*(v_gross-v_paid_end)/v_gross,2);
  v_restoration:=v_repayment-v_target;
  if v_repayment<=0 or v_repayment is distinct from v_proposal.proposed_repayment_gbp
    or v_restoration is distinct from v_proposal.proposed_restoration_gbp
    or v_restoration-v_repayment is distinct from v_proposal.proposed_box4_delta_gbp
    or v_proposal.rule_version is distinct from 'uk-input-tax-six-month-v2' then
    raise exception 'The reviewed input VAT repayment calculation changed.' using errcode='22023';
  end if;
  v_events:=jsonb_build_array(jsonb_build_object(
    'eventDate',v_first_date,'kind','six_month_repayment',
    'signedBox4DeltaGbp',-v_repayment,'sourcePaymentGbp',0));
  v_running_paid:=v_paid_first;
  v_last_target:=v_repayment;
  for v_payment_date,v_payment_amount in
    select greatest((payment.value->>'cashDate')::date,
      ((payment.value->>'allocatedAt')::timestamptz at time zone 'Europe/London')::date),
      sum((payment.value->>'amount')::numeric)
    from jsonb_array_elements(v_snapshot->'payments') payment(value)
    group by 1 order by 1
  loop
    if v_payment_date<=v_first_date then continue; end if;
    if v_payment_date>v_period.end_date or v_payment_amount<=0 then
      raise exception 'A supplier payment falls outside the reviewed VAT period.' using errcode='22023';
    end if;
    v_running_paid:=v_running_paid+v_payment_amount;
    if v_running_paid>v_gross then
      raise exception 'Supplier payments exceed the original invoice.' using errcode='22023';
    end if;
    v_target:=trunc(v_claimed*(v_gross-v_running_paid)/v_gross,2);
    v_delta:=v_last_target-v_target;
    if v_delta<0 then
      raise exception 'A supplier payment cannot increase the VAT repayment.' using errcode='22023';
    end if;
    if v_delta>0 then
      v_events:=v_events||jsonb_build_array(jsonb_build_object(
        'eventDate',v_payment_date,'kind','payment_restoration',
        'signedBox4DeltaGbp',v_delta,'sourcePaymentGbp',v_payment_amount));
    end if;
    v_last_target:=v_target;
  end loop;
  if v_running_paid is distinct from v_paid_end
    or v_last_target is distinct from
      v_proposal.proposed_repayment_gbp-v_proposal.proposed_restoration_gbp
    or (select sum((event.value->>'signedBox4DeltaGbp')::numeric)
      from jsonb_array_elements(v_events) event(value))
      is distinct from v_proposal.proposed_box4_delta_gbp then
    raise exception 'Dated supplier VAT movements do not reconcile to the reviewed proposal.' using errcode='22023';
  end if;
  v_fingerprint:=encode(sha256(convert_to(jsonb_build_object(
    'reviewId',v_review.id,'proposalId',v_proposal.id,
    'sourceFingerprint',v_proposal.source_fingerprint,
    'calculationFingerprint',v_proposal.calculation_fingerprint,
    'offsetNominalId',v_review.offset_nominal_id,'events',v_events)::text,'UTF8')),'hex');
  return jsonb_build_object('reviewId',v_review.id,'proposalId',v_proposal.id,
    'periodId',v_period.id,'documentId',v_proposal.document_id,
    'offsetNominalId',v_review.offset_nominal_id,
    'sourceFingerprint',v_proposal.source_fingerprint,
    'scheduleFingerprint',v_fingerprint,'events',v_events,
    'proposedBox4DeltaGbp',v_proposal.proposed_box4_delta_gbp,
    'status','reviewed_schedule_only_no_posting');
end; $$;
revoke all on function public.multideck_uk_vat_input_tax_repayment_schedule(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_input_tax_repayment_schedule(uuid,uuid,uuid)
  to service_role;

-- Verify each adjustment against the live, period-cutoff supplier payment
-- schedule and its native journal. A changed source cannot silently survive
-- calculation or a review-lock snapshot.
create function public._multideck_uk_vat_repayment_source_fingerprint(
  p_actor uuid,p_evidence uuid,p_period uuid
) returns text language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_event public."FIN_IndirectTaxInputTaxRepaymentPostingEvents"%rowtype;
  v_posting public."FIN_IndirectTaxInputTaxRepaymentPostings"%rowtype;
  v_evidence public."FIN_IndirectTaxEvidence"%rowtype;
  v_decision public."FIN_IndirectTaxDecisions"%rowtype;
  v_batch public."FIN_PostingBatches"%rowtype;
  v_tax public."FIN_PostingLines"%rowtype;
  v_offset public."FIN_PostingLines"%rowtype;
  v_schedule jsonb; v_expected jsonb; v_line_count integer;
  v_debit numeric; v_credit numeric; v_total numeric;
begin
  select * into v_event from public."FIN_IndirectTaxInputTaxRepaymentPostingEvents"
    where evidence_id=p_evidence and period_id=p_period;
  if not found then raise exception 'Supplier VAT adjustment has no posting-event link.' using errcode='22023'; end if;
  select * into v_posting from public."FIN_IndirectTaxInputTaxRepaymentPostings"
    where id=v_event.posting_id and legal_entity_id=v_event.legal_entity_id
      and period_id=p_period and document_id=v_event.document_id;
  select * into v_evidence from public."FIN_IndirectTaxEvidence"
    where id=p_evidence and legal_entity_id=v_event.legal_entity_id
      and jurisdiction_code='GB';
  select * into v_decision from public."FIN_IndirectTaxDecisions"
    where id=v_event.decision_id and evidence_id=p_evidence
      and revision=(select max(latest.revision) from public."FIN_IndirectTaxDecisions" latest
        where latest.evidence_id=p_evidence);
  select * into v_batch from public."FIN_PostingBatches"
    where "FINPostBatch_ID"=v_posting.batch_id;
  select * into v_tax from public."FIN_PostingLines"
    where "FINPostLine_ID"=v_event.tax_posting_line_id;
  select * into v_offset from public."FIN_PostingLines"
    where "FINPostLine_ID"=v_event.offset_posting_line_id;
  if v_posting.id is null or v_evidence.id is null or v_decision.id is null
    or v_batch."FINPostBatch_ID" is null or v_tax."FINPostLine_ID" is null
    or v_offset."FINPostLine_ID" is null then
    raise exception 'Supplier VAT adjustment source or native journal is incomplete.' using errcode='22023';
  end if;
  v_schedule:=public.multideck_uk_vat_input_tax_repayment_schedule(
    p_actor,v_event.legal_entity_id,v_posting.review_id);
  select item.value into v_expected from jsonb_array_elements(v_schedule->'events') item(value)
    where (item.value->>'eventDate')::date=v_event.event_date
      and item.value->>'kind'=v_event.event_kind;
  select count(*)::integer,coalesce(sum("FINPostLine_DebitAmount"),0),
    coalesce(sum("FINPostLine_CreditAmount"),0)
    into v_line_count,v_debit,v_credit from public."FIN_PostingLines"
    where "FINPostLine_BatchID"=v_posting.batch_id;
  select coalesce(sum(event.signed_box4_delta_gbp),0) into v_total
    from public."FIN_IndirectTaxInputTaxRepaymentPostingEvents" event
    where event.posting_id=v_posting.id;
  if v_schedule->>'scheduleFingerprint' is distinct from v_posting.schedule_fingerprint
    or v_schedule->>'status' is distinct from 'reviewed_schedule_only_no_posting'
    or v_expected is null
    or (v_expected->>'signedBox4DeltaGbp')::numeric is distinct from v_event.signed_box4_delta_gbp
    or v_posting.event_count<>jsonb_array_length(v_schedule->'events')
    or v_posting.event_count<>(select count(*) from public."FIN_IndirectTaxInputTaxRepaymentPostingEvents"
      where posting_id=v_posting.id)
    or v_posting.box4_delta_gbp is distinct from v_total
    or v_line_count<>v_posting.event_count*2 or v_debit<=0 or v_debit<>v_credit
    or v_batch."FINPostBatch_StatusCode"<>'posted'
    or v_batch."FINPostBatch_LegalEntityID"<>v_event.legal_entity_id
    or v_batch."FINPostBatch_SourceTable"<>'FIN_IndirectTaxInputTaxRepaymentReviews'
    or v_batch."FINPostBatch_SourceID"<>v_posting.review_id
    or v_batch."FINPostBatch_DebitTotal"<>v_debit
    or v_batch."FINPostBatch_CreditTotal"<>v_credit
    or v_evidence.source_kind<>'adjustment'
    or v_evidence.source_id<>v_event.tax_posting_line_id
    or v_evidence.source_posting_batch_id<>v_posting.batch_id
    or v_evidence.currency_code<>'GBP' or v_evidence.exchange_rate<>1
    or v_evidence.signed_net_amount<>0 or v_evidence.signed_net_reporting<>0
    or v_evidence.signed_tax_amount<>v_event.signed_box4_delta_gbp
    or v_evidence.signed_tax_reporting<>v_event.signed_box4_delta_gbp
    or v_evidence.source_document_date<>v_event.event_date
    or v_decision.tax_point<>v_event.event_date
    or v_decision.scheme_code<>'standard'
    or v_decision.treatment_code<>(case when v_event.event_kind='six_month_repayment'
      then 'input_tax_six_month_repayment' else 'input_tax_payment_restoration' end)
    or v_decision.rule_snapshot->>'reviewId' is distinct from v_posting.review_id::text
    or v_decision.rule_snapshot->>'proposalId' is distinct from v_posting.proposal_id::text
    or v_decision.rule_snapshot->>'documentId' is distinct from v_posting.document_id::text
    or v_decision.rule_snapshot->>'scheduleFingerprint' is distinct from v_posting.schedule_fingerprint
    or v_decision.rule_snapshot->'event' is distinct from v_expected
    or v_tax."FINPostLine_BatchID"<>v_posting.batch_id
    or v_tax."FINPostLine_NominalAccountID"<>v_event.tax_nominal_id
    or v_tax."FINPostLine_CurrencyCodeSnapshot"<>'GBP'
    or v_tax."FINPostLine_Description" not like 'Tax:%'
    or v_tax."FINPostLine_DebitAmount"<>(case when v_event.signed_box4_delta_gbp>0
      then v_event.signed_box4_delta_gbp else 0 end)
    or v_tax."FINPostLine_CreditAmount"<>(case when v_event.signed_box4_delta_gbp<0
      then -v_event.signed_box4_delta_gbp else 0 end)
    or v_offset."FINPostLine_BatchID"<>v_posting.batch_id
    or v_offset."FINPostLine_NominalAccountID"<>v_event.offset_nominal_id
    or v_offset."FINPostLine_CurrencyCodeSnapshot"<>'GBP'
    or v_offset."FINPostLine_DebitAmount"<>(case when v_event.signed_box4_delta_gbp<0
      then -v_event.signed_box4_delta_gbp else 0 end)
    or v_offset."FINPostLine_CreditAmount"<>(case when v_event.signed_box4_delta_gbp>0
      then v_event.signed_box4_delta_gbp else 0 end) then
    raise exception 'Supplier VAT adjustment schedule or balanced native posting changed.' using errcode='22023';
  end if;
  return encode(sha256(convert_to(v_posting.schedule_fingerprint||v_event.id::text||
    v_evidence.id::text||v_decision.id::text||v_tax."FINPostLine_ID"::text||
    v_offset."FINPostLine_ID"::text||v_debit::text||v_credit::text,'UTF8')),'hex');
end; $$;
revoke all on function public._multideck_uk_vat_repayment_source_fingerprint(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;

create or replace function public._multideck_uk_vat_calculate_core(p_actor uuid,p_period_id uuid,p_persist boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_registration public."FIN_LegalEntityComplianceRegistrations"%rowtype;
  v_pack record;
  v_row record; v_entry jsonb; v_entries jsonb:='[]'::jsonb; v_sources jsonb:='[]'::jsonb;
  v_registration_snapshot jsonb; v_boxes jsonb; v_control jsonb;
  v_amounts numeric[]:=array_fill(0::numeric,array[9]);
  v_missing integer; v_unreviewed integer; v_unmigrated integer; v_other_sources integer;
  v_clawback_risks integer;
  v_revision integer; v_calculation uuid; v_digest text; v_version text;
  v_ledger_checked integer; v_ledger_mismatched integer; v_ledger_sample jsonb;
  v_ledger_digest text; v_method1_fingerprints jsonb:='[]'::jsonb;
  v_repayment_fingerprints jsonb:='[]'::jsonb;
  v_adjustment_fingerprint text;
begin
  select * into v_period from public."FIN_IndirectTaxPeriods" where id=p_period_id for update;
  if not found or v_period.jurisdiction_code<>'GB' then raise exception 'UK VAT period was not found.' using errcode='P0002'; end if;
  perform public._multideck_uk_vat_access(p_actor,v_period.legal_entity_id);
  perform pg_advisory_xact_lock(hashtextextended('uk-vat:'||v_period.legal_entity_id::text,0));
  if p_persist is null or (p_persist and v_period.status<>'draft')
    or (not p_persist and v_period.status not in ('draft','review_locked'))
    or v_period.scheme_code not in ('standard','annual') or v_period.reporting_currency<>'GBP' then
    raise exception 'This VAT period is not a supported GBP draft or review lock.' using errcode='22023';
  end if;
  if (select upper("LegalEntity_BaseCurrencyCodeSnapshot") from public."cmp_LegalEntities"
      where "LegalEntity_ID"=v_period.legal_entity_id)<>'GBP' then
    raise exception 'The legal entity no longer has a GBP native ledger.' using errcode='22023';
  end if;
  select * into v_registration from public."FIN_LegalEntityComplianceRegistrations"
    where "FINComplianceReg_ID"=v_period.registration_id and "FINComplianceReg_LegalEntityID"=v_period.legal_entity_id
      and "FINComplianceReg_ObligationID"=v_period.obligation_id;
  if not found or v_registration."FINComplianceReg_StatusCode" not in ('configured','sandbox_verified','production_verified')
    or not coalesce(v_registration."FINComplianceReg_RegistrationReference" ~ '^[0-9]{9}$',false)
    or v_registration."FINComplianceReg_SettingsJSON"->>'schemeCode' is distinct from v_period.scheme_code
    or v_registration."FINComplianceReg_EffectiveFrom">v_period.start_date
    or (v_registration."FINComplianceReg_EffectiveTo" is not null and v_registration."FINComplianceReg_EffectiveTo"<v_period.end_date) then
    raise exception 'UK VAT registration or scheme changed; review the period setup.' using errcode='22023';
  end if;
  select pack."FINLocPack_ID" pack_id,pack."FINLocPack_Version" pack_version,
    pack."FINLocPack_ComplianceStatusCode" pack_status,obligation."FINCompliance_Code" obligation_code
    into v_pack
    from public."FIN_ComplianceObligations" obligation
    join public."FIN_LocalisationPacks" pack on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
    where obligation."FINCompliance_ID"=v_period.obligation_id and obligation."FINCompliance_Code"='gb-vat-mtd';
  if not found then raise exception 'The UK VAT rule pack changed or is missing.' using errcode='22023'; end if;
  -- Compare the ledger itself to captured candidates. An older posted source
  -- without a VAT event or any unresolved candidate blocks calculation.
  select count(*) into v_missing from public."FIN_Documents" doc
    join public."FIN_DocumentLines" line on line."FINDocLine_DocumentID"=doc."FINDoc_ID"
    where doc."FINDoc_LegalEntityID"=v_period.legal_entity_id
      and doc."FINDoc_NativePostingStatusCode"='posted'
      and not exists(select 1 from public."FIN_IndirectTaxEvidence" evidence
        where evidence.legal_entity_id=v_period.legal_entity_id and evidence.jurisdiction_code='GB'
          and evidence.source_kind='posted_document_line' and evidence.source_document_line_id=line."FINDocLine_ID"
          and evidence.source_posting_batch_id=doc."FINDoc_NativePostingBatchID");
  select count(*) into v_unmigrated from public."FIN_Documents" doc
    where doc."FINDoc_LegalEntityID"=v_period.legal_entity_id
      and doc."FINDoc_NativePostingStatusCode" in ('pending_migration','reversed');
  select count(*) into v_unreviewed from public."FIN_IndirectTaxEvidence" evidence
    where evidence.legal_entity_id=v_period.legal_entity_id and evidence.jurisdiction_code='GB'
      and not exists(select 1 from public."FIN_IndirectTaxDecisions" decision where decision.evidence_id=evidence.id);
  select count(*) into v_other_sources from public."FIN_IndirectTaxEvidence" evidence
    where evidence.legal_entity_id=v_period.legal_entity_id and evidence.jurisdiction_code='GB'
      and evidence.source_kind not in ('posted_document_line','adjustment');
  select v_other_sources+count(*) into v_other_sources
    from public."FIN_IndirectTaxEvidence" evidence
    where evidence.legal_entity_id=v_period.legal_entity_id
      and evidence.jurisdiction_code='GB' and evidence.source_kind='adjustment'
      and not exists(select 1 from public."FIN_IndirectTaxPriorErrorMethod1PostingItems" linked
        where linked.evidence_id=evidence.id and linked.legal_entity_id=v_period.legal_entity_id)
      and not exists(select 1 from public."FIN_IndirectTaxInputTaxRepaymentPostingEvents" linked
        where linked.evidence_id=evidence.id and linked.legal_entity_id=v_period.legal_entity_id);
  if v_missing<>0 or v_unmigrated<>0 or v_unreviewed<>0 or v_other_sources<>0 then
    raise exception 'VAT source review is incomplete: % missing posted lines, % pending/reversed documents, % unreviewed events, % unsupported source kinds.',
      v_missing,v_unmigrated,v_unreviewed,v_other_sources using errcode='22023';
  end if;
  -- A posted repayment covers its reviewed unpaid balance. Any later
  -- supplier payment reduces that balance and needs a new restoration event.
  select count(*)::integer into v_clawback_risks
    from public._multideck_uk_vat_unpaid_input_tax_risk_rows(
      v_period.legal_entity_id,v_period.end_date) risk
    where not exists(select 1 from public."FIN_IndirectTaxInputTaxRepaymentPostings" posted
      join public."FIN_IndirectTaxPeriods" posting_period on posting_period.id=posted.period_id
      join public."FIN_PostingBatches" batch on batch."FINPostBatch_ID"=posted.batch_id
      where posted.legal_entity_id=v_period.legal_entity_id
        and posted.document_id=risk.document_id
        and posting_period.end_date<=v_period.end_date
        and batch."FINPostBatch_StatusCode"='posted'
        and posted.unpaid_at_period_end<=risk.unpaid_at_period_end);
  if v_clawback_risks<>0 then
    raise exception '% supplier invoices need a reviewed six-month input VAT repayment or later payment restoration before this period can be calculated.',v_clawback_risks
      using errcode='22023';
  end if;
  v_registration_snapshot:=jsonb_build_object(
    'registrationId',v_registration."FINComplianceReg_ID",
    'vrn',v_registration."FINComplianceReg_RegistrationReference",
    'status',v_registration."FINComplianceReg_StatusCode",
    'scheme',v_period.scheme_code,'effectiveFrom',v_registration."FINComplianceReg_EffectiveFrom",
    'effectiveTo',v_registration."FINComplianceReg_EffectiveTo",
    -- JSONB text is part of the source digest. A timestamptz rendered in the
    -- session time zone would make unchanged evidence hash differently.
    'updatedAt',to_char(v_registration."FINComplianceReg_UpdatedAt" at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )||jsonb_build_object('packId',v_pack.pack_id,'packVersion',v_pack.pack_version,
    'packStatus',v_pack.pack_status,'obligationCode',v_pack.obligation_code);
  for v_row in
    select evidence.*, decision.id decision_id,decision.tax_point,decision.treatment_code,
      decision.rule_snapshot,decision.reviewed_rule_reference,decision.tax_code_id
    from public."FIN_IndirectTaxEvidence" evidence
    join lateral (
      select * from public."FIN_IndirectTaxDecisions" d where d.evidence_id=evidence.id
      order by d.revision desc limit 1
    ) decision on true
    where evidence.legal_entity_id=v_period.legal_entity_id and evidence.jurisdiction_code='GB'
      and decision.tax_point between v_period.start_date and v_period.end_date
    order by evidence.id
  loop
    v_adjustment_fingerprint:=null;
    if exists(select 1 from public."FIN_IndirectTaxReconciliations" signed
      where signed.evidence_id=v_row.id and signed.period_id<>v_period.id) then
      raise exception 'VAT evidence % was signed in another period; record a correction event.',v_row.id using errcode='22023';
    end if;
    if v_row.source_kind='posted_document_line' then
    if not exists(select 1 from public."FIN_Documents" doc
      join public."FIN_DocumentLines" source_line
        on source_line."FINDocLine_ID"=v_row.source_document_line_id
        and source_line."FINDocLine_DocumentID"=doc."FINDoc_ID"
      where doc."FINDoc_ID"=v_row.source_document_id
        and doc."FINDoc_LegalEntityID"=v_row.legal_entity_id
        and doc."FINDoc_NativePostingStatusCode"='posted'
        and doc."FINDoc_NativePostingBatchID"=v_row.source_posting_batch_id
        and doc."FINDoc_CurrencyCodeSnapshot"=v_row.currency_code
        and doc."FINDoc_ExchangeRate"=v_row.exchange_rate
        and (v_row.source_document_date is null or doc."FINDoc_DocumentDate"=v_row.source_document_date)
        and source_line."FINDocLine_NetAmount"=v_row.signed_net_amount
        and source_line."FINDocLine_TaxAmount"=v_row.signed_tax_amount
        and source_line."FINDocLine_LocalNetAmount"=v_row.signed_net_reporting
        and source_line."FINDocLine_LocalTaxAmount"=v_row.signed_tax_reporting)
      or not exists(select 1 from public."FIN_TaxCodes" tax
        where tax."FINTax_ID"=v_row.tax_code_id and tax."FINTax_LegalEntityID"=v_period.legal_entity_id
          and tax."FINTax_ApprovedAt"=(v_row.rule_snapshot->>'approvedAt')::timestamptz
          and tax."FINTax_Code"=v_row.rule_snapshot->>'code'
          and tax."FINTax_RatePercent"=(v_row.rule_snapshot->>'ratePercent')::numeric
          and tax."FINTax_TreatmentCategoryCode"=v_row.rule_snapshot->>'category'
          and tax."FINTax_IsRecoverable"=(v_row.rule_snapshot->>'recoverable')::boolean
          and tax."FINTax_EffectiveFrom"=(v_row.rule_snapshot->>'effectiveFrom')::date
          and tax."FINTax_EffectiveTo" is not distinct from (v_row.rule_snapshot->>'effectiveTo')::date
          and tax."FINTax_EffectiveFrom"<=v_row.tax_point
          and (tax."FINTax_EffectiveTo" is null or tax."FINTax_EffectiveTo">=v_row.tax_point)) then
      raise exception 'VAT source or approved treatment changed; review evidence % again.',v_row.id using errcode='22023';
    end if;
    elsif v_row.source_kind='adjustment' then
      if exists(select 1 from public."FIN_IndirectTaxPriorErrorMethod1PostingItems" linked
        where linked.evidence_id=v_row.id and linked.discovery_period_id=v_period.id) then
        v_adjustment_fingerprint:=public._multideck_uk_vat_method1_source_fingerprint(v_row.id,v_period.id);
        v_method1_fingerprints:=v_method1_fingerprints||jsonb_build_array(jsonb_build_object(
          'evidenceId',v_row.id,'postingFingerprint',v_adjustment_fingerprint));
      elsif exists(select 1 from public."FIN_IndirectTaxInputTaxRepaymentPostingEvents" linked
        where linked.evidence_id=v_row.id and linked.period_id=v_period.id) then
        v_adjustment_fingerprint:=public._multideck_uk_vat_repayment_source_fingerprint(
          p_actor,v_row.id,v_period.id);
        v_repayment_fingerprints:=v_repayment_fingerprints||jsonb_build_array(jsonb_build_object(
          'evidenceId',v_row.id,'postingFingerprint',v_adjustment_fingerprint));
      else
        raise exception 'Unsupported UK VAT adjustment evidence %.',v_row.id using errcode='22023';
      end if;
    else
      raise exception 'Unsupported UK VAT source kind %.',v_row.source_kind using errcode='22023';
    end if;
    if v_row.treatment_code='domestic_sale' then
      v_amounts[1]:=v_amounts[1]+v_row.signed_tax_reporting;
      v_amounts[6]:=v_amounts[6]+v_row.signed_net_reporting;
      v_entries:=v_entries||jsonb_build_array(
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',1,'amount',v_row.signed_tax_reporting),
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',6,'amount',v_row.signed_net_reporting));
    elsif v_row.treatment_code in ('zero_rated_sale','exempt_sale','outside_uk_service_sale') then
      if v_row.signed_tax_amount<>0 or v_row.signed_tax_reporting<>0 then
        raise exception 'A zero-UK-VAT sale has source VAT.' using errcode='22023';
      end if;
      v_amounts[6]:=v_amounts[6]+v_row.signed_net_reporting;
      v_entries:=v_entries||jsonb_build_array(jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',6,'amount',v_row.signed_net_reporting));
    elsif v_row.treatment_code='domestic_purchase' then
      v_amounts[4]:=v_amounts[4]+v_row.signed_tax_reporting;
      v_amounts[7]:=v_amounts[7]+v_row.signed_net_reporting;
      v_entries:=v_entries||jsonb_build_array(
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',4,'amount',v_row.signed_tax_reporting),
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',7,'amount',v_row.signed_net_reporting));
    elsif v_row.treatment_code='nonrecoverable_purchase' then
      v_amounts[7]:=v_amounts[7]+v_row.signed_net_reporting;
      v_entries:=v_entries||jsonb_build_array(jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',7,'amount',v_row.signed_net_reporting));
    elsif v_row.treatment_code in ('zero_rated_purchase','exempt_purchase') then
      if v_row.signed_tax_amount<>0 or v_row.signed_tax_reporting<>0 then
        raise exception 'Zero-rated or exempt purchase evidence has VAT.' using errcode='22023';
      end if;
      v_amounts[7]:=v_amounts[7]+v_row.signed_net_reporting;
      v_entries:=v_entries||jsonb_build_array(jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',7,'amount',v_row.signed_net_reporting));
    elsif v_row.treatment_code='prior_error_method1_output' then
      v_amounts[1]:=v_amounts[1]+v_row.signed_tax_reporting;
      v_amounts[6]:=v_amounts[6]+v_row.signed_net_reporting;
      v_entries:=v_entries||jsonb_build_array(
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',1,'amount',v_row.signed_tax_reporting),
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',6,'amount',v_row.signed_net_reporting));
    elsif v_row.treatment_code='prior_error_method1_input' then
      v_amounts[4]:=v_amounts[4]+v_row.signed_tax_reporting;
      v_amounts[7]:=v_amounts[7]+v_row.signed_net_reporting;
      v_entries:=v_entries||jsonb_build_array(
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',4,'amount',v_row.signed_tax_reporting),
        jsonb_build_object('evidence',v_row.id,'decision',v_row.decision_id,'box',7,'amount',v_row.signed_net_reporting));
    elsif v_row.treatment_code in ('input_tax_six_month_repayment','input_tax_payment_restoration') then
      if v_row.source_kind<>'adjustment' or v_row.signed_net_reporting<>0 then
        raise exception 'Supplier input VAT repayment must be a tax-only adjustment.' using errcode='22023';
      end if;
      v_amounts[4]:=v_amounts[4]+v_row.signed_tax_reporting;
      v_entries:=v_entries||jsonb_build_array(jsonb_build_object(
        'evidence',v_row.id,'decision',v_row.decision_id,'box',4,'amount',v_row.signed_tax_reporting));
    else
      raise exception 'UK VAT treatment % is unsupported in the standard draft.',v_row.treatment_code using errcode='22023';
    end if;
    v_sources:=v_sources||jsonb_build_array(jsonb_build_object('evidence',v_row.id,
      'decision',v_row.decision_id,'taxPoint',v_row.tax_point,'treatment',v_row.treatment_code,
      'net',v_row.signed_net_reporting,'vat',v_row.signed_tax_reporting,
      'sourceVersion',v_row.source_version,'rule',v_row.reviewed_rule_reference));
  end loop;
  if jsonb_array_length(v_repayment_fingerprints)<>
    (select count(*) from public."FIN_IndirectTaxInputTaxRepaymentPostingEvents" posted_event
      where posted_event.period_id=v_period.id
        and posted_event.legal_entity_id=v_period.legal_entity_id) then
    raise exception 'A posted supplier input VAT adjustment is missing from this period calculation.' using errcode='22023';
  end if;
  -- HMRC validates box 3 against the submitted boxes 1 and 2, and box 5
  -- against the submitted boxes 3 and 4. Round those inputs first; source
  -- lines and the control bridge retain their four-decimal amounts.
  v_amounts[3]:=round(v_amounts[1],2)+round(v_amounts[2],2);
  v_amounts[5]:=abs(v_amounts[3]-round(v_amounts[4],2));
  v_boxes:=jsonb_build_object('1',round(v_amounts[1],2),'2',round(v_amounts[2],2),
    '3',round(v_amounts[3],2),'4',round(v_amounts[4],2),'5',round(v_amounts[5],2),
    '6',round(v_amounts[6],2),'7',round(v_amounts[7],2),'8',round(v_amounts[8],2),'9',round(v_amounts[9],2));
  -- Match each reviewed VAT source to the native journal lines that actually
  -- posted it. This is a source check, not a whole-period VAT control balance:
  -- timing differences and other journal sources remain unreconciled.
  with checked as (
    select evidence.id evidence_id,evidence.source_document_id document_id,
      evidence.source_document_line_id document_line_id,
      evidence.signed_net_reporting net_gbp,evidence.signed_tax_reporting vat_gbp,
      doc."FINDoc_TypeCode" document_type,
      (doc."FINDoc_TypeCode" in ('pl_invoice','debit_note') and tax."FINTax_IsRecoverable" is false) nonrecoverable_purchase,
      batch."FINPostBatch_StatusCode" batch_status,
      batch."FINPostBatch_LegalEntityID" batch_entity,
      count(line."FINPostLine_ID") filter (where line."FINPostLine_Description" not like 'Tax:%'
        and line."FINPostLine_Description" not like 'Nonrecoverable tax:%') net_lines,
      count(line."FINPostLine_ID") filter (where line."FINPostLine_Description" like 'Tax:%'
        or line."FINPostLine_Description" like 'Nonrecoverable tax:%') tax_lines,
      count(line."FINPostLine_ID") filter (where line."FINPostLine_NominalAccountID"=expected.nominal_id
        and ((doc."FINDoc_TypeCode" in ('pl_invoice','debit_note') and tax."FINTax_IsRecoverable" is false
          and line."FINPostLine_Description" like 'Nonrecoverable tax:%')
          or (not (doc."FINDoc_TypeCode" in ('pl_invoice','debit_note') and tax."FINTax_IsRecoverable" is false)
          and line."FINPostLine_Description" like 'Tax:%'))) tax_nominal_lines,
      count(line."FINPostLine_ID") filter (where line."FINPostLine_Description" not like 'Tax:%'
        and line."FINPostLine_Description" not like 'Nonrecoverable tax:%'
        and line."FINPostLine_NominalAccountID"=expected.nominal_id
        and not (doc."FINDoc_TypeCode" in ('pl_invoice','debit_note') and tax."FINTax_IsRecoverable" is false)) misplaced_net_lines,
      expected.nominal_id expected_tax_nominal_id,
      expected_nominal."FINNom_Code" expected_tax_nominal_code,
      coalesce(jsonb_agg(distinct line."FINPostLine_NominalAccountID") filter
        (where line."FINPostLine_Description" like 'Tax:%'
          or line."FINPostLine_Description" like 'Nonrecoverable tax:%'),'[]'::jsonb) posted_tax_nominal_ids,
      coalesce(jsonb_agg(distinct posted_nominal."FINNom_Code") filter
        (where (line."FINPostLine_Description" like 'Tax:%'
          or line."FINPostLine_Description" like 'Nonrecoverable tax:%')
          and posted_nominal."FINNom_Code" is not null),'[]'::jsonb) posted_tax_nominal_codes,
      count(line."FINPostLine_ID") filter (where line."FINPostLine_NominalAccountID" is null
        or line."FINPostLine_CurrencyCodeSnapshot"<>'GBP') invalid_lines,
      encode(sha256(convert_to(coalesce(batch."FINPostBatch_StatusCode",'')||
        coalesce(batch."FINPostBatch_LegalEntityID"::text,'')||doc."FINDoc_TypeCode"||
        coalesce(expected.nominal_id::text,'')||
        coalesce(jsonb_agg(jsonb_build_object(
        'id',line."FINPostLine_ID",'nominal',line."FINPostLine_NominalAccountID",
        'debit',line."FINPostLine_DebitAmount",'credit',line."FINPostLine_CreditAmount",
        'currency',line."FINPostLine_CurrencyCodeSnapshot",'description',line."FINPostLine_Description")
        order by line."FINPostLine_ID") filter (where line."FINPostLine_ID" is not null),'[]'::jsonb)::text,'UTF8')),'hex') posting_digest,
      coalesce(sum(line."FINPostLine_DebitAmount"-line."FINPostLine_CreditAmount")
        filter (where line."FINPostLine_Description" not like 'Tax:%'
          and line."FINPostLine_Description" not like 'Nonrecoverable tax:%'),0) net_posted,
      coalesce(sum(line."FINPostLine_DebitAmount"-line."FINPostLine_CreditAmount")
        filter (where line."FINPostLine_Description" like 'Tax:%'
          or line."FINPostLine_Description" like 'Nonrecoverable tax:%'),0) tax_posted
    from public."FIN_IndirectTaxEvidence" evidence
    join lateral (select d.tax_point from public."FIN_IndirectTaxDecisions" d
      where d.evidence_id=evidence.id order by d.revision desc limit 1) decision on true
    join public."FIN_Documents" doc on doc."FINDoc_ID"=evidence.source_document_id
    left join public."FIN_DocumentLines" document_line
      on document_line."FINDocLine_ID"=evidence.source_document_line_id
      and document_line."FINDocLine_DocumentID"=evidence.source_document_id
    left join public."FIN_TaxCodes" tax
      on tax."FINTax_ID"=document_line."FINDocLine_TaxCodeID"
      and tax."FINTax_LegalEntityID"=v_period.legal_entity_id
    left join lateral (select public._multideck_finance_resolve_nominal(
      v_period.legal_entity_id,
      case when doc."FINDoc_TypeCode" in ('pl_invoice','debit_note') and tax."FINTax_IsRecoverable" is false
        then document_line."FINDocLine_NominalAccountID"
        when doc."FINDoc_TypeCode" in ('sl_invoice','credit_note')
        then tax."FINTax_OutputNominalID" else tax."FINTax_InputNominalID" end,
      case when doc."FINDoc_TypeCode" in ('pl_invoice','debit_note') and tax."FINTax_IsRecoverable" is false then '5000'
        when doc."FINDoc_TypeCode" in ('sl_invoice','credit_note') then '2100' else '1200' end
    ) nominal_id) expected on true
    left join public."FIN_NominalAccounts" expected_nominal
      on expected_nominal."FINNom_ID"=expected.nominal_id
      and expected_nominal."FINNom_LegalEntityID"=v_period.legal_entity_id
    left join public."FIN_PostingBatches" batch on batch."FINPostBatch_ID"=evidence.source_posting_batch_id
    left join public."FIN_PostingLines" line on line."FINPostLine_BatchID"=evidence.source_posting_batch_id
      and line."FINPostLine_DocumentID"=evidence.source_document_id
      and line."FINPostLine_DocumentLineID"=evidence.source_document_line_id
    left join public."FIN_NominalAccounts" posted_nominal
      on posted_nominal."FINNom_ID"=line."FINPostLine_NominalAccountID"
      and posted_nominal."FINNom_LegalEntityID"=v_period.legal_entity_id
    where evidence.legal_entity_id=v_period.legal_entity_id and evidence.jurisdiction_code='GB'
      and decision.tax_point between v_period.start_date and v_period.end_date
      and evidence.source_kind='posted_document_line'
    group by evidence.id,doc."FINDoc_TypeCode",tax."FINTax_IsRecoverable",batch."FINPostBatch_StatusCode",
      batch."FINPostBatch_LegalEntityID",expected.nominal_id,expected_nominal."FINNom_Code"
  ), evaluated as (
    select *,
      batch_status='posted' and batch_entity=v_period.legal_entity_id and invalid_lines=0
      and document_type in ('sl_invoice','credit_note','pl_invoice','debit_note')
      and net_lines=case when net_gbp=0 then 0 else 1 end
      and tax_lines=case when vat_gbp=0 then 0 else 1 end
      and tax_nominal_lines=tax_lines and misplaced_net_lines=0
      and (vat_gbp=0 or expected_tax_nominal_id is not null)
      and net_posted=case when document_type in ('sl_invoice','debit_note') then -abs(net_gbp) else abs(net_gbp) end
      and tax_posted=case when document_type in ('sl_invoice','debit_note') then -abs(vat_gbp) else abs(vat_gbp) end
      as matched
    from checked
  ), ranked as (
    select *,row_number() over (partition by coalesce(matched,false) order by evidence_id) mismatch_order
    from evaluated
  )
  select count(*)::integer,count(*) filter (where not coalesce(matched,false))::integer,
    coalesce(jsonb_agg(jsonb_build_object('evidenceId',evidence_id,'documentId',document_id,
      'documentLineId',document_line_id,'netGbp',net_gbp,'vatGbp',vat_gbp,
      'documentType',document_type,'batchStatus',batch_status,
      'netPosted',net_posted,'taxPosted',tax_posted,'netLines',net_lines,'taxLines',tax_lines,
      'taxNominalLines',tax_nominal_lines,'misplacedNetLines',misplaced_net_lines,
      'expectedTaxNominalId',expected_tax_nominal_id,'expectedTaxNominalCode',expected_tax_nominal_code,
      'postedTaxNominalIds',posted_tax_nominal_ids,'postedTaxNominalCodes',posted_tax_nominal_codes)
      order by evidence_id) filter (where not coalesce(matched,false) and mismatch_order<=20),'[]'::jsonb),
    encode(sha256(convert_to(coalesce(string_agg(evidence_id::text||posting_digest,'|' order by evidence_id),''),'UTF8')),'hex')
    into v_ledger_checked,v_ledger_mismatched,v_ledger_sample,v_ledger_digest from ranked;
  if jsonb_array_length(v_method1_fingerprints)>0 or jsonb_array_length(v_repayment_fingerprints)>0 then
    v_ledger_checked:=v_ledger_checked+jsonb_array_length(v_method1_fingerprints)
      +jsonb_array_length(v_repayment_fingerprints);
    v_ledger_digest:=encode(sha256(convert_to(v_ledger_digest||v_method1_fingerprints::text||
      v_repayment_fingerprints::text,'UTF8')),'hex');
  end if;
  v_control:=jsonb_build_object('status','unreconciled',
    'reason','Whole-period VAT control balance and timing differences require review before approval',
    'sourceLedger',jsonb_build_object('status',case when v_ledger_mismatched=0 then 'matched' else 'mismatch' end,
      'checked',v_ledger_checked,'mismatched',v_ledger_mismatched,
      'postingDigest',v_ledger_digest,'mismatchSample',v_ledger_sample));
  v_version:=case when v_period.scheme_code='annual' then 'uk-annual-v3'
    when jsonb_array_length(v_method1_fingerprints)>0 and jsonb_array_length(v_repayment_fingerprints)>0
      then 'uk-standard-adjustments-v1'
    when jsonb_array_length(v_repayment_fingerprints)>0 then 'uk-standard-input-tax-repayment-v1'
    when jsonb_array_length(v_method1_fingerprints)>0 then 'uk-standard-method1-v1'
    else 'uk-standard-v5' end;
  v_digest:=encode(sha256(convert_to(v_version||v_period.id::text||
    v_registration_snapshot::text||v_sources::text||v_boxes::text||v_ledger_digest,'UTF8')),'hex');
  if not p_persist then
    return jsonb_build_object('periodId',p_period_id,'boxes',v_boxes,
      'sourceDigest',v_digest,'calculationVersion',v_version,
      'sourceLedger',v_control->'sourceLedger','previewOnly',true);
  end if;
  select coalesce(max(revision),0)+1 into v_revision from public."FIN_IndirectTaxCalculations" where period_id=p_period_id;
  insert into public."FIN_IndirectTaxCalculations"(
    period_id,revision,calculation_version,source_digest,registration_snapshot,
    box_totals,exceptions,control_reconciliation,calculated_by
  ) values (p_period_id,v_revision,v_version,v_digest,v_registration_snapshot,
    v_boxes,'[]'::jsonb,v_control,p_actor) returning id into v_calculation;
  for v_entry in select value from jsonb_array_elements(v_entries) loop
    insert into public."FIN_IndirectTaxCalculationLines"(
      calculation_id,period_id,evidence_id,decision_id,box_number,signed_amount
    ) values (v_calculation,p_period_id,(v_entry->>'evidence')::uuid,(v_entry->>'decision')::uuid,
      (v_entry->>'box')::smallint,(v_entry->>'amount')::numeric);
  end loop;
  return jsonb_build_object('calculationId',v_calculation,'revision',v_revision,'boxes',v_boxes,
    'sourceDigest',v_digest,'controlStatus','unreconciled',
    'sourceLedger',v_control->'sourceLedger','approvalAvailable',false);
end; $$;


create or replace function public.multideck_uk_vat_tax_posting_inventory(
  p_actor uuid,p_entity uuid,p_calculation uuid,p_offset integer default 0,p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_result jsonb; v_raw_vat_due numeric; v_expected_tax_lines integer;
  v_uncovered_days integer; v_straddling_periods integer; v_control_net numeric;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Choose a valid VAT tax-posting page.' using errcode='22023';
  end if;
  select period.* into v_period from public."FIN_IndirectTaxCalculations" calculation
    join public."FIN_IndirectTaxPeriods" period on period.id=calculation.period_id
    where calculation.id=p_calculation and period.legal_entity_id=p_entity
      and period.jurisdiction_code='GB';
  if not found then raise exception 'UK VAT calculation was not found.' using errcode='P0002'; end if;
  select coalesce(sum(case line.box_number when 1 then line.signed_amount
      when 4 then -line.signed_amount else 0 end),0),
    count(*) filter (where line.box_number in (1,4) and line.signed_amount<>0)
    into v_raw_vat_due,v_expected_tax_lines
  from public."FIN_IndirectTaxCalculationLines" line
  where line.calculation_id=p_calculation and line.period_id=v_period.id;
  select count(*) filter (where coverage.period_count<>1) into v_uncovered_days
  from generate_series(v_period.start_date,v_period.end_date,interval '1 day') day
  cross join lateral (
    select count(*) period_count from public."FIN_Periods" accounting
    where accounting."FINPeriod_LegalEntityID"=p_entity
      and day::date between accounting."FINPeriod_StartDate" and accounting."FINPeriod_EndDate"
  ) coverage;
  select count(*) into v_straddling_periods from public."FIN_Periods" accounting
    where accounting."FINPeriod_LegalEntityID"=p_entity
      and accounting."FINPeriod_StartDate"<=v_period.end_date
      and accounting."FINPeriod_EndDate">=v_period.start_date
      and (accounting."FINPeriod_StartDate"<v_period.start_date
        or accounting."FINPeriod_EndDate">v_period.end_date);
  with tax_accounts as (
    select nominal."FINNom_ID" id from public."FIN_NominalAccounts" nominal
    where nominal."FINNom_LegalEntityID"=p_entity
      and (lower(coalesce(nominal."FINNom_ControlTypeCode",'')) like '%vat%'
        or nominal."FINNom_Code" ~ '^(1200|2100)([.]00[.]00)?$'
        or nominal."FINNom_ID" in (
          select tax."FINTax_OutputNominalID" from public."FIN_TaxCodes" tax
            where tax."FINTax_LegalEntityID"=p_entity and tax."FINTax_OutputNominalID" is not null
          union
          select tax."FINTax_InputNominalID" from public."FIN_TaxCodes" tax
            where tax."FINTax_LegalEntityID"=p_entity and tax."FINTax_InputNominalID" is not null))
  ), inventory as materialized (
    select posting."FINPostLine_ID" posting_line_id,
      batch."FINPostBatch_ID" batch_id,batch."FINPostBatch_Number" batch_number,
      batch."FINPostBatch_SourceTable" batch_source,
      batch."FINPostBatch_PostedAt" posted_at,
      accounting."FINPeriod_ID" accounting_period_id,
      accounting."FINPeriod_StartDate" accounting_start,
      accounting."FINPeriod_EndDate" accounting_end,
      posting."FINPostLine_LineNo" line_number,
      posting."FINPostLine_DocumentID" document_id,
      posting."FINPostLine_DocumentLineID" document_line_id,
      posting."FINPostLine_NominalAccountID" nominal_id,
      nominal."FINNom_Code" nominal_code,nominal."FINNom_Name" nominal_name,
      posting."FINPostLine_Description" description,
      posting."FINPostLine_DebitAmount" debit_gbp,
      posting."FINPostLine_CreditAmount" credit_gbp,
      posting."FINPostLine_CurrencyCodeSnapshot" currency,
      posting."FINPostLine_Description" like 'Tax:%' tax_labelled,
      posting."FINPostLine_NominalAccountID" in (select id from tax_accounts) vat_account,
      exists (
        select 1 from public."FIN_IndirectTaxCalculationLines" calc_line
        join public."FIN_IndirectTaxEvidence" evidence on evidence.id=calc_line.evidence_id
        where calc_line.calculation_id=p_calculation
          and evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
          and evidence.source_posting_batch_id=batch."FINPostBatch_ID"
          and ((evidence.source_kind='posted_document_line'
            and evidence.source_document_id=posting."FINPostLine_DocumentID"
            and evidence.source_document_line_id=posting."FINPostLine_DocumentLineID")
            or (evidence.source_kind='adjustment'
              and evidence.source_id=posting."FINPostLine_ID"
              and exists(select 1 from public."FIN_IndirectTaxPriorErrorMethod1PostingItems" method1
                where method1.evidence_id=evidence.id
                  and method1.tax_posting_line_id=posting."FINPostLine_ID"
                  and method1.legal_entity_id=p_entity
                  and method1.discovery_period_id=v_period.id)
              or exists(select 1 from public."FIN_IndirectTaxInputTaxRepaymentPostingEvents" repayment
                where repayment.evidence_id=evidence.id
                  and repayment.tax_posting_line_id=posting."FINPostLine_ID"
                  and repayment.legal_entity_id=p_entity
                  and repayment.period_id=v_period.id)))
      ) linked_to_draft
    from public."FIN_PostingLines" posting
    join public."FIN_PostingBatches" batch
      on batch."FINPostBatch_ID"=posting."FINPostLine_BatchID"
      and batch."FINPostBatch_LegalEntityID"=p_entity
      and batch."FINPostBatch_StatusCode"='posted'
    join public."FIN_Periods" accounting
      on accounting."FINPeriod_ID"=batch."FINPostBatch_PeriodID"
      and accounting."FINPeriod_LegalEntityID"=p_entity
      and accounting."FINPeriod_StartDate"<=v_period.end_date
      and accounting."FINPeriod_EndDate">=v_period.start_date
    left join public."FIN_NominalAccounts" nominal
      on nominal."FINNom_ID"=posting."FINPostLine_NominalAccountID"
      and nominal."FINNom_LegalEntityID"=p_entity
    where posting."FINPostLine_Description" like 'Tax:%'
      or posting."FINPostLine_NominalAccountID" in (select id from tax_accounts)
  )
  select jsonb_build_object(
    'calculationId',p_calculation,'periodId',v_period.id,'legalEntityId',p_entity,
    'scope','posted GL tax lines in accounting periods overlapping the VAT period',
    'vatPeriodStart',v_period.start_date,'vatPeriodEnd',v_period.end_date,
    'postingDigest',(select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object(
      'id',posting_line_id,'batch',batch_id,'accountingPeriod',accounting_period_id,
      'nominal',nominal_id,'debit',debit_gbp,'credit',credit_gbp,'currency',currency,
      'description',description,'vatAccount',vat_account,'linked',linked_to_draft)
      order by posting_line_id),'[]'::jsonb)::text,'UTF8')),'hex') from inventory),
    'accountingScopeDigest',(select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object(
      'id',accounting."FINPeriod_ID",'start',accounting."FINPeriod_StartDate",
      'end',accounting."FINPeriod_EndDate") order by accounting."FINPeriod_ID"),'[]'::jsonb)::text,'UTF8')),'hex')
      from public."FIN_Periods" accounting where accounting."FINPeriod_LegalEntityID"=p_entity
        and accounting."FINPeriod_StartDate"<=v_period.end_date
        and accounting."FINPeriod_EndDate">=v_period.start_date),
    'totalLines',(select count(*) from inventory),
    'linkedLines',(select count(*) from inventory where linked_to_draft),
    'unlinkedLines',(select count(*) from inventory where not linked_to_draft),
    'taxLinesOffVatAccounts',(select count(*) from inventory where tax_labelled and not coalesce(vat_account,false)),
    'nonGbpLines',(select count(*) from inventory where currency<>'GBP'),
    'totalDebitGbp',(select coalesce(sum(debit_gbp),0) from inventory where currency='GBP'),
    'totalCreditGbp',(select coalesce(sum(credit_gbp),0) from inventory where currency='GBP'),
    'linkedVatAccountDebitGbp',(select coalesce(sum(debit_gbp),0) from inventory
      where currency='GBP' and vat_account and linked_to_draft),
    'linkedVatAccountCreditGbp',(select coalesce(sum(credit_gbp),0) from inventory
      where currency='GBP' and vat_account and linked_to_draft),
    'unlinkedVatAccountDebitGbp',(select coalesce(sum(debit_gbp),0) from inventory
      where currency='GBP' and vat_account and not linked_to_draft),
    'unlinkedVatAccountCreditGbp',(select coalesce(sum(credit_gbp),0) from inventory
      where currency='GBP' and vat_account and not linked_to_draft),
    'taxOffVatAccountDebitGbp',(select coalesce(sum(debit_gbp),0) from inventory
      where currency='GBP' and tax_labelled and not coalesce(vat_account,false)),
    'taxOffVatAccountCreditGbp',(select coalesce(sum(credit_gbp),0) from inventory
      where currency='GBP' and tax_labelled and not coalesce(vat_account,false)),
    'linkedVatAccountTaxLines',(select count(*) from inventory
      where currency='GBP' and vat_account and linked_to_draft and tax_labelled),
    'offset',p_offset,
    'rows',(select coalesce(jsonb_agg(to_jsonb(page) order by page.accounting_start,page.batch_id,page.line_number,page.posting_line_id),'[]'::jsonb)
      from (select * from inventory order by accounting_start,batch_id,line_number,posting_line_id
        offset p_offset limit p_limit) page)
  ) into v_result;
  v_control_net:=(v_result->>'linkedVatAccountCreditGbp')::numeric
    +(v_result->>'unlinkedVatAccountCreditGbp')::numeric
    -(v_result->>'linkedVatAccountDebitGbp')::numeric
    -(v_result->>'unlinkedVatAccountDebitGbp')::numeric;
  v_result:=v_result||jsonb_build_object('controlBridge',jsonb_build_object(
    'sourceVatDueGbp',v_raw_vat_due,'vatAccountNetCreditGbp',v_control_net,
    'differenceGbp',v_control_net-v_raw_vat_due,
    'expectedTaxPostingLines',v_expected_tax_lines,
    'linkedVatAccountTaxLines',(v_result->>'linkedVatAccountTaxLines')::integer,
    'accountingCoverageExact',v_uncovered_days=0 and v_straddling_periods=0,
    'daysWithoutOneAccountingPeriod',v_uncovered_days,
    'straddlingAccountingPeriods',v_straddling_periods,
    'scope','GBP VAT-account movements in accounting periods overlapping the VAT period; comparison only'));
  return v_result;
end; $$;


commit;
