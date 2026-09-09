-- Close the high-risk trust-boundary findings from Codex Security scan
-- 3882e3a1-7c61-4175-ad72-90d32e44e9b4.

begin;

-- Public-schema views must evaluate the caller's RLS policies and expose only
-- authenticated read access. Privileged server code continues to use tables or
-- service-role functions directly.
do $$
declare
  v_view record;
begin
  for v_view in
    select namespace.nspname as schema_name, relation.relname as view_name
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'v'
  loop
    execute format('alter view %I.%I set (security_invoker = true)', v_view.schema_name, v_view.view_name);
    execute format('revoke all privileges on table %I.%I from public, anon, authenticated', v_view.schema_name, v_view.view_name);
    execute format('grant select on table %I.%I to service_role', v_view.schema_name, v_view.view_name);
  end loop;
end;
$$;

-- These are the reviewed browser-facing views. They are security-invoker
-- views, so authenticated reads still evaluate the caller's base-table RLS.
grant select on table public."sys_CustomsOptionCatalogue" to authenticated;
grant select on table public."App_Live_Bookings" to authenticated;
grant select on table public."App_Live_Quotes" to authenticated;

-- Preserve the established operational role model now that the Warehouse Edge
-- boundary actually enforces these permissions.
with role_permissions(role_name, permission_value) as (
  values
    ('Administrator', 'Warehouse.Read'),
    ('Administrator', 'Warehouse.Write'),
    ('Operations manager', 'Warehouse.Read'),
    ('Operations manager', 'Warehouse.Write'),
    ('Operator', 'Warehouse.Read'),
    ('Operator', 'Warehouse.Write'),
    ('Viewer', 'Warehouse.Read')
)
insert into public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
select role."sys_UserRole_ID", permission."sys_Permission_ID"
from role_permissions mapping
join public."sys_UserRoles" role on lower(role."sys_UserRole_Name") = lower(mapping.role_name)
join public."sys_Permissions" permission on permission."sys_Permission_Value" = mapping.permission_value
on conflict ("sys_UserRole_ID", "sys_Permission_ID") do nothing;

-- Return only contact-card fields that the owner explicitly made public. The
-- same redaction also applies to duplicate phone and website social links.
create or replace function public.multideck_public_contact_card(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $contact_card$
  select jsonb_build_object(
    'ContactCard_ID', card."ContactCard_ID",
    'ContactCard_Slug', card."ContactCard_Slug",
    'ContactCard_Label', card."ContactCard_Label",
    'ContactCard_Status', card."ContactCard_Status",
    'ContactCard_Person',
      (coalesce(card."ContactCard_Person", '{}'::jsonb) - 'phone' - 'website' - 'socialLinks')
      || jsonb_build_object(
        'phone', case when coalesce(card."ContactCard_ShowPhone", false) then coalesce(card."ContactCard_Person" ->> 'phone', '') else '' end,
        'website', case when coalesce(card."ContactCard_ShowWebsite", false) then coalesce(card."ContactCard_Person" ->> 'website', '') else '' end,
        'socialLinks', coalesce((
          select jsonb_agg(social_link.item order by social_link.position)
          from jsonb_array_elements(coalesce(card."ContactCard_Person" -> 'socialLinks', '[]'::jsonb))
            with ordinality as social_link(item, position)
          where social_link.item ->> 'enabled' = 'true'
            and (coalesce(card."ContactCard_ShowPhone", false) or lower(coalesce(social_link.item ->> 'kind', '')) not in ('phone', 'whatsapp'))
            and (coalesce(card."ContactCard_ShowWebsite", false) or lower(coalesce(social_link.item ->> 'kind', '')) <> 'website')
        ), '[]'::jsonb)
      ),
    'ContactCard_Branding', card."ContactCard_Branding",
    'ContactCard_TenantName', company."Company_Name",
    'ContactCard_ShowTenantName', card."ContactCard_ShowTenantName",
    'ContactCard_PublicHeading', card."ContactCard_PublicHeading",
    'ContactCard_PublicSubheading', card."ContactCard_PublicSubheading",
    'ContactCard_SubmitLabel', card."ContactCard_SubmitLabel",
    'ContactCard_ThanksHeading', card."ContactCard_ThanksHeading",
    'ContactCard_ThanksBody', card."ContactCard_ThanksBody",
    'ContactCard_PhoneField', card."ContactCard_PhoneField",
    'ContactCard_ShowPhone', card."ContactCard_ShowPhone",
    'ContactCard_ShowWebsite', card."ContactCard_ShowWebsite",
    'ContactCard_ConsentEnabled', card."ContactCard_ConsentEnabled",
    'ContactCard_ConsentCopy', card."ContactCard_ConsentCopy",
    'ContactCard_PrivacyUrl', card."ContactCard_PrivacyUrl",
    'ContactCard_CreatedAt', card."ContactCard_CreatedAt"
  )
  from public."CRM_ContactCards" card
  join public."cmp_Company" company on company."Company_ID" = card."Company_ID"
  where card."ContactCard_Slug" = lower(btrim(p_slug))
    and card."ContactCard_Status" = 'published'
    and card."ContactCard_DeletedAt" is null
  limit 1;
$contact_card$;

-- Anonymous scan telemetry is intentionally public, but it is bounded per card
-- under an advisory lock so parallel requests cannot bypass the shared limit.
create or replace function public.multideck_contact_card_record_scan(
  p_slug text,
  p_device text,
  p_browser text,
  p_channel text,
  p_country text,
  p_region text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_card uuid;
  v_scan uuid;
  v_recent_count integer;
  v_daily_count integer;
begin
  select "ContactCard_ID" into v_card
  from public."CRM_ContactCards"
  where "ContactCard_Slug" = lower(btrim(p_slug))
    and "ContactCard_Status" = 'published'
    and "ContactCard_DeletedAt" is null
  limit 1;
  if v_card is null then return null; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_card::text, 772));
  select
    count(*) filter (where "Scan_At" > now() - interval '10 minutes'),
    count(*) filter (where "Scan_At" > now() - interval '1 day')
  into v_recent_count, v_daily_count
  from public."CRM_ContactCardScans"
  where "ContactCard_ID" = v_card
    and "Scan_At" > now() - interval '1 day';
  if v_recent_count >= 120 or v_daily_count >= 5000 then
    raise exception 'This contact card is receiving too many requests. Try again later.' using errcode = 'P0001';
  end if;

  insert into public."CRM_ContactCardScans" (
    "ContactCard_ID", "Scan_Device", "Scan_Browser", "Scan_Channel", "Scan_Country", "Scan_Region"
  ) values (
    v_card,
    case when p_device in ('mobile', 'tablet', 'desktop') then p_device else 'desktop' end,
    left(coalesce(p_browser, 'Other'), 80),
    case when p_channel in ('direct-scan', 'shared-link', 'in-app-browser', 'unknown') then p_channel else 'unknown' end,
    left(coalesce(p_country, ''), 80),
    left(coalesce(p_region, ''), 80)
  ) returning "Scan_ID" into v_scan;
  return v_scan;
end;
$$;

-- Every submission must consume one recent scan exactly once. It always creates
-- a separate lead for operator review, so an anonymous visitor can never update
-- an existing CRM record merely by knowing its email address.
create or replace function public.multideck_contact_card_submit_exchange(p_slug text, p_scan_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_card record;
  v_scan record;
  v_email text;
  v_lead uuid;
  v_exchange uuid;
  v_run uuid;
  v_run_status text;
  v_recent_count integer;
  v_daily_count integer;
begin
  select * into v_card
  from public."CRM_ContactCards"
  where "ContactCard_Slug" = lower(btrim(p_slug))
    and "ContactCard_Status" = 'published'
    and "ContactCard_DeletedAt" is null
  limit 1;
  if not found then raise exception 'This contact card is not active.' using errcode = 'P0002'; end if;
  if p_scan_id is null then raise exception 'Reload this contact card before submitting.' using errcode = '22023'; end if;

  select * into v_scan
  from public."CRM_ContactCardScans"
  where "Scan_ID" = p_scan_id
    and "ContactCard_ID" = v_card."ContactCard_ID"
    and "Scan_At" > now() - interval '24 hours'
    and "Scan_ExchangedAt" is null
  for update;
  if not found then raise exception 'This contact-card submission has expired. Reload the card and try again.' using errcode = '22023'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_card."ContactCard_ID"::text, 773));
  select
    count(*) filter (where "Exchange_At" > now() - interval '10 minutes'),
    count(*) filter (where "Exchange_At" > now() - interval '1 day')
  into v_recent_count, v_daily_count
  from public."CRM_ContactCardExchanges"
  where "ContactCard_ID" = v_card."ContactCard_ID"
    and "Exchange_At" > now() - interval '1 day';
  if v_recent_count >= 20 or v_daily_count >= 500 then
    raise exception 'This contact card is receiving too many submissions. Try again later.' using errcode = 'P0001';
  end if;

  v_email := lower(btrim(p_input ->> 'email'));
  if coalesce(v_email, '') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if btrim(coalesce(p_input ->> 'firstName', '')) = ''
     or btrim(coalesce(p_input ->> 'lastName', '')) = ''
     or btrim(coalesce(p_input ->> 'company', '')) = '' then
    raise exception 'Enter a first name, last name and company.' using errcode = '22023';
  end if;

  insert into public."CRM_Leads" (
    "CRMLead_SourceCode", "CRMLead_StatusCode", "CRMLead_RatingCode", "CRMLead_OwnerUserID",
    "CRMLead_CompanyName", "CRMLead_PersonName", "CRMLead_Email", "CRMLead_Phone",
    "CRMLead_MetadataJSON", "CRMLead_CreatedBy", "CRMLead_UpdatedBy"
  ) values (
    'website', 'new', 'unrated', v_card."Owner_User_ID",
    left(btrim(p_input ->> 'company'), 255),
    left(btrim(concat_ws(' ', p_input ->> 'firstName', p_input ->> 'lastName')), 255),
    left(v_email, 255), left(coalesce(p_input ->> 'phone', ''), 80),
    jsonb_build_object(
      'contactCardId', v_card."ContactCard_ID",
      'contactCardSlug', v_card."ContactCard_Slug",
      'leadSource', v_card."ContactCard_LeadSource",
      'marketingConsent', coalesce((p_input ->> 'marketingConsent')::boolean, false)
    ),
    v_card."Owner_User_ID", v_card."Owner_User_ID"
  ) returning "CRMLead_ID" into v_lead;

  perform private.apply_contact_card_crm_field_mappings(v_card."ContactCard_ID", v_lead, p_input);
  insert into public."CRM_ContactCardExchanges" (
    "ContactCard_ID", "Scan_ID", "CRMLead_ID", "Exchange_FirstName", "Exchange_LastName",
    "Exchange_Email", "Exchange_Company", "Exchange_Phone", "Exchange_MarketingConsent",
    "Exchange_Outcome", "Exchange_AutomationOutcome", "Exchange_AutomationDetail"
  ) values (
    v_card."ContactCard_ID", p_scan_id, v_lead,
    btrim(p_input ->> 'firstName'), btrim(p_input ->> 'lastName'), v_email,
    btrim(p_input ->> 'company'), btrim(coalesce(p_input ->> 'phone', '')),
    coalesce((p_input ->> 'marketingConsent')::boolean, false),
    'created', 'none', 'CRM mapping pending.'
  ) returning "Exchange_ID" into v_exchange;

  v_run := public._multideck_contact_card_execute_automation(
    v_card."ContactCard_ID", v_exchange, v_lead, p_input, false, false, null, 0
  );
  select "AutomationRun_Status" into v_run_status
  from public."CRM_ContactCardAutomationRuns"
  where "AutomationRun_ID" = v_run;
  v_run_status := coalesce(v_run_status, 'skipped');

  update public."CRM_ContactCardExchanges"
  set
    "Exchange_AutomationOutcome" = case
      when v_run_status = 'succeeded' then 'ran'
      when v_run_status = 'failed' then 'failed'
      when v_run_status = 'skipped' then 'skipped'
      else 'none'
    end,
    "Exchange_AutomationDetail" = case
      when v_run_status = 'succeeded' then 'New CRM lead created.'
      when v_run_status = 'failed' then 'A CRM step failed. The new lead and submitted input were preserved for review.'
      when v_run_status = 'skipped' then 'The new CRM lead was created; optional automation was inactive.'
      else 'New CRM lead created.'
    end
  where "Exchange_ID" = v_exchange;

  update public."CRM_ContactCardScans"
  set "Scan_StartedAt" = coalesce("Scan_StartedAt", now()), "Scan_ExchangedAt" = now()
  where "Scan_ID" = p_scan_id and "ContactCard_ID" = v_card."ContactCard_ID";

  return jsonb_build_object('outcome', 'created', 'automationOutcome', v_run_status);
end;
$$;

update public."CRM_ContactCardAutomationActions"
set "Action_Config" = jsonb_set(
  jsonb_set(coalesce("Action_Config", '{}'::jsonb), '{duplicateHandling}', '"create"'::jsonb, true),
  '{recordType}', '"lead"'::jsonb, true
)
where "Action_Kind" = 'add-to-crm';

-- Persist the always-approve policy with the action registry. The runtime also
-- checks this before execution; this trigger prevents an alternate privileged
-- writer from preparing either action in Full access.
alter table public."sys_AIDexterActions"
  add column if not exists "AIDexterAction_AlwaysRequiresApproval" boolean not null default false;

alter table public."AI_DexterPreparedActions"
  add column if not exists "AIDexterPrepared_ApprovedAt" timestamptz;

update public."sys_AIDexterActions"
set "AIDexterAction_AlwaysRequiresApproval" = true
where "AIDexterAction_Code" in ('create_purchase_order', 'create_support_ticket');

create or replace function private.multideck_dexter_action_target_ids(p_value jsonb)
returns setof uuid
language plpgsql
immutable
security invoker
set search_path = pg_catalog, private
as $$
declare
  v_key text;
  v_item jsonb;
  v_array_item jsonb;
  v_text text;
begin
  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_item in select key, value from jsonb_each(p_value)
    loop
      if v_key ~* '(^|_)(id|ids)$' or v_key ~ '(Id|Ids)$' then
        if jsonb_typeof(v_item) = 'string' then
          v_text := trim(both '"' from v_item::text);
          if v_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
            return next v_text::uuid;
          end if;
        elsif jsonb_typeof(v_item) = 'array' then
          for v_array_item in select value from jsonb_array_elements(v_item)
          loop
            if jsonb_typeof(v_array_item) = 'string' then
              v_text := trim(both '"' from v_array_item::text);
              if v_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
                return next v_text::uuid;
              end if;
            end if;
          end loop;
        end if;
      end if;
      if jsonb_typeof(v_item) in ('object', 'array') then
        return query select * from private.multideck_dexter_action_target_ids(v_item);
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_item in select value from jsonb_array_elements(p_value)
    loop
      if jsonb_typeof(v_item) in ('object', 'array') then
        return query select * from private.multideck_dexter_action_target_ids(v_item);
      end if;
    end loop;
  end if;
end;
$$;

revoke all on function private.multideck_dexter_action_target_ids(jsonb) from public, anon, authenticated;

create or replace function private.multideck_dexter_guard_prepared_action()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_intent record;
  v_always_approve boolean := false;
  v_target uuid;
begin
  select coalesce(action."AIDexterAction_AlwaysRequiresApproval", false)
  into v_always_approve
  from public."sys_AIDexterActions" action
  where action."AIDexterAction_Code" = new."AIDexterPrepared_ActionCode";
  v_always_approve := coalesce(v_always_approve, false)
    or new."AIDexterPrepared_ActionCode" in ('create_purchase_order', 'create_support_ticket');

  select * into v_intent
  from public."AI_DexterIntentPlans" intent
  where intent."AIDexterIntent_ID" = new."AIDexterPrepared_IntentID"
    and intent."AIDexterIntent_CompanyID" = new."AIDexterPrepared_CompanyID"
    and intent."AIDexterIntent_UserID" = new."AIDexterPrepared_UserID"
    and intent."AIDexterIntent_AccessMode" = new."AIDexterPrepared_AccessMode"
    and intent."AIDexterIntent_ExpiresAt" > now()
    and intent."AIDexterIntent_AllowedActionsJSON" ? new."AIDexterPrepared_ActionCode";
  if not found then raise exception 'Dexter action is outside the current operator intent.' using errcode = '42501'; end if;

  if new."AIDexterPrepared_AccessMode" = 'full'
     and not v_always_approve
     and new."AIDexterPrepared_ActionCode" not in ('create_email_draft', 'send_email') then
    for v_target in
      select distinct target_id
      from private.multideck_dexter_action_target_ids(new."AIDexterPrepared_ArgumentsJSON") as targets(target_id)
    loop
      if not (coalesce(v_intent."AIDexterIntent_TargetConstraintsJSON", '[]'::jsonb) ? v_target::text) then
        raise exception 'Dexter action target is outside the current operator intent.' using errcode = '42501';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function private.multideck_dexter_guard_prepared_action() from public, anon, authenticated;
drop trigger if exists "TR_AI_DexterPreparedActions_intent_guard" on public."AI_DexterPreparedActions";
create trigger "TR_AI_DexterPreparedActions_intent_guard"
before insert or update of
  "AIDexterPrepared_ArgumentsJSON", "AIDexterPrepared_IntentID", "AIDexterPrepared_ActionCode",
  "AIDexterPrepared_AccessMode", "AIDexterPrepared_CompanyID", "AIDexterPrepared_UserID"
on public."AI_DexterPreparedActions"
for each row execute function private.multideck_dexter_guard_prepared_action();

create or replace function public.multideck_dexter_approve_prepared_action(
  p_prepared_action_id uuid,
  p_company_id uuid,
  p_user_id uuid,
  p_conversation_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'server_only' using errcode = '42501';
  end if;
  update public."AI_DexterPreparedActions"
  set "AIDexterPrepared_ApprovedAt" = now()
  where "AIDexterPrepared_ID" = p_prepared_action_id
    and "AIDexterPrepared_CompanyID" = p_company_id
    and "AIDexterPrepared_UserID" = p_user_id
    and "AIDexterPrepared_ConversationID" is not distinct from p_conversation_id
    and "AIDexterPrepared_Status" = 'prepared'
    and "AIDexterPrepared_ExpiresAt" > now();
  return found;
end;
$$;

revoke all on function public.multideck_dexter_approve_prepared_action(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.multideck_dexter_approve_prepared_action(uuid, uuid, uuid, uuid) to service_role;

create or replace function private.multideck_dexter_guard_mandatory_approval()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if old."AIDexterPrepared_Status" = 'prepared'
     and new."AIDexterPrepared_Status" = 'executing'
     and new."AIDexterPrepared_ApprovedAt" is null
     and (
       new."AIDexterPrepared_ActionCode" in ('create_purchase_order', 'create_support_ticket')
       or exists (
         select 1
         from public."sys_AIDexterActions" action
         where action."AIDexterAction_Code" = new."AIDexterPrepared_ActionCode"
           and action."AIDexterAction_AlwaysRequiresApproval"
       )
     ) then
    raise exception 'This Dexter action requires explicit operator approval.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.multideck_dexter_guard_mandatory_approval() from public, anon, authenticated;
drop trigger if exists "TR_AI_DexterPreparedActions_mandatory_approval" on public."AI_DexterPreparedActions";
create trigger "TR_AI_DexterPreparedActions_mandatory_approval"
before update of "AIDexterPrepared_Status" on public."AI_DexterPreparedActions"
for each row execute function private.multideck_dexter_guard_mandatory_approval();

commit;
