begin;

-- Append-only calculation evidence. No browser or generic Dexter table writes.
create table public."Customs_CalculationAudit" (
  id uuid primary key default gen_random_uuid(),
  declaration_id uuid not null references public."Customs_Declarations"("CUST_id"),
  actor_auth_id uuid not null,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('calculation', 'override')),
  parent_id uuid references public."Customs_CalculationAudit"(id),
  draft_snapshot jsonb not null,
  evidence jsonb not null,
  check ((kind = 'calculation' and parent_id is null) or (kind = 'override' and parent_id is not null))
);
create index customs_calculation_history on public."Customs_CalculationAudit"(declaration_id, created_at desc, id);
alter table public."Customs_CalculationAudit" enable row level security;
grant select on public."Customs_CalculationAudit" to authenticated, service_role;
revoke insert, update, delete, truncate on public."Customs_CalculationAudit" from anon, authenticated, service_role;
create policy calculation_read on public."Customs_CalculationAudit" for select to authenticated
  using (public.customs_declaration_current_user_authorised(declaration_id, false));

create function public.customs_calculation_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'Calculation evidence is append-only.' using errcode = '55000'; end;
$$;
create trigger calculation_no_rewrite before update or delete on public."Customs_CalculationAudit"
  for each row execute function public.customs_calculation_immutable();

create function public.customs_append_calculation(
  p_actor uuid, p_declaration uuid, p_draft jsonb, p_kind text, p_evidence jsonb, p_parent uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_current jsonb; v_id uuid;
begin
  -- Recheck while holding the declaration row lock: save/submit races cannot
  -- attach a result to a different declaration revision.
  select "CUST_GenericPayloadJSON" into v_current from public."Customs_Declarations"
    where "CUST_id" = p_declaration for update;
  if not coalesce(public.customs_declaration_authorised(p_actor, p_declaration, true, true), false) then
    raise exception 'Customs declaration unavailable.' using errcode = '42501';
  end if;
  if v_current is distinct from p_draft then
    raise exception 'Declaration changed. Save and calculate again.' using errcode = '40001';
  end if;
  if p_kind = 'override' and not exists (
    select 1 from public."Customs_CalculationAudit" where id = p_parent and declaration_id = p_declaration
      and kind = 'calculation' and draft_snapshot = p_draft
  ) then raise exception 'The calculation is unavailable or out of date.' using errcode = '22023'; end if;
  insert into public."Customs_CalculationAudit"(declaration_id, actor_auth_id, kind, parent_id, draft_snapshot, evidence)
    values(p_declaration, p_actor, p_kind, p_parent, p_draft, p_evidence) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.customs_append_calculation(uuid, uuid, jsonb, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.customs_append_calculation(uuid, uuid, jsonb, text, jsonb, uuid) to service_role;
revoke all on function public.customs_calculation_immutable() from public, anon, authenticated;
commit;
