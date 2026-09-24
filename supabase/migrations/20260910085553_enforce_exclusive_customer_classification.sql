-- Potential Customer and Customer are mutually exclusive lifecycle
-- classifications. Key Account is a controlled setting within Customer.
begin;

-- Preserve the retired role by converting it to Customer + Key Account.
insert into public."Org_Master_Type" ("Org_ID", "OrgType_ID")
select legacy."Org_ID", customer_type."OrgType_ID"
from public."Org_Master_Type" legacy
join public."Org_Types" legacy_type on legacy_type."OrgType_ID" = legacy."OrgType_ID"
cross join lateral (
  select type."OrgType_ID" from public."Org_Types" type
  where lower(btrim(type."OrgType_Name")) = 'customer'
  order by type."OrgType_Order" nulls last, type."OrgType_ID" limit 1
) customer_type
where lower(btrim(legacy_type."OrgType_Name")) = 'key customer account'
on conflict do nothing;

update public."CRM_AccountProfiles" profile
set "CRMAccount_IsStrategic" = true, "CRMAccount_UpdatedAt" = now()
where exists (
  select 1 from public."Org_Master_Type" legacy
  join public."Org_Types" legacy_type on legacy_type."OrgType_ID" = legacy."OrgType_ID"
  where legacy."Org_ID" = profile."CRMAccount_OrgID"
    and lower(btrim(legacy_type."OrgType_Name")) = 'key customer account'
);

delete from public."Org_Master_Type" legacy
using public."Org_Types" legacy_type
where legacy_type."OrgType_ID" = legacy."OrgType_ID"
  and lower(btrim(legacy_type."OrgType_Name")) = 'key customer account';

-- Customer wins over Potential Customer where legacy data contains both.
with ranked_customer_classifications as (
  select link."Org_ID" org_id, link."OrgType_ID" org_type_id,
    row_number() over (
      partition by link."Org_ID"
      order by case lower(btrim(type."OrgType_Name")) when 'customer' then 1 else 2 end,
        type."OrgType_Order" nulls last, link."OrgType_ID"
    ) customer_classification_rank
  from public."Org_Master_Type" link
  join public."Org_Types" type on type."OrgType_ID" = link."OrgType_ID"
  where lower(btrim(type."OrgType_Name")) in ('potential customer', 'customer')
)
delete from public."Org_Master_Type" link
using ranked_customer_classifications ranked
where ranked.customer_classification_rank > 1
  and link."Org_ID" = ranked.org_id
  and link."OrgType_ID" = ranked.org_type_id;

update public."CRM_AccountProfiles" profile
set "CRMAccount_IsStrategic" = false, "CRMAccount_UpdatedAt" = now()
where "CRMAccount_IsStrategic"
  and not exists (
    select 1 from public."Org_Master_Type" link
    join public."Org_Types" type on type."OrgType_ID" = link."OrgType_ID"
    where link."Org_ID" = profile."CRMAccount_OrgID"
      and lower(btrim(type."OrgType_Name")) = 'customer'
  );

create or replace function public.multideck_enforce_customer_classification()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_new_type_name text;
begin
  select lower(btrim(type."OrgType_Name")) into v_new_type_name
  from public."Org_Types" type where type."OrgType_ID" = new."OrgType_ID";
  if v_new_type_name = 'key customer account' then
    raise exception 'Key Account is managed within Customer settings.' using errcode = '23514';
  end if;
  if v_new_type_name not in ('potential customer', 'customer') then return new; end if;
  perform 1 from public."Org_Master" organisation
  where organisation."Org_id" = new."Org_ID" for update;
  if exists (
    select 1 from public."Org_Master_Type" link
    join public."Org_Types" type on type."OrgType_ID" = link."OrgType_ID"
    where link."Org_ID" = new."Org_ID" and link."OrgType_ID" <> new."OrgType_ID"
      and lower(btrim(type."OrgType_Name")) in ('potential customer', 'customer')
  ) then
    raise exception 'Choose either Potential Customer or Customer.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_customer_classification on public."Org_Master_Type";
create trigger enforce_customer_classification
before insert or update of "Org_ID", "OrgType_ID" on public."Org_Master_Type"
for each row execute function public.multideck_enforce_customer_classification();

create or replace function public.multideck_clear_key_account_without_customer()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_org_id uuid;
begin
  if tg_op = 'DELETE' then v_org_id := old."Org_ID"; else v_org_id := new."Org_ID"; end if;
  if not exists (
    select 1 from public."Org_Master_Type" link
    join public."Org_Types" type on type."OrgType_ID" = link."OrgType_ID"
    where link."Org_ID" = v_org_id and lower(btrim(type."OrgType_Name")) = 'customer'
  ) then
    update public."CRM_AccountProfiles"
    set "CRMAccount_IsStrategic" = false, "CRMAccount_UpdatedAt" = now()
    where "CRMAccount_OrgID" = v_org_id and "CRMAccount_IsStrategic";
    update public."CRM_AccountOperationalProfiles"
    set "CRMAccountOps_RoleProfilesJSON" = jsonb_set(
          "CRMAccountOps_RoleProfilesJSON",
          '{customer}',
          coalesce("CRMAccountOps_RoleProfilesJSON" -> 'customer', '{}'::jsonb) || '{"keyAccount": false}'::jsonb,
          true
        ),
        "CRMAccountOps_UpdatedAt" = now()
    where "CRMAccountOps_OrgID" = v_org_id
      and coalesce(("CRMAccountOps_RoleProfilesJSON" #>> '{customer,keyAccount}')::boolean, false);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists clear_key_account_without_customer on public."Org_Master_Type";
create trigger clear_key_account_without_customer
after insert or update or delete on public."Org_Master_Type"
for each row execute function public.multideck_clear_key_account_without_customer();

-- Save Key Account and its required processes with the audited operations
-- profile in one transaction and under one optimistic-lock version.
create or replace function public.multideck_crm_replace_account_operations_with_customer_settings(
  p_actor_user_id uuid, p_org_id uuid, p_expected_version bigint, p_input jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_customer_profile jsonb := coalesce(p_input #> '{roleProfiles,customer}', '{}'::jsonb);
  v_key_account boolean := coalesce((p_input #>> '{roleProfiles,customer,keyAccount}')::boolean, false);
  v_result jsonb;
begin
  if v_key_account and not exists (
    select 1 from public."Org_Master_Type" link
    join public."Org_Types" type on type."OrgType_ID" = link."OrgType_ID"
    where link."Org_ID" = p_org_id and lower(btrim(type."OrgType_Name")) = 'customer'
  ) then
    raise exception 'Only a Customer can be marked as a Key Account.' using errcode = '22023';
  end if;
  if v_key_account and (
    nullif(btrim(v_customer_profile ->> 'accountManagerName'), '') is null
    or nullif(btrim(v_customer_profile ->> 'accountManagerEmail'), '') is null
    or nullif(btrim(v_customer_profile ->> 'serviceReviewCadence'), '') is null
    or nullif(btrim(v_customer_profile ->> 'escalationProcess'), '') is null
  ) then
    raise exception 'Complete the Key Account manager, service review and escalation requirements.' using errcode = '22023';
  end if;
  v_result := public.multideck_crm_replace_account_operations(
    p_actor_user_id, p_org_id, p_expected_version, p_input
  );
  update public."CRM_AccountProfiles"
  set "CRMAccount_IsStrategic" = v_key_account
  where "CRMAccount_OrgID" = p_org_id and not "CRMAccount_IsDeleted";
  return v_result;
end;
$$;

revoke all on function public.multideck_enforce_customer_classification() from public, anon, authenticated;
revoke all on function public.multideck_clear_key_account_without_customer() from public, anon, authenticated;
revoke all on function public.multideck_crm_replace_account_operations_with_customer_settings(uuid, uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.multideck_enforce_customer_classification() to service_role;
grant execute on function public.multideck_clear_key_account_without_customer() to service_role;
grant execute on function public.multideck_crm_replace_account_operations_with_customer_settings(uuid, uuid, bigint, jsonb) to service_role;

commit;
