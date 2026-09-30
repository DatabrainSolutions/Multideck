begin;

-- After a declaration is revoked, show the newest HMRC observation so a fresh
-- check can be used for a new confirmation. Keep the approved observation
-- visible while an approval remains active.
create or replace function public.multideck_uk_vat_filing_status(
  p_actor uuid,p_entity uuid,p_period uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_approval public."FIN_IndirectTaxFilingApprovals"%rowtype;
  v_attempt public."FIN_HmrcVatSubmissionAttempts"%rowtype;
  v_obligation jsonb; v_revocation jsonb; v_receipt jsonb; v_readback jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=p_period and legal_entity_id=p_entity and jurisdiction_code='GB';
  if not found then raise exception 'UK VAT period was not found.' using errcode='P0002'; end if;
  select approval.* into v_approval from public."FIN_IndirectTaxFilingApprovals" approval
    where approval.period_id=p_period
    order by not exists(select 1 from public."FIN_IndirectTaxFilingApprovalRevocations" revocation
      where revocation.approval_id=approval.id) desc,
      approval.confirmed_at desc,approval.id desc limit 1;
  select jsonb_build_object(
    'verificationId',observation.id,'environment',observation.environment,
    'observedAt',observation.observed_at,
    'freshForApproval',observation.observed_at between now()-interval '15 minutes' and now()
  ) into v_obligation
  from public."FIN_HmrcVatObligationVerifications" observation
  where observation.period_id=p_period and observation.legal_entity_id=p_entity
    and observation.registration_id=v_period.registration_id
  order by (v_approval.id is not null
    and not exists(select 1 from public."FIN_IndirectTaxFilingApprovalRevocations" revocation
      where revocation.approval_id=v_approval.id)
    and observation.id=v_approval.obligation_verification_id) desc,
    observation.observed_at desc,observation.id desc limit 1;
  if v_approval.id is not null then
    select jsonb_build_object('revocationId',revocation.id,
      'revokedAt',revocation.revoked_at,'reason',revocation.reason)
      into v_revocation
    from public."FIN_IndirectTaxFilingApprovalRevocations" revocation
    where revocation.approval_id=v_approval.id;
  end if;
  select * into v_attempt from public."FIN_HmrcVatSubmissionAttempts"
    where period_id=p_period
    order by (status in ('reserved','dispatching','reconciliation_required',
      'accepted','accepted_readback')) desc,
      reserved_at desc,id desc limit 1;
  if v_attempt.id is not null then
    select jsonb_build_object('recordedAt',receipt.recorded_at,
      'processingDate',receipt.processing_date,
      'formBundleNumber',receipt.form_bundle_number,
      'correlationId',receipt.correlation_id,
      'receiptId',receipt.receipt_id,
      'receiptTimestamp',receipt.receipt_timestamp,
      'paymentIndicator',receipt.payment_indicator,
      'chargeRefNumber',receipt.charge_ref_number)
      into v_receipt
    from public."FIN_HmrcVatSubmissionReceipts" receipt
    where receipt.attempt_id=v_attempt.id;
    select jsonb_build_object('readbackId',readback.id,
      'result',readback.result,'httpStatus',readback.http_status,
      'correlationId',readback.correlation_id,'observedAt',readback.observed_at)
      into v_readback
    from public."FIN_HmrcVatReturnReadbackChecks" readback
    where readback.attempt_id=v_attempt.id
    order by (readback.result='matched') desc,
      readback.observed_at desc,readback.id desc limit 1;
  end if;
  return jsonb_build_object(
    'periodId',v_period.id,'periodStatus',v_period.status,
    'reviewLockId',v_period.active_review_lock_id,
    'obligation',v_obligation,
    'approval',case when v_approval.id is null then null else jsonb_build_object(
      'approvalId',v_approval.id,'environment',v_approval.environment,
      'confirmedAt',v_approval.confirmed_at,
      'confirmedBy',v_approval.confirmed_by,'revocation',v_revocation) end,
    'attempt',case when v_attempt.id is null then null else jsonb_build_object(
      'attemptId',v_attempt.id,'status',v_attempt.status,
      'environment',v_attempt.environment,
      'reservedAt',v_attempt.reserved_at,'dispatchingAt',v_attempt.dispatching_at,
      'uncertainAt',v_attempt.uncertain_at,'uncertaintyKind',v_attempt.uncertainty_kind,
      'acceptedAt',v_attempt.accepted_at,'cancelledAt',v_attempt.cancelled_at,
      'httpStatus',v_attempt.http_status) end,
    'receipt',v_receipt,'readback',v_readback);
end; $$;

commit;
