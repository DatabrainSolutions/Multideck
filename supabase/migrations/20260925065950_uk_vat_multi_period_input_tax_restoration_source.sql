begin;

-- Continue the dated restoration chain only from a previously locked period.
create or replace function public.multideck_uk_vat_later_input_tax_restoration_source(
  p_actor uuid,p_entity uuid,p_period uuid,p_document uuid
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_first public."FIN_IndirectTaxInputTaxRepaymentPostings"%rowtype;
  v_first_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_first_proposal public."FIN_IndirectTaxInputTaxRepaymentProposals"%rowtype;
  v_prior public."FIN_IndirectTaxLaterInputTaxRestorationPostings"%rowtype;
  v_prior_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_baseline_unpaid numeric; v_baseline_repayment numeric;
  v_baseline_posting uuid; v_baseline_lock uuid;
  v_source jsonb; v_payments jsonb; v_events jsonb:='[]'::jsonb;
  v_claimed numeric; v_gross numeric; v_paid_before numeric; v_paid_end numeric;
  v_running_paid numeric; v_previous_target numeric; v_target numeric;
  v_delta numeric; v_total numeric:=0; v_date date; v_amount numeric;
  v_linked integer; v_count integer; v_fingerprint text;
  v_first_event record;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=p_period and legal_entity_id=p_entity and jurisdiction_code='GB';
  if not found or v_period.status not in ('draft','review_locked')
    or v_period.scheme_code<>'standard' or v_period.reporting_currency<>'GBP' then
    raise exception 'Choose a Standard Accounting GBP VAT period.' using errcode='22023';
  end if;
  select posted.* into v_first from public."FIN_IndirectTaxInputTaxRepaymentPostings" posted
    join public."FIN_IndirectTaxPeriods" origin on origin.id=posted.period_id
    where posted.legal_entity_id=p_entity and posted.document_id=p_document
      and origin.end_date<v_period.start_date
    order by origin.end_date,posted.id limit 1;
  if not found then
    raise exception 'A prior reviewed six-month supplier VAT repayment is required.' using errcode='22023';
  end if;
  select * into v_first_period from public."FIN_IndirectTaxPeriods"
    where id=v_first.period_id and legal_entity_id=p_entity;
  select * into v_first_proposal from public."FIN_IndirectTaxInputTaxRepaymentProposals"
    where id=v_first.proposal_id and legal_entity_id=p_entity
      and document_id=p_document and period_id=v_first.period_id;
  if v_first_period.status<>'review_locked' or v_first_period.active_review_lock_id is null
    or v_first_proposal.id is null or v_first.unpaid_at_period_end<=0
    or v_first.box4_delta_gbp>=0 then
    raise exception 'The original supplier VAT repayment must be posted and review-locked.' using errcode='22023';
  end if;
  select count(*)::integer into v_count
    from public."FIN_IndirectTaxInputTaxRepaymentPostingEvents" event
    where event.posting_id=v_first.id;
  select count(*)::integer into v_linked
    from public."FIN_IndirectTaxInputTaxRepaymentPostingEvents" event
    join public."FIN_IndirectTaxPeriodReviewLocks" review_lock
      on review_lock.id=v_first_period.active_review_lock_id
        and review_lock.period_id=v_first_period.id
    join public."FIN_IndirectTaxCalculationLines" line
      on line.calculation_id=review_lock.calculation_id
        and line.period_id=v_first_period.id
        and line.evidence_id=event.evidence_id
        and line.decision_id=event.decision_id
        and line.box_number=4
        and line.signed_amount=event.signed_box4_delta_gbp
    where event.posting_id=v_first.id and event.period_id=v_first_period.id
      and event.legal_entity_id=p_entity;
  if v_count<>v_first.event_count or v_linked<>v_count then
    raise exception 'The original supplier VAT repayment is not in its active review lock.' using errcode='22023';
  end if;
  for v_first_event in select event.evidence_id
    from public."FIN_IndirectTaxInputTaxRepaymentPostingEvents" event
    where event.posting_id=v_first.id
  loop
    perform public._multideck_uk_vat_repayment_source_fingerprint(
      p_actor,v_first_event.evidence_id,v_first_period.id);
  end loop;
  v_source:=public.multideck_uk_vat_clawback_source_snapshot(
    p_actor,p_entity,v_first_period.id,p_document);
  v_claimed:=(v_source->>'originallyClaimedInputVatGbp')::numeric;
  v_gross:=(v_source->>'grossSourceAmount')::numeric;
  if v_source->>'sourceFingerprint' is distinct from v_first_proposal.source_fingerprint
    or v_source->>'sourceCurrency' is distinct from 'GBP'
    or v_gross<=0 or v_claimed<=0
    or v_first.unpaid_at_period_end<>v_first_proposal.unpaid_at_period_end
    or -v_first.box4_delta_gbp<>trunc(
      v_claimed*v_first.unpaid_at_period_end/v_gross,2) then
    raise exception 'The original supplier VAT claim or remaining repayment changed.' using errcode='22023';
  end if;
  -- Only a previous restoration actually included in an active review lock
  -- may advance the repayment balance. Rechecking that posting recursively
  -- also rechecks every earlier dated supplier-payment source.
  select posted.* into v_prior
    from public."FIN_IndirectTaxLaterInputTaxRestorationPostings" posted
    join public."FIN_IndirectTaxPeriods" prior_period on prior_period.id=posted.period_id
    where posted.legal_entity_id=p_entity and posted.document_id=p_document
      and prior_period.end_date<v_period.start_date
    order by prior_period.end_date desc,posted.id desc limit 1;
  v_baseline_unpaid:=v_first.unpaid_at_period_end;
  v_baseline_repayment:=-v_first.box4_delta_gbp;
  v_baseline_posting:=v_first.id;
  v_baseline_lock:=v_first_period.active_review_lock_id;
  if v_prior.id is not null then
    select * into v_prior_period from public."FIN_IndirectTaxPeriods"
      where id=v_prior.period_id and legal_entity_id=p_entity;
    if v_prior.first_posting_id<>v_first.id
      or v_prior_period.status<>'review_locked'
      or v_prior_period.active_review_lock_id is null then
      raise exception 'The previous supplier VAT restoration is not review-locked.' using errcode='22023';
    end if;
    select count(*)::integer into v_linked
      from public."FIN_IndirectTaxLaterInputTaxRestorationPostingEvents" event
      join public."FIN_IndirectTaxPeriodReviewLocks" review_lock
        on review_lock.id=v_prior_period.active_review_lock_id
          and review_lock.period_id=v_prior_period.id
      join public."FIN_IndirectTaxCalculationLines" line
        on line.calculation_id=review_lock.calculation_id
          and line.period_id=v_prior_period.id
          and line.evidence_id=event.evidence_id
          and line.decision_id=event.decision_id
          and line.box_number=4
          and line.signed_amount=event.signed_box4_delta_gbp
      where event.posting_id=v_prior.id and event.period_id=v_prior_period.id
        and event.legal_entity_id=p_entity;
    if v_linked<>v_prior.event_count
      or (v_prior.event_count=0 and not exists(
        select 1 from public."FIN_IndirectTaxPeriodReviewLocks" review_lock
        join public."FIN_IndirectTaxCalculations" calculation
          on calculation.id=review_lock.calculation_id
          and calculation.period_id=v_prior_period.id
        where review_lock.id=v_prior_period.active_review_lock_id
          and review_lock.period_id=v_prior_period.id
          and calculation.calculation_version in (
            'uk-standard-later-restoration-v1','uk-standard-adjustments-v2')
          and calculation.calculated_at>=v_prior.posted_at)) then
      raise exception 'The previous supplier VAT restoration is absent from its review lock.' using errcode='22023';
    end if;
    perform public._multideck_uk_vat_later_restoration_posting_fingerprint(
      p_actor,v_prior.id);
    v_baseline_unpaid:=v_prior.unpaid_at_period_end_gbp;
    v_baseline_repayment:=v_prior.remaining_repayment_gbp;
    v_baseline_posting:=v_prior.id;
    v_baseline_lock:=v_prior_period.active_review_lock_id;
  end if;
  if exists(select 1 from public."FIN_CashAllocations" allocation
    left join public."FIN_CashTransactions" cash
      on cash."FINCash_ID"=allocation."FINCashAlloc_CashID"
    where allocation."FINCashAlloc_DocumentID"=p_document
      and (allocation."FINCashAlloc_AllocationStatusCode"<>'allocated'
        or allocation."FINCashAlloc_AllocatedAmount"<=0
        or cash."FINCash_ID" is null or cash."FINCash_LegalEntityID"<>p_entity
        or cash."FINCash_TypeCode"<>'supplier_payment'
        or cash."FINCash_NativePostingStatusCode"<>'posted')) then
    raise exception 'Resolve incomplete supplier payment allocations before VAT restoration.' using errcode='22023';
  end if;
  select coalesce(sum(allocation."FINCashAlloc_AllocatedAmount") filter (where
      greatest(cash."FINCash_TransactionDate",
        (allocation."FINCashAlloc_AllocatedAt" at time zone 'Europe/London')::date)
          <v_period.start_date),0),
    coalesce(sum(allocation."FINCashAlloc_AllocatedAmount") filter (where
      greatest(cash."FINCash_TransactionDate",
        (allocation."FINCashAlloc_AllocatedAt" at time zone 'Europe/London')::date)
          <=v_period.end_date),0),
    coalesce(jsonb_agg(jsonb_build_object(
      'cashId',cash."FINCash_ID",'cashDate',cash."FINCash_TransactionDate",
      'allocatedAt',allocation."FINCashAlloc_AllocatedAt",
      'amount',allocation."FINCashAlloc_AllocatedAmount",
      'effectiveDate',greatest(cash."FINCash_TransactionDate",
        (allocation."FINCashAlloc_AllocatedAt" at time zone 'Europe/London')::date))
      order by cash."FINCash_TransactionDate",cash."FINCash_ID")
      filter (where greatest(cash."FINCash_TransactionDate",
        (allocation."FINCashAlloc_AllocatedAt" at time zone 'Europe/London')::date)
          between v_period.start_date and v_period.end_date),'[]'::jsonb)
    into v_paid_before,v_paid_end,v_payments
    from public."FIN_CashAllocations" allocation
    join public."FIN_CashTransactions" cash
      on cash."FINCash_ID"=allocation."FINCashAlloc_CashID"
    where allocation."FINCashAlloc_DocumentID"=p_document
      and allocation."FINCashAlloc_AllocationStatusCode"='allocated';
  if v_paid_before is distinct from v_gross-v_baseline_unpaid
    or v_paid_end>v_gross or v_paid_end<v_paid_before then
    raise exception 'An intervening supplier payment or excess allocation needs its own VAT period review.' using errcode='22023';
  end if;
  v_running_paid:=v_paid_before;
  v_previous_target:=v_baseline_repayment;
  for v_date,v_amount in
    select (payment.value->>'effectiveDate')::date,
      sum((payment.value->>'amount')::numeric)
    from jsonb_array_elements(v_payments) payment(value)
    group by 1 order by 1
  loop
    v_running_paid:=v_running_paid+v_amount;
    v_target:=trunc(v_claimed*(v_gross-v_running_paid)/v_gross,2);
    v_delta:=v_previous_target-v_target;
    if v_amount<=0 or v_running_paid>v_gross or v_delta<0 then
      raise exception 'A supplier payment cannot produce a valid VAT restoration.' using errcode='22023';
    end if;
    if v_delta>0 then
      v_events:=v_events||jsonb_build_array(jsonb_build_object(
        'eventDate',v_date,'kind','later_payment_restoration',
        'sourcePaymentGbp',v_amount,'signedBox4DeltaGbp',v_delta));
    end if;
    v_total:=v_total+v_delta;
    v_previous_target:=v_target;
  end loop;
  if v_running_paid<>v_paid_end or jsonb_array_length(v_payments)=0
    or v_total<0
    or v_total<>v_baseline_repayment-v_previous_target then
    raise exception 'Later supplier VAT restoration did not reconcile.' using errcode='22023';
  end if;
  v_fingerprint:=encode(sha256(convert_to(jsonb_build_object(
    'periodId',p_period,'documentId',p_document,
    'firstPostingId',v_first.id,'firstScheduleFingerprint',v_first.schedule_fingerprint,
    'firstReviewLockId',v_first_period.active_review_lock_id,
    'baselinePostingId',v_baseline_posting,'baselineReviewLockId',v_baseline_lock,
    'baselineUnpaidGbp',v_baseline_unpaid,
    'baselineRepaymentOutstandingGbp',v_baseline_repayment,
    'claimedInputVatGbp',v_claimed,'grossSourceAmount',v_gross,
    'paidBeforePeriodGbp',v_paid_before,'paidByPeriodEndGbp',v_paid_end,
    'payments',v_payments,'events',v_events)::text,'UTF8')),'hex');
  return jsonb_build_object('periodId',p_period,'documentId',p_document,
    'firstPostingId',v_first.id,'firstPeriodId',v_first_period.id,
    'previousRestorationPostingId',v_prior.id,
    'baselinePostingId',v_baseline_posting,
    'sourceFingerprint',v_fingerprint,'claimedInputVatGbp',v_claimed,
    'grossSourceAmount',v_gross,'paidBeforePeriodGbp',v_paid_before,
    'paidByPeriodEndGbp',v_paid_end,'unpaidAtPeriodEndGbp',v_gross-v_paid_end,
    'priorRepaymentOutstandingGbp',v_baseline_repayment,
    'restorationBox4Gbp',v_total,'events',v_events,
    'status',case when v_total=0 then 'source_only_no_tax_effect'
      else 'source_only_no_posting' end);
end; $$;
revoke all on function public.multideck_uk_vat_later_input_tax_restoration_source(
  uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_later_input_tax_restoration_source(
  uuid,uuid,uuid,uuid) to service_role;


commit;
