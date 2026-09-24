begin;

-- Headers are deliberately not FIN_NominalAccounts: a header can never satisfy
-- the existing posting-line FK. Existing charts and postings remain unchanged.
create table public."FIN_NominalGroups" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  code text not null check(length(code) between 1 and 80 and code=btrim(code)),
  name text not null check(length(btrim(name)) between 1 and 180),
  kind text not null check(kind in ('cost','revenue')),
  control_account_id uuid not null references public."FIN_NominalAccounts"("FINNom_ID"),
  created_by uuid not null references public."cmp_Users"("User_ID"),
  created_at timestamptz not null default now(),
  unique(legal_entity_id,code)
);
create index on public."FIN_NominalGroups"(control_account_id);
create table public."FIN_NominalGroupMembers" (
  account_id uuid primary key references public."FIN_NominalAccounts"("FINNom_ID"),
  group_id uuid not null references public."FIN_NominalGroups"(id),
  role text not null check(role in ('actual','accrued')),
  unique(group_id,role)
);
create table public."FIN_ChargeNominalMappings" (
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  charge_id uuid not null references public."RATE_ChargeCodes"("RATECharge_ID"),
  cost_group_id uuid references public."FIN_NominalGroups"(id),
  revenue_group_id uuid references public."FIN_NominalGroups"(id),
  version integer not null default 1 check(version>0),
  updated_by uuid not null references public."cmp_Users"("User_ID"),
  updated_at timestamptz not null default now(),
  primary key(legal_entity_id,charge_id),
  check(cost_group_id is not null or revenue_group_id is not null)
);
create index on public."FIN_ChargeNominalMappings"(charge_id);
create index on public."FIN_ChargeNominalMappings"(cost_group_id);
create index on public."FIN_ChargeNominalMappings"(revenue_group_id);
create table public."FIN_NominalStructureAudit" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  actor_id uuid not null references public."cmp_Users"("User_ID"),
  action text not null,
  before_snapshot jsonb,
  after_snapshot jsonb not null,
  recorded_at timestamptz not null default now()
);
create index on public."FIN_NominalStructureAudit"(legal_entity_id,recorded_at desc);
alter table public."FIN_NominalGroups" enable row level security;
alter table public."FIN_NominalGroupMembers" enable row level security;
alter table public."FIN_ChargeNominalMappings" enable row level security;
alter table public."FIN_NominalStructureAudit" enable row level security;
revoke all on public."FIN_NominalGroups",public."FIN_NominalGroupMembers",public."FIN_ChargeNominalMappings",public."FIN_NominalStructureAudit" from public,anon,authenticated;
grant select,insert on public."FIN_NominalGroups",public."FIN_NominalGroupMembers",public."FIN_NominalStructureAudit" to service_role;
grant select,insert,update on public."FIN_ChargeNominalMappings" to service_role;

create function public._multideck_nominal_structure_immutable() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  raise exception 'Nominal group identities and their audit history cannot be rewritten.' using errcode='22023';
end; $$;
create trigger nominal_groups_immutable before update or delete on public."FIN_NominalGroups" for each row execute function public._multideck_nominal_structure_immutable();
create trigger nominal_members_immutable before update or delete on public."FIN_NominalGroupMembers" for each row execute function public._multideck_nominal_structure_immutable();
create trigger nominal_structure_audit_immutable before update or delete on public."FIN_NominalStructureAudit" for each row execute function public._multideck_nominal_structure_immutable();
revoke all on function public._multideck_nominal_structure_immutable() from public,anon,authenticated;

-- Called again when resolving mappings so disabling/reclassifying a nominal does
-- not leave an apparently usable relationship behind.
create function public._multideck_validate_nominal_group(p_entity uuid,p_group uuid,p_kind text)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare g public."FIN_NominalGroups"; n public."FIN_NominalAccounts"; m record; result jsonb;
begin
  select * into g from public."FIN_NominalGroups" where id=p_group and legal_entity_id=p_entity and kind=p_kind for share;
  if not found then raise exception 'Choose a group of the correct kind in this legal entity.' using errcode='22023'; end if;
  select * into n from public."FIN_NominalAccounts" where "FINNom_ID"=g.control_account_id for share;
  if not found or n."FINNom_LegalEntityID" is distinct from p_entity or not n."FINNom_IsActive" or not n."FINNom_IsControlAccount"
    or n."FINNom_ReportCategoryCode" is distinct from (case when p_kind='cost' then 'liability' else 'asset' end) then
    raise exception 'Choose an active balance-sheet accrual or WIP control in this legal entity.' using errcode='22023';
  end if;
  if (select count(*) from public."FIN_NominalGroupMembers" where group_id=p_group)<>2 then
    raise exception 'Each group requires an actual and an accrued posting account.' using errcode='22023';
  end if;
  result:=to_jsonb(g);
  for m in select * from public."FIN_NominalGroupMembers" where group_id=p_group order by role loop
    select * into n from public."FIN_NominalAccounts" where "FINNom_ID"=m.account_id for share;
    if not found or n."FINNom_LegalEntityID" is distinct from p_entity or not n."FINNom_IsActive" or n."FINNom_IsControlAccount"
      or not coalesce(case when p_kind='revenue' then n."FINNom_ReportCategoryCode"='income'
        else n."FINNom_ReportCategoryCode" in ('direct_cost','expense') end,false) then
      raise exception 'Actual and accrued accounts must be active, non-control P&L accounts of the correct kind in this legal entity.' using errcode='22023';
    end if;
    result:=result||jsonb_build_object(m.role,jsonb_build_object('id',n."FINNom_ID",'code',n."FINNom_Code",'name',n."FINNom_Name"));
  end loop;
  return result;
end; $$;
revoke all on function public._multideck_validate_nominal_group(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public._multideck_validate_nominal_group(uuid,uuid,text) to service_role;

create function public.multideck_finance_nominal_structure(p_actor uuid,p_entity uuid,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare g public."FIN_NominalGroups"; m public."FIN_ChargeNominalMappings"; result jsonb; previous jsonb; gid uuid; cid uuid; rid uuid;
begin
  perform public._multideck_journal_access(p_actor,p_entity,case when p_action='read' then 'Finance.Management.View' else 'Finance.Configuration.Manage' end);
  if p_action='read' then
    return jsonb_build_object('groups',coalesce((select jsonb_agg(to_jsonb(x) order by code) from public."FIN_NominalGroups" x where legal_entity_id=p_entity),'[]'::jsonb),
      'members',coalesce((select jsonb_agg(to_jsonb(member)) from public."FIN_NominalGroupMembers" member join public."FIN_NominalGroups" grp on grp.id=member.group_id where grp.legal_entity_id=p_entity),'[]'::jsonb),
      'chargeMappings',coalesce((select jsonb_agg(to_jsonb(x) order by charge_id) from public."FIN_ChargeNominalMappings" x where legal_entity_id=p_entity),'[]'::jsonb));
  end if;
  -- Serialise group allocation and mapping revisions for this entity.
  perform 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity for update;
  if p_action='create_group' then
    insert into public."FIN_NominalGroups"(legal_entity_id,code,name,kind,control_account_id,created_by)
    values(p_entity,p_input->>'code',p_input->>'name',p_input->>'kind',(p_input->>'controlAccountId')::uuid,p_actor) returning * into g;
    insert into public."FIN_NominalGroupMembers"(group_id,account_id,role) values
      (g.id,(p_input->>'actualAccountId')::uuid,'actual'),(g.id,(p_input->>'accruedAccountId')::uuid,'accrued');
    result:=public._multideck_validate_nominal_group(p_entity,g.id,g.kind);
  elsif p_action='map_charge' then
    gid:=(p_input->>'chargeId')::uuid; cid:=nullif(p_input->>'costGroupId','')::uuid; rid:=nullif(p_input->>'revenueGroupId','')::uuid;
    perform 1 from public."RATE_ChargeCodes" where "RATECharge_ID"=gid and "RATECharge_IsActive" for share;
    if not found then raise exception 'Choose an active charge code.' using errcode='22023'; end if;
    if cid is not null then perform public._multideck_validate_nominal_group(p_entity,cid,'cost'); end if;
    if rid is not null then perform public._multideck_validate_nominal_group(p_entity,rid,'revenue'); end if;
    select * into m from public."FIN_ChargeNominalMappings" where legal_entity_id=p_entity and charge_id=gid for update;
    if coalesce(m.version,0) is distinct from (p_input->>'version')::integer then
      raise exception 'The charge mapping changed. Refresh and review before saving.' using errcode='22023';
    end if;
    previous:=case when m.charge_id is not null then to_jsonb(m) end;
    insert into public."FIN_ChargeNominalMappings"(legal_entity_id,charge_id,cost_group_id,revenue_group_id,updated_by)
      values(p_entity,gid,cid,rid,p_actor)
      on conflict(legal_entity_id,charge_id) do update set cost_group_id=excluded.cost_group_id,revenue_group_id=excluded.revenue_group_id,
        version="FIN_ChargeNominalMappings".version+1,updated_by=p_actor,updated_at=now() returning * into m;
    result:=to_jsonb(m);
  else raise exception 'Unknown nominal structure action.' using errcode='22023';
  end if;
  insert into public."FIN_NominalStructureAudit"(legal_entity_id,actor_id,action,before_snapshot,after_snapshot) values(p_entity,p_actor,p_action,previous,result);
  return result;
end; $$;
revoke all on function public.multideck_finance_nominal_structure(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_finance_nominal_structure(uuid,uuid,text,jsonb) to service_role;

-- No fallback: callers cannot accidentally use another entity's mapping or an
-- old generic nominal. This resolver does not itself post or activate cutover.
create function public.multideck_finance_resolve_charge_nominals(p_actor uuid,p_entity uuid,p_charge uuid)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare m public."FIN_ChargeNominalMappings";
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.View');
  perform 1 from public."RATE_ChargeCodes" where "RATECharge_ID"=p_charge and "RATECharge_IsActive" for share;
  if not found then raise exception 'Charge code is inactive or unavailable.' using errcode='22023'; end if;
  select * into m from public."FIN_ChargeNominalMappings" where legal_entity_id=p_entity and charge_id=p_charge for share;
  if not found then raise exception 'Configure this charge code for the selected legal entity before posting.' using errcode='22023'; end if;
  return jsonb_build_object('version',m.version,'chargeId',p_charge,'legalEntityId',p_entity,
    'cost',case when m.cost_group_id is not null then public._multideck_validate_nominal_group(p_entity,m.cost_group_id,'cost') end,
    'revenue',case when m.revenue_group_id is not null then public._multideck_validate_nominal_group(p_entity,m.revenue_group_id,'revenue') end);
end; $$;
revoke all on function public.multideck_finance_resolve_charge_nominals(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_finance_resolve_charge_nominals(uuid,uuid,uuid) to service_role;
commit;
