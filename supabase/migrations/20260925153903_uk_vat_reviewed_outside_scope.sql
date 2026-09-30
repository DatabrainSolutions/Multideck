begin;

-- Explicit, approved outside-scope rules must remain in the source audit even
-- though they contribute no amounts to the return. Never infer exclusion from
-- a zero rate, a code name, or a missing VAT rule.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.multideck_uk_vat_review_evidence(uuid,uuid,date,text)'::regprocedure) into definition;
  if position('and "FINTax_CountryCode"=''GB'' and "FINTax_TaxTypeCode"=''vat''' in definition)=0 then
    raise exception 'Unexpected VAT review definition';
  end if;
  definition:=replace(definition,
    'and "FINTax_CountryCode"=''GB'' and "FINTax_TaxTypeCode"=''vat''',
    'and "FINTax_CountryCode"=''GB'' and ("FINTax_TaxTypeCode"=''vat'' or
      ("FINTax_TaxTypeCode"=''none'' and "FINTax_TreatmentCategoryCode"=''out_of_scope''))');
  definition:=replace(definition,
    'if v_document."FINDoc_TypeCode" in (''sl_invoice'',''credit_note'') then',
    'if v_tax."FINTax_TreatmentCategoryCode"=''out_of_scope'' then
    v_treatment:=''outside_scope'';
  elsif v_document."FINDoc_TypeCode" in (''sl_invoice'',''credit_note'') then');
  definition:=replace(definition,
    'v_treatment in (''zero_rated_sale''',
    'v_treatment in (''outside_scope'',''zero_rated_sale''');
  execute definition;

  select pg_get_functiondef('public._multideck_uk_vat_calculate_core(uuid,uuid,boolean)'::regprocedure) into definition;
  if position('if v_row.treatment_code=''domestic_sale'' then' in definition)=0 then
    raise exception 'Unexpected Standard VAT calculation definition';
  end if;
  definition:=replace(definition,
    'if v_row.treatment_code=''domestic_sale'' then',
    'if v_row.treatment_code=''outside_scope'' then
      if v_row.signed_tax_amount<>0 or v_row.signed_tax_reporting<>0
        or v_row.rule_snapshot->>''category'' is distinct from ''out_of_scope''
        or (v_row.rule_snapshot->>''ratePercent'')::numeric is distinct from 0 then
        raise exception ''Outside-scope evidence must have an approved zero-tax exclusion rule.'' using errcode=''22023'';
      end if;
      -- A zero contribution retains the reviewed source in calculation detail,
      -- reconciliation and locking without adding its net amount to any box.
      v_entries:=v_entries||jsonb_build_array(jsonb_build_object(
        ''evidence'',v_row.id,''decision'',v_row.decision_id,''box'',6,''amount'',0));
    elsif v_row.treatment_code=''domestic_sale'' then');
  execute definition;
end $migration$;

commit;
