begin;

-- Derive the dated VAT-account movements from a current accountant review.
-- This remains read-only until native posting and return inclusion are built.
create function public.multideck_uk_vat_input_tax_repayment_schedule(
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
  if v_proposal.id is null or v_period.id is null or v_period.status<>'draft'
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

commit;
