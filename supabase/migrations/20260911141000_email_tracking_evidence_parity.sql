-- Shared delivery evidence for Dexter's existing authorised email read.
-- Image loads remain estimates, and only the private service recorder writes them.
begin;

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_FieldsJSON" = (
  select jsonb_agg(distinct field) from jsonb_array_elements("AIDexterWatchCapability_FieldsJSON" ||
    '["deliveryStatus","deliveredAt","openedAt","repliedAt","bouncedAt","openConfidence"]'::jsonb) field
), "AIDexterWatchCapability_Description" = 'Indexed Gmail and Outlook messages plus confirmed delivery, reply, bounce and failure events and estimated image opens.',
"AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'email';

create or replace function public.comm_email_delivery_evidence(p_message_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'status', evidence.status,
    'sentAt', message."CommMessage_SentAt",
    'deliveredAt', coalesce(message."CommMessage_DeliveredAt", events.delivered_at),
    'openedAt', coalesce(tracking.opened_at, events.opened_at),
    'repliedAt', coalesce(events.replied_at, replies.replied_at),
    'bouncedAt', events.bounced_at, 'failedAt', events.failed_at,
    'openTrackingEnabled', tracking.enabled,
    'confidence', case when evidence.status = 'opened_estimated' then 'estimated'
      when evidence.status in ('delivered','replied','failed','bounced') then 'confirmed' else 'none' end
  )
  from public."Comm_Messages" message
  cross join lateral (
    select min("CommDelivery_EventAt") filter(where "CommDelivery_EventTypeCode"='delivered') delivered_at,
      min("CommDelivery_EventAt") filter(where "CommDelivery_EventTypeCode"='opened') opened_at,
      min("CommDelivery_EventAt") filter(where "CommDelivery_EventTypeCode"='replied') replied_at,
      min("CommDelivery_EventAt") filter(where "CommDelivery_EventTypeCode"='bounced') bounced_at,
      min("CommDelivery_EventAt") filter(where "CommDelivery_EventTypeCode"='failed') failed_at
    from public."Comm_DeliveryEvents" where "CommDelivery_MessageID"=message."CommMessage_ID"
  ) events
  cross join lateral (
    select count(*) > 0 enabled, min("CommTrack_FirstOpenedAt") opened_at
    from public."Comm_MessageTrackingTokens" where "CommTrack_MessageID"=message."CommMessage_ID"
  ) tracking
  cross join lateral (
    select min("CommMessage_ReceivedAt") replied_at from public."Comm_Messages" reply
    where reply."CommMessage_ReplyToMessageID"=message."CommMessage_ID" and reply."CommMessage_IsInbound"
      and not reply."CommMessage_IsDeleted" and not reply."CommMessage_IsDraft"
  ) replies
  cross join lateral (
    select case
      when message."CommMessage_IsDraft" or message."CommMessage_StatusCode"='draft' then 'draft'
      when events.bounced_at is not null then 'bounced'
      when events.failed_at is not null or message."CommMessage_StatusCode"='failed' then 'failed'
      when coalesce(events.replied_at,replies.replied_at) is not null then 'replied'
      when coalesce(tracking.opened_at,events.opened_at) is not null then 'opened_estimated'
      when coalesce(message."CommMessage_DeliveredAt",events.delivered_at) is not null then 'delivered'
      when message."CommMessage_SentAt" is null and message."CommMessage_StatusCode"<>'sent' then 'sending'
      when tracking.enabled then 'no_open_signal' else 'sent' end status
  ) evidence
  where message."CommMessage_ID"=p_message_id and not message."CommMessage_IsInbound";
$$;
revoke all on function public.comm_email_delivery_evidence(uuid) from public, anon, authenticated;
grant execute on function public.comm_email_delivery_evidence(uuid) to service_role;

-- Preserve the current provider, retention, tenant, AI-read and mailbox checks.
-- Enrich only messages already selected by the existing read function.
do $$
declare definition text; previous text := '''bodyWasRedacted'', page."CommMessage_IsBodyRedacted",';
begin
  select pg_get_functiondef('public.multideck_dexter_read_email_thread(text[],uuid,timestamptz)'::regprocedure) into definition;
  if position('comm_email_delivery_evidence' in definition)=0 then
    if position(previous in definition)=0 then raise exception 'Expected authorised email read definition was not found'; end if;
    definition := replace(definition,previous, previous || E'\n      ''delivery'', public.comm_email_delivery_evidence(page."CommMessage_ID"),');
    execute definition;
  end if;
end $$;

-- The delivery signal must include mailboxId: the deterministic evaluator
-- intentionally rejects an email signal without a permitted mailbox.
create or replace function public._multideck_dexter_crm_essential_signal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_company_id uuid; v_capability text := tg_argv[0]; v_source_id uuid; v_mailbox_id uuid; v_subject text; v_old jsonb := '{}'; v_new jsonb := '{}';
begin
  if tg_table_name = 'CRM_LeadTransferRequests' then
    v_company_id := new."Company_ID"; v_source_id := new."CRMLeadTransfer_LeadID";
    v_old := case when tg_op = 'INSERT' then '{}' else jsonb_build_object('pendingTransferStatus', old."CRMLeadTransfer_Status", 'fromUserId', old."CRMLeadTransfer_FromUserID", 'toUserId', old."CRMLeadTransfer_ToUserID") end;
    v_new := jsonb_build_object('pendingTransferStatus', new."CRMLeadTransfer_Status", 'fromUserId', new."CRMLeadTransfer_FromUserID", 'toUserId', new."CRMLeadTransfer_ToUserID", 'decisionReason', new."CRMLeadTransfer_DecisionReason");
  else
    v_source_id := new."CommDelivery_MessageID";
    select owner."Company_ID", mailbox."CommMailbox_ID", message."CommMessage_Subject" into v_company_id, v_mailbox_id, v_subject
    from public."Comm_Messages" message
    join public."Comm_Mailboxes" mailbox on mailbox."CommMailbox_ID" = message."CommMessage_MailboxID"
    join public."Comm_ProviderConnections" connection on connection."CommConn_ID" = mailbox."CommMailbox_ConnectionID"
    join public."cmp_Users" owner on owner."User_ID" = connection."CommConn_UserID"
    where message."CommMessage_ID" = new."CommDelivery_MessageID";
    v_new := jsonb_build_object('mailboxId', v_mailbox_id, 'subject', v_subject,
      'openedAt', case when new."CommDelivery_EventTypeCode" = 'opened' then new."CommDelivery_EventAt" end,
      'deliveredAt', case when new."CommDelivery_EventTypeCode" = 'delivered' then new."CommDelivery_EventAt" end,
      'repliedAt', case when new."CommDelivery_EventTypeCode" = 'replied' then new."CommDelivery_EventAt" end,
      'bouncedAt', case when new."CommDelivery_EventTypeCode" = 'bounced' then new."CommDelivery_EventAt" end,
      'deliveryStatus', new."CommDelivery_EventTypeCode", 'eventAt', new."CommDelivery_EventAt",
      'openConfidence', case when new."CommDelivery_EventTypeCode" = 'opened' then 'estimated' else 'confirmed' end);
  end if;
  if v_company_id is not null and v_source_id is not null and exists (
    select 1 from public."AI_DexterWatches" watch where watch."AIDexterWatch_CompanyID" = v_company_id
      and watch."AIDexterWatch_CapabilityCode" = v_capability and watch."AIDexterWatch_StatusCode" = 'active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = v_source_id)
  ) then
    insert into public."AI_DexterWatchSignals" ("AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode", "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID", "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON")
    values (v_company_id, v_capability, tg_table_name, v_source_id, v_old, v_new);
  end if;
  return new;
end;
$$;

-- Delivery notifications describe engagement evidence, not a new inbound email.
do $$
declare definition text; anchor text := 'insert into public."AI_DexterWatchEvents" (';
begin
  select pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure) into definition;
  if position('Email engagement: ' in definition)=0 then
    if position(anchor in definition)=0 then raise exception 'Expected email watch evaluator was not found'; end if;
    definition := replace(definition,anchor,$patch$
      if watch."AIDexterWatch_CapabilityCode" = 'email'
         and new."AIDexterWatchSignal_NewJSON" ? 'deliveryStatus' then
        v_event_body := 'Email engagement: ' || case new."AIDexterWatchSignal_NewJSON"->>'deliveryStatus'
          when 'opened' then 'opened (estimated)' when 'sent' then 'accepted for sending'
          when 'delivered' then 'delivery confirmed' when 'replied' then 'reply received'
          when 'bounced' then 'delivery bounced' when 'failed' then 'sending failed'
          else 'status updated' end || ' — ' || coalesce(new."AIDexterWatchSignal_NewJSON"->>'subject','(No subject)') || '.';
        v_changed := v_changed || jsonb_build_object(
          'deliveryStatus',new."AIDexterWatchSignal_NewJSON"->>'deliveryStatus',
          'openConfidence',new."AIDexterWatchSignal_NewJSON"->>'openConfidence',
          'eventAt',new."AIDexterWatchSignal_NewJSON"->>'eventAt');
      end if;
      $patch$ || anchor);
    execute definition;
  end if;
end $$;

commit;
