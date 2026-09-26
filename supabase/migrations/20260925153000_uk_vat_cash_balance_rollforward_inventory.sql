begin;

-- Show the complete VAT-control balance brought forward, the movement in the
-- Cash period, and the closing balance. A historic settlement or other line
-- without reviewed source remains explicitly unclassified and blocks the
-- bridge; the roll-forward alone is not a filing approval.
alter function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
  rename to _multideck_uk_vat_cash_control_source_inventory_before_balance;
revoke all on function public._multideck_uk_vat_cash_control_source_inventory_before_balance(
  uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.multideck_uk_vat_cash_control_source_inventory(
  p_actor uuid,p_entity uuid,p_period uuid,p_projection uuid
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_source jsonb; v_start date; v_end date;
  v_opening numeric; v_movement numeric; v_closing numeric;
  v_opening_invoice numeric; v_opening_package numeric;
  v_current_invoice numeric; v_current_package numeric;
  v_prior_due numeric; v_opening_unclassified integer;
  v_current_unclassified integer; v_invalid_period integer;
  v_line_count integer; v_rows jsonb; v_accounts jsonb;
  v_balance jsonb; v_digest text;
begin
  v_source:=public._multideck_uk_vat_cash_control_source_inventory_before_balance(
    p_actor,p_entity,p_period,p_projection);
  if v_source->>'truncated'='true' then
    return v_source||jsonb_build_object('controlBalance',null,'sourceDigest',null);
  end if;
  v_start:=(v_source#>>'{context,periodStart}')::date;
  v_end:=(v_source#>>'{context,periodEnd}')::date;
  if v_start is null or v_end is null or v_start>v_end then
    raise exception 'Cash VAT control balance requires a valid period.' using errcode='22023';
  end if;
  select coalesce(sum(case box.box_number when 1 then box.signed_amount
      when 4 then -box.signed_amount else 0 end),0)
    into v_prior_due
  from jsonb_array_elements(v_source#>'{acceptedHistory,periods}') prior(value)
  join public."FIN_IndirectTaxCashCalculationEventLines" box
    on box.calculation_id=(prior.value->>'calculationId')::uuid
    and box.period_id=(prior.value->>'periodId')::uuid
  where prior.value->>'status'='accepted';

  with vat_accounts as materialized (
    select nominal."FINNom_ID" id,nominal."FINNom_Code" code
    from public."FIN_NominalAccounts" nominal
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
    select (posted.value->>'id')::uuid posting_id,
      (journal.value->>'batchId')::uuid batch_id,
      (journal.value->>'invoiceId')::uuid invoice_id,
      (journal.value->>'lineId')::uuid document_line_id
    from jsonb_array_elements(v_source#>'{journalEvidence,lines}') journal(value)
    cross join lateral jsonb_array_elements(journal.value->'postingLines') posted(value)
    where posted.value->>'description' like 'Tax:%'
      or posted.value->>'description' like 'Nonrecoverable tax:%'
  ), refs as materialized (
    select posting_id,count(*)::integer source_count,
      max(batch_id::text)::uuid batch_id,
      max(invoice_id::text)::uuid invoice_id,
      max(document_line_id::text)::uuid document_line_id
    from source_refs group by posting_id
  ), lines as materialized (
    select posting."FINPostLine_ID" id,
      posting."FINPostLine_BatchID" batch_id,
      posting."FINPostLine_NominalAccountID" nominal_id,
      account.code nominal_code,
      posting."FINPostLine_DocumentID" document_id,
      posting."FINPostLine_DocumentLineID" document_line_id,
      posting."FINPostLine_Description" description,
      posting."FINPostLine_DebitAmount" debit_gbp,
      posting."FINPostLine_CreditAmount" credit_gbp,
      posting."FINPostLine_CurrencyCodeSnapshot" currency,
      period."FINPeriod_ID" accounting_period_id,
      period."FINPeriod_StartDate" accounting_start,
      period."FINPeriod_EndDate" accounting_end,
      case when period."FINPeriod_EndDate"<v_start then 'opening'
        else 'current' end phase,
      case when batch."FINPostBatch_SourceTable"='FIN_OpeningBalancePackages'
          and exists(select 1 from public."FIN_OpeningBalancePackages" opening
            where opening.id=batch."FINPostBatch_SourceID"
              and opening.posting_batch_id=batch."FINPostBatch_ID"
              and opening.legal_entity_id=p_entity and opening.status='posted')
        then 'verified_opening_package'
        when refs.source_count=1 and refs.batch_id=posting."FINPostLine_BatchID"
          and refs.invoice_id=posting."FINPostLine_DocumentID"
          and refs.document_line_id=posting."FINPostLine_DocumentLineID"
          and posting."FINPostLine_CurrencyCodeSnapshot"='GBP'
          and posting."FINPostLine_Description" like 'Tax:%'
        then 'matched_invoice'
        else 'unclassified' end classification
    from public."FIN_PostingLines" posting
    join public."FIN_PostingBatches" batch
      on batch."FINPostBatch_ID"=posting."FINPostLine_BatchID"
      and batch."FINPostBatch_LegalEntityID"=p_entity
      and batch."FINPostBatch_StatusCode"='posted'
    join public."FIN_Periods" period
      on period."FINPeriod_ID"=batch."FINPostBatch_PeriodID"
      and period."FINPeriod_LegalEntityID"=p_entity
      and period."FINPeriod_EndDate"<=v_end
    join vat_accounts account on account.id=posting."FINPostLine_NominalAccountID"
    left join refs on refs.posting_id=posting."FINPostLine_ID"
  )
  select count(*)::integer,
    coalesce(sum(credit_gbp-debit_gbp) filter (where phase='opening'),0),
    coalesce(sum(credit_gbp-debit_gbp) filter (where phase='current'),0),
    coalesce(sum(credit_gbp-debit_gbp),0),
    coalesce(sum(credit_gbp-debit_gbp) filter (where phase='opening'
      and classification='matched_invoice'),0),
    coalesce(sum(credit_gbp-debit_gbp) filter (where phase='opening'
      and classification='verified_opening_package'),0),
    coalesce(sum(credit_gbp-debit_gbp) filter (where phase='current'
      and classification='matched_invoice'),0),
    coalesce(sum(credit_gbp-debit_gbp) filter (where phase='current'
      and classification='verified_opening_package'),0),
    count(*) filter (where phase='opening' and classification='unclassified')::integer,
    count(*) filter (where phase='current' and classification='unclassified')::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'batchId',batch_id,'accountingPeriodId',accounting_period_id,
      'accountingStart',accounting_start,'accountingEnd',accounting_end,
      'nominalId',nominal_id,'nominalCode',nominal_code,
      'documentId',document_id,'documentLineId',document_line_id,
      'description',description,'debitGbp',debit_gbp,'creditGbp',credit_gbp,
      'currency',currency,'phase',phase,'classification',classification)
      order by accounting_start,batch_id,id),'[]'::jsonb)
    into v_line_count,v_opening,v_movement,v_closing,
      v_opening_invoice,v_opening_package,v_current_invoice,v_current_package,
      v_opening_unclassified,v_current_unclassified,v_rows
  from lines;
  select coalesce(jsonb_agg(jsonb_build_object(
    'nominalId',account."FINNom_ID",'code',account."FINNom_Code",
    'openingNetCreditGbp',coalesce(sum_line.opening,0)::text,
    'periodNetCreditGbp',coalesce(sum_line.current,0)::text,
    'closingNetCreditGbp',coalesce(sum_line.closing,0)::text)
    order by account."FINNom_Code",account."FINNom_ID"),'[]'::jsonb)
    into v_accounts
  from public."FIN_NominalAccounts" account
  left join lateral (
    select coalesce(sum(posting."FINPostLine_CreditAmount"
      -posting."FINPostLine_DebitAmount") filter
        (where period."FINPeriod_EndDate"<v_start),0) opening,
      coalesce(sum(posting."FINPostLine_CreditAmount"
      -posting."FINPostLine_DebitAmount") filter
        (where period."FINPeriod_EndDate">=v_start),0) current,
      coalesce(sum(posting."FINPostLine_CreditAmount"
      -posting."FINPostLine_DebitAmount"),0) closing
    from public."FIN_PostingLines" posting
    join public."FIN_PostingBatches" batch
      on batch."FINPostBatch_ID"=posting."FINPostLine_BatchID"
      and batch."FINPostBatch_LegalEntityID"=p_entity
      and batch."FINPostBatch_StatusCode"='posted'
    join public."FIN_Periods" period
      on period."FINPeriod_ID"=batch."FINPostBatch_PeriodID"
      and period."FINPeriod_LegalEntityID"=p_entity
      and period."FINPeriod_EndDate"<=v_end
    where posting."FINPostLine_NominalAccountID"=account."FINNom_ID"
  ) sum_line on true
  where account."FINNom_LegalEntityID"=p_entity
    and (lower(coalesce(account."FINNom_ControlTypeCode",'')) like '%vat%'
      or account."FINNom_Code" ~ '^(1200|2100)([.]00[.]00)?$'
      or account."FINNom_ID" in (
        select tax."FINTax_OutputNominalID" from public."FIN_TaxCodes" tax
          where tax."FINTax_LegalEntityID"=p_entity and tax."FINTax_OutputNominalID" is not null
        union
        select tax."FINTax_InputNominalID" from public."FIN_TaxCodes" tax
          where tax."FINTax_LegalEntityID"=p_entity and tax."FINTax_InputNominalID" is not null));
  select count(*)::integer into v_invalid_period
  from public."FIN_PostingLines" posting
  join public."FIN_PostingBatches" batch
    on batch."FINPostBatch_ID"=posting."FINPostLine_BatchID"
    and batch."FINPostBatch_LegalEntityID"=p_entity
    and batch."FINPostBatch_StatusCode"='posted'
    and not exists(select 1 from public."FIN_Periods" period
      where period."FINPeriod_ID"=batch."FINPostBatch_PeriodID"
        and period."FINPeriod_LegalEntityID"=p_entity)
    and (batch."FINPostBatch_PostedAt" is null
      or (batch."FINPostBatch_PostedAt" at time zone 'Europe/London')::date<=v_end)
  where posting."FINPostLine_Description" like 'Tax:%'
    or posting."FINPostLine_NominalAccountID" in (
      select account."FINNom_ID" from public."FIN_NominalAccounts" account
      where account."FINNom_LegalEntityID"=p_entity
        and (lower(coalesce(account."FINNom_ControlTypeCode",'')) like '%vat%'
          or account."FINNom_Code" ~ '^(1200|2100)([.]00[.]00)?$'
          or account."FINNom_ID" in (
            select tax."FINTax_OutputNominalID" from public."FIN_TaxCodes" tax
              where tax."FINTax_LegalEntityID"=p_entity and tax."FINTax_OutputNominalID" is not null
            union
            select tax."FINTax_InputNominalID" from public."FIN_TaxCodes" tax
              where tax."FINTax_LegalEntityID"=p_entity and tax."FINTax_InputNominalID" is not null)));
  v_balance:=jsonb_build_object(
    'lineCount',v_line_count,'openingNetCreditGbp',v_opening::text,
    'periodNetCreditGbp',v_movement::text,
    'closingNetCreditGbp',v_closing::text,
    'openingInvoiceNetCreditGbp',v_opening_invoice::text,
    'openingPackageNetCreditGbp',v_opening_package::text,
    'periodInvoiceNetCreditGbp',v_current_invoice::text,
    'periodPackageNetCreditGbp',v_current_package::text,
    'priorAcceptedNetDueGbp',v_prior_due::text,
    'unclassifiedOpeningLines',v_opening_unclassified,
    'unclassifiedPeriodLines',v_current_unclassified,
    'invalidAccountingPeriodLines',v_invalid_period,
    'accounts',v_accounts,'lines',v_rows);
  v_digest:=encode(sha256(convert_to(v_balance::text,'UTF8')),'hex');
  v_balance:=v_balance||jsonb_build_object('digest',v_digest,
    'status',case when v_opening_unclassified=0 and v_current_unclassified=0
      and v_invalid_period=0 and v_opening+v_movement=v_closing
      and v_movement=v_current_invoice+v_current_package
      and v_source#>>'{ledgerMovements,status}'='period_movements_matched'
      and v_source#>>'{acceptedHistory,status}'='accepted_history_matched'
      then 'balance_rollforward_matched' else 'blocked' end);
  return v_source||jsonb_build_object(
    'controlBalance',v_balance,
    'sourceDigest',case when v_source->>'sourceDigest' is null then null else
      encode(sha256(convert_to(jsonb_build_object(
        'priorSourceDigest',v_source->>'sourceDigest',
        'balanceDigest',v_digest)::text,'UTF8')),'hex') end,
    'status','cash_control_source_only','returnReady',false);
end; $$;
revoke all on function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
  to service_role;

commit;
