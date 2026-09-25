begin;

-- Account for every VAT-control or tax-labelled posting in accounting months
-- covered by a Cash VAT period. Unsupported movements remain blocking; a
-- movement tie-out does not establish an opening or closing account balance.
alter function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
  rename to _multideck_uk_vat_cash_control_source_inventory_before_ledger;
revoke all on function public._multideck_uk_vat_cash_control_source_inventory_before_ledger(
  uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.multideck_uk_vat_cash_control_source_inventory(
  p_actor uuid,p_entity uuid,p_period uuid,p_projection uuid
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_source jsonb; v_start date; v_end date; v_boundary integer;
  v_current_lines jsonb;
  v_expected_output numeric; v_expected_input numeric; v_expected_refs integer;
  v_lines jsonb; v_count integer; v_unresolved integer; v_opening integer;
  v_duplicate_refs integer; v_matched integer; v_actual_output numeric;
  v_actual_input numeric; v_unassigned integer; v_source_period_issues integer;
  v_ledger jsonb; v_digest text;
begin
  v_source:=public._multideck_uk_vat_cash_control_source_inventory_before_ledger(
    p_actor,p_entity,p_period,p_projection);
  if v_source->>'truncated'='true' then
    return v_source||jsonb_build_object('ledgerMovements',null,'sourceDigest',null);
  end if;
  v_start:=(v_source#>>'{context,periodStart}')::date;
  v_end:=(v_source#>>'{context,periodEnd}')::date;
  select count(*)::integer into v_boundary
  from jsonb_array_elements(v_source#>'{accountingControls,periods}') period(value)
  where (period.value->>'startDate')::date<v_start
    or (period.value->>'endDate')::date>v_end;
  select count(*)::integer into v_source_period_issues
  from jsonb_array_elements(v_source#>'{journalEvidence,lines}') line(value)
  left join public."FIN_PostingBatches" batch
    on batch."FINPostBatch_ID"=(line.value->>'batchId')::uuid
  left join public."FIN_Periods" period
    on period."FINPeriod_ID"=batch."FINPostBatch_PeriodID"
  where batch."FINPostBatch_LegalEntityID" is distinct from p_entity
    or period."FINPeriod_ID" is null
    or period."FINPeriod_LegalEntityID" is distinct from p_entity;
  select coalesce(jsonb_agg(line.value order by line.value->>'invoiceId',
    line.value->>'lineId'),'[]'::jsonb) into v_current_lines
  from jsonb_array_elements(v_source#>'{journalEvidence,lines}') line(value)
  join public."FIN_PostingBatches" batch
    on batch."FINPostBatch_ID"=(line.value->>'batchId')::uuid
    and batch."FINPostBatch_LegalEntityID"=p_entity
    and batch."FINPostBatch_StatusCode"='posted'
  join public."FIN_Periods" period
    on period."FINPeriod_ID"=batch."FINPostBatch_PeriodID"
    and period."FINPeriod_LegalEntityID"=p_entity
    and period."FINPeriod_StartDate">=v_start
    and period."FINPeriod_EndDate"<=v_end;
  select coalesce(sum((line.value->>'expectedVatGbp')::numeric)
      filter (where line.value->>'treatment'='domestic_sale'),0),
    coalesce(sum((line.value->>'expectedVatGbp')::numeric)
      filter (where line.value->>'treatment'='domestic_purchase'),0)
    into v_expected_output,v_expected_input
  from jsonb_array_elements(v_current_lines) line(value);

  with tax_accounts as materialized (
    select nominal."FINNom_ID" id from public."FIN_NominalAccounts" nominal
    where nominal."FINNom_LegalEntityID"=p_entity
      and (lower(coalesce(nominal."FINNom_ControlTypeCode",'')) like '%vat%'
        or nominal."FINNom_Code" ~ '^(1200|2100)([.]00[.]00)?$'
        or nominal."FINNom_ID" in (
          select tax."FINTax_OutputNominalID" from public."FIN_TaxCodes" tax
            where tax."FINTax_LegalEntityID"=p_entity and tax."FINTax_OutputNominalID" is not null
          union
          select tax."FINTax_InputNominalID" from public."FIN_TaxCodes" tax
            where tax."FINTax_LegalEntityID"=p_entity and tax."FINTax_InputNominalID" is not null))
  ), source_refs as materialized (
    select (posting.value->>'id')::uuid posting_id,
      line.value->>'invoiceId' invoice_id,
      line.value->>'lineId' document_line_id,
      line.value->>'treatment' treatment
    from jsonb_array_elements(v_current_lines) line(value)
    cross join lateral jsonb_array_elements(line.value->'postingLines') posting(value)
    where posting.value->>'description' like 'Tax:%'
      or posting.value->>'description' like 'Nonrecoverable tax:%'
  ), expected as materialized (
    select posting_id,count(*)::integer reference_count,
      max(invoice_id) invoice_id,max(document_line_id) document_line_id,
      max(treatment) treatment
    from source_refs group by posting_id
  ), movements as materialized (
    select posting."FINPostLine_ID" id,posting."FINPostLine_BatchID" batch_id,
      posting."FINPostLine_NominalAccountID" nominal_id,
      posting."FINPostLine_Description" description,
      posting."FINPostLine_DocumentID" document_id,
      posting."FINPostLine_DocumentLineID" document_line_id,
      posting."FINPostLine_DebitAmount" debit_gbp,
      posting."FINPostLine_CreditAmount" credit_gbp,
      posting."FINPostLine_CurrencyCodeSnapshot" currency,
      expected.invoice_id,expected.treatment,expected.reference_count,
      posting."FINPostLine_NominalAccountID" in (select id from tax_accounts) vat_account,
      exists(select 1 from public."FIN_OpeningBalancePackages" opening
        where opening.id=batch."FINPostBatch_SourceID"
          and opening.posting_batch_id=batch."FINPostBatch_ID"
          and opening.legal_entity_id=p_entity and opening.status='posted'
          and batch."FINPostBatch_SourceTable"='FIN_OpeningBalancePackages') opening_excluded
    from public."FIN_PostingLines" posting
    join public."FIN_PostingBatches" batch
      on batch."FINPostBatch_ID"=posting."FINPostLine_BatchID"
      and batch."FINPostBatch_LegalEntityID"=p_entity
      and batch."FINPostBatch_StatusCode"='posted'
    join public."FIN_Periods" period
      on period."FINPeriod_ID"=batch."FINPostBatch_PeriodID"
      and period."FINPeriod_LegalEntityID"=p_entity
      and period."FINPeriod_StartDate"<=v_end
      and period."FINPeriod_EndDate">=v_start
    left join expected on expected.posting_id=posting."FINPostLine_ID"
    where posting."FINPostLine_Description" like 'Tax:%'
      or posting."FINPostLine_Description" like 'Nonrecoverable tax:%'
      or posting."FINPostLine_NominalAccountID" in (select id from tax_accounts)
  ), classified as materialized (
    select *,case
      when opening_excluded then 'verified_opening_excluded'
      when reference_count=1 and currency='GBP'
        and ((treatment in ('domestic_sale','domestic_purchase') and vat_account)
          or (treatment='nonrecoverable_purchase' and not vat_account))
        and (description like 'Tax:%' or description like 'Nonrecoverable tax:%')
        then 'matched_invoice'
      else 'unsupported' end classification
    from movements
  )
  select count(*)::integer,
    count(*) filter (where classification='unsupported')::integer,
    count(*) filter (where classification='verified_opening_excluded')::integer,
    count(*) filter (where classification='matched_invoice')::integer,
    coalesce(sum(credit_gbp-debit_gbp) filter (where classification='matched_invoice'
      and treatment='domestic_sale'),0),
    coalesce(sum(debit_gbp-credit_gbp) filter (where classification='matched_invoice'
      and treatment='domestic_purchase'),0),
    coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'batchId',batch_id,'nominalId',nominal_id,
      'documentId',document_id,'documentLineId',document_line_id,
      'invoiceId',invoice_id,'treatment',treatment,'description',description,
      'debitGbp',debit_gbp,'creditGbp',credit_gbp,'currency',currency,
      'vatAccount',vat_account,'classification',classification)
      order by id),'[]'::jsonb)
    into v_count,v_unresolved,v_opening,v_matched,v_actual_output,
      v_actual_input,v_lines from classified;
  select count(*)::integer,
    count(*) filter (where reference_count<>1)::integer
    into v_expected_refs,v_duplicate_refs
  from (select (posting.value->>'id')::uuid posting_id,count(*)::integer reference_count
    from jsonb_array_elements(v_current_lines) line(value)
    cross join lateral jsonb_array_elements(line.value->'postingLines') posting(value)
    where posting.value->>'description' like 'Tax:%'
      or posting.value->>'description' like 'Nonrecoverable tax:%'
    group by (posting.value->>'id')::uuid) refs;
  -- A posted tax movement with no accounting period in this entity would be
  -- invisible to every approved monthly inventory. Fail closed when posted
  -- in this term.
  select count(*)::integer into v_unassigned
  from public."FIN_PostingLines" posting
  join public."FIN_PostingBatches" batch
    on batch."FINPostBatch_ID"=posting."FINPostLine_BatchID"
    and batch."FINPostBatch_LegalEntityID"=p_entity
    and batch."FINPostBatch_StatusCode"='posted'
    and not exists(select 1 from public."FIN_Periods" period
      where period."FINPeriod_ID"=batch."FINPostBatch_PeriodID"
        and period."FINPeriod_LegalEntityID"=p_entity)
    and (batch."FINPostBatch_PostedAt" at time zone 'Europe/London')::date
      between v_start and v_end
  where posting."FINPostLine_Description" like 'Tax:%'
    or posting."FINPostLine_Description" like 'Nonrecoverable tax:%'
    or exists(select 1 from public."FIN_NominalAccounts" nominal
      where nominal."FINNom_ID"=posting."FINPostLine_NominalAccountID"
        and nominal."FINNom_LegalEntityID"=p_entity
        and (lower(coalesce(nominal."FINNom_ControlTypeCode",'')) like '%vat%'
          or nominal."FINNom_Code" ~ '^(1200|2100)([.]00[.]00)?$'
          or nominal."FINNom_ID" in (
            select tax."FINTax_OutputNominalID" from public."FIN_TaxCodes" tax
              where tax."FINTax_LegalEntityID"=p_entity
            union
            select tax."FINTax_InputNominalID" from public."FIN_TaxCodes" tax
              where tax."FINTax_LegalEntityID"=p_entity)));
  v_ledger:=jsonb_build_object(
    'lineCount',v_count,'unresolvedLines',v_unresolved,
    'verifiedOpeningExcludedLines',v_opening,
    'matchedInvoiceLines',v_matched,'expectedPostingCount',v_expected_refs,
    'duplicateSourcePostingReferences',v_duplicate_refs,
    'partialAccountingPeriods',v_boundary,
    'invalidAccountingPeriodTaxLines',v_unassigned,
    'invalidSourcePeriodLinks',v_source_period_issues,
    'expectedOutputVatGbp',v_expected_output::text,
    'postedOutputVatGbp',v_actual_output::text,
    'expectedInputVatGbp',v_expected_input::text,
    'postedInputVatGbp',v_actual_input::text,
    'lines',v_lines);
  v_digest:=encode(sha256(convert_to(v_ledger::text,'UTF8')),'hex');
  v_ledger:=v_ledger||jsonb_build_object('digest',v_digest,
    'status',case when v_unresolved=0 and v_duplicate_refs=0 and v_unassigned=0
      and v_source_period_issues=0
      and v_matched=v_expected_refs and v_boundary=0
      and v_actual_output=v_expected_output
      and v_actual_input=v_expected_input
      and v_source#>>'{accountingControls,status}'='verified'
      then 'period_movements_matched' else 'blocked' end);
  return v_source||jsonb_build_object(
    'ledgerMovements',v_ledger,
    'sourceDigest',case when v_source->>'sourceDigest' is null then null else
      encode(sha256(convert_to(jsonb_build_object(
        'priorSourceDigest',v_source->>'sourceDigest',
        'ledgerDigest',v_digest)::text,'UTF8')),'hex') end,
    'status','cash_control_source_only','returnReady',false);
end; $$;
revoke all on function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
  to service_role;

commit;
