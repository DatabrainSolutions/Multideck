begin;

-- A future Cash Accounting VAT event depends on the posted payment date,
-- amount, party, currency and allocation. Freeze these at native posting.
-- Provider delivery can still advance its own status after posting.
create function public._multideck_uk_vat_guard_posted_cash_source()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_old jsonb; v_new jsonb;
  v_delivery_fields text[]:=array[
    'FINCash_PostingStatusCode','FINCash_ExportStatusCode',
    'FINCash_UpdatedAt','FINCash_UpdatedBy','FINCash_StatusCode'
  ];
begin
  if old."FINCash_NativePostingStatusCode"<>'posted' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  if tg_op='DELETE' then
    raise exception 'Posted cash VAT source cannot be deleted; record a separate correction.' using errcode='22023';
  end if;
  v_old:=to_jsonb(old); v_new:=to_jsonb(new);
  if v_new-v_delivery_fields is distinct from v_old-v_delivery_fields
    or ((v_new->>'FINCash_StatusCode') is distinct from (v_old->>'FINCash_StatusCode')
      and not ((v_old->>'FINCash_StatusCode')='approved'
        and (v_new->>'FINCash_StatusCode')='submitted')) then
    raise exception 'Posted cash VAT source cannot be changed; record a separate correction.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_uk_vat_guard_posted_cash_source()
  from public,anon,authenticated;
create trigger uk_vat_posted_cash_source_lock before update or delete
  on public."FIN_CashTransactions"
  for each row execute function public._multideck_uk_vat_guard_posted_cash_source();

create function public._multideck_uk_vat_guard_posted_cash_allocation()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_old_cash uuid; v_new_cash uuid; v_posted boolean;
begin
  if tg_op<>'INSERT' then v_old_cash:=old."FINCashAlloc_CashID"; end if;
  if tg_op<>'DELETE' then v_new_cash:=new."FINCashAlloc_CashID"; end if;
  -- Serialise with native cash posting, which locks the same cash row. The
  -- ordered lock acquisition also covers an attempted allocation reassignment.
  select coalesce(bool_or(locked."FINCash_NativePostingStatusCode"='posted'),false)
    into v_posted from (
      select cash."FINCash_NativePostingStatusCode"
      from public."FIN_CashTransactions" cash
      where cash."FINCash_ID" in (v_old_cash,v_new_cash)
      order by cash."FINCash_ID" for update
    ) locked;
  if v_posted then
    raise exception 'Posted cash VAT allocation cannot be changed; record a separate correction.' using errcode='22023';
  end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;
revoke all on function public._multideck_uk_vat_guard_posted_cash_allocation()
  from public,anon,authenticated;
create trigger uk_vat_posted_cash_allocation_lock before insert or update or delete
  on public."FIN_CashAllocations"
  for each row execute function public._multideck_uk_vat_guard_posted_cash_allocation();

commit;
