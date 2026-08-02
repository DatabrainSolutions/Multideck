-- Dexter "Watching for you": owner-private, event-driven monitors.
-- Natural language is compiled once by the authenticated Edge Function. Runtime
-- evaluation is deterministic in Postgres and therefore makes no idle LLM calls.

create table if not exists public."sys_AIDexterWatchCapabilities" (
  "AIDexterWatchCapability_Code" varchar(40) primary key,
  "AIDexterWatchCapability_Name" varchar(120) not null,
  "AIDexterWatchCapability_Description" text not null,
  "AIDexterWatchCapability_FieldsJSON" jsonb not null default '[]'::jsonb,
  "AIDexterWatchCapability_IsActive" boolean not null default true,
  "AIDexterWatchCapability_SortOrder" integer not null default 100,
  "AIDexterWatchCapability_UpdatedAt" timestamptz not null default now(),
  constraint "CK_sys_AIDexterWatchCapabilities_fields_array"
    check (jsonb_typeof("AIDexterWatchCapability_FieldsJSON") = 'array')
);

create table if not exists public."AI_DexterWatches" (
  "AIDexterWatch_ID" uuid primary key default gen_random_uuid(),
  "AIDexterWatch_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "AIDexterWatch_OwnerUserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "AIDexterWatch_CapabilityCode" varchar(40) not null references public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code"),
  "AIDexterWatch_Title" varchar(180) not null,
  "AIDexterWatch_Summary" text not null,
  "AIDexterWatch_Request" text not null,
  "AIDexterWatch_TargetID" uuid,
  "AIDexterWatch_TargetLabel" varchar(240),
  "AIDexterWatch_RuleJSON" jsonb not null,
  "AIDexterWatch_ActionJSON" jsonb,
  "AIDexterWatch_StatusCode" varchar(20) not null default 'active',
  "AIDexterWatch_IsArmed" boolean not null default true,
  "AIDexterWatch_LastEvaluatedAt" timestamptz,
  "AIDexterWatch_LastTriggeredAt" timestamptz,
  "AIDexterWatch_TriggerCount" integer not null default 0,
  "AIDexterWatch_CreatedAt" timestamptz not null default now(),
  "AIDexterWatch_UpdatedAt" timestamptz not null default now(),
  constraint "CK_AI_DexterWatches_status"
    check ("AIDexterWatch_StatusCode" in ('active', 'paused')),
  constraint "CK_AI_DexterWatches_rule_object"
    check (jsonb_typeof("AIDexterWatch_RuleJSON") = 'object'),
  constraint "CK_AI_DexterWatches_action_object"
    check ("AIDexterWatch_ActionJSON" is null or jsonb_typeof("AIDexterWatch_ActionJSON") = 'object'),
  constraint "CK_AI_DexterWatches_title_nonempty"
    check (btrim("AIDexterWatch_Title") <> '')
);

create table if not exists public."AI_DexterWatchSignals" (
  "AIDexterWatchSignal_ID" uuid primary key default gen_random_uuid(),
  "AIDexterWatchSignal_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "AIDexterWatchSignal_CapabilityCode" varchar(40) not null references public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code"),
  "AIDexterWatchSignal_SourceTable" varchar(120) not null,
  "AIDexterWatchSignal_SourceID" uuid not null,
  "AIDexterWatchSignal_OldJSON" jsonb not null default '{}'::jsonb,
  "AIDexterWatchSignal_NewJSON" jsonb not null default '{}'::jsonb,
  "AIDexterWatchSignal_OccurredAt" timestamptz not null default now(),
  "AIDexterWatchSignal_ProcessedAt" timestamptz,
  constraint "CK_AI_DexterWatchSignals_old_object" check (jsonb_typeof("AIDexterWatchSignal_OldJSON") = 'object'),
  constraint "CK_AI_DexterWatchSignals_new_object" check (jsonb_typeof("AIDexterWatchSignal_NewJSON") = 'object')
);

create table if not exists public."AI_DexterWatchEvents" (
  "AIDexterWatchEvent_ID" uuid primary key default gen_random_uuid(),
  "AIDexterWatchEvent_WatchID" uuid not null references public."AI_DexterWatches"("AIDexterWatch_ID") on delete cascade,
  "AIDexterWatchEvent_SignalID" uuid references public."AI_DexterWatchSignals"("AIDexterWatchSignal_ID") on delete set null,
  "AIDexterWatchEvent_OwnerUserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "AIDexterWatchEvent_Title" varchar(240) not null,
  "AIDexterWatchEvent_Body" text not null,
  "AIDexterWatchEvent_ChangedJSON" jsonb not null default '{}'::jsonb,
  "AIDexterWatchEvent_ActionJSON" jsonb,
  "AIDexterWatchEvent_ReadAt" timestamptz,
  "AIDexterWatchEvent_CreatedAt" timestamptz not null default now(),
  constraint "CK_AI_DexterWatchEvents_changed_object" check (jsonb_typeof("AIDexterWatchEvent_ChangedJSON") = 'object')
);

create table if not exists public."AI_DexterWatchStates" (
  "AIDexterWatchState_WatchID" uuid not null references public."AI_DexterWatches"("AIDexterWatch_ID") on delete cascade,
  "AIDexterWatchState_SourceID" uuid not null,
  "AIDexterWatchState_LastMatched" boolean not null default false,
  "AIDexterWatchState_LastEvaluatedAt" timestamptz not null default now(),
  primary key ("AIDexterWatchState_WatchID", "AIDexterWatchState_SourceID")
);

create index if not exists "IX_AI_DexterWatches_owner_status_updated"
  on public."AI_DexterWatches"("AIDexterWatch_OwnerUserID", "AIDexterWatch_StatusCode", "AIDexterWatch_UpdatedAt" desc);
create index if not exists "IX_AI_DexterWatches_company_capability_active"
  on public."AI_DexterWatches"("AIDexterWatch_CompanyID", "AIDexterWatch_CapabilityCode", "AIDexterWatch_TargetID")
  where "AIDexterWatch_StatusCode" = 'active';
create index if not exists "IX_AI_DexterWatchSignals_company_occurred"
  on public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_OccurredAt" desc);
create index if not exists "IX_AI_DexterWatchEvents_owner_created"
  on public."AI_DexterWatchEvents"("AIDexterWatchEvent_OwnerUserID", "AIDexterWatchEvent_CreatedAt" desc);
create index if not exists "IX_AI_DexterWatchEvents_watch_created"
  on public."AI_DexterWatchEvents"("AIDexterWatchEvent_WatchID", "AIDexterWatchEvent_CreatedAt" desc);

alter table public."AI_DexterWatches" enable row level security;
alter table public."AI_DexterWatchSignals" enable row level security;
alter table public."AI_DexterWatchEvents" enable row level security;
alter table public."AI_DexterWatchStates" enable row level security;

revoke all on table public."sys_AIDexterWatchCapabilities" from public, anon, authenticated;
revoke all on table public."AI_DexterWatches" from public, anon, authenticated;
revoke all on table public."AI_DexterWatchSignals" from public, anon, authenticated;
revoke all on table public."AI_DexterWatchEvents" from public, anon, authenticated;
revoke all on table public."AI_DexterWatchStates" from public, anon, authenticated;
grant select on table public."AI_DexterWatches", public."AI_DexterWatchEvents" to authenticated;

drop policy if exists "Dexter owners can read their watches" on public."AI_DexterWatches";
create policy "Dexter owners can read their watches" on public."AI_DexterWatches"
for select to authenticated using (
  exists (
    select 1 from public."cmp_Users" workspace_user
    where workspace_user."User_ID" = "AIDexterWatch_OwnerUserID"
      and workspace_user."Auth_User_ID" = (select auth.uid())
      and workspace_user."Company_ID" = "AIDexterWatch_CompanyID"
  )
);

drop policy if exists "Dexter owners can read their watch events" on public."AI_DexterWatchEvents";
create policy "Dexter owners can read their watch events" on public."AI_DexterWatchEvents"
for select to authenticated using (
  exists (
    select 1 from public."cmp_Users" workspace_user
    where workspace_user."User_ID" = "AIDexterWatchEvent_OwnerUserID"
      and workspace_user."Auth_User_ID" = (select auth.uid())
  )
);

insert into public."sys_AIDexterWatchCapabilities" (
  "AIDexterWatchCapability_Code", "AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description", "AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_SortOrder"
) values
  ('warehouse', 'Warehouse', 'Warehouse orders and exceptions.', '["status","priority","releaseGateStatus","requestedDate","customerReference","containerNumber","exceptionStatus","severity","title"]', 10),
  ('leads', 'Leads', 'CRM lead status, value, score and follow-up changes.', '["companyName","contactName","status","rating","estimatedValue","urgency","score","conversionProbability","nextActionDueAt"]', 20),
  ('deals', 'Deals', 'Pipeline stage, probability, value and follow-up changes.', '["name","stage","status","expectedCloseDate","probabilityPct","expectedValue","expectedMargin","nextActionDueAt"]', 30),
  ('quotes', 'Quotes', 'Quote status, deadline, validity and route changes.', '["quoteNumber","status","deadline","validFrom","validTo","origin","destination"]', 40),
  ('email', 'Email', 'New indexed Gmail or Outlook message subjects and bodies.', '["subject","body","receivedAt"]', 50)
on conflict ("AIDexterWatchCapability_Code") do update set
  "AIDexterWatchCapability_Name" = excluded."AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description" = excluded."AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON" = excluded."AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_IsActive" = true,
  "AIDexterWatchCapability_SortOrder" = excluded."AIDexterWatchCapability_SortOrder",
  "AIDexterWatchCapability_UpdatedAt" = now();

create or replace function public.multideck_dexter_list_watch_capabilities()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, auth as $$
declare v_context record; v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', capability."AIDexterWatchCapability_Code",
    'name', capability."AIDexterWatchCapability_Name",
    'description', capability."AIDexterWatchCapability_Description",
    'fields', capability."AIDexterWatchCapability_FieldsJSON"
  ) order by capability."AIDexterWatchCapability_SortOrder"), '[]'::jsonb)
  into v_result
  from public."sys_AIDexterWatchCapabilities" capability
  where capability."AIDexterWatchCapability_IsActive"
    and (
      capability."AIDexterWatchCapability_Code" <> 'email'
      or (public._multideck_dexter_has_permission(v_context.user_id, 'Email.Read')
          and public._multideck_dexter_has_permission(v_context.user_id, 'Email.AIRead'))
    );
  return v_result;
end; $$;

create or replace function public.multideck_dexter_create_watch(
  p_capability text, p_title text, p_summary text, p_request text,
  p_target_id uuid, p_target_label text, p_rule jsonb, p_action jsonb default null
) returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public, auth as $$
declare v_context record; v_watch public."AI_DexterWatches"; v_fields jsonb; v_field text;
begin
  select * into v_context from public._multideck_dexter_context();
  select capability."AIDexterWatchCapability_FieldsJSON" into v_fields
  from public."sys_AIDexterWatchCapabilities" capability
  where capability."AIDexterWatchCapability_Code" = lower(btrim(p_capability))
    and capability."AIDexterWatchCapability_IsActive";
  if v_fields is null then raise exception 'That source cannot be watched yet.' using errcode = '22023'; end if;
  if lower(btrim(p_capability)) = 'email' and not (
    public._multideck_dexter_has_permission(v_context.user_id, 'Email.Read') and
    public._multideck_dexter_has_permission(v_context.user_id, 'Email.AIRead')
  ) then raise exception 'You do not have permission to watch email.' using errcode = '42501'; end if;
  if jsonb_typeof(p_rule) <> 'object' then raise exception 'The watch rule is invalid.' using errcode = '22023'; end if;
  v_field := p_rule->>'field';
  if v_field is null or not v_fields ? v_field then raise exception 'That field cannot be watched.' using errcode = '22023'; end if;
  if coalesce(p_rule->>'operator', '') not in ('changed','eq','neq','contains','gt','gte','lt','lte') then
    raise exception 'That watch condition is not supported.' using errcode = '22023';
  end if;
  if p_action is not null and not exists (
    select 1 from public."sys_AIDexterActions" action
    where action."AIDexterAction_Code"=p_action->>'action'
      and action."AIDexterAction_DomainCode"=lower(btrim(p_capability))
      and action."AIDexterAction_IsActive"
  ) then
    raise exception 'That prepared action is not available for this watch.' using errcode = '22023';
  end if;
  insert into public."AI_DexterWatches" (
    "AIDexterWatch_CompanyID", "AIDexterWatch_OwnerUserID", "AIDexterWatch_CapabilityCode",
    "AIDexterWatch_Title", "AIDexterWatch_Summary", "AIDexterWatch_Request",
    "AIDexterWatch_TargetID", "AIDexterWatch_TargetLabel", "AIDexterWatch_RuleJSON", "AIDexterWatch_ActionJSON"
  ) values (
    v_context.company_id, v_context.user_id, lower(btrim(p_capability)), left(btrim(p_title),180),
    left(btrim(p_summary),2000), left(btrim(p_request),4000), p_target_id, nullif(left(btrim(p_target_label),240),''), p_rule, p_action
  ) returning * into v_watch;
  return jsonb_build_object('id',v_watch."AIDexterWatch_ID",'title',v_watch."AIDexterWatch_Title",'summary',v_watch."AIDexterWatch_Summary",'capability',v_watch."AIDexterWatch_CapabilityCode",'status',v_watch."AIDexterWatch_StatusCode",'targetLabel',v_watch."AIDexterWatch_TargetLabel",'rule',v_watch."AIDexterWatch_RuleJSON",'action',v_watch."AIDexterWatch_ActionJSON",'createdAt',v_watch."AIDexterWatch_CreatedAt",'updatedAt',v_watch."AIDexterWatch_UpdatedAt",'triggerCount',v_watch."AIDexterWatch_TriggerCount");
end; $$;

create or replace function public.multideck_dexter_list_watches()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, auth as $$
declare v_context record; v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',watch."AIDexterWatch_ID",'title',watch."AIDexterWatch_Title",'summary',watch."AIDexterWatch_Summary",
    'capability',watch."AIDexterWatch_CapabilityCode",'status',watch."AIDexterWatch_StatusCode",
    'targetLabel',watch."AIDexterWatch_TargetLabel",'rule',watch."AIDexterWatch_RuleJSON",
    'action',watch."AIDexterWatch_ActionJSON",'createdAt',watch."AIDexterWatch_CreatedAt",
    'updatedAt',watch."AIDexterWatch_UpdatedAt",'lastEvaluatedAt',watch."AIDexterWatch_LastEvaluatedAt",
    'lastTriggeredAt',watch."AIDexterWatch_LastTriggeredAt",'triggerCount',watch."AIDexterWatch_TriggerCount",
    'latestEvent', latest.event
  ) order by watch."AIDexterWatch_UpdatedAt" desc), '[]'::jsonb) into v_result
  from public."AI_DexterWatches" watch
  left join lateral (
    select jsonb_build_object('id',event."AIDexterWatchEvent_ID",'title',event."AIDexterWatchEvent_Title",'body',event."AIDexterWatchEvent_Body",'changed',event."AIDexterWatchEvent_ChangedJSON",'action',event."AIDexterWatchEvent_ActionJSON",'readAt',event."AIDexterWatchEvent_ReadAt",'createdAt',event."AIDexterWatchEvent_CreatedAt") event
    from public."AI_DexterWatchEvents" event where event."AIDexterWatchEvent_WatchID" = watch."AIDexterWatch_ID"
    order by event."AIDexterWatchEvent_CreatedAt" desc limit 1
  ) latest on true
  where watch."AIDexterWatch_OwnerUserID" = v_context.user_id and watch."AIDexterWatch_CompanyID" = v_context.company_id;
  return v_result;
end; $$;

create or replace function public.multideck_dexter_set_watch_status(p_watch_id uuid, p_status text)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public, auth as $$
declare v_context record;
begin
  select * into v_context from public._multideck_dexter_context();
  if p_status not in ('active','paused') then raise exception 'Choose active or paused.' using errcode = '22023'; end if;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"=p_status,"AIDexterWatch_IsArmed"=true,"AIDexterWatch_UpdatedAt"=now()
  where "AIDexterWatch_ID"=p_watch_id and "AIDexterWatch_OwnerUserID"=v_context.user_id and "AIDexterWatch_CompanyID"=v_context.company_id;
  if not found then raise exception 'Watch not found.' using errcode = 'P0002'; end if;
end; $$;

create or replace function public.multideck_dexter_delete_watch(p_watch_id uuid)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public, auth as $$
declare v_context record;
begin
  select * into v_context from public._multideck_dexter_context();
  delete from public."AI_DexterWatches" where "AIDexterWatch_ID"=p_watch_id and "AIDexterWatch_OwnerUserID"=v_context.user_id and "AIDexterWatch_CompanyID"=v_context.company_id;
  if not found then raise exception 'Watch not found.' using errcode = 'P0002'; end if;
end; $$;

create or replace function public._multideck_dexter_watch_matches(p_rule jsonb, p_old jsonb, p_new jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
declare v_field text:=p_rule->>'field'; v_operator text:=p_rule->>'operator'; v_expected text:=p_rule->>'value'; v_old text; v_new text;
begin
  v_old:=p_old->>v_field; v_new:=p_new->>v_field;
  return case v_operator
    when 'changed' then v_new is distinct from v_old
    when 'eq' then lower(coalesce(v_new,''))=lower(coalesce(v_expected,''))
    when 'neq' then lower(coalesce(v_new,''))<>lower(coalesce(v_expected,''))
    when 'contains' then lower(coalesce(v_new,'')) like '%'||lower(coalesce(v_expected,''))||'%'
    when 'gt' then nullif(v_new,'')::numeric>nullif(v_expected,'')::numeric
    when 'gte' then nullif(v_new,'')::numeric>=nullif(v_expected,'')::numeric
    when 'lt' then nullif(v_new,'')::numeric<nullif(v_expected,'')::numeric
    when 'lte' then nullif(v_new,'')::numeric<=nullif(v_expected,'')::numeric
    else false end;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end; $$;

create or replace function public._multideck_dexter_evaluate_watch_signal()
returns trigger language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare watch record; v_matches boolean; v_previously_matched boolean; v_field text; v_old text; v_new text; v_event_id uuid;
begin
  for watch in
    select watch_row.* from public."AI_DexterWatches" watch_row
    where watch_row."AIDexterWatch_CompanyID"=new."AIDexterWatchSignal_CompanyID"
      and watch_row."AIDexterWatch_CapabilityCode"=new."AIDexterWatchSignal_CapabilityCode"
      and watch_row."AIDexterWatch_StatusCode"='active'
      and (watch_row."AIDexterWatch_TargetID" is null or watch_row."AIDexterWatch_TargetID"=new."AIDexterWatchSignal_SourceID")
      and (
        watch_row."AIDexterWatch_CapabilityCode" <> 'email'
        or exists (
          select 1
          from public._multideck_dexter_email_mailboxes(watch_row."AIDexterWatch_OwnerUserID", watch_row."AIDexterWatch_CompanyID") permitted
          where permitted.mailbox_id = nullif(new."AIDexterWatchSignal_NewJSON"->>'mailboxId','')::uuid
        )
      )
  loop
    v_matches:=public._multideck_dexter_watch_matches(watch."AIDexterWatch_RuleJSON",new."AIDexterWatchSignal_OldJSON",new."AIDexterWatchSignal_NewJSON");
    select state."AIDexterWatchState_LastMatched" into v_previously_matched
    from public."AI_DexterWatchStates" state
    where state."AIDexterWatchState_WatchID"=watch."AIDexterWatch_ID"
      and state."AIDexterWatchState_SourceID"=new."AIDexterWatchSignal_SourceID";
    insert into public."AI_DexterWatchStates"("AIDexterWatchState_WatchID","AIDexterWatchState_SourceID","AIDexterWatchState_LastMatched","AIDexterWatchState_LastEvaluatedAt")
    values(watch."AIDexterWatch_ID",new."AIDexterWatchSignal_SourceID",v_matches,now())
    on conflict ("AIDexterWatchState_WatchID","AIDexterWatchState_SourceID") do update set
      "AIDexterWatchState_LastMatched"=excluded."AIDexterWatchState_LastMatched",
      "AIDexterWatchState_LastEvaluatedAt"=excluded."AIDexterWatchState_LastEvaluatedAt";
    v_field:=watch."AIDexterWatch_RuleJSON"->>'field'; v_old:=new."AIDexterWatchSignal_OldJSON"->>v_field; v_new:=new."AIDexterWatchSignal_NewJSON"->>v_field;
    update public."AI_DexterWatches" set "AIDexterWatch_LastEvaluatedAt"=now(),"AIDexterWatch_IsArmed"=case when v_matches then "AIDexterWatch_IsArmed" else true end,"AIDexterWatch_UpdatedAt"=now()
    where "AIDexterWatch_ID"=watch."AIDexterWatch_ID";
    if v_matches and not coalesce(v_previously_matched,false) then
      insert into public."AI_DexterWatchEvents"("AIDexterWatchEvent_WatchID","AIDexterWatchEvent_SignalID","AIDexterWatchEvent_OwnerUserID","AIDexterWatchEvent_Title","AIDexterWatchEvent_Body","AIDexterWatchEvent_ChangedJSON","AIDexterWatchEvent_ActionJSON")
      values(watch."AIDexterWatch_ID",new."AIDexterWatchSignal_ID",watch."AIDexterWatch_OwnerUserID",watch."AIDexterWatch_Title",coalesce(watch."AIDexterWatch_TargetLabel",'A watched record')||': '||v_field||' changed from '||coalesce(v_old,'not set')||' to '||coalesce(v_new,'not set')||'.',jsonb_build_object('field',v_field,'before',v_old,'after',v_new,'sourceId',new."AIDexterWatchSignal_SourceID"),watch."AIDexterWatch_ActionJSON") returning "AIDexterWatchEvent_ID" into v_event_id;
      insert into public."Comm_Notifications"("CommNotif_UserID","CommNotif_Title","CommNotif_Body","CommNotif_TargetTable","CommNotif_TargetID","CommNotif_LinkTypeCode","CommNotif_MetadataJSON","CommNotif_CreatedBy")
      values(watch."AIDexterWatch_OwnerUserID",watch."AIDexterWatch_Title",coalesce(watch."AIDexterWatch_TargetLabel",'A watched record')||': '||v_field||' changed from '||coalesce(v_old,'not set')||' to '||coalesce(v_new,'not set')||'.','AI_DexterWatches',watch."AIDexterWatch_ID",'dexter_watch',jsonb_build_object('event_type','dexter_watch','watch_id',watch."AIDexterWatch_ID",'watch_event_id',v_event_id,'url','/agent-dexter?watch='||watch."AIDexterWatch_ID",'action_url','/agent-dexter?watch='||watch."AIDexterWatch_ID"),watch."AIDexterWatch_OwnerUserID");
      update public."AI_DexterWatches" set "AIDexterWatch_IsArmed"=false,"AIDexterWatch_LastTriggeredAt"=now(),"AIDexterWatch_TriggerCount"="AIDexterWatch_TriggerCount"+1,"AIDexterWatch_UpdatedAt"=now() where "AIDexterWatch_ID"=watch."AIDexterWatch_ID";
    end if;
  end loop;
  update public."AI_DexterWatchSignals" set "AIDexterWatchSignal_ProcessedAt"=now() where "AIDexterWatchSignal_ID"=new."AIDexterWatchSignal_ID";
  delete from public."AI_DexterWatchSignals" signal
  where signal."AIDexterWatchSignal_ID"=new."AIDexterWatchSignal_ID"
    and not exists (
      select 1 from public."AI_DexterWatchEvents" event
      where event."AIDexterWatchEvent_SignalID"=signal."AIDexterWatchSignal_ID"
    );
  return new;
end; $$;

drop trigger if exists "TR_AI_DexterWatchSignals_evaluate" on public."AI_DexterWatchSignals";
create trigger "TR_AI_DexterWatchSignals_evaluate" after insert on public."AI_DexterWatchSignals"
for each row execute function public._multideck_dexter_evaluate_watch_signal();

create or replace function public._multideck_dexter_watch_source_change()
returns trigger language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_company_id uuid; v_capability text:=tg_argv[0]; v_source_id uuid; v_old jsonb:='{}'; v_new jsonb:='{}';
begin
  if v_capability='leads' then
    v_source_id:=new."CRMLead_ID"; v_old:=case when tg_op='INSERT' then '{}' else jsonb_build_object('companyName',old."CRMLead_CompanyName",'contactName',old."CRMLead_PersonName",'status',old."CRMLead_StatusCode",'rating',old."CRMLead_RatingCode",'estimatedValue',old."CRMLead_EstimatedValueAmount",'urgency',old."CRMLead_UrgencyCode",'score',old."CRMLead_Score",'conversionProbability',old."CRMLead_AIProbabilityToConvert",'nextActionDueAt',old."CRMLead_NextActionDueAt") end; v_new:=jsonb_build_object('companyName',new."CRMLead_CompanyName",'contactName',new."CRMLead_PersonName",'status',new."CRMLead_StatusCode",'rating',new."CRMLead_RatingCode",'estimatedValue',new."CRMLead_EstimatedValueAmount",'urgency',new."CRMLead_UrgencyCode",'score',new."CRMLead_Score",'conversionProbability',new."CRMLead_AIProbabilityToConvert",'nextActionDueAt',new."CRMLead_NextActionDueAt"); select "Company_ID" into v_company_id from public."cmp_Users" where "User_ID"=coalesce(new."CRMLead_OwnerUserID",new."CRMLead_CreatedBy") limit 1;
  elsif v_capability='deals' then
    v_source_id:=new."CRMOppty_ID"; v_old:=case when tg_op='INSERT' then '{}' else jsonb_build_object('name',old."CRMOppty_Name",'stage',(select "CRMPipelineStage_Name" from public."CRM_PipelineStages" where "CRMPipelineStage_ID"=old."CRMOppty_PipelineStageID"),'status',old."CRMOppty_StatusCode",'expectedCloseDate',old."CRMOppty_ExpectedCloseDate",'probabilityPct',old."CRMOppty_ProbabilityPct",'expectedValue',old."CRMOppty_ExpectedValueAmount",'expectedMargin',old."CRMOppty_ExpectedMarginAmount",'nextActionDueAt',old."CRMOppty_NextActionDueAt") end; v_new:=jsonb_build_object('name',new."CRMOppty_Name",'stage',(select "CRMPipelineStage_Name" from public."CRM_PipelineStages" where "CRMPipelineStage_ID"=new."CRMOppty_PipelineStageID"),'status',new."CRMOppty_StatusCode",'expectedCloseDate',new."CRMOppty_ExpectedCloseDate",'probabilityPct',new."CRMOppty_ProbabilityPct",'expectedValue',new."CRMOppty_ExpectedValueAmount",'expectedMargin',new."CRMOppty_ExpectedMarginAmount",'nextActionDueAt',new."CRMOppty_NextActionDueAt"); select "Company_ID" into v_company_id from public."CRM_Pipelines" where "CRMPipeline_ID"=new."CRMOppty_PipelineID";
  elsif v_capability='quotes' then
    v_source_id:=new."CusQuoteHeader_ID"; v_old:=case when tg_op='INSERT' then '{}' else jsonb_build_object('quoteNumber',old."CusQuoteHeader_Number",'status',old."CusQuoteHeader_Status",'deadline',old."CusQuoteHeader_Deadline",'validFrom',old."CusQuoteHeader_ValidFrom",'validTo',old."CusQuoteHeader_ValidTo",'origin',old."CusQuoteHeader_OriginExtra",'destination',old."CusQuoteHeader_DestinationExtra") end; v_new:=jsonb_build_object('quoteNumber',new."CusQuoteHeader_Number",'status',new."CusQuoteHeader_Status",'deadline',new."CusQuoteHeader_Deadline",'validFrom',new."CusQuoteHeader_ValidFrom",'validTo',new."CusQuoteHeader_ValidTo",'origin',new."CusQuoteHeader_OriginExtra",'destination',new."CusQuoteHeader_DestinationExtra"); v_company_id:=new."Org_ID"; if v_company_id is null then select "Company_ID" into v_company_id from public."cmp_Offices" where "Office_ID"=coalesce(new."CusQuoteHeader_OrgOfficeID",new."OrgOffice_ID"); end if;
  elsif v_capability='warehouse' then
    if tg_table_name='WMS_Exceptions' then
      v_source_id:=new."WMSException_ID"; v_old:=case when tg_op='INSERT' then '{}' else jsonb_build_object('exceptionStatus',old."WMSException_StatusCode",'severity',old."WMSException_SeverityCode",'title',old."WMSException_Title") end; v_new:=jsonb_build_object('exceptionStatus',new."WMSException_StatusCode",'severity',new."WMSException_SeverityCode",'title',new."WMSException_Title"); select office."Company_ID" into v_company_id from public."WMS_Facilities" facility join public."cmp_Offices" office on office."Office_ID"=facility."WMSFacility_OrgOfficeID" where facility."WMSFacility_ID"=new."WMSException_FacilityID";
    else
      v_source_id:=new."WMSOrder_ID"; v_old:=case when tg_op='INSERT' then '{}' else jsonb_build_object('status',old."WMSOrder_StatusCode",'priority',old."WMSOrder_PriorityCode",'releaseGateStatus',old."WMSOrder_ReleaseGateStatusCode",'requestedDate',old."WMSOrder_RequestedDate",'customerReference',old."WMSOrder_CustomerReference",'containerNumber',old."WMSOrder_ContainerNumber") end; v_new:=jsonb_build_object('status',new."WMSOrder_StatusCode",'priority',new."WMSOrder_PriorityCode",'releaseGateStatus',new."WMSOrder_ReleaseGateStatusCode",'requestedDate',new."WMSOrder_RequestedDate",'customerReference',new."WMSOrder_CustomerReference",'containerNumber',new."WMSOrder_ContainerNumber"); select office."Company_ID" into v_company_id from public."WMS_Facilities" facility join public."cmp_Offices" office on office."Office_ID"=facility."WMSFacility_OrgOfficeID" where facility."WMSFacility_ID"=new."WMSOrder_FacilityID";
    end if;
  elsif v_capability='email' then
    v_source_id:=new."CommMessage_ID"; v_old:=case when tg_op='INSERT' then '{}' else jsonb_build_object('subject',old."CommMessage_Subject",'body',coalesce(old."CommMessage_BodyText",old."CommMessage_BodyPreview"),'receivedAt',old."CommMessage_ReceivedAt",'mailboxId',old."CommMessage_MailboxID") end; v_new:=jsonb_build_object('subject',new."CommMessage_Subject",'body',coalesce(new."CommMessage_BodyText",new."CommMessage_BodyPreview"),'receivedAt',new."CommMessage_ReceivedAt",'mailboxId',new."CommMessage_MailboxID"); select owner."Company_ID" into v_company_id from public."Comm_Mailboxes" mailbox join public."Comm_ProviderConnections" connection on connection."CommConn_ID"=mailbox."CommMailbox_ConnectionID" join public."cmp_Users" owner on owner."User_ID"=connection."CommConn_UserID" where mailbox."CommMailbox_ID"=new."CommMessage_MailboxID";
  end if;
  if v_company_id is not null and exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID"=v_company_id
      and watch."AIDexterWatch_CapabilityCode"=v_capability
      and watch."AIDexterWatch_StatusCode"='active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID"=v_source_id)
  ) then
    insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON") values(v_company_id,v_capability,tg_table_name,v_source_id,v_old,v_new);
  end if;
  return new;
end; $$;

drop trigger if exists "TR_CRM_Leads_dexter_watch" on public."CRM_Leads";
create trigger "TR_CRM_Leads_dexter_watch" after insert or update on public."CRM_Leads" for each row execute function public._multideck_dexter_watch_source_change('leads');
drop trigger if exists "TR_CRM_Opportunities_dexter_watch" on public."CRM_Opportunities";
create trigger "TR_CRM_Opportunities_dexter_watch" after insert or update on public."CRM_Opportunities" for each row execute function public._multideck_dexter_watch_source_change('deals');
drop trigger if exists "TR_CusQuote_Header_dexter_watch" on public."CusQuote_Header";
create trigger "TR_CusQuote_Header_dexter_watch" after insert or update on public."CusQuote_Header" for each row execute function public._multideck_dexter_watch_source_change('quotes');
drop trigger if exists "TR_WMS_Orders_dexter_watch" on public."WMS_Orders";
create trigger "TR_WMS_Orders_dexter_watch" after insert or update on public."WMS_Orders" for each row execute function public._multideck_dexter_watch_source_change('warehouse');
drop trigger if exists "TR_WMS_Exceptions_dexter_watch" on public."WMS_Exceptions";
create trigger "TR_WMS_Exceptions_dexter_watch" after insert or update of "WMSException_StatusCode","WMSException_SeverityCode","WMSException_Title" on public."WMS_Exceptions" for each row execute function public._multideck_dexter_watch_source_change('warehouse');
drop trigger if exists "TR_Comm_Messages_dexter_watch" on public."Comm_Messages";
create trigger "TR_Comm_Messages_dexter_watch" after insert or update of "CommMessage_Subject","CommMessage_BodyPreview","CommMessage_BodyText" on public."Comm_Messages" for each row execute function public._multideck_dexter_watch_source_change('email');

insert into public."Comm_UserNotificationPreferences"("CommNotifPref_UserID","CommNotifPref_ChannelCode","CommNotifPref_EventType","CommNotifPref_IsEnabled","CommNotifPref_DeliveryChannelsJSON","CommNotifPref_QuietHoursJSON")
select "User_ID",'email','dexter_watch',false,jsonb_build_object('email',false,'in_app',true),'{}'::jsonb from public."cmp_Users"
on conflict ("CommNotifPref_UserID","CommNotifPref_ChannelCode","CommNotifPref_EventType") do nothing;

revoke all on function public.multideck_dexter_list_watch_capabilities() from public, anon;
revoke all on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) from public, anon;
revoke all on function public.multideck_dexter_list_watches() from public, anon;
revoke all on function public.multideck_dexter_set_watch_status(uuid,text) from public, anon;
revoke all on function public.multideck_dexter_delete_watch(uuid) from public, anon;
grant execute on function public.multideck_dexter_list_watch_capabilities() to authenticated;
grant execute on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) to authenticated;
grant execute on function public.multideck_dexter_list_watches() to authenticated;
grant execute on function public.multideck_dexter_set_watch_status(uuid,text) to authenticated;
grant execute on function public.multideck_dexter_delete_watch(uuid) to authenticated;
revoke all on function public._multideck_dexter_watch_matches(jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public._multideck_dexter_evaluate_watch_signal() from public, anon, authenticated;
revoke all on function public._multideck_dexter_watch_source_change() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') and not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='AI_DexterWatches'
  ) then alter publication supabase_realtime add table public."AI_DexterWatches"; end if;
  if exists (select 1 from pg_publication where pubname='supabase_realtime') and not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='AI_DexterWatchEvents'
  ) then alter publication supabase_realtime add table public."AI_DexterWatchEvents"; end if;
  if exists (select 1 from pg_publication where pubname='supabase_realtime') and not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='Comm_Notifications'
  ) then alter publication supabase_realtime add table public."Comm_Notifications"; end if;
end $$;
