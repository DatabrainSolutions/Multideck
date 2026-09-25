begin;

-- Bind every Cash calculation line to the single projection captured by its
-- immutable calculation. A matching date range alone is not sufficient.
create or replace function public._multideck_uk_vat_cash_calculation_event_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_calculation public."FIN_IndirectTaxCalculations"%rowtype;
  v_event public."FIN_IndirectTaxCashEventLines"%rowtype;
  v_projection public."FIN_IndirectTaxCashEventProjections"%rowtype;
  v_cash_type text; v_expected numeric(18,4);
begin
  select * into v_period from public."FIN_IndirectTaxPeriods" where id=new.period_id;
  select * into v_calculation from public."FIN_IndirectTaxCalculations"
    where id=new.calculation_id and period_id=new.period_id;
  select * into v_event from public."FIN_IndirectTaxCashEventLines" where id=new.event_line_id;
  if v_period.id is null or v_calculation.id is null or v_event.id is null
    or v_period.jurisdiction_code<>'GB' or v_period.scheme_code<>'cash'
    or v_period.reporting_currency<>'GBP' or v_period.status<>'draft'
    or v_calculation.calculation_version<>'uk-cash-v1'
    or v_calculation.control_reconciliation->>'cashProjectionId'
      is distinct from v_event.projection_id::text
    or v_event.legal_entity_id<>v_period.legal_entity_id
    or v_event.payment_date not between v_period.start_date and v_period.end_date then
    raise exception 'A matching draft Cash calculation and payment event are required.' using errcode='22023';
  end if;
  select * into v_projection from public."FIN_IndirectTaxCashEventProjections"
    where id=v_event.projection_id;
  if v_projection.id is null or v_projection.legal_entity_id<>v_period.legal_entity_id
    or v_projection.start_date<>v_period.start_date
    or v_projection.end_date<>v_period.end_date then
    raise exception 'The payment event projection must match the exact Cash VAT period.' using errcode='22023';
  end if;
  select "FINCash_TypeCode" into v_cash_type from public."FIN_CashTransactions"
    where "FINCash_ID"=v_event.cash_id
      and "FINCash_LegalEntityID"=v_period.legal_entity_id
      and "FINCash_NativePostingStatusCode"='posted';
  v_expected:=case
    when v_cash_type='customer_receipt' and new.box_number=6
      and v_event.treatment_code in ('domestic_sale','zero_rated_sale','exempt_sale')
      then v_event.net_gbp
    when v_cash_type='customer_receipt' and new.box_number=1
      and v_event.treatment_code='domestic_sale' then v_event.vat_gbp
    when v_cash_type='supplier_payment' and new.box_number=7
      and v_event.treatment_code in ('domestic_purchase','nonrecoverable_purchase',
        'zero_rated_purchase','exempt_purchase') then v_event.net_gbp
    when v_cash_type='supplier_payment' and new.box_number=4
      and v_event.treatment_code='domestic_purchase' then v_event.vat_gbp
    else null end;
  if v_expected is null or new.signed_amount<>v_expected then
    raise exception 'Cash VAT box line does not match its reviewed payment event.' using errcode='22023';
  end if;
  return new;
end; $$;

-- Draft only. The VAT-control bridge, per-event reconciliation lock, prior
-- accepted Cash-return coverage and HMRC lifecycle remain separate gates.
create function public.multideck_uk_vat_calculate_cash_draft(
  p_actor uuid,p_period uuid,p_projection uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_registration public."FIN_LegalEntityComplianceRegistrations"%rowtype;
  v_projection public."FIN_IndirectTaxCashEventProjections"%rowtype;
  v_preview jsonb; v_boxes jsonb; v_control jsonb; v_registration_snapshot jsonb;
  v_source_digest text; v_revision integer; v_calculation uuid;
  v_source jsonb; v_entry jsonb; v_box text; v_count integer:=0;
  v_legal_currency text; v_legal_country text;
begin
  select * into v_period from public."FIN_IndirectTaxPeriods" where id=p_period for update;
  if not found then raise exception 'UK Cash VAT period was not found.' using errcode='P0002'; end if;
  perform public._multideck_uk_vat_access(p_actor,v_period.legal_entity_id);
  perform pg_advisory_xact_lock(hashtextextended('uk-vat:'||v_period.legal_entity_id::text,0));
  if v_period.jurisdiction_code<>'GB' or v_period.scheme_code<>'cash'
    or v_period.reporting_currency<>'GBP' or v_period.status<>'draft' then
    raise exception 'A draft UK Cash VAT period is required.' using errcode='22023';
  end if;
  select upper("LegalEntity_BaseCurrencyCodeSnapshot"),"LegalEntity_CountryCode"
    into v_legal_currency,v_legal_country from public."cmp_LegalEntities"
    where "LegalEntity_ID"=v_period.legal_entity_id and "LegalEntity_IsActive";
  if v_legal_currency is distinct from 'GBP' or v_legal_country is distinct from 'GB' then
    raise exception 'Cash VAT calculation requires an active GB/GBP legal entity.' using errcode='22023';
  end if;
  select * into v_registration from public."FIN_LegalEntityComplianceRegistrations"
    where "FINComplianceReg_ID"=v_period.registration_id
      and "FINComplianceReg_LegalEntityID"=v_period.legal_entity_id
      and "FINComplianceReg_ObligationID"=v_period.obligation_id;
  if not found or v_registration."FINComplianceReg_StatusCode" not in
      ('configured','sandbox_verified','production_verified')
    or v_registration."FINComplianceReg_SettingsJSON"->>'schemeCode' is distinct from 'cash'
    or v_registration."FINComplianceReg_FilingMethodCode" is distinct from 'mtd_api'
    or not coalesce(v_registration."FINComplianceReg_RegistrationReference" ~ '^[0-9]{9}$',false)
    or v_registration."FINComplianceReg_EffectiveFrom">v_period.start_date
    or (v_registration."FINComplianceReg_EffectiveTo" is not null
      and v_registration."FINComplianceReg_EffectiveTo"<v_period.end_date) then
    raise exception 'One reviewed Cash registration must cover this VAT period.' using errcode='22023';
  end if;
  select * into v_projection from public."FIN_IndirectTaxCashEventProjections"
    where id=p_projection and legal_entity_id=v_period.legal_entity_id
      and start_date=v_period.start_date and end_date=v_period.end_date;
  if not found then
    raise exception 'The Cash event projection must cover this exact period.' using errcode='22023';
  end if;
  v_preview:=public.multideck_uk_vat_cash_nine_box_preview(
    p_actor,v_period.legal_entity_id,p_projection);
  if v_preview->>'status' is distinct from 'preview_only_no_cash_return_effect'
    or v_preview->>'projectionId' is distinct from p_projection::text
    or v_preview->>'legalEntityId' is distinct from v_period.legal_entity_id::text
    or v_preview->>'startDate' is distinct from v_period.start_date::text
    or v_preview->>'endDate' is distinct from v_period.end_date::text
    or v_preview->>'sourceDigest' is distinct from v_projection.source_digest
    or coalesce(v_preview->>'sourceFingerprint','') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(v_preview->'boxLines') is distinct from 'object'
    or jsonb_typeof(v_preview->'sourceBoxesGbp') is distinct from 'object' then
    raise exception 'The Cash nine-box source is not a current verified projection.' using errcode='22023';
  end if;
  v_source:=v_preview->'sourceBoxesGbp';
  v_boxes:=jsonb_build_object(
    '1',round((v_source->>'1')::numeric,2),'2',0,
    '3',round((v_source->>'1')::numeric,2),
    '4',round((v_source->>'4')::numeric,2),
    '5',abs(round((v_source->>'1')::numeric,2)-round((v_source->>'4')::numeric,2)),
    '6',round((v_source->>'6')::numeric,2),
    '7',round((v_source->>'7')::numeric,2),'8',0,'9',0);
  v_registration_snapshot:=jsonb_build_object(
    'registrationId',v_registration."FINComplianceReg_ID",
    'vrn',v_registration."FINComplianceReg_RegistrationReference",
    'status',v_registration."FINComplianceReg_StatusCode",
    'scheme','cash','effectiveFrom',v_registration."FINComplianceReg_EffectiveFrom",
    'effectiveTo',v_registration."FINComplianceReg_EffectiveTo",
    'updatedAt',to_char(v_registration."FINComplianceReg_UpdatedAt" at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  v_control:=jsonb_build_object('status','unreconciled',
    'reason','Cash VAT control bridge, event reconciliation and prior accepted returns require review',
    'cashProjectionId',p_projection,
    'cashProjectionFingerprint',v_preview->>'sourceFingerprint',
    'sourceBoxesGbp',v_source,
    'eventLineCount',v_preview->'eventLineCount',
    'excludedAllocationCount',v_preview->'excludedAllocationCount');
  v_source_digest:=encode(sha256(convert_to(jsonb_build_object(
    'version','uk-cash-v1','periodId',p_period,
    'registration',v_registration_snapshot,
    'projectionId',p_projection,
    'projectionFingerprint',v_preview->>'sourceFingerprint',
    'sourceBoxes',v_source,'boxes',v_boxes)::text,'UTF8')),'hex');
  select coalesce(max(revision),0)+1 into v_revision
    from public."FIN_IndirectTaxCalculations" where period_id=p_period;
  insert into public."FIN_IndirectTaxCalculations"(
    period_id,revision,calculation_version,source_digest,registration_snapshot,
    box_totals,exceptions,control_reconciliation,calculated_by
  ) values (p_period,v_revision,'uk-cash-v1',v_source_digest,
    v_registration_snapshot,v_boxes,'[]'::jsonb,v_control,p_actor)
  returning id into v_calculation;
  for v_box in select unnest(array['1','4','6','7']) loop
    if jsonb_typeof(v_preview->'boxLines'->v_box) is distinct from 'array' then
      raise exception 'Cash box lines are incomplete.' using errcode='22023';
    end if;
    for v_entry in select value from jsonb_array_elements(v_preview->'boxLines'->v_box) loop
      if v_entry->>'box' is distinct from v_box then
        raise exception 'Cash event has a mismatched box.' using errcode='22023';
      end if;
      insert into public."FIN_IndirectTaxCashCalculationEventLines"(
        calculation_id,period_id,event_line_id,box_number,signed_amount
      ) values (v_calculation,p_period,(v_entry->>'eventId')::uuid,
        v_box::smallint,(v_entry->>'amountGbp')::numeric);
      v_count:=v_count+1;
    end loop;
  end loop;
  if v_count=0 and (v_preview->>'eventLineCount')::integer<>0 then
    raise exception 'Cash event lines did not attach to the calculation.' using errcode='22023';
  end if;
  return jsonb_build_object('calculationId',v_calculation,'revision',v_revision,
    'periodId',p_period,'sourceDigest',v_source_digest,'boxes',v_boxes,
    'cashProjectionId',p_projection,'eventBoxLineCount',v_count,
    'controlStatus','unreconciled','approvalAvailable',false,
    'status','cash_draft_only');
end; $$;
revoke all on function public.multideck_uk_vat_calculate_cash_draft(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_calculate_cash_draft(uuid,uuid,uuid)
  to service_role;

commit;
