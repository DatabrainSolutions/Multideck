begin;

-- PostgreSQL numeric(18,4) is exact, but a JSON number is rounded by a
-- JavaScript consumer. Convert every monetary source amount to a decimal
-- string before the operator preview or exact-decimal arithmetic sees it.
alter function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  rename to _multideck_uk_vat_cash_exit_invoice_inventory_before_decimal_strings;
revoke all on function public._multideck_uk_vat_cash_exit_invoice_inventory_before_decimal_strings(
  uuid,uuid,date,date) from public,anon,authenticated,service_role;

create function public.multideck_uk_vat_cash_exit_invoice_inventory(
  p_actor uuid,p_entity uuid,p_start date,p_exit date
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_inventory jsonb; v_invoices jsonb; v_changes jsonb; v_cash jsonb;
begin
  -- The prior snapshot validates actor, entity and complete bounded sources.
  v_inventory:=public._multideck_uk_vat_cash_exit_invoice_inventory_before_decimal_strings(
    p_actor,p_entity,p_start,p_exit);
  if v_inventory->>'truncated'='true' then
    return v_inventory||jsonb_build_object('amountEncoding','decimal_strings');
  end if;
  select coalesce(jsonb_agg(invoice.value||jsonb_build_object(
      'exchange_rate',invoice.value->>'exchange_rate',
      'gross_amount',invoice.value->>'gross_amount',
      'local_gross_amount',invoice.value->>'local_gross_amount',
      'paid_through_exit',invoice.value->>'paid_through_exit',
      'candidate_outstanding',invoice.value->>'candidate_outstanding',
      'allocation_sources',coalesce((select jsonb_agg(allocation.value||jsonb_build_object(
        'allocatedAmount',allocation.value->>'allocatedAmount') order by allocation.ordinality)
        from jsonb_array_elements(invoice.value->'allocation_sources')
          with ordinality allocation(value,ordinality)),'[]'::jsonb),
      'lines',coalesce((select jsonb_agg(line.value||jsonb_build_object(
        'netGbp',line.value->>'netGbp',
        'vatGbp',line.value->>'vatGbp',
        'grossGbp',line.value->>'grossGbp',
        'evidenceNetGbp',line.value->>'evidenceNetGbp',
        'evidenceVatGbp',line.value->>'evidenceVatGbp') order by line.ordinality)
        from jsonb_array_elements(invoice.value->'lines')
          with ordinality line(value,ordinality)),'[]'::jsonb))
      order by invoice.ordinality),'[]'::jsonb)
    into v_invoices
  from jsonb_array_elements(v_inventory->'invoices') with ordinality invoice(value,ordinality);
  select coalesce(jsonb_agg(change.value||jsonb_build_object(
      'gross_amount',change.value->>'gross_amount',
      'local_gross_amount',change.value->>'local_gross_amount')
      order by change.ordinality),'[]'::jsonb)
    into v_changes
  from jsonb_array_elements(v_inventory->'priceChanges') with ordinality change(value,ordinality);
  select coalesce(jsonb_agg(source.value||jsonb_build_object(
      'exchange_rate',source.value->>'exchange_rate',
      'cash_amount',source.value->>'cash_amount',
      'local_amount',source.value->>'local_amount',
      'unallocated_amount',source.value->>'unallocated_amount',
      'represented_amount',source.value->>'represented_amount',
      'allocation_sources',coalesce((select jsonb_agg(allocation.value||jsonb_build_object(
        'allocatedAmount',allocation.value->>'allocatedAmount') order by allocation.ordinality)
        from jsonb_array_elements(source.value->'allocation_sources')
          with ordinality allocation(value,ordinality)),'[]'::jsonb))
      order by source.ordinality),'[]'::jsonb)
    into v_cash
  from jsonb_array_elements(v_inventory->'cashSources') with ordinality source(value,ordinality);
  return v_inventory||jsonb_build_object(
    'amountEncoding','decimal_strings',
    'invoices',v_invoices,'priceChanges',v_changes,'cashSources',v_cash,
    'sourceDigest',encode(sha256(convert_to(jsonb_build_object(
      'priorSourceDigest',v_inventory->>'sourceDigest',
      'amountEncoding','decimal_strings',
      'invoices',v_invoices,'priceChanges',v_changes,'cashSources',v_cash)::text,
      'UTF8')),'hex'));
end; $$;
revoke all on function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  to service_role;

commit;
