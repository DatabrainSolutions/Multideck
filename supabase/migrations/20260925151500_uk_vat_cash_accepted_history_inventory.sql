begin;

-- Cash timing needs proof that earlier payments were actually included in
-- accepted returns. An approved draft, dispatch reservation or uncertain POST
-- is not acceptance. This remains read-only source evidence for a future lock.
alter function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
  rename to _multideck_uk_vat_cash_control_source_inventory_before_history;
revoke all on function public._multideck_uk_vat_cash_control_source_inventory_before_history(
  uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.multideck_uk_vat_cash_control_source_inventory(
  p_actor uuid,p_entity uuid,p_period uuid,p_projection uuid
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_source jsonb; v_entry date; v_start date; v_registration uuid;
  v_uncovered_days integer:=0; v_periods jsonb; v_period_count integer;
  v_unaccepted integer; v_outside integer; v_source_rows jsonb;
  v_source_count integer; v_uncovered_sources integer; v_history jsonb;
  v_digest text;
begin
  v_source:=public._multideck_uk_vat_cash_control_source_inventory_before_history(
    p_actor,p_entity,p_period,p_projection);
  if v_source->>'truncated'='true' then
    return v_source||jsonb_build_object('acceptedHistory',null,'sourceDigest',null);
  end if;
  v_entry:=(v_source#>>'{context,schemeEntryDate}')::date;
  v_start:=(v_source#>>'{context,periodStart}')::date;
  v_registration:=(v_source#>>'{context,registrationId}')::uuid;
  if v_entry is null or v_start is null or v_entry>v_start
    or v_source#>>'{context,legalEntityId}' is distinct from p_entity::text then
    raise exception 'Cash scheme entry and period identity are invalid.' using errcode='22023';
  end if;
  if v_entry<v_start then
    select count(*) filter (where covered<>1)::integer into v_uncovered_days
    from (select day.day_index,count(period.id) covered
      from generate_series(0,v_start-v_entry-1) day(day_index)
      left join public."FIN_IndirectTaxPeriods" period
        on period.legal_entity_id=p_entity and period.registration_id=v_registration
        and period.jurisdiction_code='GB' and period.scheme_code='cash'
        and v_entry+day.day_index between period.start_date and period.end_date
      group by day.day_index) coverage;
  end if;
  with prior as materialized (
    select period.id,period.start_date,period.end_date,
      period.status,period.active_review_lock_id,
      accepted.attempt_id,accepted.calculation_id,accepted.projection_id,
      accepted.environment,accepted.acceptance_kind,
      accepted.payload_sha256
    from public."FIN_IndirectTaxPeriods" period
    left join lateral (
      select attempt.id attempt_id,lock.calculation_id,
        calculation.control_reconciliation->>'cashProjectionId' projection_id,
        attempt.environment,
        case when receipt.id is not null then 'receipt'
          when readback.id is not null then 'matched_readback' end acceptance_kind,
        attempt.payload_sha256
      from public."FIN_HmrcVatSubmissionAttempts" attempt
      join public."FIN_IndirectTaxFilingApprovals" approval
        on approval.id=attempt.approval_id and approval.period_id=period.id
        and approval.tenant_project_ref=attempt.tenant_project_ref
        and approval.environment=attempt.environment
        and approval.registration_id=v_registration
        and approval.vrn=attempt.vrn
        and approval.period_key=attempt.period_key
      join public."FIN_IndirectTaxPeriodReviewLocks" lock
        on lock.id=approval.review_lock_id and lock.period_id=period.id
        and lock.id=period.active_review_lock_id
        and lock.lock_fingerprint=approval.lock_fingerprint
      join public."FIN_IndirectTaxCalculations" calculation
        on calculation.id=lock.calculation_id and calculation.period_id=period.id
        and calculation.calculation_version='uk-cash-v1'
        and calculation.source_digest=lock.source_digest
        and calculation.control_reconciliation->>'cashProjectionId' is not null
      left join public."FIN_HmrcVatSubmissionReceipts" receipt
        on receipt.attempt_id=attempt.id and receipt.period_id=period.id
        and receipt.tenant_project_ref=attempt.tenant_project_ref
        and receipt.payload_sha256=attempt.payload_sha256
      left join public."FIN_HmrcVatReturnReadbackChecks" readback
        on readback.attempt_id=attempt.id and readback.period_id=period.id
        and readback.tenant_project_ref=attempt.tenant_project_ref
        and readback.payload_sha256=attempt.payload_sha256
        and readback.result='matched'
      where attempt.period_id=period.id
        and attempt.registration_id=v_registration
        and attempt.environment='production'
        and attempt.status in ('accepted','accepted_readback')
        and attempt.payload_sha256=encode(sha256(convert_to(
          attempt.payload_body,'UTF8')),'hex')
        and (receipt.id is not null or readback.id is not null)
        and not exists(select 1 from public."FIN_IndirectTaxFilingApprovalRevocations" revoked
          where revoked.approval_id=approval.id)
        and not exists(select 1 from public."FIN_IndirectTaxPeriodReviewUnlocks" unlock
          where unlock.lock_id=lock.id)
      order by attempt.accepted_at desc,attempt.id desc limit 1
    ) accepted on true
    where period.legal_entity_id=p_entity and period.registration_id=v_registration
      and period.jurisdiction_code='GB' and period.scheme_code='cash'
      and period.start_date<v_start and period.end_date>=v_entry
  )
  select count(*)::integer,
    count(*) filter (where status<>'review_locked' or attempt_id is null)::integer,
    count(*) filter (where start_date<v_entry or end_date>=v_start)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'periodId',id,'startDate',start_date,'endDate',end_date,
      'status',case when status='review_locked' and attempt_id is not null
        then 'accepted' else 'unaccepted' end,
      'attemptId',attempt_id,'calculationId',calculation_id,
      'projectionId',projection_id,'environment',environment,
      'acceptanceKind',acceptance_kind,'payloadSha256',payload_sha256)
      order by start_date,id),'[]'::jsonb)
    into v_period_count,v_unaccepted,v_outside,v_periods from prior;

  -- Every earlier allocation must have exactly one event for every reviewed
  -- invoice line in the accepted calculation. The stored calculation line
  -- guard already fixes each event's amount and treatment at insertion.
  with expected as materialized (
    select invoice.value->>'invoice_id' invoice_id,
      line.value->>'lineId' line_id,
      line.value->>'evidenceId' evidence_id,
      line.value->>'decisionId' decision_id,
      line.value->>'treatment' treatment,
      allocation.value->>'allocationId' allocation_id,
      allocation.value->>'cashId' cash_id,
      greatest((allocation.value->>'paymentDate')::date,
        ((allocation.value->>'allocatedAt')::timestamptz
          at time zone 'Europe/London')::date,
        ((allocation.value->>'cashPostedAt')::timestamptz
          at time zone 'Europe/London')::date) effective_date,
      case when invoice.value->>'document_type'='sl_invoice' then 6 else 7 end primary_box,
      case when line.value->>'treatment'='domestic_sale' then 1
        when line.value->>'treatment'='domestic_purchase' then 4 end vat_box
    from jsonb_array_elements(v_source#>'{invoiceInventory,invoices}') invoice(value)
    cross join lateral jsonb_array_elements(invoice.value->'lines') line(value)
    cross join lateral jsonb_array_elements(invoice.value->'allocation_sources') allocation(value)
  ), earlier as materialized (
    select * from expected where effective_date>=v_entry and effective_date<v_start
  ), checked as materialized (
    select earlier.*,
      matched.event_count,matched.primary_count,matched.vat_count
    from earlier
    left join lateral (
      select count(distinct event.id)::integer event_count,
        count(*) filter (where box.box_number=earlier.primary_box)::integer primary_count,
        count(*) filter (where box.box_number=earlier.vat_box)::integer vat_count
      from jsonb_array_elements(v_periods) prior(value)
      join public."FIN_IndirectTaxCashEventLines" event
        on event.projection_id=(prior.value->>'projectionId')::uuid
        and event.legal_entity_id=p_entity
        and event.allocation_id=(earlier.allocation_id)::uuid
        and event.cash_id=(earlier.cash_id)::uuid
        and event.invoice_id=(earlier.invoice_id)::uuid
        and event.line_id=(earlier.line_id)::uuid
        and event.evidence_id=(earlier.evidence_id)::uuid
        and event.treatment_review_id=(earlier.decision_id)::uuid
        and event.treatment_code=earlier.treatment
        and event.payment_date=earlier.effective_date
      join public."FIN_IndirectTaxCashCalculationEventLines" box
        on box.event_line_id=event.id
        and box.calculation_id=(prior.value->>'calculationId')::uuid
        and box.period_id=(prior.value->>'periodId')::uuid
      where prior.value->>'status'='accepted'
        and earlier.effective_date between
          (prior.value->>'startDate')::date and (prior.value->>'endDate')::date
    ) matched on true
  )
  select count(*)::integer,
    count(*) filter (where event_count<>1 or primary_count<>1
      or vat_count<>case when vat_box is null then 0 else 1 end)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'invoiceId',invoice_id,'lineId',line_id,'allocationId',allocation_id,
      'effectiveDate',effective_date,'eventCount',event_count,
      'primaryBoxCount',primary_count,'vatBoxCount',vat_count,
      'matched',event_count=1 and primary_count=1
        and vat_count=case when vat_box is null then 0 else 1 end)
      order by effective_date,invoice_id,allocation_id,line_id),'[]'::jsonb)
    into v_source_count,v_uncovered_sources,v_source_rows from checked;
  v_history:=jsonb_build_object(
    'periodCount',v_period_count,'uncoveredDays',v_uncovered_days,
    'unacceptedPeriods',v_unaccepted,'outsideTermPeriods',v_outside,
    'sourceLineCount',v_source_count,'uncoveredSourceLines',v_uncovered_sources,
    'periods',v_periods,'sourceLines',v_source_rows,
    'status',case when v_uncovered_days=0 and v_unaccepted=0 and v_outside=0
      and v_uncovered_sources=0 then 'accepted_history_matched' else 'blocked' end);
  v_digest:=encode(sha256(convert_to(v_history::text,'UTF8')),'hex');
  v_history:=v_history||jsonb_build_object('digest',v_digest);
  return v_source||jsonb_build_object(
    'acceptedHistory',v_history,
    'sourceDigest',case when v_source->>'sourceDigest' is null then null else
      encode(sha256(convert_to(jsonb_build_object(
        'priorSourceDigest',v_source->>'sourceDigest',
        'acceptedHistoryDigest',v_digest)::text,'UTF8')),'hex') end,
    'status','cash_control_source_only','returnReady',false);
end; $$;
revoke all on function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
  to service_role;

commit;
