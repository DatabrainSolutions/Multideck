-- Supabase-backed QR contact cards, analytics, exchanges, and CRM automation routing.
-- The tenant project is the isolation boundary. Authenticated workspace reads are scoped to the
-- current cmp_Users.Company_ID; public access is limited to deliberately narrow RPCs.

begin;

create table public."CRM_ContactCards" (
  "ContactCard_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Owner_User_ID" uuid not null references public."cmp_Users"("User_ID"),
  "ContactCard_Slug" text not null,
  "ContactCard_Label" text not null,
  "ContactCard_Context" text not null default '',
  "ContactCard_Status" text not null default 'draft' check ("ContactCard_Status" in ('draft', 'published', 'paused')),
  "ContactCard_Person" jsonb not null default '{}'::jsonb,
  "ContactCard_Branding" jsonb not null default '{}'::jsonb,
  "ContactCard_LeadSource" text not null default '',
  "ContactCard_PublicHeading" text not null default 'Let''s stay in touch',
  "ContactCard_PublicSubheading" text not null default '',
  "ContactCard_SubmitLabel" text not null default 'Continue',
  "ContactCard_ThanksHeading" text not null default 'You''re connected',
  "ContactCard_ThanksBody" text not null default '',
  "ContactCard_PhoneField" text not null default 'optional' check ("ContactCard_PhoneField" in ('optional', 'required', 'hidden')),
  "ContactCard_ShowPhone" boolean not null default true,
  "ContactCard_ShowWebsite" boolean not null default true,
  "ContactCard_ConsentEnabled" boolean not null default false,
  "ContactCard_ConsentCopy" text not null default '',
  "ContactCard_PrivacyUrl" text not null default '',
  "ContactCard_CreatedAt" timestamptz not null default now(),
  "ContactCard_UpdatedAt" timestamptz not null default now(),
  "ContactCard_DeletedAt" timestamptz,
  constraint "CK_CRM_ContactCards_Slug" check ("ContactCard_Slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index "UX_CRM_ContactCards_Company_Slug"
  on public."CRM_ContactCards"("Company_ID", "ContactCard_Slug")
  where "ContactCard_DeletedAt" is null;
create unique index "UX_CRM_ContactCards_Public_Slug"
  on public."CRM_ContactCards"("ContactCard_Slug")
  where "ContactCard_DeletedAt" is null;
create index "IX_CRM_ContactCards_Company_Updated"
  on public."CRM_ContactCards"("Company_ID", "ContactCard_UpdatedAt" desc)
  where "ContactCard_DeletedAt" is null;

create table public."CRM_ContactCardAutomations" (
  "ContactCard_ID" uuid primary key references public."CRM_ContactCards"("ContactCard_ID") on delete cascade,
  "Automation_State" text not null default 'off' check ("Automation_State" in ('off', 'active', 'paused')),
  "Automation_HasUnpublishedChanges" boolean not null default false,
  "Automation_LastRunAt" timestamptz,
  "Automation_AutoPausedReason" text,
  "Automation_UpdatedAt" timestamptz not null default now()
);

create table public."CRM_ContactCardAutomationConditions" (
  "Condition_ID" uuid primary key default gen_random_uuid(),
  "ContactCard_ID" uuid not null references public."CRM_ContactCards"("ContactCard_ID") on delete cascade,
  "Condition_Kind" text not null check ("Condition_Kind" in ('free-email', 'known-company', 'new-lead', 'email-domain', 'within-dates')),
  "Condition_Negated" boolean not null default false,
  "Condition_Value" text not null default '',
  "Condition_Enabled" boolean not null default true,
  "Condition_SortOrder" integer not null default 0
);
create index "IX_CRM_ContactCardConditions_Card_Order"
  on public."CRM_ContactCardAutomationConditions"("ContactCard_ID", "Condition_SortOrder");

create table public."CRM_ContactCardAutomationActions" (
  "Action_ID" uuid primary key default gen_random_uuid(),
  "ContactCard_ID" uuid not null references public."CRM_ContactCards"("ContactCard_ID") on delete cascade,
  "Action_Kind" text not null check ("Action_Kind" in ('assign-owner', 'pipeline-stage', 'add-to-list', 'create-task', 'notify-user', 'send-email')),
  "Action_Enabled" boolean not null default true,
  "Action_Config" jsonb not null default '{}'::jsonb,
  "Action_DelayMinutes" integer not null default 0 check ("Action_DelayMinutes" >= 0),
  "Action_PipelineID" uuid references public."CRM_Pipelines"("CRMPipeline_ID"),
  "Action_PipelineStageID" uuid references public."CRM_PipelineStages"("CRMPipelineStage_ID"),
  "Action_OwnerUserID" uuid references public."cmp_Users"("User_ID"),
  "Action_SortOrder" integer not null default 0
);
create index "IX_CRM_ContactCardActions_Card_Order"
  on public."CRM_ContactCardAutomationActions"("ContactCard_ID", "Action_SortOrder");
create index "IX_CRM_ContactCardActions_Pipeline"
  on public."CRM_ContactCardAutomationActions"("Action_PipelineID", "Action_PipelineStageID")
  where "Action_Kind" = 'pipeline-stage' and "Action_Enabled";

create table public."CRM_ContactCardScans" (
  "Scan_ID" uuid primary key default gen_random_uuid(),
  "ContactCard_ID" uuid not null references public."CRM_ContactCards"("ContactCard_ID") on delete cascade,
  "Scan_At" timestamptz not null default now(),
  "Scan_Device" text not null default 'desktop' check ("Scan_Device" in ('mobile', 'tablet', 'desktop')),
  "Scan_Browser" text not null default 'Other',
  "Scan_Channel" text not null default 'direct-scan' check ("Scan_Channel" in ('direct-scan', 'shared-link', 'in-app-browser', 'unknown')),
  "Scan_Country" text not null default '',
  "Scan_Region" text not null default '',
  "Scan_StartedAt" timestamptz,
  "Scan_ExchangedAt" timestamptz
);
create index "IX_CRM_ContactCardScans_Card_At"
  on public."CRM_ContactCardScans"("ContactCard_ID", "Scan_At" desc);

create table public."CRM_ContactCardExchanges" (
  "Exchange_ID" uuid primary key default gen_random_uuid(),
  "ContactCard_ID" uuid not null references public."CRM_ContactCards"("ContactCard_ID") on delete cascade,
  "Scan_ID" uuid references public."CRM_ContactCardScans"("Scan_ID") on delete set null,
  "CRMLead_ID" uuid references public."CRM_Leads"("CRMLead_ID") on delete set null,
  "Exchange_FirstName" text not null,
  "Exchange_LastName" text not null,
  "Exchange_Email" text not null,
  "Exchange_Company" text not null,
  "Exchange_Phone" text not null default '',
  "Exchange_MarketingConsent" boolean not null default false,
  "Exchange_At" timestamptz not null default now(),
  "Exchange_Outcome" text not null check ("Exchange_Outcome" in ('created', 'matched')),
  "Exchange_AutomationOutcome" text not null default 'none' check ("Exchange_AutomationOutcome" in ('ran', 'skipped', 'failed', 'none')),
  "Exchange_AutomationDetail" text not null default ''
);
create index "IX_CRM_ContactCardExchanges_Card_At"
  on public."CRM_ContactCardExchanges"("ContactCard_ID", "Exchange_At" desc);
create index "IX_CRM_ContactCardExchanges_Lead"
  on public."CRM_ContactCardExchanges"("CRMLead_ID") where "CRMLead_ID" is not null;

-- A lead can be routed to a real configured pipeline before it becomes an opportunity.
create table public."CRM_LeadPipelinePlacements" (
  "CRMLead_ID" uuid primary key references public."CRM_Leads"("CRMLead_ID") on delete cascade,
  "CRMPipeline_ID" uuid not null references public."CRM_Pipelines"("CRMPipeline_ID"),
  "CRMPipelineStage_ID" uuid not null references public."CRM_PipelineStages"("CRMPipelineStage_ID"),
  "ContactCard_ID" uuid references public."CRM_ContactCards"("ContactCard_ID") on delete set null,
  "Placed_At" timestamptz not null default now()
);
create index "IX_CRM_LeadPipelinePlacements_PipelineStage"
  on public."CRM_LeadPipelinePlacements"("CRMPipeline_ID", "CRMPipelineStage_ID");

alter table public."CRM_ContactCards" enable row level security;
alter table public."CRM_ContactCardAutomations" enable row level security;
alter table public."CRM_ContactCardAutomationConditions" enable row level security;
alter table public."CRM_ContactCardAutomationActions" enable row level security;
alter table public."CRM_ContactCardScans" enable row level security;
alter table public."CRM_ContactCardExchanges" enable row level security;
alter table public."CRM_LeadPipelinePlacements" enable row level security;

-- The browser uses RPCs only. No direct table access is exposed to anon/authenticated roles.
revoke all on public."CRM_ContactCards", public."CRM_ContactCardAutomations",
  public."CRM_ContactCardAutomationConditions", public."CRM_ContactCardAutomationActions",
  public."CRM_ContactCardScans", public."CRM_ContactCardExchanges",
  public."CRM_LeadPipelinePlacements" from public, anon, authenticated;

create or replace function public.multideck_contact_cards_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();

  select jsonb_build_object(
    'cards', coalesce((select jsonb_agg(to_jsonb(c) order by c."ContactCard_UpdatedAt" desc) from public."CRM_ContactCards" c where c."Company_ID" = v_context.company_id and c."ContactCard_DeletedAt" is null), '[]'::jsonb),
    'automations', coalesce((select jsonb_agg(to_jsonb(a)) from public."CRM_ContactCardAutomations" a join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID" = v_context.company_id and c."ContactCard_DeletedAt" is null), '[]'::jsonb),
    'conditions', coalesce((select jsonb_agg(to_jsonb(x) order by x."Condition_SortOrder") from public."CRM_ContactCardAutomationConditions" x join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID" = v_context.company_id and c."ContactCard_DeletedAt" is null), '[]'::jsonb),
    'actions', coalesce((select jsonb_agg(to_jsonb(x) order by x."Action_SortOrder") from public."CRM_ContactCardAutomationActions" x join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID" = v_context.company_id and c."ContactCard_DeletedAt" is null), '[]'::jsonb),
    'scans', coalesce((select jsonb_agg(to_jsonb(s) order by s."Scan_At") from public."CRM_ContactCardScans" s join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID" = v_context.company_id and c."ContactCard_DeletedAt" is null), '[]'::jsonb),
    'exchanges', coalesce((select jsonb_agg(to_jsonb(e) order by e."Exchange_At") from public."CRM_ContactCardExchanges" e join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID" = v_context.company_id and c."ContactCard_DeletedAt" is null), '[]'::jsonb),
    'pipelines', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p."CRMPipeline_ID", 'name', p."CRMPipeline_Name",
      'stages', (select coalesce(jsonb_agg(jsonb_build_object('id', s."CRMPipelineStage_ID", 'name', s."CRMPipelineStage_Name", 'isDefaultEntry', s."CRMPipelineStage_IsDefaultEntry") order by s."CRMPipelineStage_SortOrder"), '[]'::jsonb) from public."CRM_PipelineStages" s where s."CRMPipeline_ID" = p."CRMPipeline_ID" and not s."Is_Deleted")
    ) order by p."CRMPipeline_SortOrder") from public."CRM_Pipelines" p where p."Company_ID" = v_context.company_id and not p."Is_Deleted"), '[]'::jsonb),
    'owners', coalesce((select jsonb_agg(jsonb_build_object('id', u."User_ID", 'name', btrim(concat_ws(' ', u."User_Firstname", u."User_Lastname")), 'email', u."User_Email") order by u."User_Firstname", u."User_Lastname") from public."cmp_Users" u where u."Company_ID" = v_context.company_id and u."Auth_User_ID" is not null), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.multideck_contact_card_save(p_card jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_id uuid;
  v_automation jsonb := coalesce(p_card -> 'automation', '{}'::jsonb);
  v_item jsonb;
  v_index integer;
  v_pipeline uuid;
  v_stage uuid;
  v_owner uuid;
begin
  select * into v_context from public._multideck_crm_context();
  begin v_id := nullif(p_card ->> 'id', '')::uuid; exception when invalid_text_representation then v_id := null; end;

  if v_id is null then
    insert into public."CRM_ContactCards" (
      "Company_ID", "Owner_User_ID", "ContactCard_Slug", "ContactCard_Label", "ContactCard_Context", "ContactCard_Status",
      "ContactCard_Person", "ContactCard_Branding", "ContactCard_LeadSource", "ContactCard_PublicHeading", "ContactCard_PublicSubheading",
      "ContactCard_SubmitLabel", "ContactCard_ThanksHeading", "ContactCard_ThanksBody", "ContactCard_PhoneField", "ContactCard_ShowPhone",
      "ContactCard_ShowWebsite", "ContactCard_ConsentEnabled", "ContactCard_ConsentCopy", "ContactCard_PrivacyUrl"
    ) values (
      v_context.company_id, coalesce(nullif(p_card ->> 'ownerUserId', '')::uuid, v_context.user_id), lower(p_card ->> 'slug'), p_card ->> 'label', coalesce(p_card ->> 'context', ''), coalesce(p_card ->> 'status', 'draft'),
      coalesce(p_card -> 'person', '{}'::jsonb), coalesce(p_card -> 'branding', '{}'::jsonb), coalesce(p_card ->> 'leadSource', ''), coalesce(p_card ->> 'publicHeading', ''), coalesce(p_card ->> 'publicSubheading', ''),
      coalesce(p_card ->> 'submitLabel', 'Continue'), coalesce(p_card ->> 'thanksHeading', ''), coalesce(p_card ->> 'thanksBody', ''), coalesce(p_card ->> 'phoneField', 'optional'), coalesce((p_card ->> 'showPhone')::boolean, true),
      coalesce((p_card ->> 'showWebsite')::boolean, true), coalesce((p_card ->> 'consentEnabled')::boolean, false), coalesce(p_card ->> 'consentCopy', ''), coalesce(p_card ->> 'privacyUrl', '')
    ) returning "ContactCard_ID" into v_id;
  else
    update public."CRM_ContactCards" set
      "Owner_User_ID" = coalesce(nullif(p_card ->> 'ownerUserId', '')::uuid, "Owner_User_ID"),
      "ContactCard_Slug" = lower(p_card ->> 'slug'), "ContactCard_Label" = p_card ->> 'label', "ContactCard_Context" = coalesce(p_card ->> 'context', ''), "ContactCard_Status" = coalesce(p_card ->> 'status', 'draft'),
      "ContactCard_Person" = coalesce(p_card -> 'person', '{}'::jsonb), "ContactCard_Branding" = coalesce(p_card -> 'branding', '{}'::jsonb), "ContactCard_LeadSource" = coalesce(p_card ->> 'leadSource', ''),
      "ContactCard_PublicHeading" = coalesce(p_card ->> 'publicHeading', ''), "ContactCard_PublicSubheading" = coalesce(p_card ->> 'publicSubheading', ''), "ContactCard_SubmitLabel" = coalesce(p_card ->> 'submitLabel', 'Continue'),
      "ContactCard_ThanksHeading" = coalesce(p_card ->> 'thanksHeading', ''), "ContactCard_ThanksBody" = coalesce(p_card ->> 'thanksBody', ''), "ContactCard_PhoneField" = coalesce(p_card ->> 'phoneField', 'optional'),
      "ContactCard_ShowPhone" = coalesce((p_card ->> 'showPhone')::boolean, true), "ContactCard_ShowWebsite" = coalesce((p_card ->> 'showWebsite')::boolean, true), "ContactCard_ConsentEnabled" = coalesce((p_card ->> 'consentEnabled')::boolean, false),
      "ContactCard_ConsentCopy" = coalesce(p_card ->> 'consentCopy', ''), "ContactCard_PrivacyUrl" = coalesce(p_card ->> 'privacyUrl', ''), "ContactCard_UpdatedAt" = now()
    where "ContactCard_ID" = v_id and "Company_ID" = v_context.company_id and "ContactCard_DeletedAt" is null;
    if not found then raise exception 'Contact card not found.' using errcode = 'P0002'; end if;
  end if;

  insert into public."CRM_ContactCardAutomations" ("ContactCard_ID", "Automation_State", "Automation_HasUnpublishedChanges", "Automation_LastRunAt", "Automation_AutoPausedReason", "Automation_UpdatedAt")
  values (v_id, coalesce(v_automation ->> 'state', 'off'), coalesce((v_automation ->> 'hasUnpublishedChanges')::boolean, false), nullif(v_automation ->> 'lastRunAt', '')::timestamptz, nullif(v_automation ->> 'autoPausedReason', ''), now())
  on conflict ("ContactCard_ID") do update set "Automation_State" = excluded."Automation_State", "Automation_HasUnpublishedChanges" = excluded."Automation_HasUnpublishedChanges", "Automation_LastRunAt" = excluded."Automation_LastRunAt", "Automation_AutoPausedReason" = excluded."Automation_AutoPausedReason", "Automation_UpdatedAt" = now();

  delete from public."CRM_ContactCardAutomationConditions" where "ContactCard_ID" = v_id;
  for v_item, v_index in select value, ordinality - 1 from jsonb_array_elements(coalesce(v_automation -> 'conditions', '[]'::jsonb)) with ordinality loop
    insert into public."CRM_ContactCardAutomationConditions" ("ContactCard_ID", "Condition_Kind", "Condition_Negated", "Condition_Value", "Condition_Enabled", "Condition_SortOrder")
    values (v_id, v_item ->> 'kind', coalesce((v_item ->> 'negated')::boolean, false), coalesce(v_item ->> 'value', ''), coalesce((v_item ->> 'enabled')::boolean, true), v_index);
  end loop;

  delete from public."CRM_ContactCardAutomationActions" where "ContactCard_ID" = v_id;
  for v_item, v_index in select value, ordinality - 1 from jsonb_array_elements(coalesce(v_automation -> 'actions', '[]'::jsonb)) with ordinality loop
    v_pipeline := nullif(v_item #>> '{config,pipelineId}', '')::uuid;
    v_stage := nullif(v_item #>> '{config,stageId}', '')::uuid;
    v_owner := nullif(v_item #>> '{config,ownerId}', '')::uuid;
    if v_item ->> 'kind' = 'pipeline-stage' and not exists (
      select 1 from public."CRM_Pipelines" p join public."CRM_PipelineStages" s on s."CRMPipeline_ID" = p."CRMPipeline_ID"
      where p."Company_ID" = v_context.company_id and p."CRMPipeline_ID" = v_pipeline and s."CRMPipelineStage_ID" = v_stage and not p."Is_Deleted" and not s."Is_Deleted"
    ) then raise exception 'Choose a valid pipeline and stage.' using errcode = '22023'; end if;
    if v_owner is not null and not exists (select 1 from public."cmp_Users" where "User_ID" = v_owner and "Company_ID" = v_context.company_id) then raise exception 'Choose a valid owner.' using errcode = '22023'; end if;
    insert into public."CRM_ContactCardAutomationActions" ("ContactCard_ID", "Action_Kind", "Action_Enabled", "Action_Config", "Action_DelayMinutes", "Action_PipelineID", "Action_PipelineStageID", "Action_OwnerUserID", "Action_SortOrder")
    values (v_id, v_item ->> 'kind', coalesce((v_item ->> 'enabled')::boolean, true), coalesce(v_item -> 'config', '{}'::jsonb), coalesce((v_item ->> 'delayMinutes')::integer, 0), v_pipeline, v_stage, v_owner, v_index);
  end loop;
  return v_id;
end;
$$;

create or replace function public.multideck_contact_card_delete(p_card_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare v_context record;
begin
  select * into v_context from public._multideck_crm_context();
  update public."CRM_ContactCards" set "ContactCard_DeletedAt" = now(), "ContactCard_Status" = 'paused', "ContactCard_UpdatedAt" = now()
  where "ContactCard_ID" = p_card_id and "Company_ID" = v_context.company_id and "ContactCard_DeletedAt" is null;
  if not found then raise exception 'Contact card not found.' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.multideck_public_contact_card(p_slug text)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object(
    'ContactCard_ID', c."ContactCard_ID",
    'ContactCard_Slug', c."ContactCard_Slug",
    'ContactCard_Label', c."ContactCard_Label",
    'ContactCard_Status', c."ContactCard_Status",
    'ContactCard_Person', c."ContactCard_Person",
    'ContactCard_Branding', c."ContactCard_Branding",
    'ContactCard_PublicHeading', c."ContactCard_PublicHeading",
    'ContactCard_PublicSubheading', c."ContactCard_PublicSubheading",
    'ContactCard_SubmitLabel', c."ContactCard_SubmitLabel",
    'ContactCard_ThanksHeading', c."ContactCard_ThanksHeading",
    'ContactCard_ThanksBody', c."ContactCard_ThanksBody",
    'ContactCard_PhoneField', c."ContactCard_PhoneField",
    'ContactCard_ShowPhone', c."ContactCard_ShowPhone",
    'ContactCard_ShowWebsite', c."ContactCard_ShowWebsite",
    'ContactCard_ConsentEnabled', c."ContactCard_ConsentEnabled",
    'ContactCard_ConsentCopy', c."ContactCard_ConsentCopy",
    'ContactCard_PrivacyUrl', c."ContactCard_PrivacyUrl",
    'ContactCard_CreatedAt', c."ContactCard_CreatedAt"
  ) from public."CRM_ContactCards" c
  where c."ContactCard_Slug" = lower(btrim(p_slug)) and c."ContactCard_Status" = 'published' and c."ContactCard_DeletedAt" is null limit 1;
$$;

create or replace function public.multideck_contact_card_record_scan(p_slug text, p_device text, p_browser text, p_channel text, p_country text, p_region text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_card uuid; v_scan uuid;
begin
  select "ContactCard_ID" into v_card from public."CRM_ContactCards" where "ContactCard_Slug" = lower(btrim(p_slug)) and "ContactCard_Status" = 'published' and "ContactCard_DeletedAt" is null limit 1;
  if v_card is null then return null; end if;
  insert into public."CRM_ContactCardScans" ("ContactCard_ID", "Scan_Device", "Scan_Browser", "Scan_Channel", "Scan_Country", "Scan_Region")
  values (v_card, case when p_device in ('mobile','tablet','desktop') then p_device else 'desktop' end, left(coalesce(p_browser,'Other'),80), case when p_channel in ('direct-scan','shared-link','in-app-browser','unknown') then p_channel else 'unknown' end, left(coalesce(p_country,''),80), left(coalesce(p_region,''),80)) returning "Scan_ID" into v_scan;
  return v_scan;
end;
$$;

create or replace function public.multideck_contact_card_mark_started(p_scan_id uuid)
returns void language sql security definer set search_path = pg_catalog, public as $$
  update public."CRM_ContactCardScans" set "Scan_StartedAt" = coalesce("Scan_StartedAt", now()) where "Scan_ID" = p_scan_id and "Scan_At" > now() - interval '24 hours';
$$;

create or replace function public.multideck_contact_card_submit_exchange(p_slug text, p_scan_id uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_card record; v_automation record; v_email text; v_lead uuid; v_existing boolean := false; v_action record; v_actions integer := 0; v_exchange uuid; v_outcome text;
begin
  select * into v_card from public."CRM_ContactCards" where "ContactCard_Slug" = lower(btrim(p_slug)) and "ContactCard_Status" = 'published' and "ContactCard_DeletedAt" is null limit 1;
  if not found then raise exception 'This contact card is not active.' using errcode = 'P0002'; end if;
  v_email := lower(btrim(p_input ->> 'email'));
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a valid email address.' using errcode = '22023'; end if;
  select "CRMLead_ID" into v_lead from public."CRM_Leads" where lower("CRMLead_Email") = v_email and not "CRMLead_IsDeleted" order by "CRMLead_CreatedAt" limit 1;
  v_existing := v_lead is not null;
  if not v_existing then
    insert into public."CRM_Leads" ("CRMLead_SourceCode", "CRMLead_StatusCode", "CRMLead_RatingCode", "CRMLead_OwnerUserID", "CRMLead_CompanyName", "CRMLead_PersonName", "CRMLead_Email", "CRMLead_Phone", "CRMLead_MetadataJSON", "CRMLead_CreatedBy", "CRMLead_UpdatedBy")
    values ('website', 'new', 'unrated', v_card."Owner_User_ID", left(btrim(p_input ->> 'company'),255), left(btrim(concat_ws(' ', p_input ->> 'firstName', p_input ->> 'lastName')),255), left(v_email,255), left(coalesce(p_input ->> 'phone',''),80), jsonb_build_object('contactCardId', v_card."ContactCard_ID", 'contactCardSlug', v_card."ContactCard_Slug", 'leadSource', v_card."ContactCard_LeadSource", 'marketingConsent', coalesce((p_input ->> 'marketingConsent')::boolean,false)), v_card."Owner_User_ID", v_card."Owner_User_ID")
    returning "CRMLead_ID" into v_lead;
  end if;

  select * into v_automation from public."CRM_ContactCardAutomations" where "ContactCard_ID" = v_card."ContactCard_ID";
  if p_scan_id is not null and not exists (select 1 from public."CRM_ContactCardScans" where "Scan_ID" = p_scan_id and "ContactCard_ID" = v_card."ContactCard_ID" and "Scan_At" > now() - interval '24 hours') then
    p_scan_id := null;
  end if;
  if v_automation."Automation_State" = 'active' then
    for v_action in select * from public."CRM_ContactCardAutomationActions" where "ContactCard_ID" = v_card."ContactCard_ID" and "Action_Enabled" order by "Action_SortOrder" loop
      if v_action."Action_Kind" = 'assign-owner' and v_action."Action_OwnerUserID" is not null then
        update public."CRM_Leads" set "CRMLead_OwnerUserID" = v_action."Action_OwnerUserID", "CRMLead_UpdatedAt" = now(), "CRMLead_UpdatedBy" = v_card."Owner_User_ID" where "CRMLead_ID" = v_lead;
        v_actions := v_actions + 1;
      elsif v_action."Action_Kind" = 'pipeline-stage' and v_action."Action_PipelineID" is not null and v_action."Action_PipelineStageID" is not null then
        insert into public."CRM_LeadPipelinePlacements" ("CRMLead_ID", "CRMPipeline_ID", "CRMPipelineStage_ID", "ContactCard_ID") values (v_lead, v_action."Action_PipelineID", v_action."Action_PipelineStageID", v_card."ContactCard_ID")
        on conflict ("CRMLead_ID") do update set "CRMPipeline_ID" = excluded."CRMPipeline_ID", "CRMPipelineStage_ID" = excluded."CRMPipelineStage_ID", "ContactCard_ID" = excluded."ContactCard_ID", "Placed_At" = now();
        v_actions := v_actions + 1;
      end if;
    end loop;
  end if;
  v_outcome := case when v_existing then 'matched' else 'created' end;
  insert into public."CRM_ContactCardExchanges" ("ContactCard_ID", "Scan_ID", "CRMLead_ID", "Exchange_FirstName", "Exchange_LastName", "Exchange_Email", "Exchange_Company", "Exchange_Phone", "Exchange_MarketingConsent", "Exchange_Outcome", "Exchange_AutomationOutcome", "Exchange_AutomationDetail")
  values (v_card."ContactCard_ID", p_scan_id, v_lead, btrim(p_input ->> 'firstName'), btrim(p_input ->> 'lastName'), v_email, btrim(p_input ->> 'company'), btrim(coalesce(p_input ->> 'phone','')), coalesce((p_input ->> 'marketingConsent')::boolean,false), v_outcome, case when v_actions > 0 then 'ran' when v_automation."Automation_State" = 'active' then 'skipped' else 'none' end, case when v_actions > 0 then v_actions || ' connected CRM actions ran.' when v_automation."Automation_State" = 'active' then 'No connected action applied.' else 'Automation is off for this card.' end)
  returning "Exchange_ID" into v_exchange;
  update public."CRM_ContactCardScans" set "Scan_StartedAt" = coalesce("Scan_StartedAt",now()), "Scan_ExchangedAt" = now() where "Scan_ID" = p_scan_id and "ContactCard_ID" = v_card."ContactCard_ID";
  update public."CRM_ContactCardAutomations" set "Automation_LastRunAt" = case when v_actions > 0 then now() else "Automation_LastRunAt" end where "ContactCard_ID" = v_card."ContactCard_ID";
  return jsonb_build_object('outcome', v_outcome, 'exchangeId', v_exchange, 'leadId', v_lead, 'automationActionsRun', v_actions);
end;
$$;

revoke all on function public.multideck_contact_cards_workspace() from public, anon;
revoke all on function public.multideck_contact_card_save(jsonb) from public, anon;
revoke all on function public.multideck_contact_card_delete(uuid) from public, anon;
grant execute on function public.multideck_contact_cards_workspace(), public.multideck_contact_card_save(jsonb), public.multideck_contact_card_delete(uuid) to authenticated;
revoke all on function public.multideck_public_contact_card(text), public.multideck_contact_card_record_scan(text,text,text,text,text,text), public.multideck_contact_card_mark_started(uuid), public.multideck_contact_card_submit_exchange(text,uuid,jsonb) from public;
grant execute on function public.multideck_public_contact_card(text), public.multideck_contact_card_record_scan(text,text,text,text,text,text), public.multideck_contact_card_mark_started(uuid), public.multideck_contact_card_submit_exchange(text,uuid,jsonb) to anon, authenticated;

commit;
