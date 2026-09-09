-- Tenant attribution on public contact cards plus an auditable marketing-consent state
-- for leads, contacts and customer accounts. Public submissions can only opt in when
-- the visitor explicitly ticks the checkbox; an unticked box never revokes prior consent.

begin;

alter table public."CRM_ContactCards"
  add column if not exists "ContactCard_ShowTenantName" boolean not null default true;

alter table public."CRM_Leads"
  add column if not exists "CRMLead_MarketingOptIn" boolean not null default false,
  add column if not exists "CRMLead_MarketingConsentSource" character varying(120),
  add column if not exists "CRMLead_MarketingConsentUpdatedAt" timestamptz;

alter table public."Org_Contacts"
  add column if not exists "OrgContact_MarketingOptIn" boolean not null default false,
  add column if not exists "OrgContact_MarketingConsentSource" character varying(120),
  add column if not exists "OrgContact_MarketingConsentUpdatedAt" timestamptz;

alter table public."Org_Master"
  add column if not exists "Org_MarketingOptIn" boolean not null default false,
  add column if not exists "Org_MarketingConsentSource" character varying(120),
  add column if not exists "Org_MarketingConsentUpdatedAt" timestamptz;

alter table public."Comm_ConsentPreferences"
  add column if not exists "CommConsent_LeadID" uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'Comm_ConsentPreferences_CommConsent_LeadID_fkey'
      and conrelid = 'public."Comm_ConsentPreferences"'::regclass
  ) then
    alter table public."Comm_ConsentPreferences"
      add constraint "Comm_ConsentPreferences_CommConsent_LeadID_fkey"
      foreign key ("CommConsent_LeadID") references public."CRM_Leads"("CRMLead_ID") on delete cascade;
  end if;
end;
$$;

create index if not exists "IX_Comm_ConsentPreferences_Lead_Effective"
  on public."Comm_ConsentPreferences"("CommConsent_LeadID", "CommConsent_EffectiveAt" desc)
  where "CommConsent_LeadID" is not null;

create or replace function public._multideck_set_marketing_consent(
  p_record_type text,
  p_record_id uuid,
  p_opted_in boolean,
  p_source text,
  p_reason text,
  p_actor uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_type text := lower(btrim(coalesce(p_record_type, '')));
  v_now timestamptz := now();
  v_lead uuid;
  v_contact uuid;
  v_org uuid;
  v_email text;
begin
  if v_type = 'lead' then
    update public."CRM_Leads"
    set "CRMLead_MarketingOptIn" = p_opted_in,
        "CRMLead_MarketingConsentSource" = left(coalesce(nullif(btrim(p_source), ''), 'manual_override'), 120),
        "CRMLead_MarketingConsentUpdatedAt" = v_now,
        "CRMLead_UpdatedAt" = v_now,
        "CRMLead_UpdatedBy" = coalesce(p_actor, "CRMLead_UpdatedBy")
    where "CRMLead_ID" = p_record_id and not "CRMLead_IsDeleted"
    returning "CRMLead_ID", "CRMLead_PrimaryContactID", "CRMLead_OrgID", lower(nullif(btrim("CRMLead_Email"), ''))
      into v_lead, v_contact, v_org, v_email;
    if v_lead is null then raise exception 'Lead not found.' using errcode = 'P0002'; end if;

    if v_contact is not null then
      update public."Org_Contacts"
      set "OrgContact_MarketingOptIn" = p_opted_in,
          "OrgContact_MarketingConsentSource" = left(coalesce(nullif(btrim(p_source), ''), 'manual_override'), 120),
          "OrgContact_MarketingConsentUpdatedAt" = v_now
      where "OrgContact_ID" = v_contact;
    end if;
  elsif v_type = 'contact' then
    update public."Org_Contacts"
    set "OrgContact_MarketingOptIn" = p_opted_in,
        "OrgContact_MarketingConsentSource" = left(coalesce(nullif(btrim(p_source), ''), 'manual_override'), 120),
        "OrgContact_MarketingConsentUpdatedAt" = v_now
    where "OrgContact_ID" = p_record_id
    returning "OrgContact_ID", "Org_ID" into v_contact, v_org;
    if v_contact is null then raise exception 'Contact not found.' using errcode = 'P0002'; end if;
    select lower(nullif(btrim(email."OrgContactEmail_Email"), '')) into v_email
    from public."OrgContact_Emails" email
    where email."OrgContact_ID" = v_contact
    order by email."OrgContactEmail_Type", email."OrgContactEmail_ID" limit 1;
  elsif v_type = 'customer' then
    update public."Org_Master"
    set "Org_MarketingOptIn" = p_opted_in,
        "Org_MarketingConsentSource" = left(coalesce(nullif(btrim(p_source), ''), 'manual_override'), 120),
        "Org_MarketingConsentUpdatedAt" = v_now,
        "Org_CRMUpdatedAt" = v_now
    where "Org_id" = p_record_id
    returning "Org_id" into v_org;
    if v_org is null then raise exception 'Customer not found.' using errcode = 'P0002'; end if;
  else
    raise exception 'Choose lead, contact or customer.' using errcode = '22023';
  end if;

  insert into public."Comm_ConsentPreferences"(
    "CommConsent_ChannelCode", "CommConsent_LeadID", "CommConsent_OrgID", "CommConsent_ContactID",
    "CommConsent_Address", "CommConsent_NormalizedAddress", "CommConsent_StatusCode",
    "CommConsent_LawfulBasis", "CommConsent_Source", "CommConsent_Reason", "CommConsent_EffectiveAt",
    "CommConsent_CapturedBy", "CommConsent_MetadataJSON"
  ) values (
    'email', v_lead, v_org, v_contact, v_email, v_email,
    case when p_opted_in then 'opted_in' else 'opted_out' end,
    case when p_source = 'contact_card' then 'explicit_consent' else 'manual_override' end,
    left(coalesce(nullif(btrim(p_source), ''), 'manual_override'), 120), nullif(btrim(p_reason), ''), v_now,
    p_actor, coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('recordType', v_type, 'recordId', p_record_id)
  );

  return jsonb_build_object(
    'recordType', v_type,
    'recordId', p_record_id,
    'marketingOptIn', p_opted_in,
    'marketingConsentSource', left(coalesce(nullif(btrim(p_source), ''), 'manual_override'), 120),
    'marketingConsentUpdatedAt', v_now
  );
end;
$$;

create or replace function public.multideck_crm_set_marketing_opt_in(
  p_record_type text,
  p_record_id uuid,
  p_opted_in boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record;
begin
  select * into v_context from public._multideck_crm_context();
  return public._multideck_set_marketing_consent(
    p_record_type, p_record_id, p_opted_in, 'manual_override', p_reason, v_context.user_id,
    jsonb_build_object('companyId', v_context.company_id)
  );
end;
$$;

create or replace function public._multideck_contact_card_capture_marketing_consent()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_owner uuid;
begin
  if new."Exchange_MarketingConsent" is true and new."CRMLead_ID" is not null then
    select "Owner_User_ID" into v_owner
    from public."CRM_ContactCards" where "ContactCard_ID" = new."ContactCard_ID";
    perform public._multideck_set_marketing_consent(
      'lead', new."CRMLead_ID", true, 'contact_card', 'Opted in on the public contact-card form.', v_owner,
      jsonb_build_object('exchangeId', new."Exchange_ID", 'contactCardId', new."ContactCard_ID")
    );
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_CRM_ContactCardExchanges_marketing_consent" on public."CRM_ContactCardExchanges";
create trigger "TR_CRM_ContactCardExchanges_marketing_consent"
after insert on public."CRM_ContactCardExchanges"
for each row execute function public._multideck_contact_card_capture_marketing_consent();

create or replace function public.multideck_contact_card_set_tenant_name_visibility(p_card_id uuid, p_show boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record;
begin
  select * into v_context from public._multideck_crm_context();
  update public."CRM_ContactCards"
  set "ContactCard_ShowTenantName" = coalesce(p_show, true), "ContactCard_UpdatedAt" = now()
  where "ContactCard_ID" = p_card_id and "Company_ID" = v_context.company_id and "ContactCard_DeletedAt" is null;
  if not found then raise exception 'Contact card not found.' using errcode = 'P0002'; end if;
end;
$$;

-- The browser generates the UUID so a newly created card can open immediately. Seed the row
-- under the authenticated tenant, then let the existing save RPC persist the full card and flow.
create or replace function public.multideck_contact_card_create(p_card jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record; v_id uuid;
begin
  select * into v_context from public._multideck_crm_context();
  begin v_id := nullif(p_card->>'id', '')::uuid; exception when invalid_text_representation then v_id := null; end;
  if v_id is null then raise exception 'A card ID is required.' using errcode = '22023'; end if;
  if exists (select 1 from public."CRM_ContactCards" where "ContactCard_ID" = v_id) then
    raise exception 'This card already exists.' using errcode = '23505';
  end if;
  insert into public."CRM_ContactCards"(
    "ContactCard_ID", "Company_ID", "Owner_User_ID", "ContactCard_Slug", "ContactCard_Label",
    "ContactCard_Status", "ContactCard_ShowTenantName"
  ) values (
    v_id, v_context.company_id, coalesce(nullif(p_card->>'ownerUserId', '')::uuid, v_context.user_id),
    lower(p_card->>'slug'), coalesce(nullif(p_card->>'label', ''), 'Contact card'), 'draft',
    coalesce((p_card->>'showTenantName')::boolean, true)
  );
  return public.multideck_contact_card_save(p_card);
end;
$$;

create or replace function public.multideck_contact_cards_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record; v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  select jsonb_build_object(
    'tenantName', coalesce((select "Company_Name" from public."cmp_Company" where "Company_ID" = v_context.company_id), 'Multideck'),
    'cards', coalesce((select jsonb_agg(to_jsonb(c) order by c."ContactCard_UpdatedAt" desc) from public."CRM_ContactCards" c where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null),'[]'::jsonb),
    'automations', coalesce((select jsonb_agg(to_jsonb(a)) from public."CRM_ContactCardAutomations" a join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null),'[]'::jsonb),
    'conditions', coalesce((select jsonb_agg(to_jsonb(x) order by x."Condition_SortOrder") from public."CRM_ContactCardAutomationConditions" x join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null),'[]'::jsonb),
    'actions', coalesce((select jsonb_agg(to_jsonb(x) order by x."Action_SortOrder") from public."CRM_ContactCardAutomationActions" x join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null),'[]'::jsonb),
    'scans', coalesce((select jsonb_agg(to_jsonb(s) order by s."Scan_At") from public."CRM_ContactCardScans" s join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null),'[]'::jsonb),
    'exchanges', coalesce((select jsonb_agg(to_jsonb(e) order by e."Exchange_At") from public."CRM_ContactCardExchanges" e join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null),'[]'::jsonb),
    'runs', coalesce((select jsonb_agg(to_jsonb(r) order by r."AutomationRun_StartedAt" desc) from (select run.* from public."CRM_ContactCardAutomationRuns" run join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null order by run."AutomationRun_StartedAt" desc limit 200) r),'[]'::jsonb),
    'runSteps', coalesce((select jsonb_agg(to_jsonb(step) order by step."AutomationRunStep_SortOrder") from public."CRM_ContactCardAutomationRunSteps" step join public."CRM_ContactCardAutomationRuns" run using ("AutomationRun_ID") join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null and run."AutomationRun_StartedAt">now()-interval '90 days'),'[]'::jsonb),
    'pipelines', coalesce((select jsonb_agg(jsonb_build_object('id',p."CRMPipeline_ID",'name',p."CRMPipeline_Name",'stages',(select coalesce(jsonb_agg(jsonb_build_object('id',s."CRMPipelineStage_ID",'name',s."CRMPipelineStage_Name",'isDefaultEntry',s."CRMPipelineStage_IsDefaultEntry") order by s."CRMPipelineStage_SortOrder"),'[]'::jsonb) from public."CRM_PipelineStages" s where s."CRMPipeline_ID"=p."CRMPipeline_ID" and not s."Is_Deleted")) order by p."CRMPipeline_SortOrder") from public."CRM_Pipelines" p where p."Company_ID"=v_context.company_id and not p."Is_Deleted"),'[]'::jsonb),
    'owners', coalesce((select jsonb_agg(jsonb_build_object('id',u."User_ID",'name',btrim(concat_ws(' ',u."User_Firstname",u."User_Lastname")),'email',u."User_Email") order by u."User_Firstname",u."User_Lastname") from public."cmp_Users" u where u."Company_ID"=v_context.company_id and u."Auth_User_ID" is not null),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.multideck_public_contact_card(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'ContactCard_ID', c."ContactCard_ID", 'ContactCard_Slug', c."ContactCard_Slug", 'ContactCard_Label', c."ContactCard_Label",
    'ContactCard_Status', c."ContactCard_Status", 'ContactCard_Person', c."ContactCard_Person", 'ContactCard_Branding', c."ContactCard_Branding",
    'ContactCard_TenantName', company."Company_Name", 'ContactCard_ShowTenantName', c."ContactCard_ShowTenantName",
    'ContactCard_PublicHeading', c."ContactCard_PublicHeading", 'ContactCard_PublicSubheading', c."ContactCard_PublicSubheading",
    'ContactCard_SubmitLabel', c."ContactCard_SubmitLabel", 'ContactCard_ThanksHeading', c."ContactCard_ThanksHeading",
    'ContactCard_ThanksBody', c."ContactCard_ThanksBody", 'ContactCard_PhoneField', c."ContactCard_PhoneField",
    'ContactCard_ShowPhone', c."ContactCard_ShowPhone", 'ContactCard_ShowWebsite', c."ContactCard_ShowWebsite",
    'ContactCard_ConsentEnabled', c."ContactCard_ConsentEnabled", 'ContactCard_ConsentCopy', c."ContactCard_ConsentCopy",
    'ContactCard_PrivacyUrl', c."ContactCard_PrivacyUrl", 'ContactCard_CreatedAt', c."ContactCard_CreatedAt"
  )
  from public."CRM_ContactCards" c
  join public."cmp_Company" company on company."Company_ID" = c."Company_ID"
  where c."ContactCard_Slug" = lower(btrim(p_slug)) and c."ContactCard_Status" = 'published'
    and c."ContactCard_DeletedAt" is null limit 1;
$$;

create or replace function public.multideck_crm_get_lead_essential(p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_result jsonb; v_contacts jsonb;
begin
  v_result := public.multideck_crm_get_lead(p_lead_id) || public._multideck_crm_lead_transfer_state(p_lead_id);
  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'marketingOptIn', coalesce(contact."OrgContact_MarketingOptIn", false),
      'marketingConsentSource', contact."OrgContact_MarketingConsentSource",
      'marketingConsentUpdatedAt', contact."OrgContact_MarketingConsentUpdatedAt"
    ) order by item_index
  ), '[]'::jsonb) into v_contacts
  from jsonb_array_elements(coalesce(v_result->'contacts', '[]'::jsonb)) with ordinality as rows(item, item_index)
  left join public."Org_Contacts" contact on contact."OrgContact_ID" = (item->>'id')::uuid;

  return v_result || coalesce((
    select jsonb_build_object(
      'marketingOptIn', lead."CRMLead_MarketingOptIn",
      'marketingConsentSource', lead."CRMLead_MarketingConsentSource",
      'marketingConsentUpdatedAt', lead."CRMLead_MarketingConsentUpdatedAt",
      'contacts', v_contacts
    ) from public."CRM_Leads" lead where lead."CRMLead_ID" = p_lead_id and not lead."CRMLead_IsDeleted"
  ), '{}'::jsonb);
end;
$$;

-- Dexter can inspect and watch consent, but cannot change it. Consent writes deliberately remain
-- human-controlled because an accidental marketing preference change has legal and trust impact.
create or replace function public.multideck_dexter_domain_marketing_consent(p_company_id uuid, p_search text, p_take integer)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with records as (
    select lead."CRMLead_ID" record_id, 'lead'::text record_type,
      coalesce(nullif(btrim(lead."CRMLead_PersonName"), ''), nullif(btrim(lead."CRMLead_CompanyName"), ''), 'Unnamed lead') label,
      lead."CRMLead_Email" email, lead."CRMLead_MarketingOptIn" opted_in,
      lead."CRMLead_MarketingConsentSource" source, lead."CRMLead_MarketingConsentUpdatedAt" updated_at
    from public."CRM_Leads" lead
    join public."cmp_Users" owner on owner."User_ID" = coalesce(lead."CRMLead_OwnerUserID", lead."CRMLead_CreatedBy")
    where owner."Company_ID" = p_company_id and not lead."CRMLead_IsDeleted"
    union all
    select contact."OrgContact_ID", 'contact',
      coalesce(nullif(btrim(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName")), ''), 'Unnamed contact'),
      email."OrgContactEmail_Email", contact."OrgContact_MarketingOptIn", contact."OrgContact_MarketingConsentSource", contact."OrgContact_MarketingConsentUpdatedAt"
    from public."Org_Contacts" contact
    left join lateral (
      select row."OrgContactEmail_Email" from public."OrgContact_Emails" row
      where row."OrgContact_ID" = contact."OrgContact_ID" order by row."OrgContactEmail_Type", row."OrgContactEmail_ID" limit 1
    ) email on true
    union all
    select org."Org_id", 'customer', org."Org_Name", null, org."Org_MarketingOptIn", org."Org_MarketingConsentSource", org."Org_MarketingConsentUpdatedAt"
    from public."Org_Master" org
    where org."Org_CRMIsPotentialCustomer" or exists (
      select 1 from public."Org_Master_Type" link join public."Org_Types" type on type."OrgType_ID" = link."OrgType_ID"
      where link."Org_ID" = org."Org_id" and lower(type."OrgType_Name") = 'customer'
    )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'recordId', record_id, 'recordType', record_type, 'label', label, 'email', email,
    'marketingOptIn', opted_in, 'source', source, 'updatedAt', updated_at
  ) order by updated_at desc nulls last, label), '[]'::jsonb)
  from (
    select * from records
    where nullif(btrim(p_search), '') is null or concat_ws(' ', label, email, record_type, source) ilike '%' || btrim(p_search) || '%'
    order by updated_at desc nulls last, label
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) limited;
$$;

insert into public."sys_AIDexterDataDomains"(
  "AIDexterDomain_Code", "AIDexterDomain_Name", "AIDexterDomain_Description", "AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder", "AIDexterDomain_IsActive", "AIDexterDomain_UpdatedAt"
) values (
  'marketing_consent', 'Marketing consent',
  'Read-only marketing opt-in status and evidence for leads, contacts and customer accounts. Changes require the explicit record toggle.',
  'multideck_dexter_domain_marketing_consent', 36, true, now()
) on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name" = excluded."AIDexterDomain_Name",
  "AIDexterDomain_Description" = excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction" = excluded."AIDexterDomain_QueryFunction",
  "AIDexterDomain_IsActive" = true,
  "AIDexterDomain_UpdatedAt" = now();

insert into public."sys_AIDexterWatchCapabilities"(
  "AIDexterWatchCapability_Code", "AIDexterWatchCapability_Name", "AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON", "AIDexterWatchCapability_SortOrder"
) values (
  'marketing_consent', 'Marketing consent', 'Opt-in or opt-out changes on a lead, contact or customer account.',
  '["recordType","marketingOptIn","source","updatedAt"]'::jsonb, 36
) on conflict ("AIDexterWatchCapability_Code") do update set
  "AIDexterWatchCapability_Name" = excluded."AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description" = excluded."AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON" = excluded."AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_IsActive" = true,
  "AIDexterWatchCapability_UpdatedAt" = now();

create or replace function public._multideck_marketing_consent_watch_signal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_company uuid; v_source uuid; v_type text; v_old jsonb; v_new jsonb;
begin
  if tg_table_name = 'CRM_Leads' then
    v_source := new."CRMLead_ID"; v_type := 'lead';
    select "Company_ID" into v_company from public."cmp_Users"
    where "User_ID" = coalesce(new."CRMLead_OwnerUserID", new."CRMLead_CreatedBy") limit 1;
    v_old := jsonb_build_object('recordType', v_type, 'marketingOptIn', old."CRMLead_MarketingOptIn", 'source', old."CRMLead_MarketingConsentSource", 'updatedAt', old."CRMLead_MarketingConsentUpdatedAt");
    v_new := jsonb_build_object('recordType', v_type, 'marketingOptIn', new."CRMLead_MarketingOptIn", 'source', new."CRMLead_MarketingConsentSource", 'updatedAt', new."CRMLead_MarketingConsentUpdatedAt");
  elsif tg_table_name = 'Org_Contacts' then
    v_source := new."OrgContact_ID"; v_type := 'contact';
    select "Company_ID" into v_company from public."cmp_Company" order by "Company_ID" limit 1;
    v_old := jsonb_build_object('recordType', v_type, 'marketingOptIn', old."OrgContact_MarketingOptIn", 'source', old."OrgContact_MarketingConsentSource", 'updatedAt', old."OrgContact_MarketingConsentUpdatedAt");
    v_new := jsonb_build_object('recordType', v_type, 'marketingOptIn', new."OrgContact_MarketingOptIn", 'source', new."OrgContact_MarketingConsentSource", 'updatedAt', new."OrgContact_MarketingConsentUpdatedAt");
  else
    v_source := new."Org_id"; v_type := 'customer';
    select "Company_ID" into v_company from public."cmp_Company" order by "Company_ID" limit 1;
    v_old := jsonb_build_object('recordType', v_type, 'marketingOptIn', old."Org_MarketingOptIn", 'source', old."Org_MarketingConsentSource", 'updatedAt', old."Org_MarketingConsentUpdatedAt");
    v_new := jsonb_build_object('recordType', v_type, 'marketingOptIn', new."Org_MarketingOptIn", 'source', new."Org_MarketingConsentSource", 'updatedAt', new."Org_MarketingConsentUpdatedAt");
  end if;
  if v_company is not null and v_new is distinct from v_old and exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = v_company and watch."AIDexterWatch_CapabilityCode" = 'marketing_consent'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = v_source)
  ) then
    insert into public."AI_DexterWatchSignals"(
      "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode", "AIDexterWatchSignal_SourceTable",
      "AIDexterWatchSignal_SourceID", "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
    ) values (v_company, 'marketing_consent', tg_table_name, v_source, v_old, v_new);
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_CRM_Leads_marketing_consent_watch" on public."CRM_Leads";
create trigger "TR_CRM_Leads_marketing_consent_watch"
after update of "CRMLead_MarketingOptIn" on public."CRM_Leads"
for each row execute function public._multideck_marketing_consent_watch_signal();
drop trigger if exists "TR_Org_Contacts_marketing_consent_watch" on public."Org_Contacts";
create trigger "TR_Org_Contacts_marketing_consent_watch"
after update of "OrgContact_MarketingOptIn" on public."Org_Contacts"
for each row execute function public._multideck_marketing_consent_watch_signal();
drop trigger if exists "TR_Org_Master_marketing_consent_watch" on public."Org_Master";
create trigger "TR_Org_Master_marketing_consent_watch"
after update of "Org_MarketingOptIn" on public."Org_Master"
for each row execute function public._multideck_marketing_consent_watch_signal();

revoke all on function public._multideck_set_marketing_consent(text, uuid, boolean, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public._multideck_contact_card_capture_marketing_consent() from public, anon, authenticated;
revoke all on function public._multideck_marketing_consent_watch_signal() from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_marketing_consent(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.multideck_crm_set_marketing_opt_in(text, uuid, boolean, text) from public, anon;
revoke all on function public.multideck_contact_card_set_tenant_name_visibility(uuid, boolean) from public, anon;
revoke all on function public.multideck_contact_card_create(jsonb) from public, anon;
revoke all on function public.multideck_contact_cards_workspace() from public, anon;
revoke all on function public.multideck_public_contact_card(text) from public;
revoke all on function public.multideck_crm_get_lead_essential(uuid) from public, anon;

grant execute on function public.multideck_crm_set_marketing_opt_in(text, uuid, boolean, text) to authenticated;
grant execute on function public.multideck_contact_card_set_tenant_name_visibility(uuid, boolean) to authenticated;
grant execute on function public.multideck_contact_card_create(jsonb) to authenticated;
grant execute on function public.multideck_contact_cards_workspace() to authenticated;
grant execute on function public.multideck_public_contact_card(text) to anon, authenticated;
grant execute on function public.multideck_crm_get_lead_essential(uuid) to authenticated;

commit;
