begin;

-- Keep the original first-repayment source list reachable beyond its first 50
-- rows. The existing three-argument readback remains available to old clients.
create function public.multideck_uk_vat_clawback_candidates_page(
  p_actor uuid,p_entity uuid,p_period uuid,p_offset integer default 0,
  p_limit integer default 50
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_total integer; v_rows jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  if p_offset is null or p_offset<0 or p_offset>2147483647
    or p_limit is null or p_limit<1 or p_limit>50 then
    raise exception 'Choose a valid supplier VAT candidate page.' using errcode='22023';
  end if;
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=p_period and legal_entity_id=p_entity and jurisdiction_code='GB';
  if not found then
    raise exception 'UK VAT period was not found.' using errcode='P0002';
  end if;
  select count(*)::integer into v_total
    from public._multideck_uk_vat_unpaid_input_tax_risk_rows(p_entity,v_period.end_date);
  select coalesce(jsonb_agg(to_jsonb(candidate)
    order by candidate.first_possible_clawback_date,candidate.document_date,
      candidate.document_id),'[]'::jsonb) into v_rows
    from (select * from public._multideck_uk_vat_unpaid_input_tax_risk_rows(
      p_entity,v_period.end_date)
      order by first_possible_clawback_date,document_date,document_id
      offset p_offset limit p_limit) candidate;
  return jsonb_build_object('periodId',p_period,'legalEntityId',p_entity,
    'periodEnd',v_period.end_date,'totalCandidates',v_total,
    'offset',p_offset,'items',v_rows);
end; $$;
revoke all on function public.multideck_uk_vat_clawback_candidates_page(
  uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_clawback_candidates_page(
  uuid,uuid,uuid,integer,integer) to service_role;

-- A fully settled invoice may still need a reviewed Box 4 restoration. Give
-- operators a focused, paged list of payments after the first repayment.
create function public.multideck_uk_vat_supplier_payment_followups(
  p_actor uuid,p_entity uuid,p_period uuid,p_offset integer default 0,
  p_limit integer default 50
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_total integer; v_rows jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  if p_offset is null or p_offset<0 or p_offset>2147483647
    or p_limit is null or p_limit<1 or p_limit>50 then
    raise exception 'Choose a valid supplier VAT follow-up page.' using errcode='22023';
  end if;
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=p_period and legal_entity_id=p_entity and jurisdiction_code='GB';
  if not found then
    raise exception 'UK VAT period was not found.' using errcode='P0002';
  end if;
  with candidates as (
    select first.document_id,document."FINDoc_Number"::text document_number,
      first.first_period_end,
      count(*)::integer payment_count,
      sum(allocation."FINCashAlloc_AllocatedAmount") paid_in_period
    from (select posting.document_id,min(first_period.end_date) first_period_end
      from public."FIN_IndirectTaxInputTaxRepaymentPostings" posting
      join public."FIN_IndirectTaxPeriods" first_period
        on first_period.id=posting.period_id
      where posting.legal_entity_id=p_entity
      group by posting.document_id) first
    join public."FIN_Documents" document
      on document."FINDoc_ID"=first.document_id
      and document."FINDoc_LegalEntityID"=p_entity
      and document."FINDoc_TypeCode"='pl_invoice'
    join public."FIN_CashAllocations" allocation
      on allocation."FINCashAlloc_DocumentID"=first.document_id
      and allocation."FINCashAlloc_AllocationStatusCode"='allocated'
      and allocation."FINCashAlloc_AllocatedAmount">0
    join public."FIN_CashTransactions" cash
      on cash."FINCash_ID"=allocation."FINCashAlloc_CashID"
      and cash."FINCash_LegalEntityID"=p_entity
      and cash."FINCash_TypeCode"='supplier_payment'
      and cash."FINCash_NativePostingStatusCode"='posted'
    where first.first_period_end<v_period.start_date
      and greatest(cash."FINCash_TransactionDate",
        (allocation."FINCashAlloc_AllocatedAt" at time zone 'Europe/London')::date)
          between v_period.start_date and v_period.end_date
      and not exists (
        select 1 from public."FIN_IndirectTaxLaterInputTaxRestorationPostings" later
        where later.legal_entity_id=p_entity and later.period_id=p_period
          and later.document_id=first.document_id)
    group by first.document_id,document."FINDoc_Number",first.first_period_end
  ) select count(*)::integer into v_total from candidates;
  with candidates as (
    select first.document_id,document."FINDoc_Number"::text document_number,
      first.first_period_end,
      count(*)::integer payment_count,
      sum(allocation."FINCashAlloc_AllocatedAmount") paid_in_period
    from (select posting.document_id,min(first_period.end_date) first_period_end
      from public."FIN_IndirectTaxInputTaxRepaymentPostings" posting
      join public."FIN_IndirectTaxPeriods" first_period
        on first_period.id=posting.period_id
      where posting.legal_entity_id=p_entity
      group by posting.document_id) first
    join public."FIN_Documents" document
      on document."FINDoc_ID"=first.document_id
      and document."FINDoc_LegalEntityID"=p_entity
      and document."FINDoc_TypeCode"='pl_invoice'
    join public."FIN_CashAllocations" allocation
      on allocation."FINCashAlloc_DocumentID"=first.document_id
      and allocation."FINCashAlloc_AllocationStatusCode"='allocated'
      and allocation."FINCashAlloc_AllocatedAmount">0
    join public."FIN_CashTransactions" cash
      on cash."FINCash_ID"=allocation."FINCashAlloc_CashID"
      and cash."FINCash_LegalEntityID"=p_entity
      and cash."FINCash_TypeCode"='supplier_payment'
      and cash."FINCash_NativePostingStatusCode"='posted'
    where first.first_period_end<v_period.start_date
      and greatest(cash."FINCash_TransactionDate",
        (allocation."FINCashAlloc_AllocatedAt" at time zone 'Europe/London')::date)
          between v_period.start_date and v_period.end_date
      and not exists (
        select 1 from public."FIN_IndirectTaxLaterInputTaxRestorationPostings" later
        where later.legal_entity_id=p_entity and later.period_id=p_period
          and later.document_id=first.document_id)
    group by first.document_id,document."FINDoc_Number",first.first_period_end
  ) select coalesce(jsonb_agg(to_jsonb(page) order by page.first_period_end,
      page.document_number,page.document_id),'[]'::jsonb)
    into v_rows from (select * from candidates
      order by first_period_end,document_number,document_id
      offset p_offset limit p_limit) page;
  return jsonb_build_object('periodId',p_period,'legalEntityId',p_entity,
    'total',v_total,'offset',p_offset,'items',v_rows);
end; $$;
revoke all on function public.multideck_uk_vat_supplier_payment_followups(
  uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_supplier_payment_followups(
  uuid,uuid,uuid,integer,integer) to service_role;

commit;
