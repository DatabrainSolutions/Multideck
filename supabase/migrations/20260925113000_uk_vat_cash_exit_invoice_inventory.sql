begin;

-- Inventory invoice balances independently of payment-driven Cash previews.
-- The supplied start must be independently verified as the scheme entry date.
-- This does not decide whether an invoice belongs to Cash Accounting, calculate
-- its VAT, choose an exit option, or authorise a return.
create function public.multideck_uk_vat_cash_exit_invoice_inventory(
  p_actor uuid,p_entity uuid,p_start date,p_exit date
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_count integer; v_allocation_count integer;
  v_rows jsonb; v_unposted integer; v_digest text;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  if p_start is null or p_exit is null or p_start>p_exit then
    raise exception 'Choose valid Cash Accounting entry and exit dates.' using errcode='22023';
  end if;
  if not exists(select 1 from public."cmp_LegalEntities" entity
    where entity."LegalEntity_ID"=p_entity
      and entity."LegalEntity_CountryCode"='GB'
      and upper(entity."LegalEntity_BaseCurrencyCodeSnapshot")='GBP') then
    raise exception 'Cash Accounting exit inventory requires a UK GBP legal entity.' using errcode='22023';
  end if;
  select count(*)::integer into v_count from public."FIN_Documents" document
  where document."FINDoc_LegalEntityID"=p_entity
    and document."FINDoc_TypeCode" in ('sl_invoice','pl_invoice')
    and document."FINDoc_NativePostingStatusCode"='posted'
    and document."FINDoc_DocumentDate" between p_start and p_exit;
  select count(*)::integer into v_unposted from public."FIN_Documents" document
  where document."FINDoc_LegalEntityID"=p_entity
    and document."FINDoc_TypeCode" in ('sl_invoice','pl_invoice')
    and document."FINDoc_NativePostingStatusCode"<>'posted'
    and document."FINDoc_DocumentDate" between p_start and p_exit;
  select count(*)::integer into v_allocation_count
  from public."FIN_CashAllocations" allocation
  join public."FIN_Documents" document
    on document."FINDoc_ID"=allocation."FINCashAlloc_DocumentID"
  where document."FINDoc_LegalEntityID"=p_entity
    and document."FINDoc_TypeCode" in ('sl_invoice','pl_invoice')
    and document."FINDoc_NativePostingStatusCode"='posted'
    and document."FINDoc_DocumentDate" between p_start and p_exit;
  if v_count>1000 or v_allocation_count>5000 then
    return jsonb_build_object('legalEntityId',p_entity,'startDate',p_start,
      'exitDate',p_exit,'invoiceCount',v_count,'unpostedInvoiceCount',v_unposted,
      'allocationCount',v_allocation_count,'invoices','[]'::jsonb,'truncated',true,
      'status','invoice_balance_inventory_only');
  end if;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.document_date,item.invoice_id),'[]'::jsonb)
  into v_rows from (
    select document."FINDoc_ID" invoice_id,
      document."FINDoc_TypeCode" document_type,
      document."FINDoc_DocumentDate" document_date,
      document."FINDoc_NativePostedAt" native_posted_at,
      document."FINDoc_NativePostingBatchID" posting_batch_id,
      document."FINDoc_CurrencyCodeSnapshot" currency_code,
      document."FINDoc_ExchangeRate" exchange_rate,
      document."FINDoc_GrossAmount" gross_amount,
      document."FINDoc_LocalGrossAmount" local_gross_amount,
      coalesce(payment.paid_through_exit,0) paid_through_exit,
      document."FINDoc_GrossAmount"-coalesce(payment.paid_through_exit,0) candidate_outstanding,
      coalesce(payment.unsupported_allocation_count,0) unsupported_allocation_count,
      coalesce(payment.future_allocation_count,0) future_allocation_count,
      coalesce(payment.allocation_sources,'[]'::jsonb) allocation_sources,
      (document."FINDoc_CurrencyCodeSnapshot"<>'GBP'
        or document."FINDoc_ExchangeRate"<>1
        or document."FINDoc_GrossAmount" is distinct from document."FINDoc_LocalGrossAmount"
        or document."FINDoc_GrossAmount"<=0
        or document."FINDoc_NativePostingBatchID" is null
        or document."FINDoc_NativePostedAt" is null
        or (document."FINDoc_NativePostedAt" at time zone 'Europe/London')::date>p_exit
        or coalesce(payment.unsupported_allocation_count,0)>0
        or coalesce(payment.paid_through_exit,0)>document."FINDoc_GrossAmount") source_exception
    from public."FIN_Documents" document
    left join lateral (
      select coalesce(sum(allocation."FINCashAlloc_AllocatedAmount") filter (where
          allocation."FINCashAlloc_AllocationStatusCode"='allocated'
          and cash."FINCash_NativePostingStatusCode"='posted'
          and cash."FINCash_NativePostedAt" is not null
          and cash."FINCash_LegalEntityID"=p_entity
          and cash."FINCash_CurrencyCodeSnapshot"='GBP'
          and cash."FINCash_TypeCode"=case
            when document."FINDoc_TypeCode"='sl_invoice' then 'customer_receipt'
            else 'supplier_payment' end
          and allocation."FINCashAlloc_DocumentLineID" is null
          and allocation."FINCashAlloc_AllocatedAmount">0
          and review.vat_payment_date is not null
          and greatest(review.vat_payment_date,
            (allocation."FINCashAlloc_AllocatedAt" at time zone 'Europe/London')::date)<=p_exit
          and (cash."FINCash_NativePostedAt" at time zone 'Europe/London')::date<=p_exit),0)
          paid_through_exit,
        count(*) filter (where
          allocation."FINCashAlloc_AllocationStatusCode"<>'allocated'
          or allocation."FINCashAlloc_AllocatedAmount"<=0
          or allocation."FINCashAlloc_DocumentLineID" is not null
          or cash."FINCash_ID" is null
          or cash."FINCash_LegalEntityID" is distinct from p_entity
          or cash."FINCash_NativePostingStatusCode"<>'posted'
          or cash."FINCash_NativePostedAt" is null
          or cash."FINCash_CurrencyCodeSnapshot"<>'GBP'
          or cash."FINCash_TypeCode" is distinct from case
            when document."FINDoc_TypeCode"='sl_invoice' then 'customer_receipt'
            else 'supplier_payment' end
          or review.vat_payment_date is null)::integer unsupported_allocation_count,
        count(*) filter (where
          review.vat_payment_date>p_exit
          or (allocation."FINCashAlloc_AllocatedAt" at time zone 'Europe/London')::date>p_exit
          or (cash."FINCash_NativePostedAt" at time zone 'Europe/London')::date>p_exit
        )::integer future_allocation_count,
        coalesce(jsonb_agg(jsonb_build_object(
          'allocationId',allocation."FINCashAlloc_ID",
          'allocatedAmount',allocation."FINCashAlloc_AllocatedAmount",
          'allocationStatus',allocation."FINCashAlloc_AllocationStatusCode",
          'allocatedAt',allocation."FINCashAlloc_AllocatedAt",
          'documentLineId',allocation."FINCashAlloc_DocumentLineID",
          'cashId',cash."FINCash_ID",
          'cashType',cash."FINCash_TypeCode",
          'cashEntityId',cash."FINCash_LegalEntityID",
          'cashCurrency',cash."FINCash_CurrencyCodeSnapshot",
          'cashPostingStatus',cash."FINCash_NativePostingStatusCode",
          'cashPostedAt',cash."FINCash_NativePostedAt",
          'reviewRevision',review.revision,
          'paymentDate',review.vat_payment_date)
          order by allocation."FINCashAlloc_ID"),'[]'::jsonb) allocation_sources
      from public."FIN_CashAllocations" allocation
      left join public."FIN_CashTransactions" cash
        on cash."FINCash_ID"=allocation."FINCashAlloc_CashID"
      left join lateral (select candidate.vat_payment_date,candidate.revision
        from public."FIN_IndirectTaxCashPaymentDateReviews" candidate
        where candidate.cash_id=cash."FINCash_ID" and candidate.legal_entity_id=p_entity
        order by candidate.revision desc limit 1) review on true
      where allocation."FINCashAlloc_DocumentID"=document."FINDoc_ID"
    ) payment on true
    where document."FINDoc_LegalEntityID"=p_entity
      and document."FINDoc_TypeCode" in ('sl_invoice','pl_invoice')
      and document."FINDoc_NativePostingStatusCode"='posted'
      and document."FINDoc_DocumentDate" between p_start and p_exit
  ) item;
  v_digest:=encode(sha256(convert_to(jsonb_build_object(
    'entity',p_entity,'start',p_start,'exit',p_exit,
    'count',v_count,'unposted',v_unposted,'allocations',v_allocation_count,
    'invoices',v_rows)::text,'UTF8')),'hex');
  return jsonb_build_object('legalEntityId',p_entity,'startDate',p_start,
    'exitDate',p_exit,'invoiceCount',v_count,'unpostedInvoiceCount',v_unposted,
    'allocationCount',v_allocation_count,
    'invoices',v_rows,'sourceDigest',v_digest,'truncated',false,
    'status','invoice_balance_inventory_only');
end; $$;
revoke all on function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  to service_role;

commit;
