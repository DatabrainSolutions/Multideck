begin;

-- A Cash-labelled decision is insufficient if its actual treatment cannot be
-- apportioned under the supported UK Cash rules, or its reviewed tax point is
-- outside the recorded Cash term. Keep the source, but make it an issue.
alter function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  rename to _multideck_uk_vat_cash_exit_invoice_inventory_before_treatments;
revoke all on function public._multideck_uk_vat_cash_exit_invoice_inventory_before_treatments(
  uuid,uuid,date,date) from public,anon,authenticated,service_role;

create function public.multideck_uk_vat_cash_exit_invoice_inventory(
  p_actor uuid,p_entity uuid,p_start date,p_exit date
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_inventory jsonb; v_invoices jsonb; v_issue_count integer;
begin
  v_inventory:=public._multideck_uk_vat_cash_exit_invoice_inventory_before_treatments(
    p_actor,p_entity,p_start,p_exit);
  if v_inventory->>'truncated'='true' then
    return v_inventory||jsonb_build_object('lineTreatmentIssueCount',null);
  end if;
  select coalesce(jsonb_agg(invoice.value||jsonb_build_object(
      'lines',coalesce(source.lines,'[]'::jsonb),
      'lineTreatmentIssueCount',coalesce(source.issue_count,0),
      'lineSourceIssueCount',(invoice.value->>'lineSourceIssueCount')::integer
        +coalesce(source.issue_count,0)) order by invoice.ordinality),'[]'::jsonb),
    coalesce(sum(source.issue_count),0)::integer
    into v_invoices,v_issue_count
  from jsonb_array_elements(v_inventory->'invoices') with ordinality invoice(value,ordinality)
  left join lateral (
    select coalesce(jsonb_agg(line.value||jsonb_build_object(
        'taxPoint',decision.tax_point,
        'taxPointInCashTerm',coalesce(decision.tax_point between p_start and p_exit,false),
        'supportedCashTreatment',coalesce(case invoice.value->>'document_type'
          when 'sl_invoice' then decision.treatment_code in
            ('domestic_sale','zero_rated_sale','exempt_sale')
          when 'pl_invoice' then decision.treatment_code in
            ('domestic_purchase','nonrecoverable_purchase',
              'zero_rated_purchase','exempt_purchase')
          else false end,false)) order by line.ordinality),'[]'::jsonb) lines,
      count(*) filter (where line.value->>'decisionId' is not null and
        (decision.id is null or decision.tax_point is null
          or decision.tax_point not between p_start and p_exit
          or not coalesce(case invoice.value->>'document_type'
            when 'sl_invoice' then decision.treatment_code in
              ('domestic_sale','zero_rated_sale','exempt_sale')
            when 'pl_invoice' then decision.treatment_code in
              ('domestic_purchase','nonrecoverable_purchase',
                'zero_rated_purchase','exempt_purchase')
            else false end,false)))::integer issue_count
    from jsonb_array_elements(invoice.value->'lines') with ordinality line(value,ordinality)
    left join public."FIN_IndirectTaxDecisions" decision
      on decision.id=(line.value->>'decisionId')::uuid
      and decision.evidence_id=(line.value->>'evidenceId')::uuid
  ) source on true;
  return v_inventory||jsonb_build_object(
    'invoices',v_invoices,
    'lineTreatmentIssueCount',v_issue_count,
    'lineSourceIssueCount',(v_inventory->>'lineSourceIssueCount')::integer+v_issue_count,
    'sourceDigest',encode(sha256(convert_to(jsonb_build_object(
      'priorSourceDigest',v_inventory->>'sourceDigest',
      'invoices',v_invoices,'lineTreatmentIssueCount',v_issue_count)::text,'UTF8')),'hex'));
end; $$;
revoke all on function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  to service_role;

commit;
