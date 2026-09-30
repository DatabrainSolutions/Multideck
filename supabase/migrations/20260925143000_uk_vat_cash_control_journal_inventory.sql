begin;

-- Tie each Cash-term invoice VAT source to its actual native journal posting.
-- A matching invoice/payment arithmetic bridge alone cannot certify the GL.
alter function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
  rename to _multideck_uk_vat_cash_control_source_inventory_before_journals;
revoke all on function public._multideck_uk_vat_cash_control_source_inventory_before_journals(
  uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.multideck_uk_vat_cash_control_source_inventory(
  p_actor uuid,p_entity uuid,p_period uuid,p_projection uuid
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_source jsonb; v_journal jsonb; v_rows jsonb; v_count integer;
  v_unmatched integer; v_orphans integer; v_digest text;
begin
  v_source:=public._multideck_uk_vat_cash_control_source_inventory_before_journals(
    p_actor,p_entity,p_period,p_projection);
  if v_source->>'truncated'='true' then
    return v_source||jsonb_build_object('journalEvidence',null,'sourceDigest',null);
  end if;
  with invoice_lines as materialized (
    select invoice.value->>'invoice_id' invoice_id,
      invoice.value->>'document_type' document_type,
      invoice.value->>'posting_batch_id' posting_batch_id,
      line.value->>'lineId' line_id,
      line.value->>'evidenceId' evidence_id,
      line.value->>'decisionId' decision_id,
      line.value->>'treatment' treatment,
      line.value->>'vatGbp' vat_gbp
    from jsonb_array_elements(v_source#>'{invoiceInventory,invoices}') invoice(value)
    cross join lateral jsonb_array_elements(invoice.value->'lines') line(value)
  ), checked as materialized (
    select source.*,
      batch."FINPostBatch_StatusCode" batch_status,
      batch."FINPostBatch_LegalEntityID" batch_entity,
      evidence.signed_tax_reporting evidence_vat,
      decision.scheme_code decision_scheme,
      tax."FINTax_IsRecoverable" tax_recoverable,
      expected.nominal_id expected_nominal_id,
      posting.tax_count,posting.gbp_count,posting.nominal_count,
      posting.misplaced_control_count,posting.signed_tax_gbp,
      posting.lines posting_lines,
      (batch."FINPostBatch_StatusCode"='posted'
        and batch."FINPostBatch_LegalEntityID"=p_entity
        and evidence.id is not null
        and evidence.signed_tax_reporting=(source.vat_gbp)::numeric
        and decision.id is not null and decision.scheme_code='cash'
        and ((source.vat_gbp)::numeric=0 or tax."FINTax_ID" is not null)
        and (source.vat_gbp)::numeric>=0
        and ((source.document_type='sl_invoice'
          and source.treatment in ('domestic_sale','zero_rated_sale','exempt_sale'))
          or (source.document_type='pl_invoice'
            and source.treatment in ('domestic_purchase','nonrecoverable_purchase',
              'zero_rated_purchase','exempt_purchase')))
        and ((source.treatment='nonrecoverable_purchase'
            and tax."FINTax_IsRecoverable" is false)
          or (source.treatment='domestic_purchase'
            and tax."FINTax_IsRecoverable" is true)
          or source.treatment not in ('nonrecoverable_purchase','domestic_purchase'))
        and posting.tax_count=case when (source.vat_gbp)::numeric=0 then 0 else 1 end
        and posting.gbp_count=posting.tax_count
        and posting.nominal_count=posting.tax_count
        and posting.misplaced_control_count=0
        and posting.signed_tax_gbp=(source.vat_gbp)::numeric
        and ((source.vat_gbp)::numeric=0 or expected.nominal_id is not null)
      ) matched
    from invoice_lines source
    left join public."FIN_PostingBatches" batch
      on batch."FINPostBatch_ID"=(source.posting_batch_id)::uuid
    left join public."FIN_IndirectTaxEvidence" evidence
      on evidence.id=(source.evidence_id)::uuid
      and evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
      and evidence.source_kind='posted_document_line'
      and evidence.source_document_id=(source.invoice_id)::uuid
      and evidence.source_document_line_id=(source.line_id)::uuid
      and evidence.source_posting_batch_id=(source.posting_batch_id)::uuid
    left join public."FIN_IndirectTaxDecisions" decision
      on decision.id=(source.decision_id)::uuid
      and decision.evidence_id=evidence.id
    left join public."FIN_DocumentLines" document_line
      on document_line."FINDocLine_ID"=(source.line_id)::uuid
      and document_line."FINDocLine_DocumentID"=(source.invoice_id)::uuid
    left join public."FIN_TaxCodes" tax
      on tax."FINTax_ID"=decision.tax_code_id
      and tax."FINTax_LegalEntityID"=p_entity
    left join lateral (select case when (source.vat_gbp)::numeric=0 then null
      else public._multideck_finance_resolve_nominal(p_entity,
        case when source.treatment='nonrecoverable_purchase'
          then document_line."FINDocLine_NominalAccountID"
          when source.document_type='sl_invoice' then tax."FINTax_OutputNominalID"
          else tax."FINTax_InputNominalID" end,
        case when source.treatment='nonrecoverable_purchase' then '5000'
          when source.document_type='sl_invoice' then '2100' else '1200' end)
      end nominal_id) expected on true
    left join lateral (
      select count(*) filter (where line."FINPostLine_Description" like 'Tax:%'
          or line."FINPostLine_Description" like 'Nonrecoverable tax:%') tax_count,
        count(*) filter (where (line."FINPostLine_Description" like 'Tax:%'
          or line."FINPostLine_Description" like 'Nonrecoverable tax:%')
          and line."FINPostLine_CurrencyCodeSnapshot"='GBP') gbp_count,
        count(*) filter (where (line."FINPostLine_Description" like 'Tax:%'
          or line."FINPostLine_Description" like 'Nonrecoverable tax:%')
          and line."FINPostLine_NominalAccountID"=expected.nominal_id
          and ((source.treatment='nonrecoverable_purchase'
            and line."FINPostLine_Description" like 'Nonrecoverable tax:%')
            or (source.treatment<>'nonrecoverable_purchase'
              and line."FINPostLine_Description" like 'Tax:%'))) nominal_count,
        count(*) filter (where source.treatment<>'nonrecoverable_purchase'
          and expected.nominal_id is not null
          and line."FINPostLine_NominalAccountID"=expected.nominal_id
          and line."FINPostLine_Description" not like 'Tax:%'
          and line."FINPostLine_Description" not like 'Nonrecoverable tax:%') misplaced_control_count,
        coalesce(sum(case when source.document_type='sl_invoice'
          then line."FINPostLine_CreditAmount"-line."FINPostLine_DebitAmount"
          else line."FINPostLine_DebitAmount"-line."FINPostLine_CreditAmount" end)
          filter (where line."FINPostLine_Description" like 'Tax:%'
            or line."FINPostLine_Description" like 'Nonrecoverable tax:%'),0) signed_tax_gbp,
        coalesce(jsonb_agg(jsonb_build_object(
          'id',line."FINPostLine_ID",'nominal',line."FINPostLine_NominalAccountID",
          'description',line."FINPostLine_Description",
          'debit',line."FINPostLine_DebitAmount",
          'credit',line."FINPostLine_CreditAmount",
          'currency',line."FINPostLine_CurrencyCodeSnapshot")
          order by line."FINPostLine_ID") filter (where line."FINPostLine_ID" is not null),'[]'::jsonb) lines
      from public."FIN_PostingLines" line
      where line."FINPostLine_BatchID"=(source.posting_batch_id)::uuid
        and line."FINPostLine_DocumentID"=(source.invoice_id)::uuid
        and line."FINPostLine_DocumentLineID"=(source.line_id)::uuid
    ) posting on true
  )
  select count(*)::integer,
    count(*) filter (where not coalesce(matched,false))::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'invoiceId',invoice_id,'lineId',line_id,'evidenceId',evidence_id,
      'decisionId',decision_id,'batchId',posting_batch_id,
      'treatment',treatment,'expectedVatGbp',vat_gbp,
      'expectedNominalId',expected_nominal_id,
      'taxPostingCount',tax_count,'postedVatGbp',signed_tax_gbp::text,
      'postingLines',posting_lines,'matched',coalesce(matched,false))
      order by invoice_id,line_id),'[]'::jsonb)
    into v_count,v_unmatched,v_rows from checked;
  -- Catch a tax line on an inventoried invoice that names no inventoried
  -- document line, including a null/forged line ID.
  select count(*)::integer into v_orphans
  from public."FIN_PostingLines" posting
  join public."FIN_PostingBatches" batch
    on batch."FINPostBatch_ID"=posting."FINPostLine_BatchID"
    and batch."FINPostBatch_LegalEntityID"=p_entity
  join lateral jsonb_array_elements(v_source#>'{invoiceInventory,invoices}') invoice(value)
    on invoice.value->>'invoice_id'=posting."FINPostLine_DocumentID"::text
    and invoice.value->>'posting_batch_id'=posting."FINPostLine_BatchID"::text
  where (posting."FINPostLine_Description" like 'Tax:%'
      or posting."FINPostLine_Description" like 'Nonrecoverable tax:%')
    and not exists(select 1
      from jsonb_array_elements(invoice.value->'lines') source_line(value)
      where source_line.value->>'lineId'=posting."FINPostLine_DocumentLineID"::text);
  v_journal:=jsonb_build_object('lineCount',v_count,
    'unmatchedLines',v_unmatched,'orphanTaxPostings',v_orphans,
    'lines',v_rows);
  v_digest:=encode(sha256(convert_to(v_journal::text,'UTF8')),'hex');
  v_journal:=v_journal||jsonb_build_object('digest',v_digest,
    'status',case when v_unmatched=0 and v_orphans=0
      then 'invoice_journals_matched' else 'blocked' end);
  return v_source||jsonb_build_object(
    'journalEvidence',v_journal,
    'sourceDigest',case when v_source->>'sourceDigest' is null then null else
      encode(sha256(convert_to(jsonb_build_object(
        'priorSourceDigest',v_source->>'sourceDigest',
        'journalDigest',v_digest)::text,'UTF8')),'hex') end,
    'status','cash_control_source_only','returnReady',false);
end; $$;
revoke all on function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
  to service_role;

commit;
