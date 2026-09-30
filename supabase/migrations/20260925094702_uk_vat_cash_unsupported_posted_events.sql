begin;

-- The native cash catalogue includes refund, on-account, bank-charge and FX
-- entries. None has a reviewed Cash Accounting tax-point/event adapter yet.
-- A posted entry must never disappear from the source merely because the
-- current extractor recognises only customer receipts and supplier payments.
alter function public.multideck_uk_vat_cash_source_snapshot(uuid,uuid,date,date)
  rename to _multideck_uk_vat_cash_source_snapshot_before_unsupported_cash;
revoke all on function public._multideck_uk_vat_cash_source_snapshot_before_unsupported_cash(
  uuid,uuid,date,date) from public,anon,authenticated,service_role;

create function public.multideck_uk_vat_cash_source_snapshot(
  p_actor uuid,p_entity uuid,p_start date,p_end date
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_snapshot jsonb; v_count integer; v_types jsonb;
begin
  -- The previous source checks actor, company, UK GBP entity and date bounds.
  v_snapshot:=public._multideck_uk_vat_cash_source_snapshot_before_unsupported_cash(
    p_actor,p_entity,p_start,p_end);
  select coalesce(sum(kind.event_count),0)::integer,
    coalesce(jsonb_agg(jsonb_build_object('type',kind.cash_type,
      'count',kind.event_count) order by kind.cash_type),'[]'::jsonb)
    into v_count,v_types
  from (
    select cash."FINCash_TypeCode" cash_type,count(*)::integer event_count
    from public."FIN_CashTransactions" cash
    where cash."FINCash_LegalEntityID"=p_entity
      and cash."FINCash_NativePostingStatusCode"='posted'
      and least(cash."FINCash_TransactionDate",cash."FINCash_AccountingDate")<=p_end
      and cash."FINCash_TypeCode" not in ('customer_receipt','supplier_payment')
    group by cash."FINCash_TypeCode"
  ) kind;
  return v_snapshot||jsonb_build_object(
    'unsupportedPostedCashCount',v_count,
    'unsupportedPostedCashTypes',v_types);
end; $$;
revoke all on function public.multideck_uk_vat_cash_source_snapshot(uuid,uuid,date,date)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_source_snapshot(uuid,uuid,date,date)
  to service_role;

alter function public.multideck_uk_vat_record_cash_event_projection(
  uuid,uuid,date,date,jsonb,jsonb)
  rename to _multideck_uk_vat_record_cash_event_projection_before_unsupported_cash;
revoke all on function public._multideck_uk_vat_record_cash_event_projection_before_unsupported_cash(
  uuid,uuid,date,date,jsonb,jsonb) from public,anon,authenticated,service_role;

create function public.multideck_uk_vat_record_cash_event_projection(
  p_actor uuid,p_entity uuid,p_start date,p_end date,p_source jsonb,p_preview jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_source is null or p_source->>'unsupportedPostedCashCount' is distinct from '0' then
    raise exception 'Posted refund or other cash events need reviewed Cash Accounting treatment before projection.' using errcode='22023';
  end if;
  return public._multideck_uk_vat_record_cash_event_projection_before_unsupported_cash(
    p_actor,p_entity,p_start,p_end,p_source,p_preview);
end; $$;
revoke all on function public.multideck_uk_vat_record_cash_event_projection(
  uuid,uuid,date,date,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_record_cash_event_projection(
  uuid,uuid,date,date,jsonb,jsonb) to service_role;

commit;
