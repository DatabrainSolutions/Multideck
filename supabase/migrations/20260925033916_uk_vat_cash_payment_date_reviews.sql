begin;

-- HMRC Notice 731 uses the date dictated by the payment method. The native
-- cash transaction date is a ledger date, not automatically the VAT date.
create table public."FIN_IndirectTaxCashPaymentDateReviews" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  cash_id uuid not null references public."FIN_CashTransactions"("FINCash_ID") on delete restrict,
  revision integer not null check (revision>0),
  method_code text not null check (method_code in
    ('cash_handover','bank_credit_or_debit','card_voucher','cheque','agent_collection')),
  method_event_date date not null,
  cheque_date date,
  vat_payment_date date not null,
  evidence_reference text not null check (length(btrim(evidence_reference)) between 3 and 160),
  source_fingerprint text not null check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  reviewed_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  reviewed_at timestamptz not null default clock_timestamp(),
  unique (cash_id,revision),
  check ((method_code='cheque' and cheque_date is not null
    and vat_payment_date=greatest(method_event_date,cheque_date))
    or (method_code<>'cheque' and cheque_date is null
      and vat_payment_date=method_event_date))
);
create index "IX_FIN_IndirectTaxCashPaymentDateReviews_latest"
  on public."FIN_IndirectTaxCashPaymentDateReviews"(cash_id,revision desc);
create trigger indirect_tax_cash_payment_date_review_immutable before update or delete
  on public."FIN_IndirectTaxCashPaymentDateReviews"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxCashPaymentDateReviews" enable row level security;
revoke all on public."FIN_IndirectTaxCashPaymentDateReviews"
  from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxCashPaymentDateReviews" to service_role;

create function public.multideck_uk_vat_review_cash_payment_date(
  p_actor uuid,p_entity uuid,p_cash uuid,p_method text,p_method_date date,
  p_cheque_date date,p_evidence_reference text,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_cash public."FIN_CashTransactions"%rowtype;
  v_review public."FIN_IndirectTaxCashPaymentDateReviews"%rowtype;
  v_allocations jsonb; v_source_fingerprint text; v_vat_date date;
  v_revision integer; v_reference text:=btrim(p_evidence_reference);
  v_reason text:=btrim(p_reason); v_today date:=(clock_timestamp() at time zone 'Europe/London')::date;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_cash is null or p_method is null or p_method not in
      ('cash_handover','bank_credit_or_debit','card_voucher','cheque','agent_collection')
    or p_method_date is null or p_method_date>v_today
    or (p_method='cheque' and (p_cheque_date is null or p_cheque_date>v_today))
    or (p_method<>'cheque' and p_cheque_date is not null)
    or v_reference is null or length(v_reference) not between 3 and 160
    or v_reason is null or length(v_reason) not between 10 and 2000 then
    raise exception 'Enter the evidenced payment method, date and review reason.' using errcode='22023';
  end if;
  v_vat_date:=case when p_method='cheque' then greatest(p_method_date,p_cheque_date)
    else p_method_date end;
  select * into v_cash from public."FIN_CashTransactions"
    where "FINCash_ID"=p_cash and "FINCash_LegalEntityID"=p_entity for update;
  if not found then raise exception 'The cash source is unavailable for this legal entity.' using errcode='42501'; end if;
  if v_cash."FINCash_NativePostingStatusCode"<>'posted'
    or v_cash."FINCash_NativePostingBatchID" is null
    or v_cash."FINCash_TypeCode" not in ('customer_receipt','supplier_payment')
    or (p_method='agent_collection' and v_cash."FINCash_TypeCode"<>'customer_receipt') then
    raise exception 'Review a supported, posted customer receipt or supplier payment.' using errcode='22023';
  end if;
  if not exists(select 1 from public."cmp_LegalEntities" entity
    where entity."LegalEntity_ID"=p_entity and entity."LegalEntity_CountryCode"='GB'
      and upper(entity."LegalEntity_BaseCurrencyCodeSnapshot")='GBP') then
    raise exception 'UK cash VAT payment review requires a GBP legal entity.' using errcode='22023';
  end if;
  if exists(select 1 from public."FIN_CashAllocations" allocation
    where allocation."FINCashAlloc_CashID"=p_cash
      and allocation."FINCashAlloc_AllocationStatusCode"<>'allocated')
    or coalesce((select sum(allocation."FINCashAlloc_AllocatedAmount")
      from public."FIN_CashAllocations" allocation
      where allocation."FINCashAlloc_CashID"=p_cash),0)>v_cash."FINCash_Amount" then
    raise exception 'Resolve invalid or pending cash allocations before VAT payment review.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(allocation) order by allocation."FINCashAlloc_ID"),'[]'::jsonb)
    into v_allocations from public."FIN_CashAllocations" allocation
    where allocation."FINCashAlloc_CashID"=p_cash;
  v_source_fingerprint:=encode(sha256(convert_to(
    (to_jsonb(v_cash)-array['FINCash_StatusCode','FINCash_PostingStatusCode',
      'FINCash_ExportStatusCode','FINCash_UpdatedAt','FINCash_UpdatedBy'])::text||
    v_allocations::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('uk-vat-cash-payment-review:'||p_cash::text,0));
  select * into v_review from public."FIN_IndirectTaxCashPaymentDateReviews"
    where cash_id=p_cash and legal_entity_id=p_entity order by revision desc limit 1;
  if exists(select 1 from public."FIN_IndirectTaxPeriods" period
    where period.legal_entity_id=p_entity and period.jurisdiction_code='GB'
      and period.scheme_code='cash' and period.status='review_locked'
      and (v_vat_date between period.start_date and period.end_date
        or v_review.vat_payment_date between period.start_date and period.end_date)) then
    raise exception 'A locked Cash Accounting VAT period cannot change its payment date.' using errcode='22023';
  end if;
  if v_review.id is not null and v_review.method_code=p_method
    and v_review.method_event_date=p_method_date
    and v_review.cheque_date is not distinct from p_cheque_date
    and v_review.evidence_reference=v_reference and v_review.reason=v_reason
    and v_review.source_fingerprint=v_source_fingerprint then
    return jsonb_build_object('reviewId',v_review.id,'cashId',p_cash,
      'revision',v_review.revision,'vatPaymentDate',v_review.vat_payment_date,
      'reviewedAt',v_review.reviewed_at,'inserted',false,
      'status','payment_date_review_only');
  end if;
  v_revision:=coalesce(v_review.revision,0)+1;
  insert into public."FIN_IndirectTaxCashPaymentDateReviews"(
    legal_entity_id,cash_id,revision,method_code,method_event_date,cheque_date,
    vat_payment_date,evidence_reference,source_fingerprint,reason,reviewed_by)
  values(p_entity,p_cash,v_revision,p_method,p_method_date,p_cheque_date,
    v_vat_date,v_reference,v_source_fingerprint,v_reason,p_actor)
  returning * into v_review;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_IndirectTaxCashPaymentDateReviews','uk_vat_cash_payment_date',v_review.id,
    'review_uk_vat_cash_payment_date',v_reason,'UK VAT cash payment date reviewed',
    jsonb_build_object('cashId',p_cash,'revision',v_revision,'method',p_method,
      'methodDate',p_method_date,'chequeDate',p_cheque_date,
      'vatPaymentDate',v_vat_date,'sourceFingerprint',v_source_fingerprint,
      'evidenceReference',v_reference));
  return jsonb_build_object('reviewId',v_review.id,'cashId',p_cash,
    'revision',v_revision,'vatPaymentDate',v_vat_date,
    'reviewedAt',v_review.reviewed_at,'inserted',true,
    'status','payment_date_review_only');
end; $$;
revoke all on function public.multideck_uk_vat_review_cash_payment_date(
  uuid,uuid,uuid,text,date,date,text,text) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_review_cash_payment_date(
  uuid,uuid,uuid,text,date,date,text,text) to service_role;

create function public.multideck_uk_vat_cash_payment_date_queue(
  p_actor uuid,p_entity uuid,p_offset integer default 0,p_limit integer default 25
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_total integer; v_rows jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Choose a valid cash payment review page.' using errcode='22023';
  end if;
  if not exists(select 1 from public."cmp_LegalEntities" entity
    where entity."LegalEntity_ID"=p_entity and entity."LegalEntity_CountryCode"='GB'
      and upper(entity."LegalEntity_BaseCurrencyCodeSnapshot")='GBP') then
    raise exception 'UK cash VAT payment review requires a GBP legal entity.' using errcode='22023';
  end if;
  select count(*)::integer into v_total from public."FIN_CashTransactions" cash
    where cash."FINCash_LegalEntityID"=p_entity
      and cash."FINCash_NativePostingStatusCode"='posted'
      and cash."FINCash_TypeCode" in ('customer_receipt','supplier_payment');
  select coalesce(jsonb_agg(to_jsonb(item) order by item.transaction_date desc,item.cash_id desc),'[]'::jsonb)
    into v_rows from (
    select cash."FINCash_ID" cash_id,cash."FINCash_Number" cash_number,
      cash."FINCash_TypeCode" cash_type,cash."FINCash_TransactionDate" transaction_date,
      cash."FINCash_Amount" amount,cash."FINCash_CurrencyCodeSnapshot" currency_code,
      cash."FINCash_NativePostingBatchID" posting_batch_id,
      (select count(*)::integer from public."FIN_CashAllocations" allocation
        where allocation."FINCashAlloc_CashID"=cash."FINCash_ID") allocation_count,
      (select coalesce(sum(allocation."FINCashAlloc_AllocatedAmount"),0)
        from public."FIN_CashAllocations" allocation
        where allocation."FINCashAlloc_CashID"=cash."FINCash_ID") allocated_amount,
      review.id review_id,review.revision,review.method_code,
      review.method_event_date,review.cheque_date,review.vat_payment_date,
      review.evidence_reference,review.source_fingerprint,
      review.reason,review.reviewed_by,review.reviewed_at,
      (select coalesce(jsonb_agg(jsonb_build_object(
        'reviewId',history.id,'revision',history.revision,
        'method',history.method_code,'vatPaymentDate',history.vat_payment_date,
        'evidenceReference',history.evidence_reference,'reason',history.reason,
        'reviewedBy',history.reviewed_by,'reviewedAt',history.reviewed_at)
        order by history.revision),'[]'::jsonb)
       from public."FIN_IndirectTaxCashPaymentDateReviews" history
       where history.cash_id=cash."FINCash_ID" and history.legal_entity_id=p_entity) review_history
    from public."FIN_CashTransactions" cash
    left join lateral (select * from public."FIN_IndirectTaxCashPaymentDateReviews" payment_review
      where payment_review.cash_id=cash."FINCash_ID" and payment_review.legal_entity_id=p_entity
      order by payment_review.revision desc limit 1) review on true
    where cash."FINCash_LegalEntityID"=p_entity
      and cash."FINCash_NativePostingStatusCode"='posted'
      and cash."FINCash_TypeCode" in ('customer_receipt','supplier_payment')
    order by cash."FINCash_TransactionDate" desc,cash."FINCash_ID" desc
    offset p_offset limit p_limit
  ) item;
  return jsonb_build_object('legalEntityId',p_entity,'total',v_total,
    'offset',p_offset,'limit',p_limit,'items',v_rows,
    'status','review_only_no_cash_return_effect');
end; $$;
revoke all on function public.multideck_uk_vat_cash_payment_date_queue(uuid,uuid,integer,integer)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_payment_date_queue(uuid,uuid,integer,integer)
  to service_role;

commit;
