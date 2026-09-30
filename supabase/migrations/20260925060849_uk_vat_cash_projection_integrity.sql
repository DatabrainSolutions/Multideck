begin;

-- The recorded projection is an input to a future Cash Accounting calculation,
-- never a return in its own right. Revalidate it against the current source
-- before any later calculator trusts the stored event amounts.
create function public.multideck_uk_vat_cash_projection_integrity(
  p_actor uuid,p_entity uuid,p_projection uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_projection public."FIN_IndirectTaxCashEventProjections"%rowtype;
  v_event public."FIN_IndirectTaxCashEventLines"%rowtype;
  v_source jsonb; v_allocation jsonb; v_source_line jsonb; v_exclusion jsonb;
  v_source_digest text; v_fingerprint text; v_lines jsonb;
  v_before numeric; v_now numeric; v_gross numeric;
  v_expected_net numeric; v_expected_vat numeric;
  v_box1 numeric:=0; v_box4 numeric:=0; v_box6 numeric:=0; v_box7 numeric:=0;
  v_count integer:=0; v_candidates integer:=0; v_excluded integer:=0;
  v_allocation_lines integer; v_payment_date date;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  select * into v_projection from public."FIN_IndirectTaxCashEventProjections"
    where id=p_projection and legal_entity_id=p_entity;
  if not found then
    raise exception 'The Cash Accounting projection is unavailable for this legal entity.' using errcode='42501';
  end if;
  v_source:=public.multideck_uk_vat_cash_source_snapshot(
    p_actor,p_entity,v_projection.start_date,v_projection.end_date);
  v_source_digest:=encode(sha256(convert_to(v_source::text,'UTF8')),'hex');
  if v_source_digest is distinct from v_projection.source_digest
    or v_source->>'truncated' is distinct from 'false'
    or (v_source->>'unreviewedPostedCash')::integer is distinct from 0 then
    raise exception 'The Cash Accounting projection is stale or its source is incomplete.' using errcode='22023';
  end if;
  for v_allocation in select value from jsonb_array_elements(v_source->'allocations') loop
    v_payment_date:=(v_allocation->>'vat_payment_date')::date;
    if v_payment_date not between v_projection.start_date and v_projection.end_date then continue; end if;
    v_exclusion:=null;
    select value into v_exclusion from jsonb_array_elements(v_projection.excluded_allocations)
      where value->>'allocationId'=v_allocation->>'allocation_id';
    select count(*) into v_allocation_lines
      from public."FIN_IndirectTaxCashEventLines"
      where projection_id=v_projection.id and allocation_id=(v_allocation->>'allocation_id')::uuid;
    if v_exclusion is not null then
      v_excluded:=v_excluded+1;
      if v_allocation_lines<>0
        or v_exclusion->>'cashId' is distinct from v_allocation->>'cash_id'
        or v_exclusion->>'invoiceId' is distinct from v_allocation->>'document_id'
        or v_exclusion->>'paymentDate' is distinct from v_allocation->>'vat_payment_date'
        or jsonb_array_length(v_allocation->'lines')=0
        or exists(select 1 from jsonb_array_elements(v_allocation->'lines') line(value)
          where line.value->>'standardVatReconciledAt' is null
            or line.value->>'standardProductionAcceptedAt' is null) then
        raise exception 'An excluded cash payment no longer matches an accepted Standard return.' using errcode='22023';
      end if;
      continue;
    end if;
    v_candidates:=v_candidates+1;
    if v_allocation_lines=0
      or v_allocation_lines<>jsonb_array_length(v_allocation->'lines') then
      raise exception 'A Cash Accounting allocation has missing or extra event lines.' using errcode='22023';
    end if;
    v_before:=coalesce((select sum((prior.value->>'allocated_amount')::numeric)
      from jsonb_array_elements(v_source->'allocations') prior(value)
      where prior.value->>'document_id'=v_allocation->>'document_id'
        and (prior.value->>'vat_payment_date',prior.value->>'cash_id',prior.value->>'allocation_id')
          < (v_allocation->>'vat_payment_date',v_allocation->>'cash_id',v_allocation->>'allocation_id')),0);
    v_now:=(v_allocation->>'allocated_amount')::numeric;
    v_gross:=(v_allocation->>'document_gross_amount')::numeric;
    if v_now<=0 or v_gross<=0 or v_before<0 or v_before+v_now>v_gross then
      raise exception 'A Cash Accounting part-payment balance changed.' using errcode='22023';
    end if;
    for v_source_line in select value from jsonb_array_elements(v_allocation->'lines') loop
      select * into v_event from public."FIN_IndirectTaxCashEventLines"
        where projection_id=v_projection.id
          and allocation_id=(v_allocation->>'allocation_id')::uuid
          and line_id=(v_source_line->>'lineId')::uuid;
      if not found or v_event.legal_entity_id is distinct from p_entity
        or v_event.cash_id::text is distinct from v_allocation->>'cash_id'
        or v_event.payment_review_id::text is distinct from v_allocation->>'payment_review_id'
        or v_event.invoice_id::text is distinct from v_allocation->>'document_id'
        or v_event.payment_date is distinct from v_payment_date
        or v_event.evidence_id::text is distinct from v_source_line->>'evidenceId'
        or v_event.treatment_review_id::text is distinct from v_source_line->>'reviewId'
        or v_event.treatment_code is distinct from v_source_line->>'treatment' then
        raise exception 'A Cash Accounting event no longer matches its reviewed source.' using errcode='22023';
      end if;
      v_expected_net:=(case when v_before+v_now=v_gross then (v_source_line->>'netGbp')::numeric
        else trunc((v_source_line->>'netGbp')::numeric*(v_before+v_now)/v_gross,4) end)
        -trunc((v_source_line->>'netGbp')::numeric*v_before/v_gross,4);
      v_expected_vat:=(case when v_before+v_now=v_gross then (v_source_line->>'vatGbp')::numeric
        else trunc((v_source_line->>'vatGbp')::numeric*(v_before+v_now)/v_gross,4) end)
        -trunc((v_source_line->>'vatGbp')::numeric*v_before/v_gross,4);
      if v_event.net_gbp is distinct from v_expected_net
        or v_event.vat_gbp is distinct from v_expected_vat then
        raise exception 'A Cash Accounting event amount no longer matches its part payment.' using errcode='22023';
      end if;
      v_count:=v_count+1;
      if v_allocation->>'cash_type'='customer_receipt' then
        v_box6:=v_box6+v_expected_net;
        if v_event.treatment_code='domestic_sale' then v_box1:=v_box1+v_expected_vat; end if;
      elsif v_allocation->>'cash_type'='supplier_payment' then
        v_box7:=v_box7+v_expected_net;
        if v_event.treatment_code='domestic_purchase' then v_box4:=v_box4+v_expected_vat; end if;
      else
        raise exception 'Cash Accounting event has an unsupported payment type.' using errcode='22023';
      end if;
    end loop;
  end loop;
  if (select count(*) from public."FIN_IndirectTaxCashEventLines"
      where projection_id=v_projection.id)<>v_count
    or v_candidates is distinct from v_projection.candidate_allocation_count
    or v_excluded is distinct from v_projection.excluded_allocation_count
    or jsonb_array_length(v_projection.excluded_allocations)<>v_excluded
    or v_box1 is distinct from (v_projection.source_boxes_gbp->>'1')::numeric
    or v_box4 is distinct from (v_projection.source_boxes_gbp->>'4')::numeric
    or v_box6 is distinct from (v_projection.source_boxes_gbp->>'6')::numeric
    or v_box7 is distinct from (v_projection.source_boxes_gbp->>'7')::numeric then
    raise exception 'Cash Accounting event coverage or nine-box source totals changed.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(line) order by line.payment_date,line.cash_id,
    line.allocation_id,line.line_id),'[]'::jsonb) into v_lines
    from public."FIN_IndirectTaxCashEventLines" line
    where line.projection_id=v_projection.id;
  v_fingerprint:=encode(sha256(convert_to(jsonb_build_object(
    'projection',v_projection.id,'sourceDigest',v_source_digest,
    'eventLines',v_lines,'excludedAllocations',v_projection.excluded_allocations,
    'sourceBoxes',v_projection.source_boxes_gbp)::text,'UTF8')),'hex');
  return jsonb_build_object('projectionId',v_projection.id,'startDate',v_projection.start_date,
    'endDate',v_projection.end_date,'sourceDigest',v_source_digest,
    'fingerprint',v_fingerprint,'eventLineCount',v_count,
    'candidateAllocationCount',v_candidates,'excludedAllocationCount',v_excluded,
    'sourceBoxesGbp',v_projection.source_boxes_gbp,
    'status','current_verified_source_only');
end; $$;
revoke all on function public.multideck_uk_vat_cash_projection_integrity(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_projection_integrity(uuid,uuid,uuid)
  to service_role;

commit;
