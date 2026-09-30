begin;

-- A price change can alter the Cash exit liability without a cash allocation
-- on the note. Bind every posted period credit/debit note to the inventory
-- digest, and keep the eventual exit calculation blocked until reviewed
-- price-change and refund events exist.
alter function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  rename to _multideck_uk_vat_cash_exit_invoice_inventory_before_price_changes;
revoke all on function public._multideck_uk_vat_cash_exit_invoice_inventory_before_price_changes(
  uuid,uuid,date,date) from public,anon,authenticated,service_role;

create function public.multideck_uk_vat_cash_exit_invoice_inventory(
  p_actor uuid,p_entity uuid,p_start date,p_exit date
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_inventory jsonb; v_count integer; v_changes jsonb;
begin
  -- The underlying inventory validates actor, legal entity and date scope.
  v_inventory:=public._multideck_uk_vat_cash_exit_invoice_inventory_before_price_changes(
    p_actor,p_entity,p_start,p_exit);
  select count(*)::integer into v_count from public."FIN_Documents" document
  where document."FINDoc_LegalEntityID"=p_entity
    and document."FINDoc_TypeCode" in ('credit_note','debit_note')
    and document."FINDoc_NativePostingStatusCode"='posted'
    and document."FINDoc_DocumentDate" between p_start and p_exit;
  if v_count>1000 or v_inventory->>'truncated'='true' then
    return v_inventory||jsonb_build_object(
      'postedPriceChangeCount',v_count,'priceChanges','[]'::jsonb,
      'requiresPriceChangeReview',v_count>0,
      'sourceDigest',null,'truncated',true);
  end if;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.document_date,item.document_id),'[]'::jsonb)
    into v_changes from (
    select document."FINDoc_ID" document_id,
      document."FINDoc_TypeCode" document_type,
      document."FINDoc_DocumentDate" document_date,
      document."FINDoc_NativePostingBatchID" posting_batch_id,
      document."FINDoc_NativePostedAt" posted_at,
      document."FINDoc_CurrencyCodeSnapshot" currency_code,
      document."FINDoc_GrossAmount" gross_amount,
      document."FINDoc_LocalGrossAmount" local_gross_amount
    from public."FIN_Documents" document
    where document."FINDoc_LegalEntityID"=p_entity
      and document."FINDoc_TypeCode" in ('credit_note','debit_note')
      and document."FINDoc_NativePostingStatusCode"='posted'
      and document."FINDoc_DocumentDate" between p_start and p_exit
  ) item;
  return v_inventory||jsonb_build_object(
    'postedPriceChangeCount',v_count,'priceChanges',v_changes,
    'requiresPriceChangeReview',v_count>0,
    'sourceDigest',encode(sha256(convert_to(jsonb_build_object(
      'invoiceDigest',v_inventory->>'sourceDigest',
      'priceChangeCount',v_count,'priceChanges',v_changes)::text,'UTF8')),'hex'));
end; $$;
revoke all on function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  to service_role;

commit;
