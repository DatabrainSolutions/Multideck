begin;

-- A durable, source-bound Cash Accounting event projection. It is preparation
-- for a cash-basis return, not VAT evidence, a period calculation or approval.
create table public."FIN_IndirectTaxCashEventProjections" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  start_date date not null,
  end_date date not null,
  source_digest text not null check (source_digest ~ '^[a-f0-9]{64}$'),
  candidate_allocation_count integer not null check (candidate_allocation_count>=0),
  excluded_allocation_count integer not null check (excluded_allocation_count>=0),
  source_boxes_gbp jsonb not null,
  excluded_allocations jsonb not null,
  projected_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  projected_at timestamptz not null default clock_timestamp(),
  unique (legal_entity_id,start_date,end_date,source_digest),
  check (start_date<=end_date)
);
create index "IX_FIN_IndirectTaxCashEventProjections_period"
  on public."FIN_IndirectTaxCashEventProjections"(legal_entity_id,start_date,end_date,projected_at desc);
create trigger indirect_tax_cash_event_projection_immutable before update or delete
  on public."FIN_IndirectTaxCashEventProjections"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxCashEventProjections" enable row level security;
revoke all on public."FIN_IndirectTaxCashEventProjections" from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxCashEventProjections" to service_role;

create table public."FIN_IndirectTaxCashEventLines" (
  id uuid primary key default gen_random_uuid(),
  projection_id uuid not null references public."FIN_IndirectTaxCashEventProjections"(id) on delete restrict,
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  cash_id uuid not null references public."FIN_CashTransactions"("FINCash_ID") on delete restrict,
  allocation_id uuid not null references public."FIN_CashAllocations"("FINCashAlloc_ID") on delete restrict,
  payment_review_id uuid not null references public."FIN_IndirectTaxCashPaymentDateReviews"(id) on delete restrict,
  invoice_id uuid not null references public."FIN_Documents"("FINDoc_ID") on delete restrict,
  payment_date date not null,
  line_id uuid not null references public."FIN_DocumentLines"("FINDocLine_ID") on delete restrict,
  evidence_id uuid not null references public."FIN_IndirectTaxEvidence"(id) on delete restrict,
  treatment_review_id uuid not null references public."FIN_IndirectTaxDecisions"(id) on delete restrict,
  treatment_code text not null,
  net_gbp numeric(18,4) not null check (net_gbp>=0),
  vat_gbp numeric(18,4) not null check (vat_gbp>=0),
  unique (projection_id,allocation_id,line_id)
);
create index "IX_FIN_IndirectTaxCashEventLines_allocation"
  on public."FIN_IndirectTaxCashEventLines"(allocation_id,projection_id);
create trigger indirect_tax_cash_event_line_immutable before update or delete
  on public."FIN_IndirectTaxCashEventLines"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxCashEventLines" enable row level security;
revoke all on public."FIN_IndirectTaxCashEventLines" from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxCashEventLines" to service_role;

create function public.multideck_uk_vat_record_cash_event_projection(
  p_actor uuid,p_entity uuid,p_start date,p_end date,p_source jsonb,p_preview jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_source jsonb; v_digest text; v_existing uuid; v_projection uuid;
  v_line jsonb; v_allocation jsonb; v_source_line jsonb; v_exclusion jsonb; v_cash jsonb;
  v_before numeric; v_now numeric; v_gross numeric; v_net numeric; v_vat numeric;
  v_expected_net numeric; v_expected_vat numeric;
  v_count integer:=0; v_distinct_allocations integer; v_candidate_lines integer;
  v_period_allocations integer:=0;
  v_box1 numeric:=0; v_box4 numeric:=0; v_box6 numeric:=0; v_box7 numeric:=0;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_source is null or p_preview is null or jsonb_typeof(p_preview) is distinct from 'object'
    or p_preview->>'sourceStatus' is distinct from 'source_only_not_filing'
    or p_preview->>'calculationValid' is distinct from 'true'
    or p_preview->>'legalEntityId' is distinct from p_entity::text
    or p_preview->>'startDate' is distinct from p_start::text
    or p_preview->>'endDate' is distinct from p_end::text
    or jsonb_typeof(p_preview->'allocationLines') is distinct from 'array'
    or jsonb_typeof(p_preview->'excludedAllocations') is distinct from 'array'
    or jsonb_typeof(p_preview->'sourceBoxesGbp') is distinct from 'object'
    or (p_preview->>'issueCount')::integer is distinct from 0 then
    raise exception 'A complete, valid Cash Accounting source projection is required.' using errcode='22023';
  end if;
  -- Re-read inside the write transaction. The Edge calculation is accepted
  -- only for the exact source it saw; a changed review creates a new revision.
  v_source:=public.multideck_uk_vat_cash_source_snapshot(p_actor,p_entity,p_start,p_end);
  if p_source<>v_source or v_source->>'truncated' is distinct from 'false'
    or (v_source->>'unreviewedPostedCash')::integer<>0 then
    raise exception 'Cash VAT sources changed or are incomplete; recalculate the projection.' using errcode='22023';
  end if;
  for v_cash in select value from jsonb_array_elements(v_source->'periodCash') loop
    if v_cash->>'posting_batch_id' is null or v_cash->>'payment_review_id' is null
      or v_cash->>'currency_code' is distinct from 'GBP'
      or v_cash->>'fingerprint_matches' is distinct from 'true'
      or (v_cash->>'allocation_count')::integer<1
      or (v_cash->>'cash_amount')::numeric<=0
      or (v_cash->>'cash_amount')::numeric is distinct from
        (v_cash->>'allocated_amount')::numeric then
      raise exception 'Posted cash lacks complete reviewed allocation evidence.' using errcode='22023';
    end if;
  end loop;
  v_digest:=encode(sha256(convert_to(v_source::text,'UTF8')),'hex');
  if (p_preview->>'candidateAllocationCount')::integer<0
    or (p_preview->>'excludedAllocationCount')::integer<0
    or (p_preview->>'excludedAllocationCount')::integer<>jsonb_array_length(p_preview->'excludedAllocations') then
    raise exception 'Cash VAT allocation counts are invalid.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'uk-vat-cash-projection:'||p_entity::text||':'||p_start::text||':'||p_end::text,0));
  -- Validate every line against its exact posted allocation, invoice line,
  -- payment review and cumulative four-decimal part-payment calculation.
  for v_line in select value from jsonb_array_elements(p_preview->'allocationLines') loop
    select value into v_allocation from jsonb_array_elements(v_source->'allocations')
      where value->>'allocation_id'=v_line->>'allocationId';
    if not found or (v_allocation->>'vat_payment_date')::date not between p_start and p_end
      or v_allocation->>'cash_id' is distinct from v_line->>'cashId'
      or v_allocation->>'payment_review_id' is distinct from v_line->>'paymentReviewId'
      or v_allocation->>'document_id' is distinct from v_line->>'invoiceId'
      or v_allocation->>'vat_payment_date' is distinct from v_line->>'paymentDate' then
      raise exception 'Cash VAT event does not match a reviewed period allocation.' using errcode='22023';
    end if;
    select value into v_source_line from jsonb_array_elements(v_allocation->'lines')
      where value->>'lineId'=v_line->>'lineId';
    if not found or v_source_line->>'evidenceId' is distinct from v_line->>'evidenceId'
      or v_source_line->>'reviewId' is distinct from v_line->>'treatmentReviewId'
      or v_source_line->>'treatment' is distinct from v_line->>'treatment' then
      raise exception 'Cash VAT event does not match reviewed invoice evidence.' using errcode='22023';
    end if;
    v_before:=coalesce((select sum((prior.value->>'allocated_amount')::numeric)
      from jsonb_array_elements(v_source->'allocations') prior(value)
      where prior.value->>'document_id'=v_line->>'invoiceId'
        and (prior.value->>'vat_payment_date',prior.value->>'cash_id',prior.value->>'allocation_id')
          < (v_allocation->>'vat_payment_date',v_allocation->>'cash_id',v_allocation->>'allocation_id')),0);
    v_now:=(v_allocation->>'allocated_amount')::numeric;
    v_gross:=(v_allocation->>'document_gross_amount')::numeric;
    v_net:=(v_source_line->>'netGbp')::numeric;
    v_vat:=(v_source_line->>'vatGbp')::numeric;
    if v_now<=0 or v_gross<=0 or v_before<0 or v_before+v_now>v_gross then
      raise exception 'Cash VAT event payment balance is invalid.' using errcode='22023';
    end if;
    v_expected_net:=(case when v_before+v_now=v_gross then v_net
      else trunc(v_net*(v_before+v_now)/v_gross,4) end)
      -trunc(v_net*v_before/v_gross,4);
    v_expected_vat:=(case when v_before+v_now=v_gross then v_vat
      else trunc(v_vat*(v_before+v_now)/v_gross,4) end)
      -trunc(v_vat*v_before/v_gross,4);
    if (v_line->>'netGbp')::numeric is distinct from v_expected_net
      or (v_line->>'vatGbp')::numeric is distinct from v_expected_vat then
      raise exception 'Cash VAT event amount differs from the posted part-payment calculation.' using errcode='22023';
    end if;
    v_count:=v_count+1;
    if v_allocation->>'cash_type'='customer_receipt' then
      v_box6:=v_box6+v_expected_net;
      if v_line->>'treatment'='domestic_sale' then v_box1:=v_box1+v_expected_vat; end if;
    else
      v_box7:=v_box7+v_expected_net;
      if v_line->>'treatment'='domestic_purchase' then v_box4:=v_box4+v_expected_vat; end if;
    end if;
  end loop;
  select count(distinct value->>'allocationId') into v_distinct_allocations
    from jsonb_array_elements(p_preview->'allocationLines');
  for v_allocation in select value from jsonb_array_elements(v_source->'allocations') loop
    if (v_allocation->>'vat_payment_date')::date not between p_start and p_end then continue; end if;
    v_period_allocations:=v_period_allocations+1;
    if v_allocation->>'allocation_status' is distinct from 'allocated'
      or v_allocation->>'document_line_id' is not null
      or v_allocation->>'cash_posting_batch_id' is null
      or v_allocation->>'payment_review_id' is null
      or v_allocation->>'cash_currency_code' is distinct from 'GBP'
      or v_allocation->>'document_currency_code' is distinct from 'GBP'
      or (v_allocation->>'document_exchange_rate')::numeric is distinct from 1
      or v_allocation->>'document_entity_id' is distinct from p_entity::text
      or v_allocation->>'document_posting_status' is distinct from 'posted'
      or v_allocation->>'document_posting_batch_id' is null
      or v_allocation->>'due_within_six_months' is distinct from 'true'
      or (v_allocation->>'vat_payment_date')::date <
        (v_allocation->>'document_date')::date
      or (v_allocation->>'cash_type'='customer_receipt'
        and v_allocation->>'document_type' is distinct from 'sl_invoice')
      or (v_allocation->>'cash_type'='supplier_payment'
        and v_allocation->>'document_type' is distinct from 'pl_invoice')
      or v_allocation->>'cash_type' not in ('customer_receipt','supplier_payment')
      or (v_allocation->>'document_gross_amount')::numeric is distinct from
        (v_allocation->>'document_local_gross_amount')::numeric then
      raise exception 'Cash VAT projection contains an unsupported or unposted invoice source.' using errcode='22023';
    end if;
    select count(*) into v_candidate_lines
      from jsonb_array_elements(p_preview->'allocationLines') candidate(value)
      where candidate.value->>'allocationId'=v_allocation->>'allocation_id';
    select value into v_exclusion
      from jsonb_array_elements(p_preview->'excludedAllocations') excluded(value)
      where excluded.value->>'allocationId'=v_allocation->>'allocation_id';
    if v_exclusion is not null then
      if v_candidate_lines<>0 or v_exclusion->>'cashId' is distinct from v_allocation->>'cash_id'
        or v_exclusion->>'invoiceId' is distinct from v_allocation->>'document_id'
        or v_exclusion->>'paymentDate' is distinct from v_allocation->>'vat_payment_date'
        or (v_exclusion->>'standardAcceptedAt')::timestamptz is distinct from
          (select min((source_line.value->>'standardProductionAcceptedAt')::timestamptz)
           from jsonb_array_elements(v_allocation->'lines') source_line(value))
        or jsonb_array_length(v_allocation->'lines')=0
        or exists(select 1 from jsonb_array_elements(v_allocation->'lines') source_line(value)
          where source_line.value->>'standardVatReconciledAt' is null
            or source_line.value->>'standardProductionAcceptedAt' is null) then
        raise exception 'Excluded payment is not fully accounted on an accepted Standard return.' using errcode='22023';
      end if;
    elsif v_candidate_lines<>jsonb_array_length(v_allocation->'lines')
      or v_candidate_lines=0
      or exists(select 1 from jsonb_array_elements(v_allocation->'lines') source_line(value)
        where source_line.value->>'standardVatReconciledAt' is not null
          or source_line.value->>'standardProductionAcceptedAt' is not null) then
      raise exception 'Every candidate invoice line must appear once and be absent from Standard filings.' using errcode='22023';
    end if;
  end loop;
  if v_distinct_allocations is distinct from (p_preview->>'candidateAllocationCount')::integer
    or v_period_allocations<>v_distinct_allocations+(p_preview->>'excludedAllocationCount')::integer
    or v_period_allocations is distinct from
      (select coalesce(sum((cash.value->>'allocation_count')::integer),0)
       from jsonb_array_elements(v_source->'periodCash') cash(value))
    or v_box1 is distinct from (p_preview->'sourceBoxesGbp'->>'1')::numeric
    or v_box4 is distinct from (p_preview->'sourceBoxesGbp'->>'4')::numeric
    or v_box6 is distinct from (p_preview->'sourceBoxesGbp'->>'6')::numeric
    or v_box7 is distinct from (p_preview->'sourceBoxesGbp'->>'7')::numeric then
    raise exception 'Cash VAT event totals do not match the source lines.' using errcode='22023';
  end if;
  select id into v_existing from public."FIN_IndirectTaxCashEventProjections"
    where legal_entity_id=p_entity and start_date=p_start and end_date=p_end and source_digest=v_digest;
  if found then
    return jsonb_build_object('projectionId',v_existing,'sourceDigest',v_digest,
      'inserted',false,'status','source_projection_only_no_cash_return_effect');
  end if;
  insert into public."FIN_IndirectTaxCashEventProjections"(
    legal_entity_id,start_date,end_date,source_digest,candidate_allocation_count,
    excluded_allocation_count,source_boxes_gbp,excluded_allocations,projected_by)
  values(p_entity,p_start,p_end,v_digest,(p_preview->>'candidateAllocationCount')::integer,
    (p_preview->>'excludedAllocationCount')::integer,
    p_preview->'sourceBoxesGbp',p_preview->'excludedAllocations',p_actor)
  returning id into v_projection;
  insert into public."FIN_IndirectTaxCashEventLines"(
    projection_id,legal_entity_id,cash_id,allocation_id,payment_review_id,
    invoice_id,payment_date,line_id,evidence_id,treatment_review_id,
    treatment_code,net_gbp,vat_gbp)
  select v_projection,p_entity,(line.value->>'cashId')::uuid,(line.value->>'allocationId')::uuid,
    (line.value->>'paymentReviewId')::uuid,(line.value->>'invoiceId')::uuid,
    (line.value->>'paymentDate')::date,(line.value->>'lineId')::uuid,(line.value->>'evidenceId')::uuid,
    (line.value->>'treatmentReviewId')::uuid,line.value->>'treatment',
    (line.value->>'netGbp')::numeric,(line.value->>'vatGbp')::numeric
  from jsonb_array_elements(p_preview->'allocationLines') as line(value);
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_IndirectTaxCashEventProjections','uk_vat_cash_event_projection',v_projection,
    'record_uk_vat_cash_event_projection','Complete reviewed cash source projection',
    'UK VAT cash event projection recorded',jsonb_build_object(
      'startDate',p_start,'endDate',p_end,'sourceDigest',v_digest,
      'eventLineCount',v_count,'candidateAllocationCount',v_distinct_allocations,
      'excludedAllocationCount',(p_preview->>'excludedAllocationCount')::integer));
  return jsonb_build_object('projectionId',v_projection,'sourceDigest',v_digest,
    'inserted',true,'eventLineCount',v_count,
    'status','source_projection_only_no_cash_return_effect');
end; $$;
revoke all on function public.multideck_uk_vat_record_cash_event_projection(
  uuid,uuid,date,date,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_record_cash_event_projection(
  uuid,uuid,date,date,jsonb,jsonb) to service_role;

create function public.multideck_uk_vat_cash_event_projection_history(
  p_actor uuid,p_entity uuid,p_start date,p_end date
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_rows jsonb; v_current_digest text;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  v_current_digest:=encode(sha256(convert_to(
    public.multideck_uk_vat_cash_source_snapshot(p_actor,p_entity,p_start,p_end)::text,'UTF8')),'hex');
  select coalesce(jsonb_agg(to_jsonb(item) order by item.projected_at desc,item.id desc),'[]'::jsonb)
    into v_rows from (
    select projection.id,projection.source_digest,projection.start_date,
      projection.end_date,projection.candidate_allocation_count,
      projection.excluded_allocation_count,projection.source_boxes_gbp,
      projection.excluded_allocations,projection.projected_by,projection.projected_at,
      projection.source_digest=v_current_digest source_current,
      (select coalesce(jsonb_agg(to_jsonb(line) order by line.payment_date,
        line.cash_id,line.allocation_id,line.line_id),'[]'::jsonb)
       from public."FIN_IndirectTaxCashEventLines" line
       where line.projection_id=projection.id and line.legal_entity_id=p_entity) event_lines
    from public."FIN_IndirectTaxCashEventProjections" projection
    where projection.legal_entity_id=p_entity and projection.start_date=p_start
      and projection.end_date=p_end
    order by projection.projected_at desc,projection.id desc limit 20
  ) item;
  return jsonb_build_object('legalEntityId',p_entity,'startDate',p_start,
    'endDate',p_end,'currentSourceDigest',v_current_digest,'items',v_rows,
    'status','source_projection_history_only');
end; $$;
revoke all on function public.multideck_uk_vat_cash_event_projection_history(
  uuid,uuid,date,date) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_event_projection_history(
  uuid,uuid,date,date) to service_role;

commit;
