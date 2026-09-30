begin;

-- A credit from an earlier period can reduce the amount later received from
-- the same customer or paid to the same supplier. Until credit application
-- and refund events exist, a current cash allocation must not silently treat
-- the invoice's unchanged gross value as the final price.
create or replace function public.multideck_uk_vat_cash_source_snapshot(
  p_actor uuid,p_entity uuid,p_start date,p_end date
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_snapshot jsonb; v_period_credits integer; v_prior_party_credits integer;
begin
  -- The private source verifies the caller, legal entity, dates and bounds.
  v_snapshot:=public._multideck_uk_vat_cash_source_snapshot_before_credit_inventory(
    p_actor,p_entity,p_start,p_end);
  select count(*)::integer into v_period_credits
  from public."FIN_Documents" document
  where document."FINDoc_LegalEntityID"=p_entity
    and document."FINDoc_NativePostingStatusCode"='posted'
    and document."FINDoc_TypeCode" in ('credit_note','debit_note')
    and document."FINDoc_DocumentDate" between p_start and p_end;
  with paid_parties as (
    select distinct invoice."FINDoc_PartyOrgID" party_id,invoice."FINDoc_TypeCode" invoice_type
    from jsonb_array_elements(v_snapshot->'allocations') allocation(value)
    join public."FIN_Documents" invoice
      on invoice."FINDoc_ID"=(allocation.value->>'document_id')::uuid
      and invoice."FINDoc_LegalEntityID"=p_entity
    where (allocation.value->>'vat_payment_date')::date between p_start and p_end
      and invoice."FINDoc_PartyOrgID" is not null
      and invoice."FINDoc_TypeCode" in ('sl_invoice','pl_invoice')
  )
  select count(*)::integer into v_prior_party_credits
  from public."FIN_Documents" credit
  where credit."FINDoc_LegalEntityID"=p_entity
    and credit."FINDoc_NativePostingStatusCode"='posted'
    and credit."FINDoc_DocumentDate"<p_start
    and credit."FINDoc_TypeCode" in ('credit_note','debit_note')
    and exists(select 1 from paid_parties paid
      where paid.party_id=credit."FINDoc_PartyOrgID"
        and (paid.invoice_type,credit."FINDoc_TypeCode") in
          (('sl_invoice','credit_note'),('pl_invoice','debit_note')));
  return v_snapshot||jsonb_build_object('postedPeriodCreditCount',v_period_credits,
    'priorPartyCreditCount',v_prior_party_credits);
end; $$;

-- Source equality is rechecked by the wrapped writer inside its transaction.
-- This extra gate prevents a caller from supplying a fabricated valid preview.
create or replace function public.multideck_uk_vat_record_cash_event_projection(
  p_actor uuid,p_entity uuid,p_start date,p_end date,p_source jsonb,p_preview jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_source is null or p_source->>'postedPeriodCreditCount' is distinct from '0'
    or p_source->>'priorPartyCreditCount' is distinct from '0' then
    raise exception 'Posted credits need reviewed Cash Accounting application and refund events before projection.' using errcode='22023';
  end if;
  return public._multideck_uk_vat_record_cash_event_projection_before_credit_inventory(
    p_actor,p_entity,p_start,p_end,p_source,p_preview);
end; $$;

commit;
