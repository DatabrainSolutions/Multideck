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
      "CRMContact_PreferredLanguageCode" = 'en-GB',
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

-- Quote-detail company and linked-location examples. These are deliberately
-- separate from generic development fixtures because quote source lookups
-- exclude records marked developmentFixture=true.
do $$
declare
  v_company uuid;
  v_office uuid;
  v_owner uuid;
  v_currency uuid;
  v_fixture record;
  v_metadata jsonb;
begin
  select office."Company_ID", office."Office_ID"
    into v_company, v_office
  from public."CusQuote_Header" quote
  join public."cmp_Offices" office
    on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
  where quote."CusQuoteHeader_CustomerReference" = 'JQ20013'
  order by quote."CusQuoteHeader_CreatedDate" desc
  limit 1;

  if v_company is null or v_office is null then
    raise exception 'Quote demo seed requires the JQ20013 workspace and office.';
  end if;

  select "User_ID" into v_owner
  from public."cmp_Users"
  where "Company_ID" = v_company and "User_AccessStatus" = 'active'
  order by "User_ID"
  limit 1;

  select "Currency_ID" into v_currency
  from public."sys_Currency"
  where "Currency_Code" = 'GBP'
  limit 1;

  if v_owner is null or v_currency is null then
    raise exception 'Quote demo seed requires an active workspace user and GBP currency.';
  end if;

  if exists (
    select 1 from public."Org_Master"
    where (
      "Org_AccCode" = any(array['QDEMO-CUS','QDEMO-SUP','QDEMO-CAR','QDEMO-AGT','QDEMO-SHP','QDEMO-CON'])
      or "Org_Name" = any(array['Northstar Apparel Demo','Meridian Freight Demo','North Sea Line Demo','Gulf Customs Partners Demo','Karachi Textiles Demo','Bristol Receiving Demo'])
    )
    and "Org_id" <> all(array[
      '51f00000-0000-4000-8000-000000000001'::uuid,'51f00000-0000-4000-8000-000000000002'::uuid,
      '51f00000-0000-4000-8000-000000000003'::uuid,'51f00000-0000-4000-8000-000000000004'::uuid,
      '51f00000-0000-4000-8000-000000000005'::uuid,'51f00000-0000-4000-8000-000000000006'::uuid
    ])
  ) then
    raise exception 'Quote demo organisation code or name collides with a non-fixture record.';
  end if;

  if exists (
    select 1 from public."OrgContact_Emails"
    where "OrgContactEmail_Email" = any(array[
      'quotes@northstar-apparel.example.test','rates@meridian-freight.example.test','services@north-sea-line.example.test',
      'clearance@gulf-customs.example.test','exports@karachi-textiles.example.test','receiving@bristol-depot.example.test'
    ])
    and "OrgContactEmail_ID" <> all(array[
      '55f00000-0000-4000-8000-000000000001'::uuid,'55f00000-0000-4000-8000-000000000002'::uuid,
      '55f00000-0000-4000-8000-000000000003'::uuid,'55f00000-0000-4000-8000-000000000004'::uuid,
      '55f00000-0000-4000-8000-000000000005'::uuid,'55f00000-0000-4000-8000-000000000006'::uuid
    ])
  ) then
    raise exception 'Quote demo email collides with a non-fixture record.';
  end if;

  for v_fixture in
    select * from (values
      ('51f00000-0000-4000-8000-000000000001'::uuid,'52f00000-0000-4000-8000-000000000001'::uuid,'53f00000-0000-4000-8000-000000000001'::uuid,'54f00000-0000-4000-8000-000000000001'::uuid,'55f00000-0000-4000-8000-000000000001'::uuid,'QDEMO-CUS','Northstar Apparel Demo','Customer','1 Harbour Exchange Square','London','E14 9GE','GB','GBLON','Maya','Collins','quotes@northstar-apparel.example.test',true),
      ('51f00000-0000-4000-8000-000000000002'::uuid,'52f00000-0000-4000-8000-000000000002'::uuid,'53f00000-0000-4000-8000-000000000002'::uuid,'54f00000-0000-4000-8000-000000000002'::uuid,'55f00000-0000-4000-8000-000000000002'::uuid,'QDEMO-SUP','Meridian Freight Demo','Supplier','40 Wilhelminakade','Rotterdam','3072 AP','NL','NLRTM','Sanne','De Vries','rates@meridian-freight.example.test',false),
      ('51f00000-0000-4000-8000-000000000003'::uuid,'52f00000-0000-4000-8000-000000000003'::uuid,'53f00000-0000-4000-8000-000000000003'::uuid,'54f00000-0000-4000-8000-000000000003'::uuid,'55f00000-0000-4000-8000-000000000003'::uuid,'QDEMO-CAR','North Sea Line Demo','Shipping Line','Am Sandtorkai 50','Hamburg','20457','DE','DEHAM','Lukas','Weber','services@north-sea-line.example.test',false),
      ('51f00000-0000-4000-8000-000000000004'::uuid,'52f00000-0000-4000-8000-000000000004'::uuid,'53f00000-0000-4000-8000-000000000004'::uuid,'54f00000-0000-4000-8000-000000000004'::uuid,'55f00000-0000-4000-8000-000000000004'::uuid,'QDEMO-AGT','Gulf Customs Partners Demo','Overseas Agent','Jebel Ali Free Zone','Dubai','00000','AE','AEDXB','Amira','Hassan','clearance@gulf-customs.example.test',false),
      ('51f00000-0000-4000-8000-000000000005'::uuid,'52f00000-0000-4000-8000-000000000005'::uuid,'53f00000-0000-4000-8000-000000000005'::uuid,'54f00000-0000-4000-8000-000000000005'::uuid,'55f00000-0000-4000-8000-000000000005'::uuid,'QDEMO-SHP','Karachi Textiles Demo','Consignor/Shipper','Port Qasim Trade Centre','Karachi','75020','PK','PKKHI','Adeel','Khan','exports@karachi-textiles.example.test',false),
      ('51f00000-0000-4000-8000-000000000006'::uuid,'52f00000-0000-4000-8000-000000000006'::uuid,'53f00000-0000-4000-8000-000000000006'::uuid,'54f00000-0000-4000-8000-000000000006'::uuid,'55f00000-0000-4000-8000-000000000006'::uuid,'QDEMO-CON','Bristol Receiving Demo','Consignee','Royal Portbury Dock','Bristol','BS20 7XH','GB','GBBRS','Olivia','Reed','receiving@bristol-depot.example.test',false)
    ) fixture(org_id,profile_id,address_id,contact_id,email_id,code,name,type_name,line1,town_city,postcode,country_code,unlocode,first_name,last_name,email,is_customer)
  loop
    insert into public."Org_Master"(
      "Org_id","Org_Name","Org_BaseCurrency","Org_CRMRelationshipStatusCode","Org_CRMIsLead",
      "Org_CRMIsPotentialCustomer","Org_CRMUpdatedAt","Org_AccCode"
    ) values (
      v_fixture.org_id,v_fixture.name,v_currency,'active_customer',
      false,v_fixture.is_customer,now(),v_fixture.code
    )
    on conflict ("Org_id") do update set
      "Org_Name"=excluded."Org_Name","Org_BaseCurrency"=excluded."Org_BaseCurrency",
      "Org_CRMRelationshipStatusCode"=excluded."Org_CRMRelationshipStatusCode",
      "Org_CRMIsPotentialCustomer"=excluded."Org_CRMIsPotentialCustomer","Org_CRMUpdatedAt"=now(),"Org_AccCode"=excluded."Org_AccCode";

    v_metadata := jsonb_build_object('quoteDemoFixture',true,'source','supabase_seed_quote_sources');
    if v_fixture.is_customer then
      v_metadata := v_metadata || jsonb_build_object('quoteTerms',jsonb_build_object(
        'terms','Northstar Apparel standard trading terms apply to this quotation.',
        'subjectTo','Subject to carrier space, equipment and final sailing confirmation.',
        'notes','Prioritise the earliest direct service and advise of any transshipment.',
        'deadline',(current_date + 7)::text
      ));
    end if;

    insert into public."CRM_AccountProfiles"(
      "CRMAccount_ID","CRMAccount_OrgID","CRMAccount_RelationshipStatusCode","CRMAccount_OwnerUserID",
      "CRMAccount_OrgOfficeID","CRMAccount_Tier","CRMAccount_Segment","CRMAccount_Vertical",
      "CRMAccount_PrimaryModeCode","CRMAccount_PrimaryTradeLane","CRMAccount_MetadataJSON",
      "CRMAccount_CreatedBy","CRMAccount_UpdatedBy","CRMAccount_CompanyID","CRMAccount_ScopeCode","CRMAccount_IsDeleted"
    ) values (
      v_fixture.profile_id,v_fixture.org_id,'active_customer',v_owner,
      v_office,'B','Quote workflow demo',v_fixture.type_name,'sea',v_fixture.unlocode || ' route',v_metadata,
      v_owner,v_owner,v_company,'standard',false
    )
    on conflict ("CRMAccount_OrgID") do update set
      "CRMAccount_RelationshipStatusCode"=excluded."CRMAccount_RelationshipStatusCode","CRMAccount_OwnerUserID"=excluded."CRMAccount_OwnerUserID",
      "CRMAccount_OrgOfficeID"=excluded."CRMAccount_OrgOfficeID","CRMAccount_Tier"=excluded."CRMAccount_Tier",
      "CRMAccount_Segment"=excluded."CRMAccount_Segment","CRMAccount_Vertical"=excluded."CRMAccount_Vertical",
      "CRMAccount_PrimaryModeCode"=excluded."CRMAccount_PrimaryModeCode","CRMAccount_PrimaryTradeLane"=excluded."CRMAccount_PrimaryTradeLane",
      "CRMAccount_MetadataJSON"=excluded."CRMAccount_MetadataJSON","CRMAccount_UpdatedAt"=now(),"CRMAccount_UpdatedBy"=excluded."CRMAccount_UpdatedBy","CRMAccount_IsDeleted"=false;

    delete from public."Org_Master_Type" where "Org_ID"=v_fixture.org_id;
    insert into public."Org_Master_Type"("Org_ID","OrgType_ID")
    select v_fixture.org_id,"OrgType_ID" from public."Org_Types" where lower("OrgType_Name")=lower(v_fixture.type_name) order by "OrgType_Order" limit 1;

    insert into public."Org_Addresses"(
      "OrgAdd_ID","Org_ID","Org_NameOverride","OrgAdd_Line1","OrgAdd_TownCity","OrgAdd_PostZipCode","OrgAdd_Country",
      "OrgAdd_UNLOCODE","OrgAdd_MainEmail","OrgAdd_IsActive","OrgAdd_TimeZone","OrgAdd_UpdatedBy"
    ) values (
      v_fixture.address_id,v_fixture.org_id,v_fixture.town_city || ' office',v_fixture.line1,v_fixture.town_city,v_fixture.postcode,
      v_fixture.country_code,v_fixture.unlocode,v_fixture.email,true,'UTC',v_owner
    )
    on conflict ("OrgAdd_ID") do update set
      "Org_ID"=excluded."Org_ID","Org_NameOverride"=excluded."Org_NameOverride","OrgAdd_Line1"=excluded."OrgAdd_Line1",
      "OrgAdd_TownCity"=excluded."OrgAdd_TownCity","OrgAdd_PostZipCode"=excluded."OrgAdd_PostZipCode","OrgAdd_Country"=excluded."OrgAdd_Country",
      "OrgAdd_UNLOCODE"=excluded."OrgAdd_UNLOCODE","OrgAdd_MainEmail"=excluded."OrgAdd_MainEmail","OrgAdd_IsActive"=true,
      "OrgAdd_UpdatedAt"=now(),"OrgAdd_UpdatedBy"=excluded."OrgAdd_UpdatedBy";

    insert into public."Org_Contacts"("OrgContact_ID","Org_ID","OrgContact_FirstName","OrgContact_LastName")
    values (v_fixture.contact_id,v_fixture.org_id,v_fixture.first_name,v_fixture.last_name)
    on conflict ("OrgContact_ID") do update set "Org_ID"=excluded."Org_ID","OrgContact_FirstName"=excluded."OrgContact_FirstName","OrgContact_LastName"=excluded."OrgContact_LastName";

    insert into public."OrgContact_Emails"(
      "OrgContactEmail_ID","OrgContactEmail_Email","OrgContactEmail_Type","OrgContact_ID","OrgContactEmail_IsActive","OrgContactEmail_IsPrimary"
    ) values (v_fixture.email_id,v_fixture.email,1,v_fixture.contact_id,true,true)
    on conflict ("OrgContactEmail_ID") do update set
      "OrgContactEmail_Email"=excluded."OrgContactEmail_Email","OrgContact_ID"=excluded."OrgContact_ID",
      "OrgContactEmail_IsActive"=true,"OrgContactEmail_IsPrimary"=true,"OrgContactEmail_ValidTo"=null;
  end loop;

  if (select count(*) from public."Org_Master_Type" where "Org_ID"::text like '51f00000-0000-4000-8000-%') <> 6 then
    raise exception 'Quote demo seed requires all six organisation types.';
  end if;

  insert into public."Org_RelatedPartyDefaults"(
    "OrgRelatedDefault_ID","OrgRelatedDefault_CompanyID","OrgRelatedDefault_SourceOrgID","OrgRelatedDefault_PartyRoleCode",
    "OrgRelatedDefault_TargetOrgID","OrgRelatedDefault_TargetAddressID","OrgRelatedDefault_TargetContactID",
    "OrgRelatedDefault_Priority","OrgRelatedDefault_IsActive","OrgRelatedDefault_CreatedBy","OrgRelatedDefault_UpdatedBy"
  ) values
    ('56f00000-0000-4000-8000-000000000001',v_company,'51f00000-0000-4000-8000-000000000001','shipper','51f00000-0000-4000-8000-000000000005','53f00000-0000-4000-8000-000000000005','54f00000-0000-4000-8000-000000000005',10,true,v_owner,v_owner),
    ('56f00000-0000-4000-8000-000000000002',v_company,'51f00000-0000-4000-8000-000000000001','consignee','51f00000-0000-4000-8000-000000000006','53f00000-0000-4000-8000-000000000006','54f00000-0000-4000-8000-000000000006',20,true,v_owner,v_owner)
  on conflict ("OrgRelatedDefault_ID") do update set
    "OrgRelatedDefault_CompanyID"=excluded."OrgRelatedDefault_CompanyID","OrgRelatedDefault_SourceOrgID"=excluded."OrgRelatedDefault_SourceOrgID",
    "OrgRelatedDefault_PartyRoleCode"=excluded."OrgRelatedDefault_PartyRoleCode","OrgRelatedDefault_TargetOrgID"=excluded."OrgRelatedDefault_TargetOrgID",
    "OrgRelatedDefault_TargetAddressID"=excluded."OrgRelatedDefault_TargetAddressID","OrgRelatedDefault_TargetContactID"=excluded."OrgRelatedDefault_TargetContactID",
    "OrgRelatedDefault_Priority"=excluded."OrgRelatedDefault_Priority","OrgRelatedDefault_IsActive"=true,"OrgRelatedDefault_UpdatedAt"=now(),"OrgRelatedDefault_UpdatedBy"=excluded."OrgRelatedDefault_UpdatedBy";

  delete from public."AI_DexterWatchSignals"
  where "AIDexterWatchSignal_SourceID"::text like any(array['51f00000-0000-4000-8000-%','52f00000-0000-4000-8000-%','53f00000-0000-4000-8000-%','56f00000-0000-4000-8000-%']);
end $$;

-- Reproducible document-template jobs. These rows use reserved IDs, synthetic
-- organisations, and a clearly marked note so they cannot be mistaken for
-- customer freight. Re-running the seed never updates an existing job.
do $$
declare
  v_owner uuid;
  v_office uuid;
begin
  select u."User_ID", o."Office_ID"
  into v_owner, v_office
  from public."cmp_Users" u
  join public."cmp_Users_Offices" uo on uo."User_ID" = u."User_ID"
  join public."cmp_Offices" o
    on o."Office_ID" = uo."Office_ID"
   and o."Company_ID" = u."Company_ID"
   and o."Office_IsActive" = true
  where u."User_AccessStatus" = 'active'
  order by o."Office_Name", o."Office_ID"
  limit 1;

  if v_owner is null or v_office is null then
    raise exception 'An active authorised user and office must exist before document demo jobs are seeded.';
  end if;

  if (
    select count(*)
    from public."Org_Master" org
    where org."Org_id"::text like 'de1000c1-5eed-4ead-8000-%'
  ) < 8 then
    raise exception 'The reserved synthetic organisations must exist before document demo jobs are seeded.';
  end if;

  if exists (
    select 1
    from public."Job_Header" job
    where job."Job_Number" between 990001 and 990010
      and job."Job_ID"::text not like 'de1000d1-5eed-4ead-8000-%'
  ) then
    raise exception 'A non-demo job already uses one of the reserved document demo numbers.';
  end if;

  insert into public."Job_Header"(
    "Job_ID", "Job_Number", "Job_Period", "Job_CreatedBy",
    "Job_Customer", "Job_CustomerAddress", "Job_Shipper", "Job_ShipperAddress",
    "Job_Consignee", "Job_ConsigneeAddress", "Job_OfficeID", "Job_OrgOfficeID",
    "Job_Status", "Job_Direction", "Job_TransportModeSummary",
    "Job_OriginUNLocode", "Job_OriginNameSnapshot",
    "Job_DestinationUNLocode", "Job_DestinationNameSnapshot",
    "Job_ReadyDate", "Job_RequiredDeliveryDate", "Job_InternalNotes", "Job_UpdatedBy"
  )
  select
    fixture.job_id, fixture.job_number, '202608', v_owner,
    fixture.customer_id, fixture.customer_address_id, fixture.shipper_id, fixture.shipper_address_id,
    fixture.consignee_id, fixture.consignee_address_id, v_office, v_office,
    'booked', fixture.direction_code, fixture.mode_code,
    fixture.origin_unlocode, fixture.origin_name,
    fixture.destination_unlocode, fixture.destination_name,
    fixture.ready_date, fixture.delivery_date,
    '[DEMO ONLY] Synthetic FIATA document-template fixture. Safe to remove.', v_owner
  from (values
    ('de1000d1-5eed-4ead-8000-000000000001'::uuid, 990001, 'de1000c1-5eed-4ead-8000-000000000001'::uuid, 'de1000c2-5eed-4ead-8000-000000000001'::uuid, 'de1000c1-5eed-4ead-8000-000000000007'::uuid, 'de1000c2-5eed-4ead-8000-000000000007'::uuid, 'de1000c1-5eed-4ead-8000-000000000001'::uuid, 'de1000c2-5eed-4ead-8000-000000000001'::uuid, 'import',      'sea',        'JPTYO', 'Tokyo',      'GBFXT', 'Felixstowe', '2026-08-06'::date, '2026-09-12'::date),
    ('de1000d1-5eed-4ead-8000-000000000002'::uuid, 990002, 'de1000c1-5eed-4ead-8000-000000000002'::uuid, 'de1000c2-5eed-4ead-8000-000000000002'::uuid, 'de1000c1-5eed-4ead-8000-000000000001'::uuid, 'de1000c2-5eed-4ead-8000-000000000001'::uuid, 'de1000c1-5eed-4ead-8000-000000000002'::uuid, 'de1000c2-5eed-4ead-8000-000000000002'::uuid, 'export',      'sea',        'GBLGP', 'London Gateway', 'FRLEH', 'Le Havre', '2026-08-07'::date, '2026-08-13'::date),
    ('de1000d1-5eed-4ead-8000-000000000003'::uuid, 990003, 'de1000c1-5eed-4ead-8000-000000000003'::uuid, 'de1000c2-5eed-4ead-8000-000000000003'::uuid, 'de1000c1-5eed-4ead-8000-000000000007'::uuid, 'de1000c2-5eed-4ead-8000-000000000007'::uuid, 'de1000c1-5eed-4ead-8000-000000000003'::uuid, 'de1000c2-5eed-4ead-8000-000000000003'::uuid, 'import',      'air',        'JPNRT', 'Tokyo Narita', 'GBLHR', 'London Heathrow', '2026-08-08'::date, '2026-08-10'::date),
    ('de1000d1-5eed-4ead-8000-000000000004'::uuid, 990004, 'de1000c1-5eed-4ead-8000-000000000004'::uuid, 'de1000c2-5eed-4ead-8000-000000000004'::uuid, 'de1000c1-5eed-4ead-8000-000000000001'::uuid, 'de1000c2-5eed-4ead-8000-000000000001'::uuid, 'de1000c1-5eed-4ead-8000-000000000004'::uuid, 'de1000c2-5eed-4ead-8000-000000000004'::uuid, 'export',      'road',       'GBBHM', 'Birmingham', 'FRLYS', 'Lyon', '2026-08-09'::date, '2026-08-12'::date),
    ('de1000d1-5eed-4ead-8000-000000000005'::uuid, 990005, 'de1000c1-5eed-4ead-8000-000000000005'::uuid, 'de1000c2-5eed-4ead-8000-000000000005'::uuid, 'de1000c1-5eed-4ead-8000-000000000004'::uuid, 'de1000c2-5eed-4ead-8000-000000000004'::uuid, 'de1000c1-5eed-4ead-8000-000000000005'::uuid, 'de1000c2-5eed-4ead-8000-000000000005'::uuid, 'import',      'sea',        'SEGOT', 'Gothenburg', 'GBLGP', 'London Gateway', '2026-08-10'::date, '2026-08-17'::date),
    ('de1000d1-5eed-4ead-8000-000000000006'::uuid, 990006, 'de1000c1-5eed-4ead-8000-000000000006'::uuid, 'de1000c2-5eed-4ead-8000-000000000006'::uuid, 'de1000c1-5eed-4ead-8000-000000000006'::uuid, 'de1000c2-5eed-4ead-8000-000000000006'::uuid, 'de1000c1-5eed-4ead-8000-000000000001'::uuid, 'de1000c2-5eed-4ead-8000-000000000001'::uuid, 'import',      'road',       'DKAAR', 'Aarhus', 'GBBHM', 'Birmingham', '2026-08-11'::date, '2026-08-15'::date),
    ('de1000d1-5eed-4ead-8000-000000000007'::uuid, 990007, 'de1000c1-5eed-4ead-8000-000000000007'::uuid, 'de1000c2-5eed-4ead-8000-000000000007'::uuid, 'de1000c1-5eed-4ead-8000-000000000005'::uuid, 'de1000c2-5eed-4ead-8000-000000000005'::uuid, 'de1000c1-5eed-4ead-8000-000000000007'::uuid, 'de1000c2-5eed-4ead-8000-000000000007'::uuid, 'export',      'air',        'GBLHR', 'London Heathrow', 'JPNRT', 'Tokyo Narita', '2026-08-12'::date, '2026-08-14'::date),
    ('de1000d1-5eed-4ead-8000-000000000008'::uuid, 990008, 'de1000c1-5eed-4ead-8000-000000000008'::uuid, 'de1000c2-5eed-4ead-8000-000000000008'::uuid, 'de1000c1-5eed-4ead-8000-000000000008'::uuid, 'de1000c2-5eed-4ead-8000-000000000008'::uuid, 'de1000c1-5eed-4ead-8000-000000000001'::uuid, 'de1000c2-5eed-4ead-8000-000000000001'::uuid, 'import',      'sea',        'NLRTM', 'Rotterdam', 'GBFXT', 'Felixstowe', '2026-08-13'::date, '2026-08-16'::date),
    ('de1000d1-5eed-4ead-8000-000000000009'::uuid, 990009, 'de1000c1-5eed-4ead-8000-000000000002'::uuid, 'de1000c2-5eed-4ead-8000-000000000002'::uuid, 'de1000c1-5eed-4ead-8000-000000000002'::uuid, 'de1000c2-5eed-4ead-8000-000000000002'::uuid, 'de1000c1-5eed-4ead-8000-000000000004'::uuid, 'de1000c2-5eed-4ead-8000-000000000004'::uuid, 'cross_trade', 'multimodal', 'FRLYS', 'Lyon', 'SEGOT', 'Gothenburg', '2026-08-14'::date, '2026-08-21'::date),
    ('de1000d1-5eed-4ead-8000-000000000010'::uuid, 990010, 'de1000c1-5eed-4ead-8000-000000000003'::uuid, 'de1000c2-5eed-4ead-8000-000000000003'::uuid, 'de1000c1-5eed-4ead-8000-000000000003'::uuid, 'de1000c2-5eed-4ead-8000-000000000003'::uuid, 'de1000c1-5eed-4ead-8000-000000000001'::uuid, 'de1000c2-5eed-4ead-8000-000000000001'::uuid, 'domestic',    'road',       'GBMAN', 'Manchester', 'GBBHM', 'Birmingham', '2026-08-15'::date, '2026-08-16'::date)
  ) as fixture(
    job_id, job_number, customer_id, customer_address_id, shipper_id, shipper_address_id,
    consignee_id, consignee_address_id, direction_code, mode_code,
    origin_unlocode, origin_name, destination_unlocode, destination_name, ready_date, delivery_date
  )
  where not exists (
    select 1 from public."Job_Header" existing
    where existing."Job_ID" = fixture.job_id or existing."Job_Number" = fixture.job_number
  )
  on conflict ("Job_ID") do nothing;

  insert into public."Job_Cargo"(
    "JobCargo_ID", "JobCargo_JobID", "JobCargo_Commodity", "JobCargo_Qty",
    "JobCargo_LineNo", "JobCargo_Description", "JobCargo_PackageTypeCodeSnapshot",
    "JobCargo_PackageQty", "JobCargo_GrossKilos", "JobCargo_NettKilos",
    "JobCargo_MarksNumbers", "JobCargo_HSCode", "JobCargo_CountryOfOriginCodeSnapshot",
    "JobCargo_VolumeCBM", "JobCargo_IsHazardous", "JobCargo_CargoJSON", "JobCargo_UpdatedBy"
  )
  select
    fixture.cargo_id, fixture.job_id, fixture.commodity, fixture.package_quantity,
    1, fixture.description, fixture.package_type, fixture.package_quantity,
    fixture.gross_kilos, fixture.net_kilos, fixture.marks_numbers, fixture.hs_code,
    fixture.origin_country, fixture.volume_cbm, false,
    jsonb_build_object('developmentFixture', true, 'source', 'supabase_seed_document_templates'), v_owner
  from (values
    ('de1000d2-5eed-4ead-8000-000000000001'::uuid, 'de1000d1-5eed-4ead-8000-000000000001'::uuid, 'Electronic components', 'Synthetic electronics for FIATA preview testing.', 'CARTON', 48::numeric, 1240::numeric, 1180::numeric, 8.600::numeric, 'DEMO-990001', '854239', 'JP'),
    ('de1000d2-5eed-4ead-8000-000000000002'::uuid, 'de1000d1-5eed-4ead-8000-000000000002'::uuid, 'Interior samples', 'Synthetic interior samples for FIATA preview testing.', 'CRATE', 12::numeric, 860::numeric, 790::numeric, 5.200::numeric, 'DEMO-990002', '940360', 'GB'),
    ('de1000d2-5eed-4ead-8000-000000000003'::uuid, 'de1000d1-5eed-4ead-8000-000000000003'::uuid, 'Outdoor equipment', 'Synthetic outdoor equipment for FIATA preview testing.', 'CARTON', 24::numeric, 420::numeric, 390::numeric, 3.400::numeric, 'DEMO-990003', '950699', 'JP'),
    ('de1000d2-5eed-4ead-8000-000000000004'::uuid, 'de1000d1-5eed-4ead-8000-000000000004'::uuid, 'Packaged food samples', 'Synthetic non-perishable samples for FIATA preview testing.', 'PALLET', 8::numeric, 3200::numeric, 3000::numeric, 10.800::numeric, 'DEMO-990004', '190590', 'GB'),
    ('de1000d2-5eed-4ead-8000-000000000005'::uuid, 'de1000d1-5eed-4ead-8000-000000000005'::uuid, 'Medical training aids', 'Synthetic training aids for FIATA preview testing.', 'PALLET', 6::numeric, 980::numeric, 910::numeric, 6.100::numeric, 'DEMO-990005', '902300', 'SE'),
    ('de1000d2-5eed-4ead-8000-000000000006'::uuid, 'de1000d1-5eed-4ead-8000-000000000006'::uuid, 'Furniture display units', 'Synthetic display units for FIATA preview testing.', 'CRATE', 10::numeric, 4600::numeric, 4320::numeric, 24.000::numeric, 'DEMO-990006', '940360', 'DK'),
    ('de1000d2-5eed-4ead-8000-000000000007'::uuid, 'de1000d1-5eed-4ead-8000-000000000007'::uuid, 'Robotics demonstration parts', 'Synthetic demonstration parts for FIATA preview testing.', 'CARTON', 18::numeric, 510::numeric, 470::numeric, 2.900::numeric, 'DEMO-990007', '847950', 'GB'),
    ('de1000d2-5eed-4ead-8000-000000000008'::uuid, 'de1000d1-5eed-4ead-8000-000000000008'::uuid, 'Recycled material samples', 'Synthetic recycled material samples for FIATA preview testing.', 'BALE', 20::numeric, 8400::numeric, 8100::numeric, 28.000::numeric, 'DEMO-990008', '470790', 'NL'),
    ('de1000d2-5eed-4ead-8000-000000000009'::uuid, 'de1000d1-5eed-4ead-8000-000000000009'::uuid, 'Lighting display units', 'Synthetic lighting display units for FIATA preview testing.', 'PALLET', 9::numeric, 2100::numeric, 1980::numeric, 12.400::numeric, 'DEMO-990009', '940519', 'FR'),
    ('de1000d2-5eed-4ead-8000-000000000010'::uuid, 'de1000d1-5eed-4ead-8000-000000000010'::uuid, 'Retail display stands', 'Synthetic retail stands for FIATA preview testing.', 'PALLET', 14::numeric, 3600::numeric, 3380::numeric, 18.500::numeric, 'DEMO-990010', '940320', 'GB')
  ) as fixture(cargo_id, job_id, commodity, description, package_type, package_quantity, gross_kilos, net_kilos, volume_cbm, marks_numbers, hs_code, origin_country)
  join public."Job_Header" job on job."Job_ID" = fixture.job_id
  where not exists (
    select 1 from public."Job_Cargo" existing where existing."JobCargo_ID" = fixture.cargo_id
  )
  on conflict ("JobCargo_ID") do nothing;

  insert into public."Job_Routing"(
    "JobRoute_ID", "Job_ID", "JobRoute_OrderNo", "JobRoute_Status", "JobRoute_ModeCode",
    "JobRoute_OriginUNLocode", "JobRoute_OriginNameSnapshot",
    "JobRoute_DestinationUNLocode", "JobRoute_DestinationNameSnapshot",
    "JobRoute_PlannedDepartureAt", "JobRoute_PlannedArrivalAt",
    "JobRoute_CarrierBookingReference", "JobRoute_MasterTransportReference",
    "JobRoute_HouseTransportReference", "JobRoute_IsMainCarriage", "JobRoute_RouteJSON", "JobRoute_UpdatedBy"
  )
  select
    fixture.route_id, fixture.job_id, 1, 'planned', fixture.mode_code,
    fixture.origin_unlocode, fixture.origin_name, fixture.destination_unlocode, fixture.destination_name,
    fixture.departure_at, fixture.arrival_at,
    'DEMO-CARRIER-' || fixture.job_number, 'DEMO-MASTER-' || fixture.job_number,
    'DEMO-HOUSE-' || fixture.job_number, true,
    jsonb_build_object('developmentFixture', true, 'source', 'supabase_seed_document_templates'), v_owner
  from (values
    ('de1000d3-5eed-4ead-8000-000000000001'::uuid, 'de1000d1-5eed-4ead-8000-000000000001'::uuid, 990001, 'sea',        'JPTYO', 'Tokyo', 'GBFXT', 'Felixstowe', '2026-08-06 09:00+00'::timestamptz, '2026-09-12 08:00+00'::timestamptz),
    ('de1000d3-5eed-4ead-8000-000000000002'::uuid, 'de1000d1-5eed-4ead-8000-000000000002'::uuid, 990002, 'sea',        'GBLGP', 'London Gateway', 'FRLEH', 'Le Havre', '2026-08-07 12:00+00'::timestamptz, '2026-08-13 07:00+00'::timestamptz),
    ('de1000d3-5eed-4ead-8000-000000000003'::uuid, 'de1000d1-5eed-4ead-8000-000000000003'::uuid, 990003, 'air',        'JPNRT', 'Tokyo Narita', 'GBLHR', 'London Heathrow', '2026-08-08 03:00+00'::timestamptz, '2026-08-10 16:00+00'::timestamptz),
    ('de1000d3-5eed-4ead-8000-000000000004'::uuid, 'de1000d1-5eed-4ead-8000-000000000004'::uuid, 990004, 'road',       'GBBHM', 'Birmingham', 'FRLYS', 'Lyon', '2026-08-09 06:00+00'::timestamptz, '2026-08-12 15:00+00'::timestamptz),
    ('de1000d3-5eed-4ead-8000-000000000005'::uuid, 'de1000d1-5eed-4ead-8000-000000000005'::uuid, 990005, 'sea',        'SEGOT', 'Gothenburg', 'GBLGP', 'London Gateway', '2026-08-10 11:00+00'::timestamptz, '2026-08-17 09:00+00'::timestamptz),
    ('de1000d3-5eed-4ead-8000-000000000006'::uuid, 'de1000d1-5eed-4ead-8000-000000000006'::uuid, 990006, 'road',       'DKAAR', 'Aarhus', 'GBBHM', 'Birmingham', '2026-08-11 07:00+00'::timestamptz, '2026-08-15 13:00+00'::timestamptz),
    ('de1000d3-5eed-4ead-8000-000000000007'::uuid, 'de1000d1-5eed-4ead-8000-000000000007'::uuid, 990007, 'air',        'GBLHR', 'London Heathrow', 'JPNRT', 'Tokyo Narita', '2026-08-12 18:00+00'::timestamptz, '2026-08-14 05:00+00'::timestamptz),
    ('de1000d3-5eed-4ead-8000-000000000008'::uuid, 'de1000d1-5eed-4ead-8000-000000000008'::uuid, 990008, 'sea',        'NLRTM', 'Rotterdam', 'GBFXT', 'Felixstowe', '2026-08-13 10:00+00'::timestamptz, '2026-08-16 06:00+00'::timestamptz),
    ('de1000d3-5eed-4ead-8000-000000000009'::uuid, 'de1000d1-5eed-4ead-8000-000000000009'::uuid, 990009, 'multimodal', 'FRLYS', 'Lyon', 'SEGOT', 'Gothenburg', '2026-08-14 08:00+00'::timestamptz, '2026-08-21 14:00+00'::timestamptz),
    ('de1000d3-5eed-4ead-8000-000000000010'::uuid, 'de1000d1-5eed-4ead-8000-000000000010'::uuid, 990010, 'road',       'GBMAN', 'Manchester', 'GBBHM', 'Birmingham', '2026-08-15 07:30+00'::timestamptz, '2026-08-16 12:00+00'::timestamptz)
  ) as fixture(route_id, job_id, job_number, mode_code, origin_unlocode, origin_name, destination_unlocode, destination_name, departure_at, arrival_at)
  join public."Job_Header" job on job."Job_ID" = fixture.job_id
  where not exists (
    select 1 from public."Job_Routing" existing where existing."JobRoute_ID" = fixture.route_id
  )
  on conflict ("JobRoute_ID") do nothing;
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

-- Dashboard mode-trend fixtures. Their route windows are distributed across the
-- elapsed day so the Today chart shows real concurrent-load peaks and drops for
-- Ocean, Air, Road, and Multimodal. Every row stays clearly marked,
-- tenant-scoped, idempotent, and safe to remove.
do $$
declare
  v_company uuid;
  v_office uuid;
  v_owner uuid;
  v_customers uuid[];
  v_local_now timestamp := clock_timestamp() at time zone 'Europe/London';
  v_local_date date := v_local_now::date;
  v_day_start timestamptz := date_trunc('day', v_local_now) at time zone 'Europe/London';
  v_elapsed interval := greatest(v_local_now - date_trunc('day', v_local_now), interval '1 minute');
  v_fixture record;
  v_job_id uuid;
  v_route_id uuid;
  v_customer uuid;
  v_marker constant text := '[DEMO ONLY] Dashboard mode trend fixture. Safe to remove.';
begin
  select company."Company_ID" into v_company
  from public."cmp_Company" company
  where company."Company_Name" = 'Development'
  limit 1;

  select office."Office_ID" into v_office
  from public."cmp_Offices" office
  where office."Company_ID" = v_company
  order by office."Office_ID"
  limit 1;

  select app_user."User_ID" into v_owner
  from public."cmp_Users" app_user
  where app_user."Company_ID" = v_company
    and app_user."Auth_User_ID" is not null
  order by app_user."User_ID"
  limit 1;

  select array_agg(org."Org_id" order by org."Org_AccCode") into v_customers
  from public."Org_Master" org
  where org."Org_AccCode" in ('DEMO-DE100001', 'DEMO-DE100002', 'DEMO-DE100003');

  if v_company is null or v_office is null or v_owner is null or coalesce(array_length(v_customers, 1), 0) < 3 then
    raise exception 'The Development workspace, an authenticated operator, and three demo customers must exist before dashboard trend data is seeded.';
  end if;

  if exists (
    select 1
    from public."Job_Header" job
    where job."Job_Number" between 991101 and 991124
      and job."Job_InternalNotes" is distinct from v_marker
  ) then
    raise exception 'A non-dashboard-demo job already uses one of the reserved 991101-991124 numbers.';
  end if;

  for v_fixture in
    select *
    from (values
      (1,  991101, 'sea',        'import',      'CNSHA', 'Shanghai',        'GBFXT', 'Felixstowe',       'in_transit', 0.18::numeric, 0.00::numeric, 0.22::numeric),
      (2,  991102, 'road',       'domestic',    'GBMAN', 'Manchester',      'GBBHM', 'Birmingham',       'on_track',   0.18::numeric, 0.00::numeric, 0.28::numeric),
      (3,  991103, 'air',        'import',      'AEDXB', 'Dubai',           'GBLHR', 'London Heathrow',  'delayed',    0.61::numeric, 0.00::numeric, 0.16::numeric),
      (4,  991104, 'sea',        'export',      'GBSOU', 'Southampton',     'SGSIN', 'Singapore',        'on_track',   0.18::numeric, 0.04::numeric, 0.38::numeric),
      (5,  991105, 'air',        'export',      'GBLHR', 'London Heathrow', 'USJFK', 'New York JFK',      'in_transit', 0.18::numeric, 0.12::numeric, 0.31::numeric),
      (6,  991106, 'road',       'export',      'GBFXT', 'Felixstowe',      'NLRTM', 'Rotterdam',        'delayed',    0.61::numeric, 0.06::numeric, 0.34::numeric),
      (7,  991107, 'sea',        'import',      'NLRTM', 'Rotterdam',       'GBLGP', 'London Gateway',   'exception',  0.86::numeric, 0.18::numeric, 0.54::numeric),
      (8,  991108, 'road',       'import',      'FRLYS', 'Lyon',            'GBBHM', 'Birmingham',       'in_transit', 0.18::numeric, 0.15::numeric, 0.43::numeric),
      (9,  991109, 'air',        'import',      'DEFRA', 'Frankfurt',       'GBMAN', 'Manchester',       'on_track',   0.18::numeric, 0.21::numeric, 0.48::numeric),
      (10, 991110, 'sea',        'export',      'GBFXT', 'Felixstowe',      'DEHAM', 'Hamburg',           'delayed',    0.61::numeric, 0.44::numeric, 0.68::numeric),
      (11, 991111, 'air',        'export',      'GBMAN', 'Manchester',      'NLAMS', 'Amsterdam',         'exception',  0.86::numeric, 0.42::numeric, 0.62::numeric),
      (12, 991112, 'road',       'domestic',    'GBBRS', 'Bristol',         'GBLON', 'London',            'on_track',   0.18::numeric, 0.36::numeric, 0.57::numeric),
      (13, 991113, 'sea',        'import',      'HKHKG', 'Hong Kong',       'GBSOU', 'Southampton',       'on_track',   0.18::numeric, 0.52::numeric, 0.86::numeric),
      (14, 991114, 'sea',        'export',      'GBLGP', 'London Gateway',  'IEDUB', 'Dublin',            'in_transit', 0.18::numeric, 0.74::numeric, 1.12::numeric),
      (15, 991115, 'air',        'import',      'FRCDG', 'Paris CDG',       'GBMAN', 'Manchester',       'delayed',    0.61::numeric, 0.56::numeric, 0.79::numeric),
      (16, 991116, 'air',        'export',      'GBLHR', 'London Heathrow', 'ESMAD', 'Madrid',            'on_track',   0.18::numeric, 0.73::numeric, 1.08::numeric),
      (17, 991117, 'road',       'export',      'GBBHM', 'Birmingham',      'FRPAR', 'Paris',             'on_track',   0.18::numeric, 0.49::numeric, 0.72::numeric),
      (18, 991118, 'road',       'import',      'BEBRU', 'Brussels',        'GBLON', 'London',            'in_transit', 0.18::numeric, 0.66::numeric, 0.92::numeric),
      (19, 991119, 'multimodal', 'cross_trade', 'DEHAM', 'Hamburg',         'GBMAN', 'Manchester',       'on_track',   0.18::numeric, 0.10::numeric, 0.36::numeric),
      (20, 991120, 'multimodal', 'import',      'ITMIL', 'Milan',           'GBLDS', 'Leeds',             'delayed',    0.61::numeric, 0.24::numeric, 0.51::numeric),
      (21, 991121, 'multimodal', 'export',      'GBLIV', 'Liverpool',       'PLGDN', 'Gdansk',            'on_track',   0.18::numeric, 0.39::numeric, 0.66::numeric),
      (22, 991122, 'multimodal', 'import',      'PLWAW', 'Warsaw',          'GBBHM', 'Birmingham',       'exception',  0.86::numeric, 0.51::numeric, 0.77::numeric),
      (23, 991123, 'multimodal', 'export',      'GBLON', 'London',          'SEGOT', 'Gothenburg',        'in_transit', 0.18::numeric, 0.68::numeric, 0.90::numeric),
      (24, 991124, 'multimodal', 'cross_trade', 'NLRTM', 'Rotterdam',       'FRLYS', 'Lyon',              'on_track',   0.18::numeric, 0.81::numeric, 1.15::numeric)
    ) fixture(slot, job_number, mode_code, direction_code, origin_unlocode, origin_name, destination_unlocode, destination_name, tracking_status, risk_score, start_ratio, end_ratio)
  loop
    v_customer := v_customers[1 + ((v_fixture.slot - 1) % array_length(v_customers, 1))];

    select job."Job_ID" into v_job_id
    from public."Job_Header" job
    where job."Job_Number" = v_fixture.job_number
      and job."Job_InternalNotes" = v_marker
    limit 1;

    if v_job_id is null then
      insert into public."Job_Header" (
        "Job_Number", "Job_Period", "Job_CreatedDate", "Job_CreatedBy",
        "Job_Customer", "Job_OfficeID", "Job_OrgOfficeID", "Job_Status",
        "Job_Direction", "Job_TransportModeSummary",
        "Job_OriginUNLocode", "Job_OriginNameSnapshot",
        "Job_DestinationUNLocode", "Job_DestinationNameSnapshot",
        "Job_RequiredDeliveryDate", "Job_TrackingStatus", "Job_TrackingRiskScore",
        "Job_CurrentLocationNameSnapshot", "Job_InternalNotes", "Job_UpdatedBy", "Job_UpdatedAt"
      ) values (
        v_fixture.job_number, to_char(v_local_date, 'YYYYMM'),
        (v_day_start + v_elapsed * v_fixture.start_ratio::double precision)::timestamp, v_owner,
        v_customer, v_office, v_office, 'booked',
        v_fixture.direction_code, v_fixture.mode_code,
        v_fixture.origin_unlocode, v_fixture.origin_name,
        v_fixture.destination_unlocode, v_fixture.destination_name,
        v_local_date, v_fixture.tracking_status, v_fixture.risk_score,
        'Planning desk', v_marker, v_owner,
        v_day_start + v_elapsed * v_fixture.start_ratio::double precision
      )
      returning "Job_ID" into v_job_id;
    else
      update public."Job_Header" job
      set "Job_Period" = to_char(v_local_date, 'YYYYMM'),
          "Job_Customer" = v_customer,
          "Job_OfficeID" = v_office,
          "Job_OrgOfficeID" = v_office,
          "Job_Status" = 'booked',
          "Job_Direction" = v_fixture.direction_code,
          "Job_TransportModeSummary" = v_fixture.mode_code,
          "Job_OriginUNLocode" = v_fixture.origin_unlocode,
          "Job_OriginNameSnapshot" = v_fixture.origin_name,
          "Job_DestinationUNLocode" = v_fixture.destination_unlocode,
          "Job_DestinationNameSnapshot" = v_fixture.destination_name,
          "Job_RequiredDeliveryDate" = v_local_date,
          "Job_PredictedDeliveryAt" = null,
          "Job_TrackingStatus" = v_fixture.tracking_status,
          "Job_TrackingRiskScore" = v_fixture.risk_score,
          "Job_CurrentLocationNameSnapshot" = 'Planning desk',
          "Job_ClosedDate" = null,
          "Job_IsDeleted" = false,
          "Job_UpdatedBy" = v_owner,
          "Job_UpdatedAt" = v_day_start + v_elapsed * v_fixture.start_ratio::double precision
      where job."Job_ID" = v_job_id;
    end if;

    v_route_id := null;
    select route."JobRoute_ID" into v_route_id
    from public."Job_Routing" route
    where route."Job_ID" = v_job_id
    order by route."JobRoute_OrderNo" nulls last, route."JobRoute_ID"
    limit 1;

    if v_route_id is null then
      insert into public."Job_Routing" (
        "Job_ID", "JobRoute_OrderNo", "JobRoute_Status", "JobRoute_ModeCode",
        "JobRoute_OriginUNLocode", "JobRoute_OriginNameSnapshot",
        "JobRoute_DestinationUNLocode", "JobRoute_DestinationNameSnapshot",
        "JobRoute_PlannedDepartureAt", "JobRoute_PlannedArrivalAt",
        "JobRoute_IsMainCarriage", "JobRoute_RouteJSON", "JobRoute_UpdatedBy"
      ) values (
        v_job_id, 1, 'planned', v_fixture.mode_code,
        v_fixture.origin_unlocode, v_fixture.origin_name,
        v_fixture.destination_unlocode, v_fixture.destination_name,
        v_day_start + v_elapsed * v_fixture.start_ratio::double precision,
        v_day_start + v_elapsed * v_fixture.end_ratio::double precision,
        true, jsonb_build_object('developmentFixture', true, 'source', 'dashboard_mode_trend'), v_owner
      )
      returning "JobRoute_ID" into v_route_id;
    else
      update public."Job_Routing" route
      set "JobRoute_OrderNo" = 1,
          "JobRoute_Status" = 'planned',
          "JobRoute_ModeCode" = v_fixture.mode_code,
          "JobRoute_OriginUNLocode" = v_fixture.origin_unlocode,
          "JobRoute_OriginNameSnapshot" = v_fixture.origin_name,
          "JobRoute_DestinationUNLocode" = v_fixture.destination_unlocode,
          "JobRoute_DestinationNameSnapshot" = v_fixture.destination_name,
          "JobRoute_PlannedDepartureAt" = v_day_start + v_elapsed * v_fixture.start_ratio::double precision,
          "JobRoute_PlannedArrivalAt" = v_day_start + v_elapsed * v_fixture.end_ratio::double precision,
          "JobRoute_IsMainCarriage" = true,
          "JobRoute_RouteJSON" = jsonb_build_object('developmentFixture', true, 'source', 'dashboard_mode_trend'),
          "JobRoute_UpdatedAt" = now(),
          "JobRoute_UpdatedBy" = v_owner
      where route."JobRoute_ID" = v_route_id;
    end if;

    -- Demo reseeding must not create operator-facing watch notifications.
    delete from public."AI_DexterWatchSignals" signal
    where signal."AIDexterWatchSignal_SourceTable" = 'Job_Header'
      and signal."AIDexterWatchSignal_SourceID" = v_job_id;

    delete from public."AI_DexterWatchSignals" signal
    where signal."AIDexterWatchSignal_SourceTable" = 'Job_Routing'
      and signal."AIDexterWatchSignal_SourceID" = v_route_id;
  end loop;
end $$;
