begin;

alter table quote_api.reference_settings
  add column if not exists quote_follow_up_enabled boolean not null default true,
  add column if not exists quote_follow_up_delay_days smallint not null default 3,
  add column if not exists quote_follow_up_send_time time without time zone not null default time '09:00',
  add column if not exists quote_follow_up_timezone text not null default 'Europe/London';

alter table quote_api.reference_settings
  drop constraint if exists reference_settings_quote_follow_up_delay_check;
alter table quote_api.reference_settings
  add constraint reference_settings_quote_follow_up_delay_check
  check (quote_follow_up_delay_days between 1 and 30);

alter table quote_api.customer_response_links
  add column if not exists delivery_mailbox_id uuid references public."Comm_Mailboxes"("CommMailbox_ID") on delete set null,
  add column if not exists follow_up_status_code varchar(30) not null default 'not_scheduled',
  add column if not exists follow_up_attempt_count smallint not null default 0,
  add column if not exists follow_up_next_attempt_at timestamptz,
  add column if not exists follow_up_sent_at timestamptz,
  add column if not exists follow_up_delivery_provider_id text,
  add column if not exists follow_up_error text,
  add column if not exists follow_up_lease_token uuid,
  add column if not exists follow_up_lease_expires_at timestamptz;

alter table quote_api.customer_response_links
  drop constraint if exists customer_response_links_follow_up_status_check,
  drop constraint if exists customer_response_links_follow_up_attempt_check;
alter table quote_api.customer_response_links
  add constraint customer_response_links_follow_up_status_check
    check (follow_up_status_code in ('not_scheduled','pending','processing','retryable','sent','cancelled','failed')),
  add constraint customer_response_links_follow_up_attempt_check
    check (follow_up_attempt_count between 0 and 3);

create index if not exists customer_response_links_follow_up_due_idx
  on quote_api.customer_response_links (follow_up_next_attempt_at, created_at)
  where follow_up_status_code in ('pending','retryable');

create or replace function public.quote_workflow_get_follow_up_settings(caller_auth_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  company_id_value uuid;
  settings_row quote_api.reference_settings%rowtype;
begin
  select app_user."Company_ID" into company_id_value
  from public."cmp_Users" app_user
  where app_user."Auth_User_ID" = caller_auth_user_id
    and app_user."User_AccessStatus" = 'active';
  if company_id_value is null then
    raise exception 'User identity is incomplete.' using errcode = '42501';
  end if;
  select * into settings_row from quote_api.reference_settings where company_id = company_id_value;
  return jsonb_build_object(
    'enabled', coalesce(settings_row.quote_follow_up_enabled, true),
    'defaultDelayDays', coalesce(settings_row.quote_follow_up_delay_days, 3),
    'sendTime', to_char(coalesce(settings_row.quote_follow_up_send_time, time '09:00'), 'HH24:MI'),
    'timezone', coalesce(settings_row.quote_follow_up_timezone, 'Europe/London')
  );
end;
$$;

create or replace function public.quote_workflow_save_follow_up_settings(
  caller_auth_user_id uuid,
  requested_enabled boolean,
  requested_default_delay_days integer,
  requested_send_time time without time zone,
  requested_timezone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_id_value uuid;
  user_id_value uuid;
  timezone_value text := nullif(btrim(requested_timezone), '');
  before_value jsonb;
  after_value jsonb;
begin
  select app_user."User_ID", app_user."Company_ID" into user_id_value, company_id_value
  from public."cmp_Users" app_user
  where app_user."Auth_User_ID" = caller_auth_user_id
    and app_user."User_AccessStatus" = 'active';
  if company_id_value is null then
    raise exception 'User identity is incomplete.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public."cmp_Users_Roles" link
    join public."sys_UserRoles" role on role."sys_UserRole_ID" = link."sys_UserRole_ID"
    where link."User_ID" = user_id_value
      and lower(role."sys_UserRole_Name") in ('administrator', 'company admin')
  ) then
    raise exception 'Only tenant administrators can change quote follow-up policy.' using errcode = '42501';
  end if;
  if requested_default_delay_days not between 1 and 30 then
    raise exception 'Quote follow-up timing must be between 1 and 30 days.' using errcode = '22023';
  end if;
  if timezone_value is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = timezone_value) then
    raise exception 'Choose a recognised quote follow-up timezone.' using errcode = '22023';
  end if;

  before_value := public.quote_workflow_get_follow_up_settings(caller_auth_user_id);
  insert into quote_api.reference_settings (
    company_id, quote_follow_up_enabled, quote_follow_up_delay_days,
    quote_follow_up_send_time, quote_follow_up_timezone, updated_at, updated_by
  ) values (
    company_id_value, coalesce(requested_enabled, true), requested_default_delay_days,
    coalesce(requested_send_time, time '09:00'), timezone_value, now(), user_id_value
  )
  on conflict (company_id) do update set
    quote_follow_up_enabled = excluded.quote_follow_up_enabled,
    quote_follow_up_delay_days = excluded.quote_follow_up_delay_days,
    quote_follow_up_send_time = excluded.quote_follow_up_send_time,
    quote_follow_up_timezone = excluded.quote_follow_up_timezone,
    updated_at = now(),
    updated_by = excluded.updated_by;
  after_value := public.quote_workflow_get_follow_up_settings(caller_auth_user_id);

  if after_value is distinct from before_value then
    insert into public."AI_DexterWatchSignals" (
      "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode",
      "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID",
      "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
    ) values (
      company_id_value, 'quote_follow_up_policy', 'quote_api.reference_settings', company_id_value,
      before_value, after_value
    );
  end if;
  return after_value;
end;
$$;

create or replace function quote_api.follow_up_due_at(
  sent_at timestamptz,
  delay_days integer,
  send_time time without time zone,
  timezone_name text
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((((sent_at at time zone timezone_name)::date + greatest(delay_days, 1)) + send_time) at time zone timezone_name)
$$;

create or replace function quote_api.schedule_customer_follow_up(requested_response_link_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  link_row quote_api.customer_response_links%rowtype;
  quote_row public."CusQuote_Header"%rowtype;
  settings_row quote_api.reference_settings%rowtype;
  payer_org_id uuid;
  payer_metadata jsonb := '{}'::jsonb;
  allow_follow_up boolean := true;
  minimum_hours integer := 24;
  delay_days integer;
  due_at timestamptz;
begin
  select * into link_row from quote_api.customer_response_links
  where response_link_id = requested_response_link_id for update;
  if not found then raise exception 'That quote response link could not be found.' using errcode = 'P0002'; end if;
  select * into quote_row from public."CusQuote_Header"
  where "CusQuoteHeader_ID" = link_row.quote_id and not "CusQuoteHeader_IsDeleted";
  if not found then return null; end if;
  select * into settings_row from quote_api.reference_settings where company_id = link_row.company_id;
  select coalesce(party."CusQuoteParty_OrgID", quote_row."CusQuoteHeader_CustomerID") into payer_org_id
  from (select 1) seed
  left join public."CusQuote_Parties" party
    on party."CusQuoteHeader_ID" = link_row.quote_id
   and party."CusQuoteParty_RoleCode" = 'payer'
  limit 1;
  select coalesce(profile."CRMAccount_MetadataJSON", '{}'::jsonb) into payer_metadata
  from public."CRM_AccountProfiles" profile
  where profile."CRMAccount_OrgID" = payer_org_id;
  select coalesce(preference."CRMCustEngPref_AllowFollowupMessages", true),
         greatest(0, coalesce(preference."CRMCustEngPref_MinHoursBetweenNonUrgentMessages", 24))
    into allow_follow_up, minimum_hours
  from (select 1) seed
  left join public."CRM_CustomerEngagementPreferences" preference
    on preference."CRMCustEngPref_CustomerOrgID" = payer_org_id
  limit 1;

  if not coalesce(settings_row.quote_follow_up_enabled, true)
     or not coalesce(allow_follow_up, true)
     or link_row.delivery_mailbox_id is null
     or link_row.delivery_provider_id is null then
    update quote_api.customer_response_links set
      follow_up_status_code = 'not_scheduled', follow_up_next_attempt_at = null,
      follow_up_error = case
        when not coalesce(allow_follow_up, true) then 'Customer follow-up messages are disabled.'
        when link_row.delivery_mailbox_id is null or link_row.delivery_provider_id is null then 'The sending mailbox could not be resolved.'
        else null
      end
    where response_link_id = requested_response_link_id;
    update public."CusQuote_Header" set "CusQuoteHeader_FollowUpAt" = null
    where "CusQuoteHeader_ID" = link_row.quote_id;
    return null;
  end if;

  delay_days := case
    when payer_metadata #>> '{quoteTerms,followUpDays}' ~ '^[0-9]+$'
      then least(30, greatest(1, (payer_metadata #>> '{quoteTerms,followUpDays}')::integer))
    else coalesce(settings_row.quote_follow_up_delay_days, 3)
  end;
  due_at := greatest(
    quote_api.follow_up_due_at(
      link_row.created_at, delay_days,
      coalesce(settings_row.quote_follow_up_send_time, time '09:00'),
      coalesce(settings_row.quote_follow_up_timezone, 'Europe/London')
    ),
    link_row.created_at + make_interval(hours => minimum_hours)
  );
  update quote_api.customer_response_links set
    follow_up_status_code = 'pending', follow_up_attempt_count = 0,
    follow_up_next_attempt_at = due_at, follow_up_sent_at = null,
    follow_up_delivery_provider_id = null, follow_up_error = null,
    follow_up_lease_token = null, follow_up_lease_expires_at = null
  where response_link_id = requested_response_link_id;
  update public."CusQuote_Header" set "CusQuoteHeader_FollowUpAt" = due_at
  where "CusQuoteHeader_ID" = link_row.quote_id;
  return due_at;
end;
$$;

alter function public.quote_workflow_finalize_customer_response_v4(uuid, text)
  rename to quote_workflow_finalize_customer_response_pre_fu_20260904;

create or replace function public.quote_workflow_finalize_customer_response_v4(
  requested_response_link_id uuid,
  requested_provider_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  follow_up_at timestamptz;
begin
  result := public.quote_workflow_finalize_customer_response_pre_fu_20260904(
    requested_response_link_id, requested_provider_id
  );
  follow_up_at := quote_api.schedule_customer_follow_up(requested_response_link_id);
  return result || jsonb_strip_nulls(jsonb_build_object('followUpAt', follow_up_at));
end;
$$;

create or replace function public.quote_workflow_claim_due_follow_ups(
  requested_lease_token uuid,
  requested_limit integer default 2
)
returns table (
  response_link_id uuid,
  company_id uuid,
  quote_id uuid,
  quote_reference text,
  recipient_name text,
  mailbox_id uuid,
  source_message_id uuid,
  actor_user_id uuid,
  actor_auth_user_id uuid,
  actor_email text,
  actor_first_name text,
  actor_last_name text,
  attempt_number integer
)
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select link.response_link_id
    from quote_api.customer_response_links link
    join public."CusQuote_Header" quote on quote."CusQuoteHeader_ID" = link.quote_id
    join public."cmp_Users" actor on actor."User_ID" = link.created_by
    where link.follow_up_status_code in ('pending','retryable','processing')
      and link.follow_up_next_attempt_at <= now()
      and (link.follow_up_lease_expires_at is null or link.follow_up_lease_expires_at <= now())
      and link.delivery_status_code = 'sent'
      and quote."CusQuoteHeader_LifecycleCode" = 'sent'
      and not quote."CusQuoteHeader_IsDeleted"
      and actor."User_AccessStatus" = 'active'
      and actor."Company_ID" = link.company_id
      and link.delivery_mailbox_id is not null
      and link.delivery_provider_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and not exists (select 1 from quote_api.customer_responses response where response.response_link_id = link.response_link_id)
      and not exists (
        select 1 from quote_api.customer_response_links newer
        where newer.quote_id = link.quote_id and newer.delivery_status_code = 'sent' and newer.created_at > link.created_at
      )
    order by link.follow_up_next_attempt_at, link.created_at
    for update of link skip locked
    limit least(greatest(coalesce(requested_limit, 2), 1), 10)
  ), claimed as (
    update quote_api.customer_response_links link set
      follow_up_status_code = 'processing',
      follow_up_attempt_count = least(3, link.follow_up_attempt_count + case when link.follow_up_status_code = 'processing' then 0 else 1 end),
      follow_up_lease_token = requested_lease_token,
      follow_up_lease_expires_at = now() + interval '5 minutes'
    from candidates
    where link.response_link_id = candidates.response_link_id
    returning link.*
  )
  select claimed.response_link_id, claimed.company_id, claimed.quote_id,
    coalesce(quote."CusQuoteHeader_CustomerReference", 'Quote')::text,
    claimed.recipient_name::text, claimed.delivery_mailbox_id, claimed.delivery_provider_id::uuid,
    actor."User_ID", actor."Auth_User_ID", actor."User_Email"::text,
    actor."User_Firstname"::text, actor."User_Lastname"::text,
    claimed.follow_up_attempt_count::integer
  from claimed
  join public."CusQuote_Header" quote on quote."CusQuoteHeader_ID" = claimed.quote_id
  join public."cmp_Users" actor on actor."User_ID" = claimed.created_by;
$$;

create or replace function public.quote_workflow_finish_follow_up(
  requested_response_link_id uuid,
  requested_lease_token uuid,
  requested_sent boolean,
  requested_provider_id text default null,
  requested_error text default null,
  requested_retryable boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  link_row quote_api.customer_response_links%rowtype;
  terminal_failure boolean;
begin
  select * into link_row from quote_api.customer_response_links
  where response_link_id = requested_response_link_id
    and follow_up_status_code = 'processing'
    and follow_up_lease_token = requested_lease_token
  for update;
  if not found then return false; end if;

  if requested_sent then
    update quote_api.customer_response_links set
      follow_up_status_code = 'sent', follow_up_sent_at = now(), follow_up_next_attempt_at = null,
      follow_up_delivery_provider_id = left(nullif(btrim(requested_provider_id), ''), 180),
      follow_up_error = null, follow_up_lease_token = null, follow_up_lease_expires_at = null
    where response_link_id = requested_response_link_id;
    update public."CusQuote_Header" set "CusQuoteHeader_FollowUpAt" = null,
      "CusQuoteHeader_LastEditedDate" = now()
    where "CusQuoteHeader_ID" = link_row.quote_id;
    insert into public."CusQuote_Events" (
      "Company_ID", "CusQuoteHeader_ID", "CusQuoteVersion_ID", "CusQuoteEvent_TypeCode",
      "CusQuoteEvent_Summary", "CusQuoteEvent_MetadataJSON", "CusQuoteEvent_ActorUserID"
    ) values (
      link_row.company_id, link_row.quote_id, link_row.quote_version_id, 'customer_follow_up_sent',
      'Automatic quote follow-up sent.',
      jsonb_build_object('responseLinkId', link_row.response_link_id, 'recipientEmail', link_row.recipient_email, 'attempt', link_row.follow_up_attempt_count),
      link_row.created_by
    );
    return true;
  end if;

  terminal_failure := not coalesce(requested_retryable, false) or link_row.follow_up_attempt_count >= 3;
  update quote_api.customer_response_links set
    follow_up_status_code = case when terminal_failure then 'failed' else 'retryable' end,
    follow_up_next_attempt_at = case when terminal_failure then null else now() + case link_row.follow_up_attempt_count when 1 then interval '15 minutes' else interval '1 hour' end end,
    follow_up_error = left(coalesce(nullif(btrim(requested_error), ''), 'Quote follow-up delivery failed.'), 2000),
    follow_up_lease_token = null, follow_up_lease_expires_at = null
  where response_link_id = requested_response_link_id;
  if terminal_failure then
    insert into public."CusQuote_Events" (
      "Company_ID", "CusQuoteHeader_ID", "CusQuoteVersion_ID", "CusQuoteEvent_TypeCode",
      "CusQuoteEvent_Summary", "CusQuoteEvent_MetadataJSON", "CusQuoteEvent_ActorUserID"
    ) values (
      link_row.company_id, link_row.quote_id, link_row.quote_version_id, 'customer_follow_up_failed',
      'Automatic quote follow-up needs manual attention.',
      jsonb_build_object('responseLinkId', link_row.response_link_id, 'recipientEmail', link_row.recipient_email, 'attempts', link_row.follow_up_attempt_count, 'message', left(coalesce(requested_error, ''), 1000)),
      link_row.created_by
    );
  end if;
  return true;
end;
$$;

create or replace function public._multideck_dexter_quote_delivery_watch_source_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  quote_reference text;
  old_json jsonb;
  new_json jsonb;
begin
  if old.follow_up_status_code is distinct from new.follow_up_status_code
     and new.follow_up_status_code = 'processing'
     and old.delivery_status_code is not distinct from new.delivery_status_code
     and old.follow_up_next_attempt_at is not distinct from new.follow_up_next_attempt_at then
    return new;
  end if;
  select "CusQuoteHeader_CustomerReference" into quote_reference
  from public."CusQuote_Header" where "CusQuoteHeader_ID" = new.quote_id;
  old_json := jsonb_build_object(
    'quoteNumber', quote_reference, 'deliveryMode', old.delivery_mode_code,
    'responseControlsEnabled', old.delivery_mode_code = 'standard', 'recipientSource', old.recipient_source_code,
    'recipientEmail', old.recipient_email, 'quoteDocumentId', old.quote_document_id,
    'deliveryStatus', old.delivery_status_code, 'followUpStatus', old.follow_up_status_code,
    'followUpAt', old.follow_up_next_attempt_at
  );
  new_json := jsonb_build_object(
    'quoteNumber', quote_reference, 'deliveryMode', new.delivery_mode_code,
    'responseControlsEnabled', new.delivery_mode_code = 'standard', 'recipientSource', new.recipient_source_code,
    'recipientEmail', new.recipient_email, 'quoteDocumentId', new.quote_document_id,
    'deliveryStatus', new.delivery_status_code, 'followUpStatus', new.follow_up_status_code,
    'followUpAt', new.follow_up_next_attempt_at
  );
  if old_json is distinct from new_json and exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = new.company_id
      and watch."AIDexterWatch_CapabilityCode" = 'quotes'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = new.quote_id)
  ) then
    insert into public."AI_DexterWatchSignals" (
      "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode",
      "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID",
      "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
    ) values (new.company_id, 'quotes', 'quote_api.customer_response_links', new.quote_id, old_json, new_json);
  end if;
  return new;
end;
$$;

drop trigger if exists customer_response_links_dexter_watch on quote_api.customer_response_links;
create trigger customer_response_links_dexter_watch
after update of delivery_status_code, follow_up_status_code, follow_up_next_attempt_at on quote_api.customer_response_links
for each row when (
  old.delivery_status_code is distinct from new.delivery_status_code
  or old.follow_up_status_code is distinct from new.follow_up_status_code
  or old.follow_up_next_attempt_at is distinct from new.follow_up_next_attempt_at
)
execute function public._multideck_dexter_quote_delivery_watch_source_change();

alter function public.multideck_dexter_domain_quotes(uuid, text, integer)
  rename to multideck_dexter_domain_quotes_pre_followup_20260904;

create or replace function public.multideck_dexter_domain_quotes(p_company_id uuid, p_search text, p_take integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    item.value || jsonb_strip_nulls(jsonb_build_object(
      'followUpDelivery', case when latest.response_link_id is null then null else jsonb_strip_nulls(jsonb_build_object(
        'status', latest.follow_up_status_code,
        'scheduledAt', latest.follow_up_next_attempt_at,
        'sentAt', latest.follow_up_sent_at,
        'attempts', latest.follow_up_attempt_count,
        'needsAttention', latest.follow_up_status_code = 'failed',
        'evidence', jsonb_build_object('sourceTable', 'quote_api.customer_response_links', 'sourceId', latest.response_link_id)
      )) end
    )) order by item.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(
    public.multideck_dexter_domain_quotes_pre_followup_20260904(p_company_id, p_search, p_take)
  ) with ordinality item(value, ordinality)
  left join lateral (
    select link.response_link_id, link.follow_up_status_code, link.follow_up_next_attempt_at,
      link.follow_up_sent_at, link.follow_up_attempt_count
    from quote_api.customer_response_links link
    where link.quote_id = nullif(item.value->>'recordId', '')::uuid
    order by link.created_at desc limit 1
  ) latest on true;
$$;

create or replace function public.multideck_dexter_domain_quote_follow_up_policy(p_company_id uuid, p_search text, p_take integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_array(jsonb_build_object(
    'recordId', p_company_id, 'name', 'Quote follow-up policy',
    'enabled', coalesce(settings.quote_follow_up_enabled, true),
    'defaultDelayDays', coalesce(settings.quote_follow_up_delay_days, 3),
    'sendTime', to_char(coalesce(settings.quote_follow_up_send_time, time '09:00'), 'HH24:MI'),
    'timezone', coalesce(settings.quote_follow_up_timezone, 'Europe/London'),
    'updatedAt', settings.updated_at
  ))
  from (select 1) seed
  left join quote_api.reference_settings settings on settings.company_id = p_company_id;
$$;

create or replace function public.multideck_dexter_action_update_quote_follow_up_policy(
  p_company_id uuid, p_user_id uuid, p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_auth_id uuid;
begin
  select app_user."Auth_User_ID" into actor_auth_id
  from public."cmp_Users" app_user
  where app_user."User_ID" = p_user_id and app_user."Company_ID" = p_company_id
    and app_user."User_AccessStatus" = 'active';
  if actor_auth_id is null then raise exception 'User identity is incomplete.' using errcode = '42501'; end if;
  return public.quote_workflow_save_follow_up_settings(
    actor_auth_id,
    coalesce((p_arguments->>'enabled')::boolean, true),
    (p_arguments->>'default_delay_days')::integer,
    (p_arguments->>'send_time')::time,
    p_arguments->>'timezone'
  );
end;
$$;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code", "AIDexterDomain_Name", "AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction", "AIDexterDomain_SortOrder", "AIDexterDomain_IsActive", "AIDexterDomain_UpdatedAt"
) values (
  'quote_follow_up_policy', 'Quote follow-up policy',
  'Administrator-controlled timing for one automatic reminder on submitted quotes. Customer account preferences and per-customer delays can suppress or override the company default.',
  'multideck_dexter_domain_quote_follow_up_policy', 96, true, now()
)
on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name" = excluded."AIDexterDomain_Name",
  "AIDexterDomain_Description" = excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction" = excluded."AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder" = excluded."AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive" = true, "AIDexterDomain_UpdatedAt" = now();

insert into public."sys_AIDexterWatchCapabilities" (
  "AIDexterWatchCapability_Code", "AIDexterWatchCapability_Name", "AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON", "AIDexterWatchCapability_IsActive", "AIDexterWatchCapability_SortOrder",
  "AIDexterWatchCapability_UpdatedAt", "AIDexterWatchCapability_RequiredPermissionsJSON"
) values (
  'quote_follow_up_policy', 'Quote follow-up policy',
  'Event-driven changes to the company quote follow-up policy. Ordinary due-time checks are deterministic and do not call an LLM.',
  '["enabled","defaultDelayDays","sendTime","timezone"]'::jsonb, true, 96, now(), '["AgentDexter.Manage"]'::jsonb
)
on conflict ("AIDexterWatchCapability_Code") do update set
  "AIDexterWatchCapability_Name" = excluded."AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description" = excluded."AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON" = excluded."AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_IsActive" = true,
  "AIDexterWatchCapability_SortOrder" = excluded."AIDexterWatchCapability_SortOrder",
  "AIDexterWatchCapability_UpdatedAt" = now(),
  "AIDexterWatchCapability_RequiredPermissionsJSON" = excluded."AIDexterWatchCapability_RequiredPermissionsJSON";

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code", "AIDexterAction_DomainCode", "AIDexterAction_Name", "AIDexterAction_Description",
  "AIDexterAction_Function", "AIDexterAction_ParametersJSON", "AIDexterAction_SortOrder",
  "AIDexterAction_IsActive", "AIDexterAction_UpdatedAt", "AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_IntentFamily", "AIDexterAction_ScopeStrategy", "AIDexterAction_HasExternalEffect"
) values (
  'update_quote_follow_up_policy', 'quote_follow_up_policy', 'Update quote follow-up policy',
  'Propose an administrator-reviewed change to the company default for automatic quote reminders.',
  'multideck_dexter_action_update_quote_follow_up_policy',
  '{"type":"object","properties":{"enabled":{"type":"boolean"},"default_delay_days":{"type":"integer","minimum":1,"maximum":30},"send_time":{"type":"string"},"timezone":{"type":"string"},"reason":{"type":"string"}},"required":["enabled","default_delay_days","send_time","timezone","reason"],"additionalProperties":false}'::jsonb,
  196, true, now(), '["AgentDexter.Manage"]'::jsonb, 'quote_follow_up_policy', 'canonical', true
)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode" = excluded."AIDexterAction_DomainCode",
  "AIDexterAction_Name" = excluded."AIDexterAction_Name",
  "AIDexterAction_Description" = excluded."AIDexterAction_Description",
  "AIDexterAction_Function" = excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON" = excluded."AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder" = excluded."AIDexterAction_SortOrder",
  "AIDexterAction_IsActive" = true, "AIDexterAction_UpdatedAt" = now(),
  "AIDexterAction_RequiredPermissionsJSON" = excluded."AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_IntentFamily" = excluded."AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy" = excluded."AIDexterAction_ScopeStrategy",
  "AIDexterAction_HasExternalEffect" = excluded."AIDexterAction_HasExternalEffect";

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description" = 'Customer quote versions, response evidence, routing, commercial evidence, copy provenance, bill-to payer and deterministic automatic follow-up delivery evidence.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'quotes';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description" = 'Event-driven quote lifecycle, ETD, ETA, validity, payer, customer response, delivery and automatic follow-up status changes.',
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'quotes';

revoke all on function public.quote_workflow_get_follow_up_settings(uuid) from public, anon, authenticated;
revoke all on function public.quote_workflow_save_follow_up_settings(uuid, boolean, integer, time without time zone, text) from public, anon, authenticated;
revoke all on function public.quote_workflow_claim_due_follow_ups(uuid, integer) from public, anon, authenticated;
revoke all on function public.quote_workflow_finish_follow_up(uuid, uuid, boolean, text, text, boolean) from public, anon, authenticated;
revoke all on function public.quote_workflow_finalize_customer_response_pre_fu_20260904(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.multideck_dexter_domain_quotes_pre_followup_20260904(uuid, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.multideck_dexter_domain_quote_follow_up_policy(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_update_quote_follow_up_policy(uuid, uuid, jsonb) from public, anon, authenticated;

grant execute on function public.quote_workflow_get_follow_up_settings(uuid) to service_role;
grant execute on function public.quote_workflow_save_follow_up_settings(uuid, boolean, integer, time without time zone, text) to service_role;
grant execute on function public.quote_workflow_claim_due_follow_ups(uuid, integer) to service_role;
grant execute on function public.quote_workflow_finish_follow_up(uuid, uuid, boolean, text, text, boolean) to service_role;
grant execute on function public.quote_workflow_finalize_customer_response_v4(uuid, text) to service_role;
grant execute on function public.multideck_dexter_domain_quotes(uuid, text, integer) to service_role;
grant execute on function public.multideck_dexter_domain_quote_follow_up_policy(uuid, text, integer) to service_role;
grant execute on function public.multideck_dexter_action_update_quote_follow_up_policy(uuid, uuid, jsonb) to service_role;

commit;
