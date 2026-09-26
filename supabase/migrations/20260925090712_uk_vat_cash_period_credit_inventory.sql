begin;

-- A credit or debit note is a posted price-change source even if no payment
-- was allocated to it and it has not yet been linked to its original invoice.
-- Include it in the source digest and keep the Cash preview closed until the
-- credit/refund event path can account for it.
alter function public.multideck_uk_vat_cash_source_snapshot(uuid,uuid,date,date)
  rename to _multideck_uk_vat_cash_source_snapshot_before_credit_inventory;
revoke all on function public._multideck_uk_vat_cash_source_snapshot_before_credit_inventory(uuid,uuid,date,date)
  from public,anon,authenticated,service_role;

create function public.multideck_uk_vat_cash_source_snapshot(
  p_actor uuid,p_entity uuid,p_start date,p_end date
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_snapshot jsonb; v_credit_count integer;
begin
  -- The underlying function verifies the actor, entity, UK GBP scope and
  -- bounded dates before this wrapper reads any documents.
  v_snapshot:=public._multideck_uk_vat_cash_source_snapshot_before_credit_inventory(
    p_actor,p_entity,p_start,p_end);
  select count(*)::integer into v_credit_count
  from public."FIN_Documents" document
  where document."FINDoc_LegalEntityID"=p_entity
    and document."FINDoc_NativePostingStatusCode"='posted'
    and document."FINDoc_TypeCode" in ('credit_note','debit_note')
    and document."FINDoc_DocumentDate" between p_start and p_end;
  return v_snapshot||jsonb_build_object('postedPeriodCreditCount',v_credit_count);
end; $$;
revoke all on function public.multideck_uk_vat_cash_source_snapshot(uuid,uuid,date,date)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_source_snapshot(uuid,uuid,date,date)
  to service_role;

-- A forged client preview cannot bypass the server's source-only block.
alter function public.multideck_uk_vat_record_cash_event_projection(uuid,uuid,date,date,jsonb,jsonb)
  rename to _multideck_uk_vat_record_cash_event_projection_before_credit_inventory;
revoke all on function public._multideck_uk_vat_record_cash_event_projection_before_credit_inventory(
  uuid,uuid,date,date,jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.multideck_uk_vat_record_cash_event_projection(
  p_actor uuid,p_entity uuid,p_start date,p_end date,p_source jsonb,p_preview jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_source is null or p_source->>'postedPeriodCreditCount' is distinct from '0' then
    raise exception 'Posted credit or debit notes need reviewed Cash Accounting events before projection.' using errcode='22023';
  end if;
  return public._multideck_uk_vat_record_cash_event_projection_before_credit_inventory(
    p_actor,p_entity,p_start,p_end,p_source,p_preview);
end; $$;
revoke all on function public.multideck_uk_vat_record_cash_event_projection(
  uuid,uuid,date,date,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_record_cash_event_projection(
  uuid,uuid,date,date,jsonb,jsonb) to service_role;

commit;
