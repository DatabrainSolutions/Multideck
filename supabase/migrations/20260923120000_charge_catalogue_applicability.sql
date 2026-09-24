begin;

-- Existing codes stay available until an administrator explicitly configures
-- their scope. A configured code must have at least one allowed combination.
alter table public."RATE_ChargeCodes"
  add column "RATECharge_ScopeConfigured" boolean not null default false,
  add column "RATECharge_Version" integer not null default 1 check ("RATECharge_Version" > 0);

create table public."RATE_ChargeApplicability" (
  charge_id uuid not null references public."RATE_ChargeCodes"("RATECharge_ID") on delete cascade,
  record_kind text not null check (record_kind in ('quote','booking')),
  direction text not null check (direction in ('import','export','cross_trade','other')),
  mode text not null check (mode in ('air','sea','road','mix','other')),
  primary key (charge_id,record_kind,direction,mode)
);
create index on public."RATE_ChargeApplicability"(record_kind,direction,mode,charge_id);
alter table public."RATE_ChargeApplicability" enable row level security;
revoke all on public."RATE_ChargeApplicability" from public,anon,authenticated;
grant select,insert,delete on public."RATE_ChargeApplicability" to service_role;

create table public."RATE_ChargeCatalogueAudit" (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references public."RATE_ChargeCodes"("RATECharge_ID"),
  actor_id uuid not null references public."cmp_Users"("User_ID"),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  before_snapshot jsonb,
  after_snapshot jsonb not null,
  recorded_at timestamptz not null default now()
);
alter table public."RATE_ChargeCatalogueAudit" enable row level security;
revoke all on public."RATE_ChargeCatalogueAudit" from public,anon,authenticated;
grant select,insert on public."RATE_ChargeCatalogueAudit" to service_role;

create function public.multideck_manage_charge_catalogue(p_actor uuid,p_entity uuid,p_input jsonb)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare
  charge public."RATE_ChargeCodes";
  before_state jsonb;
  result jsonb;
  matrix jsonb := p_input->'applicability';
  item jsonb;
  v_charge_id uuid := nullif(p_input->>'id','')::uuid;
  expected_version integer := coalesce((p_input->>'version')::integer,0);
  code text := upper(btrim(p_input->>'code'));
  name text := btrim(p_input->>'name');
  category text := p_input->>'category';
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Configuration.Manage');
  if code is null or code !~ '^[A-Z0-9][A-Z0-9._-]{0,79}$'
    or name is null or length(name) not between 1 and 180
    or category is null or not exists(select 1 from public."sys_RateChargeCategories" where "RATECCAT_Code"=category)
    or p_input->>'side' not in ('buy','sell','both','pass_through') or p_input->>'side' is null
    or jsonb_typeof(matrix) is distinct from 'array' or jsonb_array_length(matrix)=0 or jsonb_array_length(matrix)>40 then
    raise exception 'Enter a valid code, name, category and at least one quote or booking type.' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(matrix) loop
    if item->>'recordKind' not in ('quote','booking') or item->>'direction' not in ('import','export','cross_trade','other')
      or item->>'mode' not in ('air','sea','road','mix','other') or item->>'recordKind' is null
      or item->>'direction' is null or item->>'mode' is null then
      raise exception 'Choose valid quote or booking applicability.' using errcode='22023';
    end if;
  end loop;
  -- The catalogue is shared within this isolated tenant; serialise edits across
  -- legal entities and check the version before replacing the matrix.
  perform pg_advisory_xact_lock(hashtext('multideck-charge-catalogue'));
  if exists(select 1 from public."RATE_ChargeCodes" c
    where upper(c."RATECharge_Code")=code and c."RATECharge_ID" is distinct from v_charge_id) then
    raise exception 'This charge code already exists.' using errcode='22023';
  end if;
  if v_charge_id is null then
    if expected_version<>0 then raise exception 'Refresh the charge catalogue before saving.' using errcode='22023'; end if;
    insert into public."RATE_ChargeCodes"("RATECharge_Code","RATECharge_Name","RATECharge_Description","RATECharge_CategoryCode",
      "RATECharge_DefaultApplicabilityCode","RATECharge_IsFreight","RATECharge_IsSurcharge","RATECharge_IsPassThrough",
      "RATECharge_IsActive","RATECharge_ScopeConfigured","RATECharge_CreatedBy","RATECharge_UpdatedBy")
    values(code,name,nullif(btrim(p_input->>'description'),''),category,coalesce(nullif(p_input->>'side',''),'both'),
      category='freight',category in ('fuel','security','peak'),p_input->>'side'='pass_through',
      coalesce((p_input->>'active')::boolean,true),true,p_actor,p_actor) returning * into charge;
    v_charge_id:=charge."RATECharge_ID";
  else
    select * into charge from public."RATE_ChargeCodes" where "RATECharge_ID"=v_charge_id for update;
    if not found then raise exception 'Charge code not found.' using errcode='22023'; end if;
    if charge."RATECharge_Version"<>expected_version then raise exception 'The charge code changed. Refresh before saving.' using errcode='22023'; end if;
    before_state:=to_jsonb(charge)||jsonb_build_object('applicability',
      coalesce((select jsonb_agg(jsonb_build_object('recordKind',record_kind,'direction',direction,'mode',mode))
        from public."RATE_ChargeApplicability" a where a.charge_id=charge."RATECharge_ID"),'[]'::jsonb));
    update public."RATE_ChargeCodes" set "RATECharge_Code"=code,"RATECharge_Name"=name,
      "RATECharge_Description"=nullif(btrim(p_input->>'description'),''),"RATECharge_CategoryCode"=category,
      "RATECharge_DefaultApplicabilityCode"=coalesce(nullif(p_input->>'side',''),'both'),
      "RATECharge_IsFreight"=category='freight',"RATECharge_IsSurcharge"=category in ('fuel','security','peak'),
      "RATECharge_IsPassThrough"=p_input->>'side'='pass_through',
      "RATECharge_IsActive"=coalesce((p_input->>'active')::boolean,true),"RATECharge_ScopeConfigured"=true,
      "RATECharge_Version"="RATECharge_Version"+1,"RATECharge_UpdatedAt"=now(),"RATECharge_UpdatedBy"=p_actor
    where "RATECharge_ID"=v_charge_id returning * into charge;
    delete from public."RATE_ChargeApplicability" where charge_id=charge."RATECharge_ID";
  end if;
  insert into public."RATE_ChargeApplicability"(charge_id,record_kind,direction,mode)
    select distinct v_charge_id,value->>'recordKind',value->>'direction',value->>'mode' from jsonb_array_elements(matrix);
  result:=to_jsonb(charge)||jsonb_build_object('applicability',matrix);
  insert into public."RATE_ChargeCatalogueAudit"(charge_id,actor_id,legal_entity_id,before_snapshot,after_snapshot)
    values(v_charge_id,p_actor,p_entity,before_state,result);
  return result;
end; $$;
revoke all on function public.multideck_manage_charge_catalogue(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_manage_charge_catalogue(uuid,uuid,jsonb) to service_role;

commit;
