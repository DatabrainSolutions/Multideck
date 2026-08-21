-- Existing companies may temporarily have no assigned type while their roles
-- are being corrected. Creation still requires a type; this only widens the
-- existing account update contract and keeps the same access and watch paths.

begin;

create or replace function public.multideck_crm_update_account(
  p_actor_user_id uuid,
  p_account_id uuid,
  p_expected_version bigint,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_type_ids uuid[];
  v_old_types jsonb;
  v_new_types jsonb;
  v_company_id uuid;
  v_is_customer boolean;
  v_types_supplied boolean := p_input ? 'orgTypeIds';
begin
  perform public._multideck_crm_require_account_access(p_actor_user_id, p_account_id);

  if v_types_supplied then
    if jsonb_typeof(p_input -> 'orgTypeIds') <> 'array' then
      raise exception 'Choose company types.' using errcode = '22023';
    end if;

    select array_agg(distinct value::uuid) into v_type_ids
    from jsonb_array_elements_text(p_input -> 'orgTypeIds') item(value);
    v_type_ids := coalesce(v_type_ids, array[]::uuid[]);

    if cardinality(v_type_ids) > 12 then
      raise exception 'Choose no more than 12 company types.' using errcode = '22023';
    end if;
    if (select count(*) from public."Org_Types" where "OrgType_ID" = any(v_type_ids)) <> cardinality(v_type_ids) then
      raise exception 'Choose valid company types.' using errcode = '22023';
    end if;

    select coalesce(jsonb_agg(type."OrgType_Name" order by type."OrgType_Name"), '[]'::jsonb)
    into v_old_types
    from public."Org_Master_Type" link
    join public."Org_Types" type on type."OrgType_ID" = link."OrgType_ID"
    where link."Org_ID" = p_account_id;
  end if;

  v_result := public._multideck_crm_update_account_unscoped_20260818(
    p_actor_user_id,
    p_account_id,
    p_expected_version,
    p_input - 'orgTypeIds'
  );

  if v_types_supplied then
    delete from public."Org_Master_Type"
    where "Org_ID" = p_account_id
      and not ("OrgType_ID" = any(v_type_ids));

    insert into public."Org_Master_Type"("Org_ID", "OrgType_ID")
    select p_account_id, type_id
    from unnest(v_type_ids) type_id
    on conflict ("OrgType_ID", "Org_ID") do nothing;

    select exists (
      select 1
      from public."Org_Types" type
      where type."OrgType_ID" = any(v_type_ids)
        and lower(type."OrgType_Name") in ('customer', 'potential customer', 'key customer account')
    ) into v_is_customer;

    update public."Org_Master"
    set "Org_CRMIsPotentialCustomer" = v_is_customer,
        "Org_CRMUpdatedAt" = now()
    where "Org_id" = p_account_id;

    select coalesce(jsonb_agg(type."OrgType_Name" order by type."OrgType_Name"), '[]'::jsonb)
    into v_new_types
    from public."Org_Master_Type" link
    join public."Org_Types" type on type."OrgType_ID" = link."OrgType_ID"
    where link."Org_ID" = p_account_id;

    select profile."CRMAccount_CompanyID" into v_company_id
    from public."CRM_AccountProfiles" profile
    where profile."CRMAccount_OrgID" = p_account_id
      and not profile."CRMAccount_IsDeleted"
    order by profile."CRMAccount_ID"
    limit 1;

    if v_company_id is not null
       and v_new_types is distinct from v_old_types
       and not exists (
         select 1
         from public."CRM_AccountProfiles" fixture
         where fixture."CRMAccount_OrgID" = p_account_id
           and not fixture."CRMAccount_IsDeleted"
           and lower(coalesce(fixture."CRMAccount_MetadataJSON" ->> 'developmentFixture', 'false')) = 'true'
       ) then
      insert into public."AI_DexterWatchSignals"(
        "AIDexterWatchSignal_CompanyID",
        "AIDexterWatchSignal_CapabilityCode",
        "AIDexterWatchSignal_SourceTable",
        "AIDexterWatchSignal_SourceID",
        "AIDexterWatchSignal_OldJSON",
        "AIDexterWatchSignal_NewJSON"
      )
      select
        v_company_id,
        'customers',
        'Org_Master_Type',
        p_account_id,
        jsonb_build_object('recordType', 'company', 'organisationTypes', v_old_types),
        jsonb_build_object('recordType', 'company', 'organisationTypes', v_new_types)
      from public."AI_DexterWatches" watch
      where watch."AIDexterWatch_CompanyID" = v_company_id
        and watch."AIDexterWatch_CapabilityCode" = 'customers'
        and watch."AIDexterWatch_StatusCode" = 'active'
        and watch."AIDexterWatch_IsArmed"
        and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = p_account_id)
      limit 1;
    end if;
  end if;

  return v_result;
end;
$$;

revoke all on function public.multideck_crm_update_account(uuid, uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.multideck_crm_update_account(uuid, uuid, bigint, jsonb) to service_role;

commit;
