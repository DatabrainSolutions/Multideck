-- Extend email watches to cover the actual operator workflow: sender plus
-- content/attachment clues, still evaluated deterministically with no polling.

update public."sys_AIDexterWatchCapabilities"
set
  "AIDexterWatchCapability_FieldsJSON" = '["senderEmail","senderName","subject","body","receivedAt","hasAttachments","attachmentNames","searchText"]'::jsonb,
  "AIDexterWatchCapability_Description" = 'New indexed Gmail or Outlook messages, including sender, subject, body and attachment names.',
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'email';

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
  if coalesce(p_rule->>'operator', '') not in ('changed','eq','neq','contains','contains_all','gt','gte','lt','lte') then
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

create or replace function public._multideck_dexter_watch_matches(p_rule jsonb, p_old jsonb, p_new jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
declare
  v_field text:=p_rule->>'field';
  v_operator text:=p_rule->>'operator';
  v_expected text:=p_rule->>'value';
  v_old text;
  v_new text;
begin
  v_old:=p_old->>v_field;
  v_new:=p_new->>v_field;
  return case v_operator
    when 'changed' then v_new is distinct from v_old
    when 'eq' then lower(coalesce(v_new,''))=lower(coalesce(v_expected,''))
    when 'neq' then lower(coalesce(v_new,''))<>lower(coalesce(v_expected,''))
    when 'contains' then lower(coalesce(v_new,'')) like '%'||lower(coalesce(v_expected,''))||'%'
    when 'contains_all' then (
      select coalesce(bool_and(lower(coalesce(v_new,'')) like '%'||lower(term)||'%'), false)
      from unnest(regexp_split_to_array(btrim(coalesce(v_expected,'')), E'\\s+')) term
      where term <> ''
    )
    when 'gt' then nullif(v_new,'')::numeric>nullif(v_expected,'')::numeric
    when 'gte' then nullif(v_new,'')::numeric>=nullif(v_expected,'')::numeric
    when 'lt' then nullif(v_new,'')::numeric<nullif(v_expected,'')::numeric
    when 'lte' then nullif(v_new,'')::numeric<=nullif(v_expected,'')::numeric
    else false end;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end; $$;

create or replace function public._multideck_dexter_emit_email_watch_signal(p_message_id uuid)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare
  v_message public."Comm_Messages";
  v_company_id uuid;
  v_sender_email text;
  v_sender_name text;
  v_attachment_names text;
  v_snapshot jsonb;
begin
  select message.* into v_message
  from public."Comm_Messages" message
  where message."CommMessage_ID" = p_message_id
    and message."CommMessage_IsInbound"
    and not message."CommMessage_IsDraft"
    and not message."CommMessage_IsSpam"
    and not message."CommMessage_IsDeleted";
  if not found then return; end if;

  select
    string_agg(distinct recipient."CommRecipient_NormalizedAddress", ' ' order by recipient."CommRecipient_NormalizedAddress"),
    string_agg(distinct recipient."CommRecipient_DisplayNameSnapshot", ' ' order by recipient."CommRecipient_DisplayNameSnapshot")
  into v_sender_email, v_sender_name
  from public."Comm_MessageRecipients" recipient
  where recipient."CommRecipient_MessageID" = p_message_id
    and recipient."CommRecipient_RecipientTypeCode" = 'from';

  select string_agg(distinct attachment."CommAttachment_FileName", ' ' order by attachment."CommAttachment_FileName")
  into v_attachment_names
  from public."Comm_MessageAttachments" attachment
  where attachment."CommAttachment_MessageID" = p_message_id
    and not attachment."CommAttachment_IsInline";

  select owner."Company_ID" into v_company_id
  from public."Comm_Mailboxes" mailbox
  join public."Comm_ProviderConnections" connection
    on connection."CommConn_ID" = mailbox."CommMailbox_ConnectionID"
  join public."cmp_Users" owner
    on owner."User_ID" = connection."CommConn_UserID"
  where mailbox."CommMailbox_ID" = v_message."CommMessage_MailboxID";
  if v_company_id is null then return; end if;

  if not exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = v_company_id
      and watch."AIDexterWatch_CapabilityCode" = 'email'
      and watch."AIDexterWatch_StatusCode" = 'active'
  ) then return; end if;

  v_snapshot := jsonb_build_object(
    'senderEmail', coalesce(v_sender_email, ''),
    'senderName', coalesce(v_sender_name, ''),
    'subject', coalesce(v_message."CommMessage_Subject", ''),
    'body', left(coalesce(v_message."CommMessage_BodyText", v_message."CommMessage_BodyPreview", ''), 16000),
    'receivedAt', v_message."CommMessage_ReceivedAt",
    'hasAttachments', v_message."CommMessage_HasAttachments",
    'attachmentNames', left(coalesce(v_attachment_names, ''), 4000),
    'mailboxId', v_message."CommMessage_MailboxID",
    'searchText', left(concat_ws(
      ' ',
      v_sender_email,
      v_sender_name,
      v_message."CommMessage_Subject",
      coalesce(v_message."CommMessage_BodyText", v_message."CommMessage_BodyPreview"),
      v_attachment_names
    ), 24000)
  );

  insert into public."AI_DexterWatchSignals" (
    "AIDexterWatchSignal_CompanyID",
    "AIDexterWatchSignal_CapabilityCode",
    "AIDexterWatchSignal_SourceTable",
    "AIDexterWatchSignal_SourceID",
    "AIDexterWatchSignal_OldJSON",
    "AIDexterWatchSignal_NewJSON"
  ) values (
    v_company_id,
    'email',
    'Comm_Messages',
    p_message_id,
    '{}'::jsonb,
    v_snapshot
  );
end; $$;

create or replace function public._multideck_dexter_watch_email_source_change()
returns trigger language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_message_id uuid;
begin
  if tg_table_name = 'Comm_Messages' then
    v_message_id := case when tg_op = 'DELETE' then old."CommMessage_ID" else new."CommMessage_ID" end;
  elsif tg_table_name = 'Comm_MessageRecipients' then
    if coalesce(new."CommRecipient_RecipientTypeCode", old."CommRecipient_RecipientTypeCode") <> 'from' then
      if tg_op = 'DELETE' then return old; else return new; end if;
    end if;
    v_message_id := case when tg_op = 'DELETE' then old."CommRecipient_MessageID" else new."CommRecipient_MessageID" end;
  elsif tg_table_name = 'Comm_MessageAttachments' then
    v_message_id := case when tg_op = 'DELETE' then old."CommAttachment_MessageID" else new."CommAttachment_MessageID" end;
  end if;
  if v_message_id is not null then
    perform public._multideck_dexter_emit_email_watch_signal(v_message_id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;

drop trigger if exists "TR_Comm_Messages_dexter_watch" on public."Comm_Messages";
create trigger "TR_Comm_Messages_dexter_watch"
after insert or update of
  "CommMessage_Subject",
  "CommMessage_BodyPreview",
  "CommMessage_BodyText",
  "CommMessage_ReceivedAt",
  "CommMessage_HasAttachments",
  "CommMessage_IsInbound",
  "CommMessage_IsDraft",
  "CommMessage_IsSpam",
  "CommMessage_IsDeleted"
on public."Comm_Messages"
for each row execute function public._multideck_dexter_watch_email_source_change();

drop trigger if exists "TR_Comm_MessageRecipients_dexter_watch" on public."Comm_MessageRecipients";
create trigger "TR_Comm_MessageRecipients_dexter_watch"
after insert or update or delete on public."Comm_MessageRecipients"
for each row execute function public._multideck_dexter_watch_email_source_change();

drop trigger if exists "TR_Comm_MessageAttachments_dexter_watch" on public."Comm_MessageAttachments";
create trigger "TR_Comm_MessageAttachments_dexter_watch"
after insert or update or delete on public."Comm_MessageAttachments"
for each row execute function public._multideck_dexter_watch_email_source_change();

revoke all on function public._multideck_dexter_emit_email_watch_signal(uuid) from public, anon, authenticated;
revoke all on function public._multideck_dexter_watch_email_source_change() from public, anon, authenticated;
