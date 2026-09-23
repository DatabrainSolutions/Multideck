-- Every organisation must retain at least one company type. The constraint is
-- deferred so audited update functions may replace the complete type set inside
-- one transaction without failing during their delete-and-insert sequence.
begin;

create or replace function public.multideck_require_company_type()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  v_org_id uuid;
begin
  if tg_table_name = 'Org_Master' then
    v_org_id := new."Org_id";
  else
    v_org_id := old."Org_ID";
  end if;

  if exists (
    select 1 from public."Org_Master" organisation
    where organisation."Org_id" = v_org_id
  ) and not exists (
    select 1 from public."Org_Master_Type" link
    where link."Org_ID" = v_org_id
  ) then
    raise exception 'Choose at least one company type.' using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists require_company_type_for_organisation on public."Org_Master";
create constraint trigger require_company_type_for_organisation
after insert or update on public."Org_Master"
deferrable initially deferred
for each row execute function public.multideck_require_company_type();

drop trigger if exists retain_company_type_for_organisation on public."Org_Master_Type";
create constraint trigger retain_company_type_for_organisation
after delete or update on public."Org_Master_Type"
deferrable initially deferred
for each row execute function public.multideck_require_company_type();

revoke all on function public.multideck_require_company_type() from public, anon, authenticated;
grant execute on function public.multideck_require_company_type() to service_role;

commit;
