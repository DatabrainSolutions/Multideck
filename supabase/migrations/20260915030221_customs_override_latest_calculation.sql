-- Overrides must be reviewed against the newest calculation, even when a
-- reference refresh changes the result without changing the saved draft.
create or replace function public.customs_append_calculation(
  p_actor uuid, p_declaration uuid, p_draft jsonb, p_kind text, p_evidence jsonb, p_parent uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_current jsonb; v_id uuid; v_latest uuid;
begin
  select "CUST_GenericPayloadJSON" into v_current from public."Customs_Declarations"
    where "CUST_id" = p_declaration for update;
  if not coalesce(public.customs_declaration_authorised(p_actor, p_declaration, true, true), false) then
    raise exception 'Customs declaration unavailable.' using errcode = '42501';
  end if;
  if v_current is distinct from p_draft then
    raise exception 'Declaration changed. Save and calculate again.' using errcode = '40001';
  end if;
  if p_kind = 'override' then
    select id into v_latest from public."Customs_CalculationAudit"
      where declaration_id = p_declaration and kind = 'calculation'
      order by created_at desc, id desc limit 1;
    if p_parent is distinct from v_latest or not exists (
      select 1 from public."Customs_CalculationAudit" where id = p_parent
        and declaration_id = p_declaration and kind = 'calculation' and draft_snapshot = p_draft
    ) then
      raise exception 'A newer calculation is available. Review its workings before recording an override.' using errcode = '40001';
    end if;
  end if;
  -- Timestamp after acquiring the declaration lock, not at transaction start.
  -- This preserves history order for overlapping calculation requests.
  insert into public."Customs_CalculationAudit"(declaration_id, actor_auth_id, kind, parent_id, draft_snapshot, evidence, created_at)
    values(p_declaration, p_actor, p_kind, p_parent, p_draft, p_evidence, clock_timestamp()) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.customs_append_calculation(uuid,uuid,jsonb,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.customs_append_calculation(uuid,uuid,jsonb,text,jsonb,uuid) to service_role;
