begin;

-- HMRC Notice 731 section 2.7 excludes an invoiced supply if full payment is
-- not due within six months. An absent or incoherent due date is not proof of
-- Cash eligibility. Bind the native date and issue count to the exit digest.
alter function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  rename to _multideck_uk_vat_cash_exit_invoice_inventory_before_due_terms;
revoke all on function public._multideck_uk_vat_cash_exit_invoice_inventory_before_due_terms(
  uuid,uuid,date,date) from public,anon,authenticated,service_role;

create function public.multideck_uk_vat_cash_exit_invoice_inventory(
  p_actor uuid,p_entity uuid,p_start date,p_exit date
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_inventory jsonb; v_invoices jsonb; v_issue_count integer;
begin
  v_inventory:=public._multideck_uk_vat_cash_exit_invoice_inventory_before_due_terms(
    p_actor,p_entity,p_start,p_exit);
  if v_inventory->>'truncated'='true' then
    return v_inventory||jsonb_build_object('dueTermIssueCount',null);
  end if;
  select coalesce(jsonb_agg(invoice.value||jsonb_build_object(
      'document_due_date',document."FINDoc_DueDate",
      'due_within_six_months',coalesce(
        document."FINDoc_DueDate">=document."FINDoc_DocumentDate"
          and document."FINDoc_DueDate"<=document."FINDoc_DocumentDate"+interval '6 months',
        false),
      'source_exception',coalesce((invoice.value->>'source_exception')::boolean,false)
        or document."FINDoc_DueDate" is null
        or document."FINDoc_DueDate"<document."FINDoc_DocumentDate"
        or document."FINDoc_DueDate">document."FINDoc_DocumentDate"+interval '6 months'
        or document."FINDoc_ID" is null)
      order by invoice.ordinality),'[]'::jsonb),
    count(*) filter (where document."FINDoc_DueDate" is null
      or document."FINDoc_DueDate"<document."FINDoc_DocumentDate"
      or document."FINDoc_DueDate">document."FINDoc_DocumentDate"+interval '6 months'
      or document."FINDoc_ID" is null)::integer
    into v_invoices,v_issue_count
  from jsonb_array_elements(v_inventory->'invoices') with ordinality invoice(value,ordinality)
  left join public."FIN_Documents" document
    on document."FINDoc_ID"=(invoice.value->>'invoice_id')::uuid
    and document."FINDoc_LegalEntityID"=p_entity;
  return v_inventory||jsonb_build_object(
    'invoices',v_invoices,'dueTermIssueCount',v_issue_count,
    'sourceDigest',encode(sha256(convert_to(jsonb_build_object(
      'priorSourceDigest',v_inventory->>'sourceDigest',
      'invoices',v_invoices,'dueTermIssueCount',v_issue_count)::text,'UTF8')),'hex'));
end; $$;
revoke all on function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  to service_role;

commit;
