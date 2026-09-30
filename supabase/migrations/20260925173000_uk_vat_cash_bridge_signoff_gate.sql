begin;

-- Cash payment events cannot be VAT-reconciled merely because their payment
-- projection and draft match. The complete invoice-to-payment and ledger
-- control bridge must be verified in the same sign-off transaction first.
-- Until that atomic gate exists, retain the immutable preparation records but
-- fail closed for new Cash event sign-offs.
create or replace function public.multideck_uk_vat_reconcile_cash_events(
  p_actor uuid,p_entity uuid,p_calculation uuid,p_source_digest text,
  p_event_ids uuid[],p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  raise exception 'Cash VAT event reconciliation requires the complete control bridge and period review workflow.' using errcode='22023';
end; $$;

commit;
