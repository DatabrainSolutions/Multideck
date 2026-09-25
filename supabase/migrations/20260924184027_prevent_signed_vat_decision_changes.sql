begin;

-- A transaction sign-off fixes its tax point and treatment as well as its
-- posted source. A correction has its own evidence and decision; reopening a
-- return review must never reopen the original signed transaction.
create or replace function public._multideck_indirect_tax_decision_period_guard()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('vat-source-period:'||new.evidence_id::text,0));
  if exists (
    select 1 from public."FIN_IndirectTaxReconciliations" signed
    where signed.evidence_id=new.evidence_id
  ) then
    raise exception 'A VAT-reconciled transaction cannot have its tax treatment changed; create a separate correction event.' using errcode='22023';
  end if;
  return new;
end; $$;

commit;
