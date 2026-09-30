begin;

-- A later allocation must not retrospectively settle an invoice for a closed
-- VAT period, even when the underlying cash transaction carries an earlier
-- date. Use the later of the cash date and the UK date of actual allocation.
create or replace function public._multideck_uk_vat_unpaid_input_tax_risk_rows(
  p_entity uuid,p_end date
) returns table(document_id uuid,document_number text,document_date date,due_date date,
  currency_code text,gross_amount numeric,paid_by_period_end numeric,
  unpaid_at_period_end numeric,first_possible_clawback_date date)
language sql stable security definer set search_path=pg_catalog,public as $$
  select document."FINDoc_ID",document."FINDoc_Number"::text,
    document."FINDoc_DocumentDate",document."FINDoc_DueDate",
    document."FINDoc_CurrencyCodeSnapshot"::text,document."FINDoc_GrossAmount",
    coalesce(paid.amount,0),document."FINDoc_GrossAmount"-coalesce(paid.amount,0),
    reviewed.first_possible_date
  from public."FIN_Documents" document
  join lateral (
    select min((greatest(coalesce(document."FINDoc_DueDate",document."FINDoc_DocumentDate"),
      decision.tax_point)+interval '6 months')::date) first_possible_date
    from public."FIN_IndirectTaxEvidence" evidence
    join lateral (
      select latest.tax_point,latest.treatment_code
      from public."FIN_IndirectTaxDecisions" latest
      where latest.evidence_id=evidence.id
      order by latest.revision desc limit 1
    ) decision on true
    where evidence.source_document_id=document."FINDoc_ID"
      and evidence.legal_entity_id=p_entity
      and evidence.jurisdiction_code='GB'
      and evidence.source_kind='posted_document_line'
      and evidence.signed_tax_reporting>0
      and decision.treatment_code='domestic_purchase'
      and decision.tax_point<=p_end
  ) reviewed on reviewed.first_possible_date<=p_end
  left join lateral (
    select sum(allocation."FINCashAlloc_AllocatedAmount") filter (where
      greatest(cash."FINCash_TransactionDate",
        (allocation."FINCashAlloc_AllocatedAt" at time zone 'Europe/London')::date)
          <=p_end) amount,
      sum(allocation."FINCashAlloc_AllocatedAmount") filter (where
        greatest(cash."FINCash_TransactionDate",
          (allocation."FINCashAlloc_AllocatedAt" at time zone 'Europe/London')::date)
            <=reviewed.first_possible_date) amount_at_first_date
    from public."FIN_CashAllocations" allocation
    join public."FIN_CashTransactions" cash
      on cash."FINCash_ID"=allocation."FINCashAlloc_CashID"
    where allocation."FINCashAlloc_DocumentID"=document."FINDoc_ID"
      and allocation."FINCashAlloc_AllocationStatusCode"='allocated'
      and cash."FINCash_LegalEntityID"=p_entity
      and cash."FINCash_TypeCode"='supplier_payment'
      and cash."FINCash_NativePostingStatusCode"='posted'
  ) paid on true
  where document."FINDoc_LegalEntityID"=p_entity
    and document."FINDoc_TypeCode"='pl_invoice'
    and document."FINDoc_NativePostingStatusCode"='posted'
    -- A later payment can restore VAT, but it cannot erase the repayment
    -- that first became due while the invoice was unpaid.
    and document."FINDoc_GrossAmount"-coalesce(paid.amount_at_first_date,0)<>0;
$$;
revoke all on function public._multideck_uk_vat_unpaid_input_tax_risk_rows(uuid,date)
  from public,anon,authenticated;

commit;
