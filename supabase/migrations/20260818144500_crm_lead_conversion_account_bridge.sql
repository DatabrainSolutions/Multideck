-- A lead created by the operator-facing New lead flow intentionally has no
-- organisation yet. Deal conversion must promote that lead into a prospect
-- account atomically instead of failing at the final review step.

begin;

alter function public.multideck_crm_convert_lead(uuid, jsonb)
  rename to _multideck_crm_convert_lead_with_org_20260818;

create function public.multideck_crm_convert_lead(
  p_lead_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_lead public."CRM_Leads"%rowtype;
  v_org_id uuid;
  v_account_id uuid;
  v_contact_id uuid;
  v_contact_profile_id uuid;
  v_company_name text;
  v_contact_name text;
  v_contact_first_name text;
  v_contact_last_name text;
  v_email text;
  v_existing_contact_account_id uuid;
  v_existing_contact_company_id uuid;
  v_relationship_status text;
  v_currency_id uuid;
  v_org_type_id uuid;
  v_matching_account_count integer;
  v_matching_contact_count integer;
begin
  select * into v_context from public._multideck_crm_context();

  if not public._multideck_crm_has_permission(v_context.user_id, 'CRM.Write') then
    raise exception 'You do not have permission to convert CRM leads.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_lead_id::text, 0));

  select * into v_lead
  from public."CRM_Leads"
  where "CRMLead_ID" = p_lead_id
    and not "CRMLead_IsDeleted"
  for update;

  if not found or not public._multideck_crm_lead_is_reachable(p_lead_id, v_context.company_id) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  if lower(coalesce(v_lead."CRMLead_MetadataJSON" ->> 'isDemo', 'false')) = 'true' then
    raise exception 'Development demo leads cannot be converted.' using errcode = '42501';
  end if;

  perform public."Audit_SetContext"(
    v_context.user_id, null, 'user', null, null, null, null, null, null,
    'multideck', 'crm', null, null, null
  );

  if v_lead."CRMLead_OrgID" is null then
    v_company_name := nullif(btrim(v_lead."CRMLead_CompanyName"), '');
    if v_company_name is null then
      raise exception 'Add a company name to this lead before converting it to a deal.' using errcode = '22023';
    end if;

    v_email := lower(nullif(btrim(v_lead."CRMLead_Email"), ''));
    v_contact_name := nullif(btrim(v_lead."CRMLead_PersonName"), '');
    v_contact_first_name := nullif(split_part(coalesce(v_contact_name, ''), ' ', 1), '');
    v_contact_last_name := nullif(btrim(substring(coalesce(v_contact_name, '') from length(coalesce(v_contact_first_name, '')) + 1)), '');

    if length(v_company_name) > 100 then
      raise exception 'Company names must be 100 characters or fewer before conversion.' using errcode = '22023';
    end if;
    if length(v_email) > 200 then
      raise exception 'Contact emails must be 200 characters or fewer before conversion.' using errcode = '22023';
    end if;
    if length(v_contact_first_name) > 50 or length(v_contact_last_name) > 50 then
      raise exception 'Contact names must fit within 50 characters per name before conversion.' using errcode = '22023';
    end if;
    if length(nullif(btrim(v_lead."CRMLead_AddressLine1"), '')) > 50
      or length(nullif(btrim(v_lead."CRMLead_AddressLine2"), '')) > 50
      or length(nullif(btrim(v_lead."CRMLead_TownCity"), '')) > 50
      or length(nullif(btrim(v_lead."CRMLead_CountyState"), '')) > 50
      or length(nullif(btrim(v_lead."CRMLead_PostZipCode"), '')) > 50 then
      raise exception 'Lead address fields must be 50 characters or fewer before conversion.' using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(lower(v_company_name), 0));

    -- Reuse one exact, company-scoped account match. This avoids creating a
    -- duplicate prospect while refusing to guess when existing data is already
    -- ambiguous.
    select count(*)
    into v_matching_account_count
    from public."CRM_AccountProfiles" profile
    join public."Org_Master" organisation
      on organisation."Org_id" = profile."CRMAccount_OrgID"
    where profile."CRMAccount_CompanyID" = v_context.company_id
      and not profile."CRMAccount_IsDeleted"
      and lower(coalesce(profile."CRMAccount_MetadataJSON" ->> 'developmentFixture', 'false')) <> 'true'
      and lower(btrim(organisation."Org_Name")) = lower(v_company_name);

    if v_matching_account_count > 1 then
      raise exception 'More than one account matches this company name. Choose the correct account before converting the lead.' using errcode = '22023';
    end if;

    if v_matching_account_count = 1 then
      select profile."CRMAccount_ID", profile."CRMAccount_OrgID"
      into v_account_id, v_org_id
      from public."CRM_AccountProfiles" profile
      join public."Org_Master" organisation
        on organisation."Org_id" = profile."CRMAccount_OrgID"
      where profile."CRMAccount_CompanyID" = v_context.company_id
        and not profile."CRMAccount_IsDeleted"
        and lower(coalesce(profile."CRMAccount_MetadataJSON" ->> 'developmentFixture', 'false')) <> 'true'
        and lower(btrim(organisation."Org_Name")) = lower(v_company_name)
      limit 1;
    else
      select status."CRMRelStatus_Code" into v_relationship_status
      from public."sys_CRMRelationshipStatuses" status
      where status."CRMRelStatus_IsActive"
        and not status."CRMRelStatus_IsCustomer"
      order by
        case status."CRMRelStatus_Code" when 'prospect' then 0 when 'lead' then 1 else 2 end,
        status."CRMRelStatus_SortOrder"
      limit 1;

      select currency."Currency_ID" into v_currency_id
      from public."sys_Currency" currency
      order by case when currency."Currency_Code" = 'GBP' then 0 else 1 end, currency."Currency_Code"
      limit 1;

      if v_relationship_status is null or v_currency_id is null then
        raise exception 'Prospect account lookups are incomplete for this workspace.' using errcode = '55000';
      end if;

      v_org_id := gen_random_uuid();
      v_account_id := gen_random_uuid();

      insert into public."Org_Master" (
        "Org_id",
        "Org_Name",
        "Org_BaseCurrency",
        "Org_AccCode",
        "Org_CRMRelationshipStatusCode",
        "Org_CRMIsPotentialCustomer",
        "Org_CRMIsLead",
        "Org_CRMUpdatedAt"
      ) values (
        v_org_id,
        v_company_name,
        v_currency_id,
        coalesce(nullif(left(regexp_replace(upper(v_company_name), '[^A-Z0-9]', '', 'g'), 11), ''), 'PROSPECT')
          || '-' || upper(left(replace(v_org_id::text, '-', ''), 6)),
        v_relationship_status,
        true,
        true,
        now()
      );

      insert into public."CRM_AccountProfiles" (
        "CRMAccount_ID",
        "CRMAccount_OrgID",
        "CRMAccount_CompanyID",
        "CRMAccount_RelationshipStatusCode",
        "CRMAccount_OwnerUserID",
        "CRMAccount_CreatedBy",
        "CRMAccount_UpdatedBy",
        "CRMAccount_EditVersion"
      ) values (
        v_account_id,
        v_org_id,
        v_context.company_id,
        v_relationship_status,
        coalesce(v_lead."CRMLead_OwnerUserID", v_context.user_id),
        v_context.user_id,
        v_context.user_id,
        1
      );

      select "OrgType_ID" into v_org_type_id
      from public."Org_Types"
      where lower(btrim("OrgType_Name")) in ('prospect', 'lead')
      order by case lower(btrim("OrgType_Name")) when 'prospect' then 0 else 1 end, "OrgType_Order" nulls last
      limit 1;
      if v_org_type_id is not null then
        insert into public."Org_Master_Type" ("Org_ID", "OrgType_ID")
        values (v_org_id, v_org_type_id)
        on conflict ("OrgType_ID", "Org_ID") do nothing;
      end if;
    end if;

    if coalesce(
      nullif(btrim(v_lead."CRMLead_AddressLine1"), ''),
      nullif(btrim(v_lead."CRMLead_TownCity"), ''),
      nullif(btrim(v_lead."CRMLead_PostZipCode"), ''),
      nullif(btrim(v_lead."CRMLead_CountryCode"), '')
    ) is not null and not exists (
      select 1 from public."Org_Addresses" address where address."Org_ID" = v_org_id
    ) then
      insert into public."Org_Addresses" (
        "OrgAdd_ID", "Org_ID", "OrgAdd_Line1", "OrgAdd_Line2", "OrgAdd_TownCity",
        "OrgAdd_CountyState", "OrgAdd_PostZipCode", "OrgAdd_Country"
      ) values (
        gen_random_uuid(), v_org_id,
        nullif(btrim(v_lead."CRMLead_AddressLine1"), ''),
        nullif(btrim(v_lead."CRMLead_AddressLine2"), ''),
        nullif(btrim(v_lead."CRMLead_TownCity"), ''),
        nullif(btrim(v_lead."CRMLead_CountyState"), ''),
        nullif(btrim(v_lead."CRMLead_PostZipCode"), ''),
        upper(nullif(btrim(v_lead."CRMLead_CountryCode"), ''))
      );
    end if;

    if v_email is not null then
      perform pg_advisory_xact_lock(hashtextextended(v_email, 0));
      select count(distinct contact."OrgContact_ID") into v_matching_contact_count
      from public."Org_Contacts" contact
      join public."OrgContact_Emails" email
        on email."OrgContact_ID" = contact."OrgContact_ID"
      where contact."Org_ID" = v_org_id
        and lower(btrim(email."OrgContactEmail_Email")) = v_email
      ;
      if v_matching_contact_count > 1 then
        raise exception 'More than one contact matches this lead email. Choose the correct contact before converting the lead.' using errcode = '22023';
      elsif v_matching_contact_count = 1 then
        select contact."OrgContact_ID" into v_contact_id
        from public."Org_Contacts" contact
        join public."OrgContact_Emails" email
          on email."OrgContact_ID" = contact."OrgContact_ID"
        where contact."Org_ID" = v_org_id
          and lower(btrim(email."OrgContactEmail_Email")) = v_email;
      end if;
    end if;

    if v_contact_id is not null then
      select profile."CRMContact_ID", profile."CRMContact_AccountID", profile."CRMContact_CompanyID"
      into v_contact_profile_id, v_existing_contact_account_id, v_existing_contact_company_id
      from public."CRM_ContactProfiles" profile
      where profile."CRMContact_OrgContactID" = v_contact_id
      order by profile."CRMContact_ID"
      limit 1
      for update;

      if v_contact_profile_id is null then
        insert into public."CRM_ContactProfiles" (
          "CRMContact_ID", "CRMContact_OrgContactID", "CRMContact_AccountID", "CRMContact_CompanyID",
          "CRMContact_CreatedBy", "CRMContact_UpdatedBy", "CRMContact_EditVersion"
        ) values (gen_random_uuid(), v_contact_id, v_account_id, v_context.company_id, v_context.user_id, v_context.user_id, 1);
      elsif v_existing_contact_company_id is distinct from v_context.company_id
        or (v_existing_contact_account_id is not null and v_existing_contact_account_id is distinct from v_account_id) then
        raise exception 'The matched contact belongs to a different CRM account or company.' using errcode = '42501';
      else
        update public."CRM_ContactProfiles"
        set "CRMContact_AccountID" = v_account_id,
            "CRMContact_CompanyID" = v_context.company_id,
            "CRMContact_UpdatedBy" = v_context.user_id,
            "CRMContact_UpdatedAt" = now(),
            "CRMContact_EditVersion" = "CRMContact_EditVersion" + 1
        where "CRMContact_ID" = v_contact_profile_id;
      end if;
    elsif v_contact_name is not null or v_email is not null then
      v_contact_id := gen_random_uuid();
      v_contact_profile_id := gen_random_uuid();

      insert into public."Org_Contacts" (
        "OrgContact_ID",
        "Org_ID",
        "OrgContact_FirstName",
        "OrgContact_LastName"
      ) values (
        v_contact_id,
        v_org_id,
        v_contact_first_name,
        v_contact_last_name
      );

      insert into public."CRM_ContactProfiles" (
        "CRMContact_ID",
        "CRMContact_OrgContactID",
        "CRMContact_AccountID",
        "CRMContact_CompanyID",
        "CRMContact_CreatedBy",
        "CRMContact_UpdatedBy",
        "CRMContact_EditVersion"
      ) values (
        v_contact_profile_id,
        v_contact_id,
        v_account_id,
        v_context.company_id,
        v_context.user_id,
        v_context.user_id,
        1
      );

      if v_email is not null then
        insert into public."OrgContact_Emails" (
          "OrgContactEmail_ID",
          "OrgContact_ID",
          "OrgContactEmail_Email",
          "OrgContactEmail_Type"
        ) values (
          gen_random_uuid(),
          v_contact_id,
          v_email,
          1
        );
      end if;
    end if;

    update public."CRM_Leads"
    set
      "CRMLead_OrgID" = v_org_id,
      "CRMLead_PrimaryContactID" = coalesce(v_contact_id, "CRMLead_PrimaryContactID"),
      "CRMLead_UpdatedAt" = now(),
      "CRMLead_UpdatedBy" = v_context.user_id
    where "CRMLead_ID" = p_lead_id;

    insert into public."CRM_OrgLifecycleTags" (
      "CRMOrgLifeTag_OrgID", "CRMOrgLifeTag_TagCode", "CRMOrgLifeTag_SourceTable",
      "CRMOrgLifeTag_SourceID", "CRMOrgLifeTag_CreatedBy"
    ) values
      (v_org_id, 'potential_customer', 'CRM_Leads', p_lead_id, v_context.user_id),
      (v_org_id, 'prospect', 'CRM_Leads', p_lead_id, v_context.user_id)
    on conflict ("CRMOrgLifeTag_OrgID", "CRMOrgLifeTag_TagCode") do update
      set "CRMOrgLifeTag_IsActive" = true;
  end if;

  return public._multideck_crm_convert_lead_with_org_20260818(p_lead_id, p_input);
end;
$$;

revoke all on function public._multideck_crm_convert_lead_with_org_20260818(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.multideck_crm_convert_lead(uuid, jsonb)
  from public, anon;
grant execute on function public.multideck_crm_convert_lead(uuid, jsonb)
  to authenticated;

comment on function public.multideck_crm_convert_lead(uuid, jsonb) is
  'Atomically promotes an organisation-free lead into a company-scoped prospect account and then creates the first deal.';

commit;
