-- Account and contact read/watch parity for Dexter.
-- Structured profile edits remain form-only: they combine consent, training-use
-- choices and freeform metadata that must be reviewed together. Dexter therefore
-- exposes evidence-safe reads and deterministic watches, but no broad write action.

begin;

create or replace function public.multideck_dexter_domain_customers(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(jsonb_agg(row_data order by search_rank desc, customer_name), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'recordId', customer."Org_id",
      'recordType', 'account',
      'name', customer."Org_Name",
      'relationshipStatus', coalesce(profile."CRMAccount_RelationshipStatusCode", customer."Org_CRMRelationshipStatusCode"),
      'tier', profile."CRMAccount_Tier",
      'segment', profile."CRMAccount_Segment",
      'vertical', profile."CRMAccount_Vertical",
      'primaryMode', profile."CRMAccount_PrimaryModeCode",
      'primaryTradeLane', profile."CRMAccount_PrimaryTradeLane",
      'healthScore', profile."CRMAccount_HealthScore",
      'churnRiskScore', profile."CRMAccount_ChurnRiskScore",
      'lastContactAt', profile."CRMAccount_LastContactAt",
      'nextActionDueAt', profile."CRMAccount_NextActionDueAt",
      'strategic', coalesce(profile."CRMAccount_IsStrategic", false),
      'owner', nullif(btrim(concat_ws(' ', owner."User_Firstname", owner."User_Lastname")), ''),
      'contactCount', (select count(*) from public."Org_Contacts" contact where contact."Org_ID" = customer."Org_id"),
      'location', address.location,
      'summary', profile."CRMAccount_CustomerCentricSummary",
      'searchEvidence', evidence.value - 'matched'
    ) row_data,
    coalesce((evidence.value->>'confidence')::numeric, 0) search_rank,
    customer."Org_Name" customer_name
    from public."Org_Master" customer
    left join public."CRM_AccountProfiles" profile
      on profile."CRMAccount_OrgID" = customer."Org_id" and not profile."CRMAccount_IsDeleted"
    left join public."cmp_Users" owner on owner."User_ID" = profile."CRMAccount_OwnerUserID"
    left join lateral (
      select nullif(concat_ws(', ', nullif(btrim(location_row."OrgAdd_TownCity"), ''), nullif(upper(btrim(location_row."OrgAdd_Country")), '')), '') location
      from public."Org_Addresses" location_row
      where location_row."Org_ID" = customer."Org_id"
      order by location_row."OrgAdd_ID"
      limit 1
    ) address on true
    cross join lateral public._multideck_dexter_search_evidence(
      p_search,
      jsonb_build_object(
        'name', customer."Org_Name",
        'status', coalesce(profile."CRMAccount_RelationshipStatusCode", customer."Org_CRMRelationshipStatusCode"),
        'tier', profile."CRMAccount_Tier",
        'segment', profile."CRMAccount_Segment",
        'vertical', profile."CRMAccount_Vertical",
        'tradeLane', profile."CRMAccount_PrimaryTradeLane",
        'owner', nullif(btrim(concat_ws(' ', owner."User_Firstname", owner."User_Lastname")), ''),
        'location', address.location
      )
    ) evidence(value)
    where public._multideck_dexter_has_permission(
      (select app_user."User_ID" from public."cmp_Users" app_user where app_user."Auth_User_ID" = auth.uid() and app_user."Company_ID" = p_company_id limit 1),
      'Customers.Read'
    )
      and (
        customer."Org_CRMIsPotentialCustomer"
        or exists (
          select 1 from public."Org_Master_Type" customer_type
          join public."Org_Types" type on type."OrgType_ID" = customer_type."OrgType_ID"
          where customer_type."Org_ID" = customer."Org_id" and lower(type."OrgType_Name") = 'customer'
        )
      )
      and (evidence.value->>'matched')::boolean
    order by search_rank desc, customer."Org_Name"
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) customers;
$$;

create or replace function public.multideck_dexter_domain_contacts(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(jsonb_agg(row_data order by search_rank desc, contact_name), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'recordId', contact."OrgContact_ID",
      'recordType', 'contact',
      'name', nullif(btrim(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName")), ''),
      'accountId', account."Org_id",
      'accountName', account."Org_Name",
      'email', email."OrgContactEmail_Email",
      'role', profile."CRMContact_RoleCode",
      'influenceLevel', profile."CRMContact_InfluenceLevel",
      'relationshipStrength', profile."CRMContact_RelationshipStrength",
      'preferredChannel', profile."CRMContact_PreferredChannelCode",
      'preferredLanguage', profile."CRMContact_PreferredLanguageCode",
      'salesContactAllowed', coalesce(profile."CRMContact_ConsentSalesContact", false),
      'lastContactAt', profile."CRMContact_LastContactAt",
      'notes', profile."CRMContact_Notes",
      'jobTitle', profile."CRMContact_MetadataJSON"->>'jobTitle',
      'department', profile."CRMContact_MetadataJSON"->>'department',
      'searchEvidence', evidence.value - 'matched'
    ) row_data,
    coalesce((evidence.value->>'confidence')::numeric, 0) search_rank,
    nullif(btrim(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName")), '') contact_name
    from public."Org_Contacts" contact
    join public."Org_Master" account on account."Org_id" = contact."Org_ID"
    left join public."CRM_ContactProfiles" profile on profile."CRMContact_OrgContactID" = contact."OrgContact_ID"
    left join lateral (
      select contact_email."OrgContactEmail_Email"
      from public."OrgContact_Emails" contact_email
      where contact_email."OrgContact_ID" = contact."OrgContact_ID"
      order by contact_email."OrgContactEmail_Type", contact_email."OrgContactEmail_ID"
      limit 1
    ) email on true
    cross join lateral public._multideck_dexter_search_evidence(
      p_search,
      jsonb_build_object(
        'name', nullif(btrim(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName")), ''),
        'accountName', account."Org_Name",
        'email', email."OrgContactEmail_Email",
        'role', profile."CRMContact_RoleCode",
        'jobTitle', profile."CRMContact_MetadataJSON"->>'jobTitle',
        'department', profile."CRMContact_MetadataJSON"->>'department'
      ),
      array['email']::text[]
    ) evidence(value)
    where public._multideck_dexter_has_permission(
      (select app_user."User_ID" from public."cmp_Users" app_user where app_user."Auth_User_ID" = auth.uid() and app_user."Company_ID" = p_company_id limit 1),
      'Customers.Read'
    )
      and (evidence.value->>'matched')::boolean
    order by search_rank desc, contact_name
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) contacts;
$$;

insert into public."sys_AIDexterDataDomains"(
  "AIDexterDomain_Code", "AIDexterDomain_Name", "AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction", "AIDexterDomain_SortOrder", "AIDexterDomain_IsActive", "AIDexterDomain_UpdatedAt"
) values
  ('customers', 'Accounts', 'Customer accounts, relationship health, contacts, location and next-action evidence. Profile edits remain available in the structured account form.', 'multideck_dexter_domain_customers', 30, true, now()),
  ('contacts', 'Contacts', 'Account contacts, role, relationship, communication preference and last-contact evidence. Profile edits remain available in the structured contact form.', 'multideck_dexter_domain_contacts', 31, true, now())
on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name" = excluded."AIDexterDomain_Name",
  "AIDexterDomain_Description" = excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction" = excluded."AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder" = excluded."AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive" = true,
  "AIDexterDomain_UpdatedAt" = now();

insert into public."sys_AIDexterWatchCapabilities"(
  "AIDexterWatchCapability_Code", "AIDexterWatchCapability_Name", "AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON", "AIDexterWatchCapability_SortOrder"
) values (
  'customers', 'Accounts and contacts', 'Account relationship, health, owner and contact-profile changes from live CRM records.',
  '["recordType","name","relationshipStatus","tier","segment","healthScore","churnRiskScore","lastContactAt","nextActionDueAt","role","influenceLevel","relationshipStrength","preferredChannel","salesContactAllowed"]'::jsonb,
  31
)
on conflict ("AIDexterWatchCapability_Code") do update set
  "AIDexterWatchCapability_Name" = excluded."AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description" = excluded."AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON" = excluded."AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_IsActive" = true,
  "AIDexterWatchCapability_UpdatedAt" = now();

create or replace function public._multideck_crm_customer_watch_signal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company uuid;
  v_source uuid;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
begin
  select "Company_ID" into v_company from public."cmp_Company" order by "Company_ID" limit 1;

  if tg_table_name = 'Org_Master' then
    v_source := new."Org_id";
    if tg_op <> 'INSERT' then
      v_old := jsonb_build_object('recordType', 'account', 'name', old."Org_Name", 'relationshipStatus', old."Org_CRMRelationshipStatusCode");
    end if;
    v_new := jsonb_build_object('recordType', 'account', 'name', new."Org_Name", 'relationshipStatus', new."Org_CRMRelationshipStatusCode");
  elsif tg_table_name = 'CRM_AccountProfiles' then
    v_source := new."CRMAccount_OrgID";
    if tg_op <> 'INSERT' then
      v_old := jsonb_build_object('recordType', 'account', 'relationshipStatus', old."CRMAccount_RelationshipStatusCode", 'tier', old."CRMAccount_Tier", 'segment', old."CRMAccount_Segment", 'healthScore', old."CRMAccount_HealthScore", 'churnRiskScore', old."CRMAccount_ChurnRiskScore", 'lastContactAt', old."CRMAccount_LastContactAt", 'nextActionDueAt', old."CRMAccount_NextActionDueAt");
    end if;
    v_new := jsonb_build_object('recordType', 'account', 'relationshipStatus', new."CRMAccount_RelationshipStatusCode", 'tier', new."CRMAccount_Tier", 'segment', new."CRMAccount_Segment", 'healthScore', new."CRMAccount_HealthScore", 'churnRiskScore', new."CRMAccount_ChurnRiskScore", 'lastContactAt', new."CRMAccount_LastContactAt", 'nextActionDueAt', new."CRMAccount_NextActionDueAt");
  elsif tg_table_name = 'Org_Contacts' then
    v_source := new."OrgContact_ID";
    if tg_op <> 'INSERT' then
      v_old := jsonb_build_object('recordType', 'contact', 'name', nullif(btrim(concat_ws(' ', old."OrgContact_FirstName", old."OrgContact_LastName")), ''));
    end if;
    v_new := jsonb_build_object('recordType', 'contact', 'name', nullif(btrim(concat_ws(' ', new."OrgContact_FirstName", new."OrgContact_LastName")), ''));
  else
    v_source := new."CRMContact_OrgContactID";
    if tg_op <> 'INSERT' then
      v_old := jsonb_build_object('recordType', 'contact', 'role', old."CRMContact_RoleCode", 'influenceLevel', old."CRMContact_InfluenceLevel", 'relationshipStrength', old."CRMContact_RelationshipStrength", 'preferredChannel', old."CRMContact_PreferredChannelCode", 'salesContactAllowed', old."CRMContact_ConsentSalesContact", 'lastContactAt', old."CRMContact_LastContactAt");
    end if;
    v_new := jsonb_build_object('recordType', 'contact', 'role', new."CRMContact_RoleCode", 'influenceLevel', new."CRMContact_InfluenceLevel", 'relationshipStrength', new."CRMContact_RelationshipStrength", 'preferredChannel', new."CRMContact_PreferredChannelCode", 'salesContactAllowed', new."CRMContact_ConsentSalesContact", 'lastContactAt', new."CRMContact_LastContactAt");
  end if;

  if v_company is not null and v_source is not null and v_new is distinct from v_old and exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = v_company
      and watch."AIDexterWatch_CapabilityCode" = 'customers'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = v_source)
  ) then
    insert into public."AI_DexterWatchSignals"(
      "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode", "AIDexterWatchSignal_SourceTable",
      "AIDexterWatchSignal_SourceID", "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
    ) values (v_company, 'customers', tg_table_name, v_source, v_old, v_new);
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_Org_Master_crm_customer_watch" on public."Org_Master";
create trigger "TR_Org_Master_crm_customer_watch"
after insert or update of "Org_Name", "Org_CRMRelationshipStatusCode" on public."Org_Master"
for each row execute function public._multideck_crm_customer_watch_signal();

drop trigger if exists "TR_CRM_AccountProfiles_crm_customer_watch" on public."CRM_AccountProfiles";
create trigger "TR_CRM_AccountProfiles_crm_customer_watch"
after insert or update of "CRMAccount_RelationshipStatusCode", "CRMAccount_Tier", "CRMAccount_Segment", "CRMAccount_HealthScore", "CRMAccount_ChurnRiskScore", "CRMAccount_LastContactAt", "CRMAccount_NextActionDueAt" on public."CRM_AccountProfiles"
for each row execute function public._multideck_crm_customer_watch_signal();

drop trigger if exists "TR_Org_Contacts_crm_customer_watch" on public."Org_Contacts";
create trigger "TR_Org_Contacts_crm_customer_watch"
after insert or update of "OrgContact_FirstName", "OrgContact_LastName" on public."Org_Contacts"
for each row execute function public._multideck_crm_customer_watch_signal();

drop trigger if exists "TR_CRM_ContactProfiles_crm_customer_watch" on public."CRM_ContactProfiles";
create trigger "TR_CRM_ContactProfiles_crm_customer_watch"
after insert or update of "CRMContact_RoleCode", "CRMContact_InfluenceLevel", "CRMContact_RelationshipStrength", "CRMContact_PreferredChannelCode", "CRMContact_ConsentSalesContact", "CRMContact_LastContactAt" on public."CRM_ContactProfiles"
for each row execute function public._multideck_crm_customer_watch_signal();

revoke all on function public.multideck_dexter_domain_customers(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_contacts(uuid, text, integer) from public, anon, authenticated;
revoke all on function public._multideck_crm_customer_watch_signal() from public, anon, authenticated;

commit;
