-- Reproducible development CRM records for account and contact workflows.
-- The .example.test addresses are reserved and cannot deliver real email.
do $$
declare
  v_owner uuid;
  v_customer_type uuid;
  v_org record;
  v_contact record;
begin
  select "User_ID" into v_owner
  from public."cmp_Users"
  where lower(coalesce("User_Firstname", '')) = 'harry'
    and lower(coalesce("User_Lastname", '')) = 'phillips'
  order by "User_ID"
  limit 1;

  select "OrgType_ID" into v_customer_type
  from public."Org_Types"
  where lower("OrgType_Name") = 'customer'
  limit 1;

  insert into public."Org_Master_Type"("Org_ID", "OrgType_ID")
  select org."Org_id", v_customer_type
  from public."Org_Master" org
  where org."Org_id"::text like 'de1000c1-5eed-4ead-8000-%'
    and v_customer_type is not null
  on conflict do nothing;

  insert into public."CRM_AccountProfiles"(
    "CRMAccount_ID", "CRMAccount_OrgID", "CRMAccount_RelationshipStatusCode",
    "CRMAccount_OwnerUserID", "CRMAccount_CreatedBy", "CRMAccount_UpdatedBy"
  )
  select gen_random_uuid(), org."Org_id", 'active_customer', v_owner, v_owner, v_owner
  from public."Org_Master" org
  where org."Org_id"::text like 'de1000c1-5eed-4ead-8000-%'
  on conflict ("CRMAccount_OrgID") do nothing;

  update public."CRM_AccountProfiles" profile
  set "CRMAccount_RelationshipStatusCode" = case when org."Org_Name" in ('Northstar Components', 'Meridian Medical', 'Horizon Robotics') then 'strategic_customer' else 'active_customer' end,
      "CRMAccount_OwnerUserID" = v_owner,
      "CRMAccount_Tier" = case org."Org_Name"
        when 'Northstar Components' then 'A'
        when 'Meridian Medical' then 'A'
        when 'Horizon Robotics' then 'A'
        when 'Kestrel Outdoor' then 'A'
        when 'Atelier Maison' then 'B'
        when 'Bergstrom Foods' then 'B'
        when 'Fjord Living' then 'B'
        else 'C' end,
      "CRMAccount_Segment" = case org."Org_Name"
        when 'Northstar Components' then 'Enterprise manufacturing'
        when 'Meridian Medical' then 'Healthcare distribution'
        when 'Horizon Robotics' then 'Advanced technology'
        when 'Kestrel Outdoor' then 'Retail and outdoor'
        when 'Atelier Maison' then 'Premium interiors'
        when 'Bergstrom Foods' then 'Food and beverage'
        when 'Fjord Living' then 'Furniture and homeware'
        else 'Circular materials' end,
      "CRMAccount_Vertical" = case org."Org_Name"
        when 'Northstar Components' then 'Industrial components'
        when 'Meridian Medical' then 'Medical devices'
        when 'Horizon Robotics' then 'Robotics'
        when 'Kestrel Outdoor' then 'Outdoor retail'
        when 'Atelier Maison' then 'Interior design'
        when 'Bergstrom Foods' then 'Chilled foods'
        when 'Fjord Living' then 'Furniture'
        else 'Recycled materials' end,
      "CRMAccount_PrimaryModeCode" = case when org."Org_Name" in ('Horizon Robotics', 'Meridian Medical') then 'air' else 'ocean' end,
      "CRMAccount_PrimaryTradeLane" = case org."Org_Name"
        when 'Northstar Components' then 'UK to Benelux'
        when 'Atelier Maison' then 'France to UK'
        when 'Kestrel Outdoor' then 'Asia to UK'
        when 'Bergstrom Foods' then 'Nordics to UK'
        when 'Meridian Medical' then 'Germany to UK'
        when 'Fjord Living' then 'Scandinavia to UK'
        when 'Horizon Robotics' then 'Japan to UK'
        else 'West Africa to UK' end,
      "CRMAccount_GrowthState" = case when org."Org_Name" in ('Northstar Components', 'Meridian Medical', 'Horizon Robotics') then 'expansion' when org."Org_Name" = 'Kestrel Outdoor' then 'attention' else 'steady' end,
      "CRMAccount_HealthScore" = case org."Org_Name" when 'Northstar Components' then 86 when 'Meridian Medical' then 91 when 'Horizon Robotics' then 82 when 'Kestrel Outdoor' then 64 when 'Atelier Maison' then 76 when 'Bergstrom Foods' then 72 when 'Fjord Living' then 79 else 70 end,
      "CRMAccount_ChurnRiskScore" = case when org."Org_Name" = 'Kestrel Outdoor' then 42 else 12 end,
      "CRMAccount_IsStrategic" = org."Org_Name" in ('Northstar Components', 'Meridian Medical', 'Horizon Robotics'),
      "CRMAccount_CustomerCentricSummary" = case org."Org_Name"
        when 'Northstar Components' then 'Growing manufacturer consolidating weekly UK and Benelux movements. Values predictable collections and early exception updates.'
        when 'Atelier Maison' then 'Premium interiors customer with seasonal launches and time-sensitive showroom deliveries.'
        when 'Kestrel Outdoor' then 'Outdoor retailer reviewing landed costs and peak-season ocean capacity after two late arrivals.'
        when 'Bergstrom Foods' then 'Chilled food importer focused on temperature control, customs readiness and delivery-slot reliability.'
        when 'Meridian Medical' then 'Medical device distributor that prioritises validated handling, traceability and urgent air options.'
        when 'Fjord Living' then 'Furniture brand moving regular Scandinavian groupage with careful delivery coordination.'
        when 'Horizon Robotics' then 'Robotics business importing high-value components with short engineering lead times.'
        else 'Circular materials business scaling repeat movements between West Africa and the UK.' end,
      "CRMAccount_MetadataJSON" = coalesce(profile."CRMAccount_MetadataJSON", '{}'::jsonb) || jsonb_build_object('developmentFixture', true, 'source', 'supabase_seed'),
      "CRMAccount_UpdatedAt" = now(),
      "CRMAccount_UpdatedBy" = v_owner
  from public."Org_Master" org
  where profile."CRMAccount_OrgID" = org."Org_id"
    and org."Org_id"::text like 'de1000c1-5eed-4ead-8000-%';

  insert into public."CRM_CustomerEngagementPreferences"(
    "CRMCustEngPref_ID", "CRMCustEngPref_CustomerOrgID", "CRMCustEngPref_PreferredChannelCode",
    "CRMCustEngPref_AllowThankYouMessages", "CRMCustEngPref_AllowFollowupMessages",
    "CRMCustEngPref_AllowWhatsApp", "CRMCustEngPref_DoNotOverContact",
    "CRMCustEngPref_MinHoursBetweenNonUrgentMessages", "CRMCustEngPref_Notes"
  )
  select gen_random_uuid(), org."Org_id", 'email', true, true,
    org."Org_Name" in ('Northstar Components', 'Meridian Medical'),
    org."Org_Name" = 'Kestrel Outdoor',
    case when org."Org_Name" = 'Kestrel Outdoor' then 72 else 24 end,
    case when org."Org_Name" = 'Kestrel Outdoor' then 'Combine non-urgent updates into one concise message.' else 'Use the primary contact for operational follow-up.' end
  from public."Org_Master" org
  where org."Org_id"::text like 'de1000c1-5eed-4ead-8000-%'
  on conflict ("CRMCustEngPref_CustomerOrgID") do update set
    "CRMCustEngPref_PreferredChannelCode" = excluded."CRMCustEngPref_PreferredChannelCode",
    "CRMCustEngPref_AllowThankYouMessages" = excluded."CRMCustEngPref_AllowThankYouMessages",
    "CRMCustEngPref_AllowFollowupMessages" = excluded."CRMCustEngPref_AllowFollowupMessages",
    "CRMCustEngPref_AllowWhatsApp" = excluded."CRMCustEngPref_AllowWhatsApp",
    "CRMCustEngPref_DoNotOverContact" = excluded."CRMCustEngPref_DoNotOverContact",
    "CRMCustEngPref_MinHoursBetweenNonUrgentMessages" = excluded."CRMCustEngPref_MinHoursBetweenNonUrgentMessages",
    "CRMCustEngPref_Notes" = excluded."CRMCustEngPref_Notes",
    "CRMCustEngPref_UpdatedAt" = now();

  insert into public."CRM_ContactProfiles"(
    "CRMContact_ID", "CRMContact_OrgContactID", "CRMContact_AccountID",
    "CRMContact_CreatedBy", "CRMContact_UpdatedBy"
  )
  select gen_random_uuid(), contact."OrgContact_ID", account."CRMAccount_ID", v_owner, v_owner
  from public."Org_Contacts" contact
  join public."CRM_AccountProfiles" account on account."CRMAccount_OrgID" = contact."Org_ID"
  where contact."OrgContact_ID"::text like 'de10%c3-5eed-4ead-8000-%'
  on conflict ("CRMContact_OrgContactID") do nothing;

  update public."CRM_ContactProfiles" profile
  set "CRMContact_AccountID" = account."CRMAccount_ID",
      "CRMContact_RoleCode" = case
        when contact."OrgContact_FirstName" in ('Amelia', 'Camille', 'Theo', 'Ingrid') then 'decision_maker'
        when contact."OrgContact_FirstName" in ('Maja', 'Kenji', 'Priya', 'Nadia') then 'champion'
        else 'stakeholder' end,
      "CRMContact_InfluenceLevel" = case when contact."OrgContact_FirstName" in ('Amelia', 'Camille', 'Priya', 'Kenji') then 'high' else 'medium' end,
      "CRMContact_RelationshipStrength" = case when contact."OrgContact_FirstName" in ('Amelia', 'Priya', 'Maja') then 82 else 68 end,
      "CRMContact_PreferredChannelCode" = 'email',
      "CRMContact_PreferredLanguageCode" = case when org."Org_Name" = 'Atelier Maison' then 'fr' else 'en-GB' end,
      "CRMContact_ConsentSalesContact" = contact."OrgContact_FirstName" not in ('Maya', 'Markus'),
      "CRMContact_ConsentMarketing" = contact."OrgContact_FirstName" in ('Amelia', 'Camille', 'Priya', 'Maja', 'Kenji', 'Nadia'),
      "CRMContact_Notes" = case
        when contact."OrgContact_FirstName" in ('Amelia', 'Camille', 'Priya', 'Kenji') then 'Primary decision-maker. Keep proposals concise and include the operational impact.'
        when contact."OrgContact_FirstName" in ('Maya', 'Markus', 'Nicolas') then 'Commercial stakeholder. Include approved cost detail when relevant.'
        else 'Operational stakeholder. Prefers clear next steps and confirmed timings.' end,
      "CRMContact_MetadataJSON" = coalesce(profile."CRMContact_MetadataJSON", '{}'::jsonb) || jsonb_build_object(
        'developmentFixture', true,
        'source', 'supabase_seed',
        'jobTitle', case
          when contact."OrgContact_FirstName" in ('Amelia', 'Camille', 'Priya') then 'Procurement Director'
          when contact."OrgContact_FirstName" in ('Maya', 'Markus', 'Nicolas') then 'Finance Manager'
          when contact."OrgContact_FirstName" in ('Theo', 'Maja', 'Nina', 'Elena') then 'Operations Manager'
          when contact."OrgContact_FirstName" = 'Kenji' then 'Head of Supply Chain'
          when contact."OrgContact_FirstName" = 'Nadia' then 'Commercial Director'
          else 'Logistics Manager' end,
        'department', case when contact."OrgContact_FirstName" in ('Maya', 'Markus', 'Nicolas') then 'Finance' else 'Operations' end
      ),
      "CRMContact_UpdatedAt" = now(),
      "CRMContact_UpdatedBy" = v_owner
  from public."Org_Contacts" contact
  join public."Org_Master" org on org."Org_id" = contact."Org_ID"
  join public."CRM_AccountProfiles" account on account."CRMAccount_OrgID" = contact."Org_ID"
  where profile."CRMContact_OrgContactID" = contact."OrgContact_ID"
    and contact."OrgContact_ID"::text like 'de10%c3-5eed-4ead-8000-%';

  insert into public."CRM_Activities"(
    "CRMActivity_ID", "CRMActivity_ActivityTypeCode", "CRMActivity_AccountID",
    "CRMActivity_Subject", "CRMActivity_Summary", "CRMActivity_ActivityAt",
    "CRMActivity_OwnerUserID", "CRMActivity_MetadataJSON", "CRMActivity_CreatedBy", "CRMActivity_UpdatedBy"
  )
  select gen_random_uuid(), activity.activity_type, account."CRMAccount_ID", activity.subject,
    activity.summary, now() - activity.age, v_owner,
    jsonb_build_object('developmentFixture', true, 'source', 'supabase_seed'), v_owner, v_owner
  from public."CRM_AccountProfiles" account
  join public."Org_Master" org on org."Org_id" = account."CRMAccount_OrgID"
  cross join lateral (values
    ('review', 'Service review completed', 'Reviewed service performance, open actions and the next planned movement.', interval '4 days'),
    ('email', 'Commercial follow-up recorded', 'Shared the agreed next steps and confirmed who owns each action.', interval '11 days')
  ) as activity(activity_type, subject, summary, age)
  where org."Org_id"::text like 'de1000c1-5eed-4ead-8000-%'
    and not exists (
      select 1 from public."CRM_Activities" existing
      where existing."CRMActivity_AccountID" = account."CRMAccount_ID"
        and existing."CRMActivity_Subject" = activity.subject
        and existing."CRMActivity_MetadataJSON" ->> 'source' = 'supabase_seed'
    );

  for v_org in
    select org."Org_id", org."Org_Name" in ('Northstar Components', 'Atelier Maison', 'Meridian Medical', 'Fjord Living') as opted_in
    from public."Org_Master" org
    where org."Org_id"::text like 'de1000c1-5eed-4ead-8000-%'
  loop
    if not exists (
      select 1 from public."Comm_ConsentPreferences" consent
      where consent."CommConsent_OrgID" = v_org."Org_id"
        and consent."CommConsent_MetadataJSON" ->> 'source' = 'supabase_seed'
    ) then
      perform public._multideck_set_marketing_consent(
        'customer', v_org."Org_id", v_org.opted_in, 'development_seed',
        'Development-only consent state for CRM workflow testing.', v_owner,
        jsonb_build_object('developmentFixture', true, 'source', 'supabase_seed')
      );
    end if;
  end loop;

  for v_contact in
    select contact."OrgContact_ID", contact."OrgContact_FirstName" in ('Amelia', 'Camille', 'Priya', 'Maja', 'Kenji', 'Nadia') as opted_in
    from public."Org_Contacts" contact
    where contact."OrgContact_ID"::text like 'de10%c3-5eed-4ead-8000-%'
  loop
    if not exists (
      select 1 from public."Comm_ConsentPreferences" consent
      where consent."CommConsent_ContactID" = v_contact."OrgContact_ID"
        and consent."CommConsent_MetadataJSON" ->> 'source' = 'supabase_seed'
    ) then
      perform public._multideck_set_marketing_consent(
        'contact', v_contact."OrgContact_ID", v_contact.opted_in, 'development_seed',
        'Development-only consent state for CRM workflow testing.', v_owner,
        jsonb_build_object('developmentFixture', true, 'source', 'supabase_seed')
      );
    end if;
  end loop;

end $$;

-- Connect real development inbox threads to these CRM records when a message
-- recipient already matches a reserved test contact address.
update public."Comm_Threads" thread
set "CommThread_CustomerOrgID" = matched."Org_ID",
    "CommThread_UpdatedAt" = now()
from (
  select distinct on (message."CommMessage_ThreadID")
    message."CommMessage_ThreadID" as thread_id,
    contact."Org_ID"
  from public."Comm_Messages" message
  join public."Comm_MessageRecipients" recipient on recipient."CommRecipient_MessageID" = message."CommMessage_ID"
  join public."OrgContact_Emails" email on lower(email."OrgContactEmail_Email") = lower(recipient."CommRecipient_NormalizedAddress")
  join public."Org_Contacts" contact on contact."OrgContact_ID" = email."OrgContact_ID"
  where contact."OrgContact_ID"::text like 'de10%c3-5eed-4ead-8000-%'
  order by message."CommMessage_ThreadID", message."CommMessage_MessageDate" desc nulls last
) matched
where thread."CommThread_ID" = matched.thread_id
  and thread."CommThread_CustomerOrgID" is distinct from matched."Org_ID";
