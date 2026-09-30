begin;

-- A payment-driven source can exist without an invoice allocation, and native
-- cash types include refunds and on-account amounts. Bind all posted cash in
-- the supplied scheme interval to the exit inventory and flag any amount that
-- is not wholly supported by a reviewed, dated, in-scope invoice allocation.
alter function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  rename to _multideck_uk_vat_cash_exit_invoice_inventory_before_cash_sources;
revoke all on function public._multideck_uk_vat_cash_exit_invoice_inventory_before_cash_sources(
  uuid,uuid,date,date) from public,anon,authenticated,service_role;

create function public.multideck_uk_vat_cash_exit_invoice_inventory(
  p_actor uuid,p_entity uuid,p_start date,p_exit date
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_inventory jsonb; v_cash_count integer; v_allocation_count integer;
  v_cash jsonb; v_issue_count integer;
begin
  -- The prior source validates actor, legal entity, UK GBP scope and dates.
  v_inventory:=public._multideck_uk_vat_cash_exit_invoice_inventory_before_cash_sources(
    p_actor,p_entity,p_start,p_exit);
  select count(*)::integer,coalesce(sum((select count(*)
    from public."FIN_CashAllocations" allocation
    where allocation."FINCashAlloc_CashID"=cash."FINCash_ID")),0)::integer
    into v_cash_count,v_allocation_count
  from public."FIN_CashTransactions" cash
  left join lateral (select candidate.vat_payment_date
    from public."FIN_IndirectTaxCashPaymentDateReviews" candidate
    where candidate.cash_id=cash."FINCash_ID" and candidate.legal_entity_id=p_entity
    order by candidate.revision desc limit 1) scope_review on true
  where cash."FINCash_LegalEntityID"=p_entity
    and cash."FINCash_NativePostingStatusCode" in ('posted','reversed','pending_migration')
    and ((least(cash."FINCash_TransactionDate",cash."FINCash_AccountingDate")<=p_exit
      and greatest(cash."FINCash_TransactionDate",cash."FINCash_AccountingDate")>=p_start)
      or scope_review.vat_payment_date between p_start and p_exit);
  if v_inventory->>'truncated'='true' or v_cash_count>1000 or v_allocation_count>5000 then
    return v_inventory||jsonb_build_object(
      'cashSourceCount',v_cash_count,'cashAllocationCount',v_allocation_count,
      'cashSources','[]'::jsonb,'cashSourceIssueCount',null,
      'invoices','[]'::jsonb,'sourceDigest',null,'truncated',true);
  end if;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.transaction_date,item.cash_id),'[]'::jsonb)
    into v_cash from (
    select cash."FINCash_ID" cash_id,
      cash."FINCash_TypeCode" cash_type,
      cash."FINCash_NativePostingStatusCode" native_posting_status,
      cash."FINCash_TransactionDate" transaction_date,
      cash."FINCash_AccountingDate" accounting_date,
      cash."FINCash_NativePostedAt" native_posted_at,
      cash."FINCash_NativePostingBatchID" posting_batch_id,
      cash."FINCash_CurrencyCodeSnapshot" currency_code,
      cash."FINCash_ExchangeRate" exchange_rate,
      cash."FINCash_Amount" cash_amount,
      cash."FINCash_LocalAmount" local_amount,
      cash."FINCash_UnallocatedAmount" unallocated_amount,
      review.revision payment_review_revision,
      review.vat_payment_date,
      coalesce(payment.represented_amount,0) represented_amount,
      coalesce(payment.allocation_sources,'[]'::jsonb) allocation_sources,
      (cash."FINCash_NativePostingStatusCode"<>'posted'
        or cash."FINCash_TypeCode" not in ('customer_receipt','supplier_payment')
        or cash."FINCash_CurrencyCodeSnapshot"<>'GBP'
        or cash."FINCash_ExchangeRate"<>1
        or cash."FINCash_Amount" is distinct from cash."FINCash_LocalAmount"
        or cash."FINCash_Amount"<=0
        or cash."FINCash_UnallocatedAmount"<>0
        or cash."FINCash_NativePostingBatchID" is null
        or cash."FINCash_NativePostedAt" is null
        or (cash."FINCash_NativePostedAt" at time zone 'Europe/London')::date>p_exit
        or review.vat_payment_date is null
        or coalesce(payment.represented_amount,0)<>cash."FINCash_Amount") source_issue
    from public."FIN_CashTransactions" cash
    left join lateral (select candidate.revision,candidate.vat_payment_date
      from public."FIN_IndirectTaxCashPaymentDateReviews" candidate
      where candidate.cash_id=cash."FINCash_ID" and candidate.legal_entity_id=p_entity
      order by candidate.revision desc limit 1) review on true
    left join lateral (
      select coalesce(sum(allocation."FINCashAlloc_AllocatedAmount") filter (where
          allocation."FINCashAlloc_AllocationStatusCode"='allocated'
          and allocation."FINCashAlloc_DocumentLineID" is null
          and allocation."FINCashAlloc_AllocatedAmount">0
          and document."FINDoc_LegalEntityID"=p_entity
          and document."FINDoc_NativePostingStatusCode"='posted'
          and document."FINDoc_TypeCode"=case
            when cash."FINCash_TypeCode"='customer_receipt' then 'sl_invoice'
            when cash."FINCash_TypeCode"='supplier_payment' then 'pl_invoice'
            else null end
          and document."FINDoc_DocumentDate" between p_start and p_exit
          and review.vat_payment_date is not null
          and greatest(review.vat_payment_date,
            (allocation."FINCashAlloc_AllocatedAt" at time zone 'Europe/London')::date)<=p_exit
          and (cash."FINCash_NativePostedAt" at time zone 'Europe/London')::date<=p_exit),0)
        represented_amount,
        coalesce(jsonb_agg(jsonb_build_object(
          'allocationId',allocation."FINCashAlloc_ID",
          'documentId',allocation."FINCashAlloc_DocumentID",
          'documentType',document."FINDoc_TypeCode",
          'documentEntityId',document."FINDoc_LegalEntityID",
          'documentDate',document."FINDoc_DocumentDate",
          'documentPostingStatus',document."FINDoc_NativePostingStatusCode",
          'documentLineId',allocation."FINCashAlloc_DocumentLineID",
          'allocatedAmount',allocation."FINCashAlloc_AllocatedAmount",
          'allocationStatus',allocation."FINCashAlloc_AllocationStatusCode",
          'allocatedAt',allocation."FINCashAlloc_AllocatedAt")
          order by allocation."FINCashAlloc_ID"),'[]'::jsonb) allocation_sources
      from public."FIN_CashAllocations" allocation
      left join public."FIN_Documents" document
        on document."FINDoc_ID"=allocation."FINCashAlloc_DocumentID"
      where allocation."FINCashAlloc_CashID"=cash."FINCash_ID"
    ) payment on true
    where cash."FINCash_LegalEntityID"=p_entity
      and cash."FINCash_NativePostingStatusCode" in ('posted','reversed','pending_migration')
      and ((least(cash."FINCash_TransactionDate",cash."FINCash_AccountingDate")<=p_exit
        and greatest(cash."FINCash_TransactionDate",cash."FINCash_AccountingDate")>=p_start)
        or review.vat_payment_date between p_start and p_exit)
  ) item;
  select count(*)::integer into v_issue_count
  from jsonb_array_elements(v_cash) source(value)
  where source.value->>'source_issue'='true';
  return v_inventory||jsonb_build_object(
    'cashSourceCount',v_cash_count,'cashAllocationCount',v_allocation_count,
    'cashSources',v_cash,'cashSourceIssueCount',v_issue_count,
    'sourceDigest',encode(sha256(convert_to(jsonb_build_object(
      'invoiceLineDigest',v_inventory->>'sourceDigest',
      'cashSourceCount',v_cash_count,'cashAllocationCount',v_allocation_count,
      'cashSources',v_cash)::text,'UTF8')),'hex'));
end; $$;
revoke all on function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  to service_role;

commit;
