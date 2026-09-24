begin;

-- Once an entity activates the dotted freight chart, native document and cash
-- posting must not fall back to the old four-digit control and P&L accounts.
-- A valid active preferred account still wins (for charge-specific postings).
create or replace function public._multideck_finance_resolve_nominal(
  p_legal_entity_id uuid,p_preferred_nominal_id uuid,p_default_code text
) returns uuid
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare
  v_code text;
  v_id uuid;
  v_new_chart boolean;
begin
  if p_legal_entity_id is null then return null; end if;

  -- Preserve a same-code preference when a job changes legal entity, but never
  -- return an inactive account or an account owned by another legal entity.
  select "FINNom_Code" into v_code from public."FIN_NominalAccounts"
    where "FINNom_ID"=p_preferred_nominal_id;
  if v_code is not null then
    select "FINNom_ID" into v_id from public."FIN_NominalAccounts"
      where "FINNom_LegalEntityID"=p_legal_entity_id and "FINNom_Code"=v_code
        and "FINNom_IsActive"
      order by ("FINNom_ID"=p_preferred_nominal_id) desc,"FINNom_CreatedAt","FINNom_ID"
      limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  select exists(select 1 from public."FIN_NominalAccounts"
    where "FINNom_LegalEntityID"=p_legal_entity_id
      and "FINNom_Code"='6210.00.00' and "FINNom_IsActive") into v_new_chart;
  v_code:=case when v_new_chart then case p_default_code
    when '1000' then '6110.10.10'
    when '1100' then '6210.00.00'
    when '2000' then '8210.00.00'
    when '4000' then '1010.10.10'
    when '5000' then '1010.20.10'
    else p_default_code end
    else p_default_code end;
  select "FINNom_ID" into v_id from public."FIN_NominalAccounts"
    where "FINNom_LegalEntityID"=p_legal_entity_id and "FINNom_Code"=v_code
      and "FINNom_IsActive" limit 1;
  return v_id;
end; $$;

revoke all on function public._multideck_finance_resolve_nominal(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public._multideck_finance_resolve_nominal(uuid,uuid,text) to service_role;

commit;
