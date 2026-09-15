begin;

create table public."Customs_AssessmentComparisons" (
  id uuid primary key default gen_random_uuid(),
  declaration_id uuid not null references public."Customs_Declarations"("CUST_id"),
  source_id uuid not null references public."Customs_ProviderResponseHistory"(id),
  calculation_id uuid not null references public."Customs_CalculationAudit"(id),
  actor_auth_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  adapter_version text not null,
  evidence jsonb not null,
  unique(source_id, calculation_id, adapter_version)
);
create index customs_assessment_comparison_history on public."Customs_AssessmentComparisons"(declaration_id, created_at desc, id);
alter table public."Customs_AssessmentComparisons" enable row level security;
revoke all on public."Customs_AssessmentComparisons" from public, anon, authenticated, service_role;
grant select on public."Customs_AssessmentComparisons" to authenticated, service_role;
create policy assessment_comparison_read on public."Customs_AssessmentComparisons" for select to authenticated
  using(public.customs_declaration_current_user_authorised(declaration_id, false));
create trigger assessment_comparison_no_rewrite before update or delete on public."Customs_AssessmentComparisons"
  for each row execute function public.customs_calculation_immutable();

-- Comparisons annotate a retained submission; they do not edit an accepted
-- declaration. Still require Customs write permission and recheck ownership.
create function public.customs_record_assessment_comparison(
  p_actor uuid, p_declaration uuid, p_source uuid, p_calculation uuid,
  p_adapter_version text, p_evidence jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare source public."Customs_ProviderResponseHistory"; calculation public."Customs_CalculationAudit"; result_id uuid;
begin
  perform 1 from public."Customs_Declarations" where "CUST_id"=p_declaration for update;
  if not coalesce(public.customs_declaration_authorised(p_actor,p_declaration,true,false),false)
    or not exists(select 1 from public."Customs_Declarations" where "CUST_id"=p_declaration and "CUST_Direction"='import') then
    raise exception 'Customs declaration unavailable.' using errcode='42501';
  end if;
  select * into source from public."Customs_ProviderResponseHistory" where id=p_source and declaration_id=p_declaration;
  select * into calculation from public."Customs_CalculationAudit" where id=p_calculation and declaration_id=p_declaration and kind='calculation';
  if source.id is null or calculation.id is null
    or source.declaration_snapshot#>>'{declaration,id}' is distinct from p_declaration::text
    or source.declaration_snapshot#>>'{calculationLink,calculationId}' is distinct from p_calculation::text
    or source.declaration_snapshot#>'{declaration,genericPayload}' is distinct from calculation.draft_snapshot then
    raise exception 'The source and calculation do not describe the same submitted revision.' using errcode='22023';
  end if;
  if p_adapter_version is null or p_adapter_version !~ '^[a-zA-Z0-9._-]{1,80}$'
    or jsonb_typeof(p_evidence) is distinct from 'object'
    or jsonb_typeof(p_evidence->'notices') is distinct from 'array'
    or jsonb_array_length(p_evidence->'notices')=0
    or octet_length(p_evidence::text)>2000000 then
    raise exception 'Invalid assessment comparison evidence.' using errcode='22023';
  end if;
  insert into public."Customs_AssessmentComparisons"(declaration_id,source_id,calculation_id,actor_auth_id,adapter_version,evidence)
    values(p_declaration,p_source,p_calculation,p_actor,p_adapter_version,p_evidence)
    on conflict(source_id,calculation_id,adapter_version) do nothing returning id into result_id;
  if result_id is null then
    select id into result_id from public."Customs_AssessmentComparisons"
      where source_id=p_source and calculation_id=p_calculation and adapter_version=p_adapter_version;
  end if;
  return result_id;
end;
$$;
revoke all on function public.customs_record_assessment_comparison(uuid,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.customs_record_assessment_comparison(uuid,uuid,uuid,uuid,text,jsonb) to service_role;
commit;
