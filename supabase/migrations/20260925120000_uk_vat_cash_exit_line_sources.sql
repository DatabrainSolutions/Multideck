begin;

-- Attach every posted invoice line, its native VAT evidence and latest review
-- to the Cash exit balance inventory. Missing or non-Cash line decisions are
-- explicit issues. This remains a read-only source snapshot, not a return.
alter function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  rename to _multideck_uk_vat_cash_exit_invoice_inventory_before_lines;
revoke all on function public._multideck_uk_vat_cash_exit_invoice_inventory_before_lines(
  uuid,uuid,date,date) from public,anon,authenticated,service_role;

create function public.multideck_uk_vat_cash_exit_invoice_inventory(
  p_actor uuid,p_entity uuid,p_start date,p_exit date
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_inventory jsonb; v_line_count integer; v_invoices jsonb;
begin
  -- The prior source function checks the signed-in actor and legal entity.
  v_inventory:=public._multideck_uk_vat_cash_exit_invoice_inventory_before_lines(
    p_actor,p_entity,p_start,p_exit);
  if v_inventory->>'truncated'='true' then
    return v_inventory||jsonb_build_object('lineCount',null,'lineSourceIssueCount',null);
  end if;
  select count(*)::integer into v_line_count
  from public."FIN_DocumentLines" line
  where line."FINDocLine_DocumentID" in (
    select (invoice.value->>'invoice_id')::uuid
    from jsonb_array_elements(v_inventory->'invoices') invoice(value));
  if v_line_count>5000 then
    return v_inventory||jsonb_build_object('lineCount',v_line_count,
      'lineSourceIssueCount',null,'invoices','[]'::jsonb,
      'sourceDigest',null,'truncated',true);
  end if;
  select coalesce(jsonb_agg(invoice.value||jsonb_build_object(
      'lines',coalesce(source.lines,'[]'::jsonb),
      'lineSourceIssueCount',coalesce(source.issue_count,0)
        +case when coalesce(source.line_count,0)=0
          or coalesce(source.gross_total,0)<>(invoice.value->>'local_gross_amount')::numeric
          then 1 else 0 end)
      order by invoice.ordinality),'[]'::jsonb)
    into v_invoices
  from jsonb_array_elements(v_inventory->'invoices') with ordinality invoice(value,ordinality)
  left join lateral (
    select count(*)::integer line_count,
      coalesce(sum(line."FINDocLine_LocalGrossAmount"),0) gross_total,
      count(*) filter (where evidence.id is null or decision.id is null
        or decision.scheme_code<>'cash'
        or evidence.signed_net_reporting is distinct from line."FINDocLine_LocalNetAmount"
        or evidence.signed_tax_reporting is distinct from line."FINDocLine_LocalTaxAmount"
        or evidence.source_posting_batch_id is distinct from
          (invoice.value->>'posting_batch_id')::uuid
        or exists(select 1 from public."FIN_IndirectTaxCreditLinks" linked
          where linked.legal_entity_id=p_entity
            and linked.original_evidence_id=evidence.id)
        or exists(select 1 from public."FIN_IndirectTaxReconciliations" reconciliation
          join public."FIN_IndirectTaxPeriods" period
            on period.id=reconciliation.period_id
            and period.legal_entity_id=p_entity
            and period.scheme_code in ('standard','annual')
          where reconciliation.evidence_id=evidence.id))::integer issue_count,
      coalesce(jsonb_agg(jsonb_build_object(
        'lineId',line."FINDocLine_ID",
        'lineNo',line."FINDocLine_LineNo",
        'netGbp',line."FINDocLine_LocalNetAmount",
        'vatGbp',line."FINDocLine_LocalTaxAmount",
        'grossGbp',line."FINDocLine_LocalGrossAmount",
        'evidenceId',evidence.id,
        'evidenceBatchId',evidence.source_posting_batch_id,
        'evidenceNetGbp',evidence.signed_net_reporting,
        'evidenceVatGbp',evidence.signed_tax_reporting,
        'decisionId',decision.id,
        'decisionRevision',decision.revision,
        'decisionScheme',decision.scheme_code,
        'treatment',decision.treatment_code,
        'reviewedRuleId',decision.reviewed_rule_reference,
        'linkedCreditCount',(select count(*)::integer
          from public."FIN_IndirectTaxCreditLinks" linked
          where linked.legal_entity_id=p_entity
            and linked.original_evidence_id=evidence.id),
        'priorInvoiceBasisSignoffCount',(select count(*)::integer
          from public."FIN_IndirectTaxReconciliations" reconciliation
          join public."FIN_IndirectTaxPeriods" period
            on period.id=reconciliation.period_id
            and period.legal_entity_id=p_entity
            and period.scheme_code in ('standard','annual')
          where reconciliation.evidence_id=evidence.id))
        order by line."FINDocLine_LineNo",line."FINDocLine_ID"),'[]'::jsonb) lines
    from public."FIN_DocumentLines" line
    left join lateral (select candidate.*
      from public."FIN_IndirectTaxEvidence" candidate
      where candidate.source_document_line_id=line."FINDocLine_ID"
        and candidate.source_document_id=(invoice.value->>'invoice_id')::uuid
        and candidate.source_posting_batch_id=(invoice.value->>'posting_batch_id')::uuid
        and candidate.legal_entity_id=p_entity
        and candidate.jurisdiction_code='GB'
        and candidate.source_kind='posted_document_line'
      order by candidate.recorded_at desc,candidate.id desc limit 1) evidence on true
    left join lateral (select candidate.*
      from public."FIN_IndirectTaxDecisions" candidate
      where candidate.evidence_id=evidence.id
      order by candidate.revision desc limit 1) decision on true
    where line."FINDocLine_DocumentID"=(invoice.value->>'invoice_id')::uuid
  ) source on true;
  return v_inventory||jsonb_build_object(
    'lineCount',v_line_count,
    'lineSourceIssueCount',(select coalesce(sum((invoice.value->>'lineSourceIssueCount')::integer),0)
      from jsonb_array_elements(v_invoices) invoice(value)),
    'invoices',v_invoices,
    'sourceDigest',encode(sha256(convert_to(jsonb_build_object(
      'balanceAndPriceDigest',v_inventory->>'sourceDigest',
      'lineCount',v_line_count,'invoices',v_invoices)::text,'UTF8')),'hex'));
end; $$;
revoke all on function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  to service_role;

commit;
