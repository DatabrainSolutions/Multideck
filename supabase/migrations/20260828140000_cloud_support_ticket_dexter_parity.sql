begin;

-- Cloud remains the ticket source of truth. The tenant stores only the minimum
-- public state required for reporter-safe Dexter reads and deterministic
-- Watching for you evaluation. No report body, email content or security ticket
-- data is copied into the operational tenant.
create table public."Support_CloudTicketSignals" (
  "CloudTicketSignal_TicketID" uuid primary key,
  "CloudTicketSignal_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CloudTicketSignal_ReporterUserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "CloudTicketSignal_Reference" text not null,
  "CloudTicketSignal_TicketType" text not null
    check ("CloudTicketSignal_TicketType" in ('bug','feature_request','question','account_billing')),
  "CloudTicketSignal_StatusCode" text not null
    check ("CloudTicketSignal_StatusCode" in ('new','in_progress','waiting_for_customer','resolved','closed')),
  "CloudTicketSignal_NeedsReply" boolean not null,
  "CloudTicketSignal_LatestMessageID" uuid,
  "CloudTicketSignal_ChangedAt" timestamptz not null,
  "CloudTicketSignal_UpdatedAt" timestamptz not null default now(),
  constraint "CK_Support_CloudTicketSignals_reference"
    check ("CloudTicketSignal_Reference" ~ '^MD-[0-9]{5,}$')
);

create index "IX_Support_CloudTicketSignals_company_changed"
  on public."Support_CloudTicketSignals" (
    "CloudTicketSignal_CompanyID", "CloudTicketSignal_ChangedAt" desc
  );
create index "IX_Support_CloudTicketSignals_reporter_changed"
  on public."Support_CloudTicketSignals" (
    "CloudTicketSignal_ReporterUserID", "CloudTicketSignal_ChangedAt" desc
  );

create table public."Support_CloudTicketCallbackNonces" (
  "CloudTicketCallbackNonce_Value" uuid primary key,
  "CloudTicketCallbackNonce_EventID" uuid not null,
  "CloudTicketCallbackNonce_SeenAt" timestamptz not null default now()
);

create unique index "UX_Support_CloudTicketCallbackNonces_event"
  on public."Support_CloudTicketCallbackNonces" ("CloudTicketCallbackNonce_EventID");

alter table public."Support_CloudTicketSignals" enable row level security;
alter table public."Support_CloudTicketCallbackNonces" enable row level security;
revoke all on public."Support_CloudTicketSignals", public."Support_CloudTicketCallbackNonces"
  from public, anon, authenticated;
grant select, insert, update, delete on
  public."Support_CloudTicketSignals", public."Support_CloudTicketCallbackNonces"
  to service_role;

comment on table public."Support_CloudTicketSignals" is
  'Minimal public Cloud ticket change state for tenant-safe Dexter reads and deterministic watches. Cloud owns the complete ticket.';
comment on table public."Support_CloudTicketCallbackNonces" is
  'Short-lived replay and event-idempotency evidence for signed Cloud ticket callbacks.';

create or replace function public.multideck_receive_cloud_ticket_signal(
  p_event_id uuid,
  p_nonce uuid,
  p_sent_at bigint,
  p_ticket_id uuid,
  p_reference text,
  p_reporter_user_id uuid,
  p_ticket_type text,
  p_restricted boolean,
  p_status text,
  p_needs_reply boolean,
  p_message_id uuid,
  p_changed_at timestamptz,
  p_tenant_host text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_reporter public."cmp_Users";
  v_before public."Support_CloudTicketSignals";
  v_after public."Support_CloudTicketSignals";
  v_old_json jsonb := '{}'::jsonb;
  v_new_json jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'server_only' using errcode = '42501';
  end if;
  if p_event_id is null or p_nonce is null or p_ticket_id is null or p_reporter_user_id is null then
    raise exception 'The callback identifiers are incomplete.' using errcode = '22023';
  end if;
  if abs(extract(epoch from now())::bigint - p_sent_at) > 300 then
    raise exception 'The callback timestamp is outside the allowed window.' using errcode = '22023';
  end if;
  if btrim(coalesce(p_tenant_host, '')) = ''
     or lower(btrim(p_tenant_host)) <> btrim(p_tenant_host)
     or p_tenant_host like '%/%' then
    raise exception 'The callback tenant hostname is invalid.' using errcode = '22023';
  end if;
  if coalesce(p_status, '') not in ('new','in_progress','waiting_for_customer','resolved','closed') then
    raise exception 'The callback ticket status is invalid.' using errcode = '22023';
  end if;
  if coalesce(p_restricted, true)
     or coalesce(p_ticket_type, '') not in ('bug','feature_request','question','account_billing') then
    raise exception 'Restricted ticket callbacks are not accepted by tenant deployments.' using errcode = '42501';
  end if;
  if coalesce(p_reference, '') !~ '^MD-[0-9]{5,}$' then
    raise exception 'The callback ticket reference is invalid.' using errcode = '22023';
  end if;
  if p_changed_at is null or p_changed_at > now() + interval '5 minutes' then
    raise exception 'The callback change timestamp is invalid.' using errcode = '22023';
  end if;

  delete from public."Support_CloudTicketCallbackNonces"
  where "CloudTicketCallbackNonce_SeenAt" < now() - interval '24 hours';

  insert into public."Support_CloudTicketCallbackNonces" (
    "CloudTicketCallbackNonce_Value", "CloudTicketCallbackNonce_EventID"
  ) values (p_nonce, p_event_id)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('accepted', true, 'duplicate', true);
  end if;

  select * into v_reporter
  from public."cmp_Users" workspace_user
  where workspace_user."User_ID" = p_reporter_user_id
    and workspace_user."Company_ID" is not null
    and coalesce(workspace_user."User_AccessStatus", 'active') = 'active';
  if not found then
    raise exception 'The callback reporter is not an active tenant user.' using errcode = '42501';
  end if;

  select * into v_before
  from public."Support_CloudTicketSignals"
  where "CloudTicketSignal_TicketID" = p_ticket_id
  for update;

  if found and v_before."CloudTicketSignal_CompanyID" <> v_reporter."Company_ID" then
    raise exception 'The callback ticket belongs to another workspace.' using errcode = '42501';
  end if;
  if found and v_before."CloudTicketSignal_ReporterUserID" <> p_reporter_user_id then
    raise exception 'The callback reporter cannot be changed.' using errcode = '42501';
  end if;
  if found and v_before."CloudTicketSignal_TicketType" <> p_ticket_type then
    raise exception 'The callback ticket type cannot be changed.' using errcode = '42501';
  end if;
  if found and v_before."CloudTicketSignal_ChangedAt" > p_changed_at then
    return jsonb_build_object('accepted', true, 'stale', true);
  end if;

  if found then
    v_old_json := jsonb_build_object(
      'status', v_before."CloudTicketSignal_StatusCode",
      'needsReply', v_before."CloudTicketSignal_NeedsReply",
      'messageId', v_before."CloudTicketSignal_LatestMessageID",
      'updatedAt', v_before."CloudTicketSignal_ChangedAt"
    );
  end if;

  insert into public."Support_CloudTicketSignals" (
    "CloudTicketSignal_TicketID", "CloudTicketSignal_CompanyID",
    "CloudTicketSignal_ReporterUserID", "CloudTicketSignal_Reference",
    "CloudTicketSignal_TicketType",
    "CloudTicketSignal_StatusCode", "CloudTicketSignal_NeedsReply",
    "CloudTicketSignal_LatestMessageID", "CloudTicketSignal_ChangedAt"
  ) values (
    p_ticket_id, v_reporter."Company_ID", p_reporter_user_id,
    p_reference, p_ticket_type, p_status, p_needs_reply, p_message_id, p_changed_at
  )
  on conflict ("CloudTicketSignal_TicketID") do update set
    "CloudTicketSignal_StatusCode" = excluded."CloudTicketSignal_StatusCode",
    "CloudTicketSignal_NeedsReply" = excluded."CloudTicketSignal_NeedsReply",
    "CloudTicketSignal_LatestMessageID" = coalesce(
      excluded."CloudTicketSignal_LatestMessageID",
      public."Support_CloudTicketSignals"."CloudTicketSignal_LatestMessageID"
    ),
    "CloudTicketSignal_ChangedAt" = excluded."CloudTicketSignal_ChangedAt",
    "CloudTicketSignal_UpdatedAt" = now()
  returning * into v_after;

  v_new_json := jsonb_build_object(
    'status', v_after."CloudTicketSignal_StatusCode",
    'needsReply', v_after."CloudTicketSignal_NeedsReply",
    'messageId', v_after."CloudTicketSignal_LatestMessageID",
    'updatedAt', v_after."CloudTicketSignal_ChangedAt"
  );

  if v_new_json is distinct from v_old_json and exists (
    select 1
    from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = v_after."CloudTicketSignal_CompanyID"
      and watch."AIDexterWatch_CapabilityCode" = 'support_tickets'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and watch."AIDexterWatch_TargetID" = p_ticket_id
  ) then
    insert into public."AI_DexterWatchSignals" (
      "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode",
      "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID",
      "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
    ) values (
      v_after."CloudTicketSignal_CompanyID", 'support_tickets',
      'Support_CloudTicketSignals', p_ticket_id, v_old_json, v_new_json
    );
  end if;

  return jsonb_build_object(
    'accepted', true,
    'ticketId', p_ticket_id,
    'reference', p_reference
  );
end;
$$;

revoke all on function public.multideck_receive_cloud_ticket_signal(
  uuid,uuid,bigint,uuid,text,uuid,text,boolean,text,boolean,uuid,timestamptz,text
) from public, anon, authenticated;
grant execute on function public.multideck_receive_cloud_ticket_signal(
  uuid,uuid,bigint,uuid,text,uuid,text,boolean,text,boolean,uuid,timestamptz,text
) to service_role;

create or replace function public.multideck_dexter_domain_support_tickets(
  p_company_id uuid,
  p_search text,
  p_take integer
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, private
as $$
declare
  v_context record;
  v_is_admin boolean;
  v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  if v_context.company_id <> p_company_id then
    raise exception 'That ticket workspace is not available.' using errcode = '42501';
  end if;
  v_is_admin := private.is_tenant_administrator(v_context.user_id);

  select coalesce(jsonb_agg(row_payload order by changed_at desc), '[]'::jsonb)
  into v_result
  from (
    select
      signal."CloudTicketSignal_ChangedAt" as changed_at,
      jsonb_build_object(
        'id', signal."CloudTicketSignal_TicketID",
        'reference', signal."CloudTicketSignal_Reference",
        'status', signal."CloudTicketSignal_StatusCode",
        'needsReply', signal."CloudTicketSignal_NeedsReply",
        'latestMessageId', signal."CloudTicketSignal_LatestMessageID",
        'updatedAt', signal."CloudTicketSignal_ChangedAt",
        'sourceReferences', jsonb_build_array(jsonb_build_object(
          'source', 'multideck_cloud_support_ticket',
          'id', signal."CloudTicketSignal_TicketID",
          'reference', signal."CloudTicketSignal_Reference"
        )),
        'securityOperationsSupported', false
      ) as row_payload
    from public."Support_CloudTicketSignals" signal
    where signal."CloudTicketSignal_CompanyID" = p_company_id
      and (
        signal."CloudTicketSignal_ReporterUserID" = v_context.user_id
        or v_is_admin
      )
      and (
        nullif(btrim(p_search), '') is null
        or signal."CloudTicketSignal_Reference" ilike '%' || btrim(p_search) || '%'
        or replace(signal."CloudTicketSignal_StatusCode", '_', ' ') ilike '%' || btrim(p_search) || '%'
      )
    order by signal."CloudTicketSignal_ChangedAt" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) visible_rows;
  return v_result;
end;
$$;

revoke all on function public.multideck_dexter_domain_support_tickets(uuid,text,integer)
  from public, anon, authenticated;
grant execute on function public.multideck_dexter_domain_support_tickets(uuid,text,integer)
  to service_role;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code", "AIDexterDomain_Name", "AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction", "AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive", "AIDexterDomain_UpdatedAt",
  "AIDexterDomain_RequiredPermissionsJSON", "AIDexterDomain_DataCategoriesJSON",
  "AIDexterDomain_ScopeStrategy"
) values (
  'support_tickets', 'Support tickets',
  'Minimal public status and reply signals for the signed-in reporter, or all ordinary workspace tickets for a tenant administrator. Ticket bodies and restricted security concerns stay in Multideck Cloud.',
  'multideck_dexter_domain_support_tickets', 82, true, now(),
  '[]'::jsonb, '["support","ticket_status","notifications"]'::jsonb, 'reporter_or_tenant_admin'
)
on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name" = excluded."AIDexterDomain_Name",
  "AIDexterDomain_Description" = excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction" = excluded."AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder" = excluded."AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive" = true,
  "AIDexterDomain_UpdatedAt" = now(),
  "AIDexterDomain_RequiredPermissionsJSON" = excluded."AIDexterDomain_RequiredPermissionsJSON",
  "AIDexterDomain_DataCategoriesJSON" = excluded."AIDexterDomain_DataCategoriesJSON",
  "AIDexterDomain_ScopeStrategy" = excluded."AIDexterDomain_ScopeStrategy";

-- The Edge runtime executes this external action through the same authenticated
-- create-support-ticket boundary as the form. This fail-closed placeholder
-- prevents an older executor from ever substituting direct SQL ticket creation.
create or replace function public.multideck_dexter_action_create_support_ticket(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'This support action must use the authenticated ticket intake boundary.'
    using errcode = '0A000';
end;
$$;

revoke all on function public.multideck_dexter_action_create_support_ticket(uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.multideck_dexter_action_create_support_ticket(uuid,uuid,jsonb)
  to service_role;

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code", "AIDexterAction_DomainCode", "AIDexterAction_Name",
  "AIDexterAction_Description", "AIDexterAction_Function",
  "AIDexterAction_ParametersJSON", "AIDexterAction_SortOrder",
  "AIDexterAction_IsActive", "AIDexterAction_UpdatedAt",
  "AIDexterAction_RequiredPermissionsJSON", "AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy", "AIDexterAction_HasExternalEffect"
) values (
  'create_support_ticket', 'support_tickets', 'Create support ticket',
  'Create one ordinary Multideck support ticket for the signed-in operator through Cloud intake. Always requires explicit approval. Screenshots and restricted security concerns must use Submit a ticket.',
  'multideck_dexter_action_create_support_ticket',
  '{
    "type":"object",
    "additionalProperties":false,
    "properties":{
      "ticket_type":{"type":"string","enum":["bug","feature_request","question","account_billing"]},
      "impact":{"type":"string","enum":["blocked","slowed_down","no_immediate_blocker"]},
      "title":{"type":"string","minLength":4,"maxLength":180},
      "description":{"type":"string","minLength":10,"maxLength":12000},
      "expected_behaviour":{"type":["string","null"],"maxLength":6000},
      "actual_behaviour":{"type":["string","null"],"maxLength":6000},
      "desired_outcome":{"type":["string","null"],"maxLength":6000}
    },
    "required":["ticket_type","impact","title","description","expected_behaviour","actual_behaviour","desired_outcome"]
  }'::jsonb,
  825, true, now(), '[]'::jsonb, 'support_ticket_creation',
  'signed_in_reporter', true
)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode" = excluded."AIDexterAction_DomainCode",
  "AIDexterAction_Name" = excluded."AIDexterAction_Name",
  "AIDexterAction_Description" = excluded."AIDexterAction_Description",
  "AIDexterAction_Function" = excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON" = excluded."AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder" = excluded."AIDexterAction_SortOrder",
  "AIDexterAction_IsActive" = true,
  "AIDexterAction_UpdatedAt" = now(),
  "AIDexterAction_RequiredPermissionsJSON" = excluded."AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_IntentFamily" = excluded."AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy" = excluded."AIDexterAction_ScopeStrategy",
  "AIDexterAction_HasExternalEffect" = excluded."AIDexterAction_HasExternalEffect";

insert into public."sys_AIDexterWatchCapabilities" (
  "AIDexterWatchCapability_Code", "AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description", "AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_SortOrder", "AIDexterWatchCapability_IsActive",
  "AIDexterWatchCapability_UpdatedAt", "AIDexterWatchCapability_RequiredPermissionsJSON",
  "AIDexterWatchCapability_ScopeStrategy"
) values (
  'support_tickets', 'Support tickets',
  'Public reply and status changes for one exact ordinary Cloud support ticket.',
  '["status","needsReply","messageId","updatedAt"]'::jsonb,
  82, true, now(), '[]'::jsonb, 'exact_reporter_or_tenant_admin_ticket'
)
on conflict ("AIDexterWatchCapability_Code") do update set
  "AIDexterWatchCapability_Name" = excluded."AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description" = excluded."AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON" = excluded."AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_SortOrder" = excluded."AIDexterWatchCapability_SortOrder",
  "AIDexterWatchCapability_IsActive" = true,
  "AIDexterWatchCapability_UpdatedAt" = now(),
  "AIDexterWatchCapability_RequiredPermissionsJSON" = excluded."AIDexterWatchCapability_RequiredPermissionsJSON",
  "AIDexterWatchCapability_ScopeStrategy" = excluded."AIDexterWatchCapability_ScopeStrategy";

alter function public.multideck_dexter_create_watch(
  text,text,text,text,uuid,text,jsonb,jsonb
) rename to _multideck_dexter_create_watch_before_support_tickets_20260828;

create or replace function public.multideck_dexter_create_watch(
  p_capability text,
  p_title text,
  p_summary text,
  p_request text,
  p_target_id uuid,
  p_target_label text,
  p_rule jsonb,
  p_action jsonb default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth, private
as $$
declare
  v_context record;
  v_capability text := lower(btrim(p_capability));
begin
  select * into v_context from public._multideck_dexter_context();
  if v_capability = 'support_tickets' and (
    p_target_id is null
    or not exists (
      select 1
      from public."Support_CloudTicketSignals" signal
      where signal."CloudTicketSignal_TicketID" = p_target_id
        and signal."CloudTicketSignal_CompanyID" = v_context.company_id
        and (
          signal."CloudTicketSignal_ReporterUserID" = v_context.user_id
          or private.is_tenant_administrator(v_context.user_id)
        )
    )
  ) then
    raise exception 'Choose one exact ordinary support ticket you can read before creating this watch.'
      using errcode = '42501';
  end if;
  if v_capability = 'support_tickets' and p_action is not null then
    raise exception 'Support ticket watches notify only; automatic ticket changes are not supported.'
      using errcode = '42501';
  end if;
  return public._multideck_dexter_create_watch_before_support_tickets_20260828(
    p_capability, p_title, p_summary, p_request,
    p_target_id, p_target_label, p_rule, p_action
  );
end;
$$;

revoke all on function public.multideck_dexter_create_watch(
  text,text,text,text,uuid,text,jsonb,jsonb
) from public, anon;
grant execute on function public.multideck_dexter_create_watch(
  text,text,text,text,uuid,text,jsonb,jsonb
) to authenticated, service_role;

revoke all on function public._multideck_dexter_create_watch_before_support_tickets_20260828(
  text,text,text,text,uuid,text,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public._multideck_dexter_create_watch_before_support_tickets_20260828(
  text,text,text,text,uuid,text,jsonb,jsonb
) to service_role;

commit;
