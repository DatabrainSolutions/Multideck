begin;

-- A complete, source-checked nine-box candidate for the Cash Accounting
-- projection. It has no VAT period, review lock or HMRC filing authority yet.
create function public.multideck_uk_vat_cash_nine_box_preview(
  p_actor uuid,p_entity uuid,p_projection uuid
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_projection public."FIN_IndirectTaxCashEventProjections"%rowtype;
  v_integrity jsonb; v_row record; v_box smallint; v_amount numeric;
  v_source numeric[]:=array_fill(0::numeric,array[9]);
  v_lines jsonb:=jsonb_build_object('1','[]'::jsonb,'2','[]'::jsonb,
    '3','[]'::jsonb,'4','[]'::jsonb,'5','[]'::jsonb,'6','[]'::jsonb,
    '7','[]'::jsonb,'8','[]'::jsonb,'9','[]'::jsonb);
  v_entry jsonb; v_filed jsonb; v_source_boxes jsonb;
  v_filed_box1 numeric; v_filed_box4 numeric; v_count integer:=0;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  select * into v_projection from public."FIN_IndirectTaxCashEventProjections"
    where id=p_projection and legal_entity_id=p_entity;
  if not found then
    raise exception 'The Cash Accounting projection is unavailable for this legal entity.' using errcode='42501';
  end if;
  v_integrity:=public.multideck_uk_vat_cash_projection_integrity(
    p_actor,p_entity,p_projection);
  if v_integrity->>'status' is distinct from 'current_verified_source_only'
    or v_integrity->>'projectionId' is distinct from p_projection::text
    or v_integrity->>'startDate' is distinct from v_projection.start_date::text
    or v_integrity->>'endDate' is distinct from v_projection.end_date::text then
    raise exception 'The Cash Accounting event projection is not current.' using errcode='22023';
  end if;
  for v_row in
    select event.*,cash."FINCash_TypeCode" cash_type
    from public."FIN_IndirectTaxCashEventLines" event
    join public."FIN_CashTransactions" cash
      on cash."FINCash_ID"=event.cash_id
      and cash."FINCash_LegalEntityID"=p_entity
      and cash."FINCash_NativePostingStatusCode"='posted'
    where event.projection_id=p_projection and event.legal_entity_id=p_entity
    order by event.payment_date,event.cash_id,event.allocation_id,event.line_id
  loop
    v_count:=v_count+1;
    if v_row.payment_date not between v_projection.start_date and v_projection.end_date then
      raise exception 'A Cash Accounting event is outside the projected dates.' using errcode='22023';
    end if;
    v_entry:=jsonb_build_object('eventId',v_row.id,
      'cashId',v_row.cash_id,'allocationId',v_row.allocation_id,
      'invoiceId',v_row.invoice_id,'invoiceLineId',v_row.line_id,
      'paymentDate',v_row.payment_date,'evidenceId',v_row.evidence_id,
      'paymentReviewId',v_row.payment_review_id,
      'treatmentReviewId',v_row.treatment_review_id);
    if v_row.cash_type='customer_receipt'
      and v_row.treatment_code in ('domestic_sale','zero_rated_sale','exempt_sale')
      and (v_row.treatment_code='domestic_sale' or v_row.vat_gbp=0) then
      v_box:=6; v_amount:=v_row.net_gbp;
      v_source[v_box]:=v_source[v_box]+v_amount;
      v_lines:=jsonb_set(v_lines,array[v_box::text],
        (v_lines->(v_box::text))||jsonb_build_array(v_entry||jsonb_build_object(
          'box',v_box,'amountGbp',v_amount)));
      if v_row.treatment_code='domestic_sale' then
        v_box:=1; v_amount:=v_row.vat_gbp;
        v_source[v_box]:=v_source[v_box]+v_amount;
        v_lines:=jsonb_set(v_lines,array[v_box::text],
          (v_lines->(v_box::text))||jsonb_build_array(v_entry||jsonb_build_object(
            'box',v_box,'amountGbp',v_amount)));
      end if;
    elsif v_row.cash_type='supplier_payment'
      and v_row.treatment_code in ('domestic_purchase','nonrecoverable_purchase',
        'zero_rated_purchase','exempt_purchase')
      and (v_row.treatment_code='domestic_purchase'
        or v_row.treatment_code='nonrecoverable_purchase'
        or v_row.vat_gbp=0) then
      v_box:=7; v_amount:=v_row.net_gbp;
      v_source[v_box]:=v_source[v_box]+v_amount;
      v_lines:=jsonb_set(v_lines,array[v_box::text],
        (v_lines->(v_box::text))||jsonb_build_array(v_entry||jsonb_build_object(
          'box',v_box,'amountGbp',v_amount)));
      if v_row.treatment_code='domestic_purchase' then
        v_box:=4; v_amount:=v_row.vat_gbp;
        v_source[v_box]:=v_source[v_box]+v_amount;
        v_lines:=jsonb_set(v_lines,array[v_box::text],
          (v_lines->(v_box::text))||jsonb_build_array(v_entry||jsonb_build_object(
            'box',v_box,'amountGbp',v_amount)));
      end if;
    else
      raise exception 'A Cash Accounting event has no reviewed nine-box treatment.' using errcode='22023';
    end if;
  end loop;
  if v_count is distinct from (v_integrity->>'eventLineCount')::integer
    or v_source[1] is distinct from (v_integrity#>>'{sourceBoxesGbp,1}')::numeric
    or v_source[4] is distinct from (v_integrity#>>'{sourceBoxesGbp,4}')::numeric
    or v_source[6] is distinct from (v_integrity#>>'{sourceBoxesGbp,6}')::numeric
    or v_source[7] is distinct from (v_integrity#>>'{sourceBoxesGbp,7}')::numeric then
    raise exception 'The Cash Accounting nine-box lines do not match their verified projection.' using errcode='22023';
  end if;
  v_source[3]:=v_source[1]+v_source[2];
  v_source[5]:=abs(v_source[3]-v_source[4]);
  v_source_boxes:=jsonb_build_object('1',v_source[1],'2',v_source[2],
    '3',v_source[3],'4',v_source[4],'5',v_source[5],
    '6',v_source[6],'7',v_source[7],'8',v_source[8],'9',v_source[9]);
  v_filed_box1:=round(v_source[1],2);
  v_filed_box4:=round(v_source[4],2);
  v_filed:=jsonb_build_object('1',v_filed_box1,'2',0,
    '3',v_filed_box1,'4',v_filed_box4,
    '5',abs(v_filed_box1-v_filed_box4),
    '6',round(v_source[6],0),'7',round(v_source[7],0),
    '8',round(v_source[8],0),'9',round(v_source[9],0));
  return jsonb_build_object('projectionId',p_projection,
    'legalEntityId',p_entity,'startDate',v_projection.start_date,
    'endDate',v_projection.end_date,'sourceDigest',v_projection.source_digest,
    'sourceFingerprint',v_integrity->>'fingerprint',
    'sourceBoxesGbp',v_source_boxes,'candidateFilingBoxes',v_filed,
    'boxLines',v_lines,
    'eventLineCount',v_integrity->'eventLineCount',
    'candidateAllocationCount',v_integrity->'candidateAllocationCount',
    'excludedAllocationCount',v_integrity->'excludedAllocationCount',
    'excludedAllocations',v_projection.excluded_allocations,
    'status','preview_only_no_cash_return_effect');
end; $$;
revoke all on function public.multideck_uk_vat_cash_nine_box_preview(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_nine_box_preview(uuid,uuid,uuid)
  to service_role;

commit;
