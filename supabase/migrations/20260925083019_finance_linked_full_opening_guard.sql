begin;

-- ERPNext opening invoices and payments post their own subledgers. Sending a
-- whole trial-balance JE including AR/AP controls would double those amounts
-- once provider documents are imported. Preserve the reviewed native package,
-- but block a linked entity before its first opening ledger write until a
-- separate residual JE and exact provider-source readback are implemented.
create function public._multideck_finance_linked_full_opening_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_package public."FIN_OpeningBalancePackages";
begin
  if new."FINPostBatch_SourceTable"<>'FIN_OpeningBalancePackages' then return new; end if;
  select * into v_package from public."FIN_OpeningBalancePackages"
    where id=new."FINPostBatch_SourceID" and legal_entity_id=new."FINPostBatch_LegalEntityID";
  if not found or v_package.package_kind<>'full_open_items' then return new; end if;
  if exists(select 1 from public."ACCI_Connections" connection
    where connection."ACCIC_LegalEntityID"=v_package.legal_entity_id
      and connection."ACCIC_StatusCode"='active') then
    raise exception 'Full CargoWise open-item cutover is blocked for a linked accounts system until provider invoices, credits, unapplied cash and the residual opening journal reconcile by source identity.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_finance_linked_full_opening_guard() from public,anon,authenticated;
create trigger full_opening_linked_provider_guard before insert on public."FIN_PostingBatches"
for each row execute function public._multideck_finance_linked_full_opening_guard();

commit;
