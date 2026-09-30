begin;

-- The CargoWise trial-balance journal carries the opening VAT liability or
-- asset, not tax arising in the new VAT period. Exclude only a posted batch
-- that is linked back to its immutable opening package. Ordinary unlinked VAT
-- account lines continue to block the strict control review.
create or replace function public.multideck_uk_vat_tax_posting_inventory(
  p_actor uuid,p_entity uuid,p_calculation uuid,p_offset integer default 0,p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_result jsonb; v_raw_vat_due numeric; v_expected_tax_lines integer;
  v_uncovered_days integer; v_straddling_periods integer; v_control_net numeric;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Choose a valid VAT tax-posting page.' using errcode='22023';
  end if;
  select period.* into v_period from public."FIN_IndirectTaxCalculations" calculation
    join public."FIN_IndirectTaxPeriods" period on period.id=calculation.period_id
    where calculation.id=p_calculation and period.legal_entity_id=p_entity
      and period.jurisdiction_code='GB';
  if not found then raise exception 'UK VAT calculation was not found.' using errcode='P0002'; end if;
  select coalesce(sum(case line.box_number when 1 then line.signed_amount
      when 4 then -line.signed_amount else 0 end),0),
    count(*) filter (where line.box_number in (1,4) and line.signed_amount<>0)
    into v_raw_vat_due,v_expected_tax_lines
  from public."FIN_IndirectTaxCalculationLines" line
  where line.calculation_id=p_calculation and line.period_id=v_period.id;
  select count(*) filter (where coverage.period_count<>1) into v_uncovered_days
  from generate_series(v_period.start_date,v_period.end_date,interval '1 day') day
  cross join lateral (
    select count(*) period_count from public."FIN_Periods" accounting
    where accounting."FINPeriod_LegalEntityID"=p_entity
      and day::date between accounting."FINPeriod_StartDate" and accounting."FINPeriod_EndDate"
  ) coverage;
  select count(*) into v_straddling_periods from public."FIN_Periods" accounting
    where accounting."FINPeriod_LegalEntityID"=p_entity
      and accounting."FINPeriod_StartDate"<=v_period.end_date
      and accounting."FINPeriod_EndDate">=v_period.start_date
      and (accounting."FINPeriod_StartDate"<v_period.start_date
        or accounting."FINPeriod_EndDate">v_period.end_date);
  with tax_accounts as (
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
  ), inventory as materialized (
    select posting."FINPostLine_ID" posting_line_id,
      batch."FINPostBatch_ID" batch_id,batch."FINPostBatch_Number" batch_number,
      batch."FINPostBatch_SourceTable" batch_source,
      batch."FINPostBatch_PostedAt" posted_at,
      accounting."FINPeriod_ID" accounting_period_id,
      accounting."FINPeriod_StartDate" accounting_start,
      accounting."FINPeriod_EndDate" accounting_end,
      posting."FINPostLine_LineNo" line_number,
      posting."FINPostLine_DocumentID" document_id,
      posting."FINPostLine_DocumentLineID" document_line_id,
      posting."FINPostLine_NominalAccountID" nominal_id,
      nominal."FINNom_Code" nominal_code,nominal."FINNom_Name" nominal_name,
      posting."FINPostLine_Description" description,
      posting."FINPostLine_DebitAmount" debit_gbp,
      posting."FINPostLine_CreditAmount" credit_gbp,
      posting."FINPostLine_CurrencyCodeSnapshot" currency,
      posting."FINPostLine_Description" like 'Tax:%' tax_labelled,
      posting."FINPostLine_NominalAccountID" in (select id from tax_accounts) vat_account,
      exists (
        select 1 from public."FIN_IndirectTaxCalculationLines" calc_line
        join public."FIN_IndirectTaxEvidence" evidence on evidence.id=calc_line.evidence_id
        where calc_line.calculation_id=p_calculation
          and evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
          and evidence.source_posting_batch_id=batch."FINPostBatch_ID"
          and ((evidence.source_kind='posted_document_line'
            and evidence.source_document_id=posting."FINPostLine_DocumentID"
            and evidence.source_document_line_id=posting."FINPostLine_DocumentLineID")
            or (evidence.source_kind='adjustment'
              and evidence.source_id=posting."FINPostLine_ID"
              and exists(select 1 from public."FIN_IndirectTaxPriorErrorMethod1PostingItems" method1
                where method1.evidence_id=evidence.id
                  and method1.tax_posting_line_id=posting."FINPostLine_ID"
                  and method1.legal_entity_id=p_entity
                  and method1.discovery_period_id=v_period.id)
              or exists(select 1 from public."FIN_IndirectTaxInputTaxRepaymentPostingEvents" repayment
                where repayment.evidence_id=evidence.id
                  and repayment.tax_posting_line_id=posting."FINPostLine_ID"
                  and repayment.legal_entity_id=p_entity
                  and repayment.period_id=v_period.id)
              or exists(select 1 from public."FIN_IndirectTaxLaterInputTaxRestorationPostingEvents" later
                where later.evidence_id=evidence.id
                  and later.tax_posting_line_id=posting."FINPostLine_ID"
                  and later.legal_entity_id=p_entity
                  and later.period_id=v_period.id)))
      ) linked_to_draft
    from public."FIN_PostingLines" posting
    join public."FIN_PostingBatches" batch
      on batch."FINPostBatch_ID"=posting."FINPostLine_BatchID"
      and batch."FINPostBatch_LegalEntityID"=p_entity
      and batch."FINPostBatch_StatusCode"='posted'
      and not exists(select 1 from public."FIN_OpeningBalancePackages" opening
        where opening.id=batch."FINPostBatch_SourceID"
          and opening.posting_batch_id=batch."FINPostBatch_ID"
          and opening.legal_entity_id=p_entity
          and opening.status='posted'
          and batch."FINPostBatch_SourceTable"='FIN_OpeningBalancePackages')
    join public."FIN_Periods" accounting
      on accounting."FINPeriod_ID"=batch."FINPostBatch_PeriodID"
      and accounting."FINPeriod_LegalEntityID"=p_entity
      and accounting."FINPeriod_StartDate"<=v_period.end_date
      and accounting."FINPeriod_EndDate">=v_period.start_date
    left join public."FIN_NominalAccounts" nominal
      on nominal."FINNom_ID"=posting."FINPostLine_NominalAccountID"
      and nominal."FINNom_LegalEntityID"=p_entity
    where posting."FINPostLine_Description" like 'Tax:%'
      or posting."FINPostLine_NominalAccountID" in (select id from tax_accounts)
  )
  select jsonb_build_object(
    'calculationId',p_calculation,'periodId',v_period.id,'legalEntityId',p_entity,
    'scope','current posted GL tax lines in accounting periods overlapping the VAT period; verified historical opening batches excluded',
    'vatPeriodStart',v_period.start_date,'vatPeriodEnd',v_period.end_date,
    'postingDigest',(select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object(
      'id',posting_line_id,'batch',batch_id,'accountingPeriod',accounting_period_id,
      'nominal',nominal_id,'debit',debit_gbp,'credit',credit_gbp,'currency',currency,
      'description',description,'vatAccount',vat_account,'linked',linked_to_draft)
      order by posting_line_id),'[]'::jsonb)::text,'UTF8')),'hex') from inventory),
    'accountingScopeDigest',(select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object(
      'id',accounting."FINPeriod_ID",'start',accounting."FINPeriod_StartDate",
      'end',accounting."FINPeriod_EndDate") order by accounting."FINPeriod_ID"),'[]'::jsonb)::text,'UTF8')),'hex')
      from public."FIN_Periods" accounting where accounting."FINPeriod_LegalEntityID"=p_entity
        and accounting."FINPeriod_StartDate"<=v_period.end_date
        and accounting."FINPeriod_EndDate">=v_period.start_date),
    'totalLines',(select count(*) from inventory),
    'linkedLines',(select count(*) from inventory where linked_to_draft),
    'unlinkedLines',(select count(*) from inventory where not linked_to_draft),
    'taxLinesOffVatAccounts',(select count(*) from inventory where tax_labelled and not coalesce(vat_account,false)),
    'nonGbpLines',(select count(*) from inventory where currency<>'GBP'),
    'totalDebitGbp',(select coalesce(sum(debit_gbp),0) from inventory where currency='GBP'),
    'totalCreditGbp',(select coalesce(sum(credit_gbp),0) from inventory where currency='GBP'),
    'linkedVatAccountDebitGbp',(select coalesce(sum(debit_gbp),0) from inventory
      where currency='GBP' and vat_account and linked_to_draft),
    'linkedVatAccountCreditGbp',(select coalesce(sum(credit_gbp),0) from inventory
      where currency='GBP' and vat_account and linked_to_draft),
    'unlinkedVatAccountDebitGbp',(select coalesce(sum(debit_gbp),0) from inventory
      where currency='GBP' and vat_account and not linked_to_draft),
    'unlinkedVatAccountCreditGbp',(select coalesce(sum(credit_gbp),0) from inventory
      where currency='GBP' and vat_account and not linked_to_draft),
    'taxOffVatAccountDebitGbp',(select coalesce(sum(debit_gbp),0) from inventory
      where currency='GBP' and tax_labelled and not coalesce(vat_account,false)),
    'taxOffVatAccountCreditGbp',(select coalesce(sum(credit_gbp),0) from inventory
      where currency='GBP' and tax_labelled and not coalesce(vat_account,false)),
    'linkedVatAccountTaxLines',(select count(*) from inventory
      where currency='GBP' and vat_account and linked_to_draft and tax_labelled),
    'offset',p_offset,
    'rows',(select coalesce(jsonb_agg(to_jsonb(page) order by page.accounting_start,page.batch_id,page.line_number,page.posting_line_id),'[]'::jsonb)
      from (select * from inventory order by accounting_start,batch_id,line_number,posting_line_id
        offset p_offset limit p_limit) page)
  ) into v_result;
  v_control_net:=(v_result->>'linkedVatAccountCreditGbp')::numeric
    +(v_result->>'unlinkedVatAccountCreditGbp')::numeric
    -(v_result->>'linkedVatAccountDebitGbp')::numeric
    -(v_result->>'unlinkedVatAccountDebitGbp')::numeric;
  v_result:=v_result||jsonb_build_object('controlBridge',jsonb_build_object(
    'sourceVatDueGbp',v_raw_vat_due,'vatAccountNetCreditGbp',v_control_net,
    'differenceGbp',v_control_net-v_raw_vat_due,
    'expectedTaxPostingLines',v_expected_tax_lines,
    'linkedVatAccountTaxLines',(v_result->>'linkedVatAccountTaxLines')::integer,
    'accountingCoverageExact',v_uncovered_days=0 and v_straddling_periods=0,
    'daysWithoutOneAccountingPeriod',v_uncovered_days,
    'straddlingAccountingPeriods',v_straddling_periods,
    'scope','current GBP VAT-account movements in accounting periods overlapping the VAT period, excluding verified historical opening batches; comparison only'));
  return v_result;
end; $$;

commit;
