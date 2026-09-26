begin;

-- Recheck the exact posted cash row and all allocation rows against the
-- fingerprint signed in the latest payment-date review. A reviewed date
-- without matching source is never valid exit evidence.
alter function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  rename to _multideck_uk_vat_cash_exit_invoice_inventory_before_review_fingerprint;
revoke all on function public._multideck_uk_vat_cash_exit_invoice_inventory_before_review_fingerprint(
  uuid,uuid,date,date) from public,anon,authenticated,service_role;

create function public.multideck_uk_vat_cash_exit_invoice_inventory(
  p_actor uuid,p_entity uuid,p_start date,p_exit date
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_inventory jsonb; v_cash jsonb; v_issues integer;
begin
  -- The prior inventory validates actor, entity and bounded sources.
  v_inventory:=public._multideck_uk_vat_cash_exit_invoice_inventory_before_review_fingerprint(
    p_actor,p_entity,p_start,p_exit);
  if v_inventory->>'truncated'='true' then return v_inventory; end if;
  select coalesce(jsonb_agg(source.value||jsonb_build_object(
      'paymentReviewId',review.id,
      'reviewSourceFingerprint',review.source_fingerprint,
      'currentSourceFingerprint',current_source.fingerprint,
      'reviewFingerprintMatches',review.source_fingerprint=current_source.fingerprint,
      'source_issue',(source.value->>'source_issue')::boolean
        or not coalesce(review.source_fingerprint=current_source.fingerprint,false))
      order by source.ordinality),'[]'::jsonb)
    into v_cash
  from jsonb_array_elements(v_inventory->'cashSources') with ordinality source(value,ordinality)
  join public."FIN_CashTransactions" cash
    on cash."FINCash_ID"=(source.value->>'cash_id')::uuid
      and cash."FINCash_LegalEntityID"=p_entity
  left join lateral (select candidate.id,candidate.source_fingerprint
    from public."FIN_IndirectTaxCashPaymentDateReviews" candidate
    where candidate.cash_id=cash."FINCash_ID" and candidate.legal_entity_id=p_entity
    order by candidate.revision desc limit 1) review on true
  cross join lateral (select encode(sha256(convert_to(
    (to_jsonb(cash)-array['FINCash_StatusCode','FINCash_PostingStatusCode',
      'FINCash_ExportStatusCode','FINCash_UpdatedAt','FINCash_UpdatedBy'])::text||
    coalesce((select jsonb_agg(to_jsonb(allocation) order by allocation."FINCashAlloc_ID")
      from public."FIN_CashAllocations" allocation
      where allocation."FINCashAlloc_CashID"=cash."FINCash_ID"),'[]'::jsonb)::text,
    'UTF8')),'hex') fingerprint) current_source;
  if jsonb_array_length(v_cash)<>(v_inventory->>'cashSourceCount')::integer then
    raise exception 'Cash exit source changed during payment-review verification.' using errcode='40001';
  end if;
  select count(*)::integer into v_issues
    from jsonb_array_elements(v_cash) source(value)
    where source.value->>'source_issue'='true';
  return v_inventory||jsonb_build_object(
    'cashSources',v_cash,'cashSourceIssueCount',v_issues,
    'sourceDigest',encode(sha256(convert_to(jsonb_build_object(
      'cashInventoryDigest',v_inventory->>'sourceDigest',
      'cashSources',v_cash)::text,'UTF8')),'hex'));
end; $$;
revoke all on function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
  to service_role;

commit;
