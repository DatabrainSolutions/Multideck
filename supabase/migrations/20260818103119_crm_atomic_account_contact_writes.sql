-- CRM account/contact write boundary.
--
-- The customer Edge Function is deliberately the permission boundary.  These
-- RPCs are service-role-only so that the Edge Function can validate the
-- authenticated operator once, then commit the complete record change in one
-- database transaction.  The edit versions make stale browser drafts fail
-- closed instead of overwriting a newer operator's work.

begin;

alter table public."CRM_AccountProfiles"
  add column if not exists "CRMAccount_EditVersion" bigint not null default 1;

alter table public."CRM_ContactProfiles"
  add column if not exists "CRMContact_EditVersion" bigint not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'CRM_AccountProfiles_edit_version_positive'
      and conrelid = 'public."CRM_AccountProfiles"'::regclass
  ) then
    alter table public."CRM_AccountProfiles"
      add constraint "CRM_AccountProfiles_edit_version_positive"
      check ("CRMAccount_EditVersion" > 0) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'CRM_ContactProfiles_edit_version_positive'
      and conrelid = 'public."CRM_ContactProfiles"'::regclass
  ) then
    alter table public."CRM_ContactProfiles"
      add constraint "CRM_ContactProfiles_edit_version_positive"
      check ("CRMContact_EditVersion" > 0) not valid;
  end if;
end;
$$;

create index if not exists "IX_OrgContact_Emails_normalized_crm_write"
  on public."OrgContact_Emails" (lower(btrim("OrgContactEmail_Email")));

create or replace function public._multideck_crm_write_actor(p_actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_actor_user_id is null or not exists (
    select 1 from public."cmp_Users"
    where "User_ID" = p_actor_user_id
      and coalesce("User_AccessStatus", 'active') = 'active'
      and "Auth_User_ID" is not null
  ) then
    raise exception 'The CRM operator is not active.' using errcode = '42501';
  end if;
  perform public."Audit_SetContext"(
    p_actor_user_id, null, 'user', null, null, null, null, null, null,
    'multideck', 'crm', null, null, null
  );
end;
$$;

create or replace function public._multideck_crm_json_bool(p_input jsonb, p_key text, p_fallback boolean)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select case lower(coalesce(p_input ->> p_key, ''))
    when 'true' then true
    when 'false' then false
    else p_fallback
  end;
$$;

create or replace function public._multideck_crm_json_number(p_input jsonb, p_key text, p_fallback numeric)
returns numeric
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when coalesce(p_input ->> p_key, '') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
      then (p_input ->> p_key)::numeric
    when p_input ? p_key then null
    else p_fallback
  end;
$$;

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
  v_org public."Org_Master"%rowtype;
  v_profile public."CRM_AccountProfiles"%rowtype;
  v_address public."Org_Addresses"%rowtype;
  v_engagement public."CRM_CustomerEngagementPreferences"%rowtype;
  v_address_input jsonb := case when jsonb_typeof(p_input -> 'address') = 'object' then p_input -> 'address' else '{}'::jsonb end;
  v_engagement_input jsonb := case when jsonb_typeof(p_input -> 'engagement') = 'object' then p_input -> 'engagement' else '{}'::jsonb end;
  v_name text := nullif(btrim(p_input ->> 'name'), '');
  v_country text := upper(nullif(btrim(v_address_input ->> 'countryCode'), ''));
  v_now timestamptz := now();
  v_marketing boolean;
  v_reason text;
  v_next_version bigint;
  v_profile_id uuid;
  v_engagement_id uuid;
  v_activity_type text;
begin
  perform public._multideck_crm_write_actor(p_actor_user_id);
  if v_name is null then
    raise exception 'Enter an account name.' using errcode = '22023';
  end if;
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    raise exception 'Enter a two-letter ISO country code, such as GB.' using errcode = '22023';
  end if;

  -- Serialise the name check so two simultaneous creates/renames cannot pass
  -- the same case-insensitive duplicate check.
  perform pg_advisory_xact_lock(hashtextextended(lower(v_name), 0));
  if exists (
    select 1 from public."Org_Master"
    where lower(btrim("Org_Name")) = lower(v_name)
      and "Org_id" <> p_account_id
  ) then
    raise exception 'An account named ''%'' already exists.', v_name using errcode = '23505';
  end if;

  select * into v_org
  from public."Org_Master"
  where "Org_id" = p_account_id
  for update;
  if not found then
    raise exception 'Account not found.' using errcode = 'P0002';
  end if;

  select * into v_profile
  from public."CRM_AccountProfiles"
  where "CRMAccount_OrgID" = p_account_id
    and not "CRMAccount_IsDeleted"
  order by "CRMAccount_ID"
  limit 1
  for update;

  if not found then
    if p_expected_version is not null and p_expected_version <> 1 then
      raise exception 'CRM_CONFLICT:This account changed since it was loaded.' using errcode = 'P0001';
    end if;
    v_profile_id := gen_random_uuid();
    insert into public."CRM_AccountProfiles"(
      "CRMAccount_ID", "CRMAccount_OrgID", "CRMAccount_RelationshipStatusCode",
      "CRMAccount_CreatedBy", "CRMAccount_UpdatedBy", "CRMAccount_EditVersion"
    ) values (
      v_profile_id, p_account_id, coalesce(nullif(btrim(p_input ->> 'relationshipStatus'), ''), 'active_customer'),
      p_actor_user_id, p_actor_user_id, 1
    );
    select * into v_profile from public."CRM_AccountProfiles" where "CRMAccount_ID" = v_profile_id for update;
  elsif p_expected_version is not null and v_profile."CRMAccount_EditVersion" <> p_expected_version then
    raise exception 'CRM_CONFLICT:This account changed since it was loaded.' using errcode = 'P0001';
  end if;

  v_next_version := coalesce(v_profile."CRMAccount_EditVersion", 1) + 1;
  v_marketing := case when p_input ? 'marketingOptIn' then public._multideck_crm_json_bool(p_input, 'marketingOptIn', v_org."Org_MarketingOptIn") else v_org."Org_MarketingOptIn" end;
  if v_marketing is distinct from v_org."Org_MarketingOptIn" then
    v_reason := nullif(btrim(p_input ->> 'marketingConsentReason'), '');
    if v_reason is null then
      raise exception 'Explain the source or evidence for this consent change.' using errcode = '22023';
    end if;
  end if;

  update public."Org_Master"
  set "Org_Name" = v_name,
      "Org_CRMRelationshipStatusCode" = coalesce(nullif(btrim(p_input ->> 'relationshipStatus'), ''), "Org_CRMRelationshipStatusCode"),
      "Org_CRMUpdatedAt" = v_now
  where "Org_id" = p_account_id;

  update public."CRM_AccountProfiles"
  set "CRMAccount_RelationshipStatusCode" = coalesce(nullif(btrim(p_input ->> 'relationshipStatus'), ''), "CRMAccount_RelationshipStatusCode"),
      "CRMAccount_Tier" = case when p_input ? 'tier' then nullif(btrim(p_input ->> 'tier'), '') else "CRMAccount_Tier" end,
      "CRMAccount_Segment" = case when p_input ? 'segment' then nullif(btrim(p_input ->> 'segment'), '') else "CRMAccount_Segment" end,
      "CRMAccount_Vertical" = case when p_input ? 'vertical' then nullif(btrim(p_input ->> 'vertical'), '') else "CRMAccount_Vertical" end,
      "CRMAccount_PrimaryModeCode" = case when p_input ? 'primaryMode' then nullif(btrim(p_input ->> 'primaryMode'), '') else "CRMAccount_PrimaryModeCode" end,
      "CRMAccount_PrimaryTradeLane" = case when p_input ? 'primaryTradeLane' then nullif(btrim(p_input ->> 'primaryTradeLane'), '') else "CRMAccount_PrimaryTradeLane" end,
      "CRMAccount_GrowthState" = case when p_input ? 'growthState' then nullif(btrim(p_input ->> 'growthState'), '') else "CRMAccount_GrowthState" end,
      "CRMAccount_HealthScore" = public._multideck_crm_json_number(p_input, 'healthScore', "CRMAccount_HealthScore"),
      "CRMAccount_ChurnRiskScore" = public._multideck_crm_json_number(p_input, 'churnRiskScore', "CRMAccount_ChurnRiskScore"),
      "CRMAccount_CustomerCentricSummary" = case when p_input ? 'summary' then nullif(btrim(p_input ->> 'summary'), '') else "CRMAccount_CustomerCentricSummary" end,
      "CRMAccount_IsStrategic" = case when p_input ? 'strategic' then public._multideck_crm_json_bool(p_input, 'strategic', "CRMAccount_IsStrategic") else "CRMAccount_IsStrategic" end,
      "CRMAccount_IsTrainingAllowed" = case when p_input ? 'trainingAllowed' then public._multideck_crm_json_bool(p_input, 'trainingAllowed', "CRMAccount_IsTrainingAllowed") else "CRMAccount_IsTrainingAllowed" end,
      "CRMAccount_MetadataJSON" = case when jsonb_typeof(p_input -> 'metadata') = 'object' then p_input -> 'metadata' else "CRMAccount_MetadataJSON" end,
      "CRMAccount_UpdatedAt" = v_now,
      "CRMAccount_UpdatedBy" = p_actor_user_id,
      "CRMAccount_EditVersion" = v_next_version
  where "CRMAccount_ID" = v_profile."CRMAccount_ID";

  select * into v_address from public."Org_Addresses" where "Org_ID" = p_account_id order by "OrgAdd_ID" limit 1 for update;
  if found then
    update public."Org_Addresses"
    set "OrgAdd_Line1" = case when v_address_input ? 'line1' then nullif(btrim(v_address_input ->> 'line1'), '') else "OrgAdd_Line1" end,
        "OrgAdd_Line2" = case when v_address_input ? 'line2' then nullif(btrim(v_address_input ->> 'line2'), '') else "OrgAdd_Line2" end,
        "OrgAdd_TownCity" = case when v_address_input ? 'townCity' then nullif(btrim(v_address_input ->> 'townCity'), '') else "OrgAdd_TownCity" end,
        "OrgAdd_CountyState" = case when v_address_input ? 'countyState' then nullif(btrim(v_address_input ->> 'countyState'), '') else "OrgAdd_CountyState" end,
        "OrgAdd_PostZipCode" = case when v_address_input ? 'postZipCode' then nullif(btrim(v_address_input ->> 'postZipCode'), '') else "OrgAdd_PostZipCode" end,
        "OrgAdd_Country" = case when v_address_input ? 'countryCode' then v_country else "OrgAdd_Country" end,
        "OrgAdd_MainEmail" = case when v_address_input ? 'mainEmail' then lower(nullif(btrim(v_address_input ->> 'mainEmail'), '')) else "OrgAdd_MainEmail" end,
        "OrgAdd_MainPhone" = case when v_address_input ? 'mainPhone' then nullif(btrim(v_address_input ->> 'mainPhone'), '') else "OrgAdd_MainPhone" end
    where "OrgAdd_ID" = v_address."OrgAdd_ID";
  elsif jsonb_typeof(p_input -> 'address') = 'object' then
    insert into public."Org_Addresses"(
      "OrgAdd_ID", "Org_ID", "OrgAdd_Line1", "OrgAdd_Line2", "OrgAdd_TownCity", "OrgAdd_CountyState",
      "OrgAdd_PostZipCode", "OrgAdd_Country", "OrgAdd_MainEmail", "OrgAdd_MainPhone"
    ) values (
      gen_random_uuid(), p_account_id, nullif(btrim(v_address_input ->> 'line1'), ''), nullif(btrim(v_address_input ->> 'line2'), ''),
      nullif(btrim(v_address_input ->> 'townCity'), ''), nullif(btrim(v_address_input ->> 'countyState'), ''),
      nullif(btrim(v_address_input ->> 'postZipCode'), ''), v_country,
      lower(nullif(btrim(v_address_input ->> 'mainEmail'), '')), nullif(btrim(v_address_input ->> 'mainPhone'), '')
    );
  end if;

  select * into v_engagement from public."CRM_CustomerEngagementPreferences"
  where "CRMCustEngPref_CustomerOrgID" = p_account_id
  order by "CRMCustEngPref_UpdatedAt" desc, "CRMCustEngPref_ID" desc
  limit 1 for update;
  if found then
    update public."CRM_CustomerEngagementPreferences"
    set "CRMCustEngPref_PreferredChannelCode" = case when v_engagement_input ? 'preferredChannel' then nullif(btrim(v_engagement_input ->> 'preferredChannel'), '') else "CRMCustEngPref_PreferredChannelCode" end,
        "CRMCustEngPref_AllowThankYouMessages" = case when v_engagement_input ? 'allowThankYouMessages' then public._multideck_crm_json_bool(v_engagement_input, 'allowThankYouMessages', "CRMCustEngPref_AllowThankYouMessages") else "CRMCustEngPref_AllowThankYouMessages" end,
        "CRMCustEngPref_AllowFollowupMessages" = case when v_engagement_input ? 'allowFollowupMessages' then public._multideck_crm_json_bool(v_engagement_input, 'allowFollowupMessages', "CRMCustEngPref_AllowFollowupMessages") else "CRMCustEngPref_AllowFollowupMessages" end,
        "CRMCustEngPref_AllowWhatsApp" = case when v_engagement_input ? 'allowWhatsApp' then public._multideck_crm_json_bool(v_engagement_input, 'allowWhatsApp', "CRMCustEngPref_AllowWhatsApp") else "CRMCustEngPref_AllowWhatsApp" end,
        "CRMCustEngPref_DoNotOverContact" = case when v_engagement_input ? 'doNotOverContact' then public._multideck_crm_json_bool(v_engagement_input, 'doNotOverContact', "CRMCustEngPref_DoNotOverContact") else "CRMCustEngPref_DoNotOverContact" end,
        "CRMCustEngPref_MinHoursBetweenNonUrgentMessages" = greatest(0, coalesce(public._multideck_crm_json_number(v_engagement_input, 'minHoursBetweenNonUrgentMessages', "CRMCustEngPref_MinHoursBetweenNonUrgentMessages"), 24))::integer,
        "CRMCustEngPref_Notes" = case when v_engagement_input ? 'notes' then nullif(btrim(v_engagement_input ->> 'notes'), '') else "CRMCustEngPref_Notes" end,
        "CRMCustEngPref_UpdatedAt" = v_now
    where "CRMCustEngPref_ID" = v_engagement."CRMCustEngPref_ID";
  elsif jsonb_typeof(p_input -> 'engagement') = 'object' then
    v_engagement_id := gen_random_uuid();
    insert into public."CRM_CustomerEngagementPreferences"(
      "CRMCustEngPref_ID", "CRMCustEngPref_CustomerOrgID", "CRMCustEngPref_PreferredChannelCode",
      "CRMCustEngPref_AllowThankYouMessages", "CRMCustEngPref_AllowFollowupMessages", "CRMCustEngPref_AllowWhatsApp",
      "CRMCustEngPref_DoNotOverContact", "CRMCustEngPref_MinHoursBetweenNonUrgentMessages", "CRMCustEngPref_Notes"
    ) values (
      v_engagement_id, p_account_id, nullif(btrim(v_engagement_input ->> 'preferredChannel'), ''),
      public._multideck_crm_json_bool(v_engagement_input, 'allowThankYouMessages', true),
      public._multideck_crm_json_bool(v_engagement_input, 'allowFollowupMessages', true),
      public._multideck_crm_json_bool(v_engagement_input, 'allowWhatsApp', false),
      public._multideck_crm_json_bool(v_engagement_input, 'doNotOverContact', false),
      greatest(0, coalesce(public._multideck_crm_json_number(v_engagement_input, 'minHoursBetweenNonUrgentMessages', 24), 24))::integer,
      nullif(btrim(v_engagement_input ->> 'notes'), '')
    );
  end if;

  if v_marketing is distinct from v_org."Org_MarketingOptIn" then
    perform public._multideck_set_marketing_consent(
      'customer', p_account_id, v_marketing, 'account_detail', v_reason, p_actor_user_id,
      jsonb_build_object('surface', 'crm_account_detail')
    );
  end if;

  select "CRMActType_Code" into v_activity_type
  from public."sys_CRMActivityTypes"
  where "CRMActType_IsActive"
  order by case when "CRMActType_Code" = 'review' then 0 else 1 end, "CRMActType_SortOrder", "CRMActType_Code"
  limit 1;
  if v_activity_type is null then
    raise exception 'No active CRM activity type is configured.' using errcode = '23503';
  end if;

  insert into public."CRM_Activities"(
    "CRMActivity_ID", "CRMActivity_ActivityTypeCode", "CRMActivity_AccountID", "CRMActivity_Subject",
    "CRMActivity_Summary", "CRMActivity_ActivityAt", "CRMActivity_OwnerUserID", "CRMActivity_CreatedBy", "CRMActivity_UpdatedBy"
  ) values (
    gen_random_uuid(), v_activity_type, v_profile."CRMAccount_ID", 'Account details updated',
    coalesce(nullif(btrim(p_input ->> 'changeSummary'), ''), 'The account profile and communication preferences were reviewed.'),
    v_now, p_actor_user_id, p_actor_user_id, p_actor_user_id
  );

  return jsonb_build_object('id', p_account_id, 'editVersion', v_next_version);
end;
$$;

create or replace function public.multideck_crm_update_contact(
  p_actor_user_id uuid,
  p_contact_id uuid,
  p_expected_version bigint,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_contact public."Org_Contacts"%rowtype;
  v_profile public."CRM_ContactProfiles"%rowtype;
  v_existing_email public."OrgContact_Emails"%rowtype;
  v_identity public."Comm_Identities"%rowtype;
  v_account_id uuid;
  v_first text := case when p_input ? 'firstName' then nullif(btrim(p_input ->> 'firstName'), '') end;
  v_last text := case when p_input ? 'lastName' then nullif(btrim(p_input ->> 'lastName'), '') end;
  v_email text := lower(nullif(btrim(p_input ->> 'email'), ''));
  v_phone text := nullif(btrim(p_input ->> 'phone'), '');
  v_now timestamptz := now();
  v_marketing boolean;
  v_reason text;
  v_next_version bigint;
  v_metadata jsonb;
  v_activity_id uuid;
  v_activity_type text;
begin
  perform public._multideck_crm_write_actor(p_actor_user_id);

  select * into v_contact from public."Org_Contacts" where "OrgContact_ID" = p_contact_id for update;
  if not found then
    raise exception 'Contact not found.' using errcode = 'P0002';
  end if;
  v_first := case when p_input ? 'firstName' then nullif(btrim(p_input ->> 'firstName'), '') else v_contact."OrgContact_FirstName" end;
  v_last := case when p_input ? 'lastName' then nullif(btrim(p_input ->> 'lastName'), '') else v_contact."OrgContact_LastName" end;
  v_email := case when p_input ? 'email' then lower(nullif(btrim(p_input ->> 'email'), '')) else null end;
  if v_first is null and v_last is null then
    raise exception 'Enter the contact''s name.' using errcode = '22023';
  end if;

  select * into v_profile from public."CRM_ContactProfiles"
  where "CRMContact_OrgContactID" = p_contact_id
  order by "CRMContact_ID"
  limit 1 for update;
  if not found then
    if p_expected_version is not null and p_expected_version <> 1 then
      raise exception 'CRM_CONFLICT:This contact changed since it was loaded.' using errcode = 'P0001';
    end if;
    insert into public."CRM_ContactProfiles"(
      "CRMContact_ID", "CRMContact_OrgContactID", "CRMContact_CreatedBy", "CRMContact_UpdatedBy", "CRMContact_EditVersion"
    ) values (gen_random_uuid(), p_contact_id, p_actor_user_id, p_actor_user_id, 1)
    returning * into v_profile;
  elsif p_expected_version is not null and v_profile."CRMContact_EditVersion" <> p_expected_version then
    raise exception 'CRM_CONFLICT:This contact changed since it was loaded.' using errcode = 'P0001';
  end if;
  v_next_version := coalesce(v_profile."CRMContact_EditVersion", 1) + 1;

  if v_email is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_email, 0));
    if exists (
      select 1 from public."OrgContact_Emails" email
      where lower(btrim(email."OrgContactEmail_Email")) = v_email
        and email."OrgContact_ID" <> p_contact_id
    ) then
      raise exception 'This email is already connected to a contact.' using errcode = '23505';
    end if;
  end if;

  v_marketing := case when p_input ? 'marketingOptIn' then public._multideck_crm_json_bool(p_input, 'marketingOptIn', v_contact."OrgContact_MarketingOptIn") else v_contact."OrgContact_MarketingOptIn" end;
  if v_marketing is distinct from v_contact."OrgContact_MarketingOptIn" then
    v_reason := nullif(btrim(p_input ->> 'marketingConsentReason'), '');
    if v_reason is null then
      raise exception 'Explain the source or evidence for this consent change.' using errcode = '22023';
    end if;
  end if;

  update public."Org_Contacts"
  set "OrgContact_FirstName" = case when p_input ? 'firstName' then v_first else "OrgContact_FirstName" end,
      "OrgContact_LastName" = case when p_input ? 'lastName' then v_last else "OrgContact_LastName" end
  where "OrgContact_ID" = p_contact_id;

  select * into v_existing_email from public."OrgContact_Emails"
  where "OrgContact_ID" = p_contact_id
  order by "OrgContactEmail_Type", "OrgContactEmail_ID"
  limit 1 for update;
  if p_input ? 'email' then
    if v_email is null and found then
      delete from public."OrgContact_Emails" where "OrgContactEmail_ID" = v_existing_email."OrgContactEmail_ID";
    elsif v_email is not null and found then
      update public."OrgContact_Emails" set "OrgContactEmail_Email" = v_email where "OrgContactEmail_ID" = v_existing_email."OrgContactEmail_ID";
    elsif v_email is not null then
      insert into public."OrgContact_Emails"("OrgContactEmail_ID", "OrgContact_ID", "OrgContactEmail_Email", "OrgContactEmail_Type")
      values (gen_random_uuid(), p_contact_id, v_email, 1);
    end if;
  end if;

  v_metadata := case when jsonb_typeof(p_input -> 'metadata') = 'object' then p_input -> 'metadata' else coalesce(v_profile."CRMContact_MetadataJSON", '{}'::jsonb) end;
  v_metadata := v_metadata || jsonb_build_object(
    'jobTitle', case when p_input ? 'jobTitle' then nullif(btrim(p_input ->> 'jobTitle'), '') else v_metadata ->> 'jobTitle' end,
    'department', case when p_input ? 'department' then nullif(btrim(p_input ->> 'department'), '') else v_metadata ->> 'department' end,
    'phone', case when p_input ? 'phone' then v_phone else v_metadata ->> 'phone' end
  );

  select account."CRMAccount_ID" into v_account_id
  from public."CRM_AccountProfiles" account
  where account."CRMAccount_OrgID" = v_contact."Org_ID"
    and not account."CRMAccount_IsDeleted"
  order by account."CRMAccount_ID"
  limit 1;

  update public."CRM_ContactProfiles"
  set "CRMContact_AccountID" = coalesce(v_profile."CRMContact_AccountID", v_account_id),
      "CRMContact_RoleCode" = case when p_input ? 'role' then nullif(btrim(p_input ->> 'role'), '') else "CRMContact_RoleCode" end,
      "CRMContact_InfluenceLevel" = case when p_input ? 'influenceLevel' then nullif(btrim(p_input ->> 'influenceLevel'), '') else "CRMContact_InfluenceLevel" end,
      "CRMContact_RelationshipStrength" = public._multideck_crm_json_number(p_input, 'relationshipStrength', "CRMContact_RelationshipStrength"),
      "CRMContact_PreferredChannelCode" = case when p_input ? 'preferredChannel' then nullif(btrim(p_input ->> 'preferredChannel'), '') else "CRMContact_PreferredChannelCode" end,
      "CRMContact_PreferredLanguageCode" = case when p_input ? 'preferredLanguage' then nullif(btrim(p_input ->> 'preferredLanguage'), '') else "CRMContact_PreferredLanguageCode" end,
      "CRMContact_ConsentSalesContact" = case when p_input ? 'consentSalesContact' then public._multideck_crm_json_bool(p_input, 'consentSalesContact', "CRMContact_ConsentSalesContact") else "CRMContact_ConsentSalesContact" end,
      "CRMContact_ConsentMarketing" = v_marketing,
      "CRMContact_Notes" = case when p_input ? 'notes' then nullif(btrim(p_input ->> 'notes'), '') else "CRMContact_Notes" end,
      "CRMContact_IsTrainingAllowed" = case when p_input ? 'trainingAllowed' then public._multideck_crm_json_bool(p_input, 'trainingAllowed', "CRMContact_IsTrainingAllowed") else "CRMContact_IsTrainingAllowed" end,
      "CRMContact_MetadataJSON" = v_metadata,
      "CRMContact_UpdatedAt" = v_now,
      "CRMContact_UpdatedBy" = p_actor_user_id,
      "CRMContact_EditVersion" = v_next_version
  where "CRMContact_ID" = v_profile."CRMContact_ID";

  if p_input ? 'phone' then
    select * into v_identity from public."Comm_Identities"
    where "CommIdentity_ContactID" = p_contact_id
      and "CommIdentity_ChannelCode" in ('phone', 'sms', 'whatsapp')
      and not "CommIdentity_IsDeleted"
    order by "CommIdentity_ID"
    limit 1
    for update;
    if v_phone is null and found then
      update public."Comm_Identities" set "CommIdentity_IsDeleted" = true, "CommIdentity_UpdatedAt" = v_now where "CommIdentity_ID" = v_identity."CommIdentity_ID";
    elsif v_phone is not null then
      if found then
        update public."Comm_Identities"
        set "CommIdentity_ChannelCode" = case when nullif(btrim(p_input ->> 'preferredChannel'), '') = 'whatsapp' then 'whatsapp' else 'phone' end,
            "CommIdentity_Address" = v_phone,
            "CommIdentity_NormalizedAddress" = regexp_replace(v_phone, '[^+0-9]', '', 'g'),
            "CommIdentity_DisplayName" = btrim(concat_ws(' ', coalesce(v_first, v_contact."OrgContact_FirstName"), coalesce(v_last, v_contact."OrgContact_LastName"))),
            "CommIdentity_UpdatedAt" = v_now
        where "CommIdentity_ID" = v_identity."CommIdentity_ID";
      else
        insert into public."Comm_Identities"(
          "CommIdentity_ID", "CommIdentity_ChannelCode", "CommIdentity_Address", "CommIdentity_NormalizedAddress",
          "CommIdentity_DisplayName", "CommIdentity_ParticipantTypeCode", "CommIdentity_OrgID", "CommIdentity_ContactID",
          "CommIdentity_Source", "CommIdentity_UpdatedAt"
        ) values (
          gen_random_uuid(), case when nullif(btrim(p_input ->> 'preferredChannel'), '') = 'whatsapp' then 'whatsapp' else 'phone' end,
          v_phone, regexp_replace(v_phone, '[^+0-9]', '', 'g'),
          btrim(concat_ws(' ', coalesce(v_first, v_contact."OrgContact_FirstName"), coalesce(v_last, v_contact."OrgContact_LastName"))),
          'external', v_contact."Org_ID", p_contact_id, 'crm_contact_detail', v_now
        );
      end if;
    end if;
  end if;

  if v_marketing is distinct from v_contact."OrgContact_MarketingOptIn" then
    perform public._multideck_set_marketing_consent(
      'contact', p_contact_id, v_marketing, 'contact_detail', v_reason, p_actor_user_id,
      jsonb_build_object('surface', 'crm_contact_detail')
    );
  end if;

  select "CRMActType_Code" into v_activity_type
  from public."sys_CRMActivityTypes"
  where "CRMActType_IsActive"
  order by case when "CRMActType_Code" = 'note' then 0 else 1 end, "CRMActType_SortOrder", "CRMActType_Code"
  limit 1;
  if v_activity_type is null then
    raise exception 'No active CRM activity type is configured.' using errcode = '23503';
  end if;

  v_activity_id := gen_random_uuid();
  insert into public."CRM_Activities"(
    "CRMActivity_ID", "CRMActivity_ActivityTypeCode", "CRMActivity_AccountID", "CRMActivity_Subject",
    "CRMActivity_Summary", "CRMActivity_ActivityAt", "CRMActivity_OwnerUserID", "CRMActivity_CreatedBy", "CRMActivity_UpdatedBy"
  ) values (
    v_activity_id, v_activity_type, coalesce(v_profile."CRMContact_AccountID", v_account_id), 'Contact details updated',
    coalesce(nullif(btrim(p_input ->> 'changeSummary'), ''), 'The contact profile and communication preferences were reviewed.'),
    v_now, p_actor_user_id, p_actor_user_id, p_actor_user_id
  );
  insert into public."CRM_ActivityParticipants"(
    "CRMActPart_ID", "CRMActPart_ActivityID", "CRMActPart_OrgID", "CRMActPart_OrgContactID",
    "CRMActPart_NameSnapshot", "CRMActPart_EmailSnapshot", "CRMActPart_Role", "CRMActPart_IsExternal"
  ) values (
    gen_random_uuid(), v_activity_id, v_contact."Org_ID", p_contact_id,
    btrim(concat_ws(' ', coalesce(v_first, v_contact."OrgContact_FirstName"), coalesce(v_last, v_contact."OrgContact_LastName"))),
    v_email, nullif(btrim(p_input ->> 'role'), ''), true
  );

  return jsonb_build_object('id', p_contact_id, 'accountId', v_contact."Org_ID", 'editVersion', v_next_version);
end;
$$;

create or replace function public.multideck_crm_create_account(
  p_actor_user_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_name text := nullif(btrim(p_input ->> 'name'), '');
  v_org_id uuid := gen_random_uuid();
  v_account_id uuid := gen_random_uuid();
  v_contact_id uuid;
  v_email text := lower(nullif(btrim(p_input ->> 'contactEmail'), ''));
  v_country text := upper(nullif(btrim(p_input ->> 'countryCode'), ''));
  v_currency uuid;
  v_now timestamptz := now();
begin
  perform public._multideck_crm_write_actor(p_actor_user_id);
  if v_name is null then raise exception 'Enter an account name.' using errcode = '22023'; end if;
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then raise exception 'Enter a two-letter ISO country code, such as GB.' using errcode = '22023'; end if;
  if p_input ->> 'orgTypeId' is null or not exists (select 1 from public."Org_Types" where "OrgType_ID" = (p_input ->> 'orgTypeId')::uuid) then
    raise exception 'Choose a valid organisation type.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(v_name), 0));
  if exists (select 1 from public."Org_Master" where lower(btrim("Org_Name")) = lower(v_name)) then
    raise exception 'An account named ''%'' already exists.', v_name using errcode = '23505';
  end if;
  if v_email is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_email, 0));
    if exists (select 1 from public."OrgContact_Emails" where lower(btrim("OrgContactEmail_Email")) = v_email) then
      raise exception 'This email is already connected to a contact.' using errcode = '23505';
    end if;
  end if;
  select "Currency_ID" into v_currency
  from public."sys_Currency"
  order by case when "Currency_Code" = 'GBP' then 0 else 1 end, "Currency_Code"
  limit 1;
  if v_currency is null then raise exception 'No base currency is configured for this workspace.' using errcode = '23503'; end if;

  insert into public."Org_Master"(
    "Org_id", "Org_Name", "Org_BaseCurrency", "Org_AccCode", "Org_CRMRelationshipStatusCode",
    "Org_CRMIsPotentialCustomer", "Org_CRMIsLead", "Org_CRMUpdatedAt"
  ) values (
    v_org_id, v_name, v_currency,
    coalesce(nullif(left(regexp_replace(upper(v_name), '[^A-Z0-9]', '', 'g'), 11), ''), 'ACCOUNT') || '-' || upper(left(replace(v_org_id::text, '-', ''), 6)),
    'active_customer', true, false, v_now
  );
  insert into public."Org_Master_Type"("Org_ID", "OrgType_ID") values (v_org_id, (p_input ->> 'orgTypeId')::uuid);
  insert into public."CRM_AccountProfiles"(
    "CRMAccount_ID", "CRMAccount_OrgID", "CRMAccount_RelationshipStatusCode",
    "CRMAccount_OwnerUserID", "CRMAccount_CreatedBy", "CRMAccount_UpdatedBy", "CRMAccount_EditVersion"
  ) values (v_account_id, v_org_id, 'active_customer', p_actor_user_id, p_actor_user_id, p_actor_user_id, 1);
  if coalesce(nullif(btrim(p_input ->> 'addressLine1'), ''), nullif(btrim(p_input ->> 'townCity'), ''), v_country) is not null then
    insert into public."Org_Addresses"("OrgAdd_ID", "Org_ID", "OrgAdd_Line1", "OrgAdd_TownCity", "OrgAdd_PostZipCode", "OrgAdd_Country")
    values (gen_random_uuid(), v_org_id, nullif(btrim(p_input ->> 'addressLine1'), ''), nullif(btrim(p_input ->> 'townCity'), ''), nullif(btrim(p_input ->> 'postZipCode'), ''), v_country);
  end if;
  if nullif(btrim(p_input ->> 'contactFirstName'), '') is not null or nullif(btrim(p_input ->> 'contactLastName'), '') is not null or v_email is not null then
    v_contact_id := gen_random_uuid();
    insert into public."Org_Contacts"("OrgContact_ID", "Org_ID", "OrgContact_FirstName", "OrgContact_LastName")
    values (v_contact_id, v_org_id, nullif(btrim(p_input ->> 'contactFirstName'), ''), nullif(btrim(p_input ->> 'contactLastName'), ''));
    insert into public."CRM_ContactProfiles"("CRMContact_ID", "CRMContact_OrgContactID", "CRMContact_AccountID", "CRMContact_CreatedBy", "CRMContact_UpdatedBy", "CRMContact_EditVersion")
    values (gen_random_uuid(), v_contact_id, v_account_id, p_actor_user_id, p_actor_user_id, 1);
    if v_email is not null then
      insert into public."OrgContact_Emails"("OrgContactEmail_ID", "OrgContact_ID", "OrgContactEmail_Email", "OrgContactEmail_Type")
      values (gen_random_uuid(), v_contact_id, v_email, 1);
    end if;
  end if;
  return jsonb_build_object('id', v_org_id, 'editVersion', 1);
end;
$$;

create or replace function public.multideck_crm_create_contact(
  p_actor_user_id uuid,
  p_account_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_contact_id uuid := gen_random_uuid();
  v_email text := lower(nullif(btrim(p_input ->> 'email'), ''));
  v_first text := nullif(btrim(p_input ->> 'firstName'), '');
  v_last text := nullif(btrim(p_input ->> 'lastName'), '');
  v_account_id uuid;
begin
  perform public._multideck_crm_write_actor(p_actor_user_id);
  if v_email is null then raise exception 'Enter a contact email address.' using errcode = '22023'; end if;
  if v_first is null and v_last is null then raise exception 'Enter the contact''s name.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_email, 0));
  select account."CRMAccount_ID" into v_account_id
  from public."CRM_AccountProfiles" account
  join public."Org_Master" org on org."Org_id" = account."CRMAccount_OrgID"
  where org."Org_id" = p_account_id and not account."CRMAccount_IsDeleted"
  limit 1;
  if v_account_id is null then raise exception 'Choose an existing account.' using errcode = 'P0002'; end if;
  if exists (select 1 from public."OrgContact_Emails" where lower(btrim("OrgContactEmail_Email")) = v_email) then
    raise exception 'This email is already connected to a contact.' using errcode = '23505';
  end if;
  insert into public."Org_Contacts"("OrgContact_ID", "Org_ID", "OrgContact_FirstName", "OrgContact_LastName")
  values (v_contact_id, p_account_id, v_first, v_last);
  insert into public."OrgContact_Emails"("OrgContactEmail_ID", "OrgContact_ID", "OrgContactEmail_Email", "OrgContactEmail_Type")
  values (gen_random_uuid(), v_contact_id, v_email, 1);
  insert into public."CRM_ContactProfiles"("CRMContact_ID", "CRMContact_OrgContactID", "CRMContact_AccountID", "CRMContact_CreatedBy", "CRMContact_UpdatedBy", "CRMContact_EditVersion")
  values (gen_random_uuid(), v_contact_id, v_account_id, p_actor_user_id, p_actor_user_id, 1);

  -- Additional fields use the same atomic update path, preserving one response
  -- contract and one activity entry for a fully populated contact.
  if p_input ? 'role' or p_input ? 'jobTitle' or p_input ? 'department' or p_input ? 'marketingOptIn' or p_input ? 'phone' then
    return public.multideck_crm_update_contact(p_actor_user_id, v_contact_id, 1, p_input);
  end if;
  return jsonb_build_object('id', v_contact_id, 'accountId', p_account_id, 'editVersion', 1);
end;
$$;

revoke all on function public._multideck_crm_write_actor(uuid) from public, anon, authenticated;
revoke all on function public._multideck_crm_json_bool(jsonb, text, boolean) from public, anon, authenticated;
revoke all on function public._multideck_crm_json_number(jsonb, text, numeric) from public, anon, authenticated;
revoke all on function public.multideck_crm_update_account(uuid, uuid, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_crm_update_contact(uuid, uuid, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_crm_create_account(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_crm_create_contact(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.multideck_crm_update_account(uuid, uuid, bigint, jsonb) to service_role;
grant execute on function public.multideck_crm_update_contact(uuid, uuid, bigint, jsonb) to service_role;
grant execute on function public.multideck_crm_create_account(uuid, jsonb) to service_role;
grant execute on function public.multideck_crm_create_contact(uuid, uuid, jsonb) to service_role;

-- Record field-level changes without retaining full row snapshots.  Email and
-- phone values are deliberately redacted in the audit field table.
insert into public."sys_WorkflowRecordTypes"(
  "WorkflowRecordType_Code", "WorkflowRecordType_Name", "WorkflowRecordType_SourceTable",
  "WorkflowRecordType_Description", "WorkflowRecordType_IsActive", "WorkflowRecordType_SortOrder"
) values
  ('crm_account', 'CRM account', 'Org_Master', 'Customer and prospect account record.', true, 205),
  ('crm_contact', 'CRM contact', 'Org_Contacts', 'Contact attached to a CRM account.', true, 206),
  ('crm_activity', 'CRM activity', 'CRM_Activities', 'Customer or internal CRM activity.', true, 207)
on conflict ("WorkflowRecordType_Code") do update set
  "WorkflowRecordType_Name" = excluded."WorkflowRecordType_Name",
  "WorkflowRecordType_SourceTable" = excluded."WorkflowRecordType_SourceTable",
  "WorkflowRecordType_Description" = excluded."WorkflowRecordType_Description",
  "WorkflowRecordType_IsActive" = true,
  "WorkflowRecordType_SortOrder" = excluded."WorkflowRecordType_SortOrder";

select public."Audit_EnableTableAudit"('public', 'Org_Master', 'crm_account', 'all_changes', 'standard_7y', 'confidential', false, array['Org_id'], null, null, null);
select public."Audit_EnableTableAudit"('public', 'CRM_AccountProfiles', 'crm_account', 'all_changes', 'standard_7y', 'confidential', false, array['CRMAccount_OrgID'], null, null, array['CRMAccount_MetadataJSON']);
select public."Audit_EnableTableAudit"('public', 'Org_Contacts', 'crm_contact', 'all_changes', 'standard_7y', 'confidential', false, array['OrgContact_ID'], null, null, null);
select public."Audit_EnableTableAudit"('public', 'OrgContact_Emails', 'crm_contact', 'all_changes', 'standard_7y', 'confidential', false, array['OrgContact_ID'], null, null, array['OrgContactEmail_Email']);
select public."Audit_EnableTableAudit"('public', 'CRM_ContactProfiles', 'crm_contact', 'all_changes', 'standard_7y', 'confidential', false, array['CRMContact_OrgContactID'], null, null, array['CRMContact_MetadataJSON']);
select public."Audit_EnableTableAudit"('public', 'CRM_CustomerEngagementPreferences', 'crm_account', 'all_changes', 'standard_7y', 'confidential', false, array['CRMCustEngPref_CustomerOrgID'], null, null, null);
select public."Audit_EnableTableAudit"('public', 'Comm_Identities', 'crm_contact', 'all_changes', 'standard_7y', 'confidential', false, array['CommIdentity_ID', 'CommIdentity_ContactID'], null, null, array['CommIdentity_Address', 'CommIdentity_NormalizedAddress']);
select public."Audit_EnableTableAudit"('public', 'CRM_Activities', 'crm_activity', 'key_fields', 'standard_7y', 'normal', false, array['CRMActivity_ID', 'CRMActivity_AccountID'], null, null, null);
select public."Audit_EnableTableAudit"('public', 'CRM_ActivityParticipants', 'crm_activity', 'key_fields', 'standard_7y', 'normal', false, array['CRMActPart_ID', 'CRMActPart_ActivityID', 'CRMActPart_OrgContactID'], null, null, array['CRMActPart_NameSnapshot', 'CRMActPart_EmailSnapshot']);

commit;
