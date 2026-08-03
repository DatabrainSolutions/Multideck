-- Dexter parity for CRM ownership, customer conversion and delivery evidence.

begin;

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Description" = 'CRM lead ownership, transfer decisions, area, contact timing, value and follow-up changes.',
    "AIDexterWatchCapability_FieldsJSON" = '["companyName","contactName","status","rating","estimatedValue","ownerId","area","contactAgeDays","pendingTransferStatus","nextActionDueAt"]'::jsonb,
    "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'leads';

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Description" = 'Indexed email plus confirmed delivery, estimated open, reply, bounce and failure evidence.',
    "AIDexterWatchCapability_FieldsJSON" = '["subject","body","receivedAt","deliveryStatus","deliveredAt","openedAt","repliedAt","bouncedAt","openConfidence"]'::jsonb,
    "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'email';

create or replace function public.multideck_dexter_domain_leads(p_company_id uuid, p_search text, p_take integer)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(jsonb_agg(row_data order by sort_due nulls last, sort_created desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'recordId', lead."CRMLead_ID", 'companyName', lead."CRMLead_CompanyName", 'contactName', lead."CRMLead_PersonName",
      'contactEmail', lead."CRMLead_Email", 'status', lead."CRMLead_StatusCode", 'rating', lead."CRMLead_RatingCode",
      'source', lead."CRMLead_SourceCode", 'ownerId', lead."CRMLead_OwnerUserID",
      'owner', nullif(btrim(concat_ws(' ', owner."User_Firstname", owner."User_Lastname")), ''),
      'area', address.area_label, 'mode', lead."CRMLead_ModeCode", 'direction', lead."CRMLead_DirectionCode",
      'tradeLane', lead."CRMLead_TradeLane", 'serviceInterest', lead."CRMLead_ServiceInterest",
      'estimatedValue', lead."CRMLead_EstimatedValueAmount", 'currency', lead."CRMLead_EstimatedValueCurrencyCode",
      'urgency', lead."CRMLead_UrgencyCode", 'score', lead."CRMLead_Score",
      'conversionProbability', lead."CRMLead_AIProbabilityToConvert", 'nextActionDueAt', lead."CRMLead_NextActionDueAt",
      'lastInteractionAt', lead."CRMLead_LastInteractionAt",
      'contactAgeDays', case when lead."CRMLead_LastInteractionAt" is null then null else floor(extract(epoch from (now() - lead."CRMLead_LastInteractionAt")) / 86400)::integer end,
      'pendingTransfer', pending_transfer.value
    ) row_data, lead."CRMLead_NextActionDueAt" sort_due, lead."CRMLead_CreatedAt" sort_created
    from public."CRM_Leads" lead
    join public."cmp_Users" owner on owner."User_ID" = lead."CRMLead_OwnerUserID"
    left join lateral (
      select nullif(concat_ws(' · ', nullif(btrim(a."OrgAdd_TownCity"), ''), nullif(btrim(a."OrgAdd_CountyState"), ''),
        nullif(split_part(btrim(a."OrgAdd_PostZipCode"), ' ', 1), ''), nullif(upper(btrim(a."OrgAdd_Country")), '')), '') area_label
      from public."Org_Addresses" a where a."Org_ID" = lead."CRMLead_OrgID" order by a."OrgAdd_ID" limit 1
    ) address on true
    left join lateral (
      select jsonb_build_object('id', request."CRMLeadTransfer_ID", 'status', request."CRMLeadTransfer_Status",
        'fromUserId', request."CRMLeadTransfer_FromUserID", 'toUserId', request."CRMLeadTransfer_ToUserID", 'requestedAt', request."CRMLeadTransfer_RequestedAt") value
      from public."CRM_LeadTransferRequests" request
      where request."CRMLeadTransfer_LeadID" = lead."CRMLead_ID" and request."CRMLeadTransfer_Status" = 'pending'
      order by request."CRMLeadTransfer_RequestedAt" desc limit 1
    ) pending_transfer on true
    where not lead."CRMLead_IsDeleted"
      and owner."Company_ID" = p_company_id
      and owner."Auth_User_ID" = auth.uid()
      and (nullif(btrim(p_search), '') is null or concat_ws(' ', lead."CRMLead_CompanyName", lead."CRMLead_PersonName", lead."CRMLead_Email", lead."CRMLead_TradeLane", lead."CRMLead_ServiceInterest") ilike '%' || btrim(p_search) || '%')
    order by lead."CRMLead_NextActionDueAt" nulls last, lead."CRMLead_CreatedAt" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) rows;
$$;

create or replace function public._multideck_dexter_crm_essential_signal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_company_id uuid; v_capability text := tg_argv[0]; v_source_id uuid; v_old jsonb := '{}'; v_new jsonb := '{}';
begin
  if tg_table_name = 'CRM_LeadTransferRequests' then
    v_company_id := new."Company_ID"; v_source_id := new."CRMLeadTransfer_LeadID";
    v_old := case when tg_op = 'INSERT' then '{}' else jsonb_build_object('pendingTransferStatus', old."CRMLeadTransfer_Status", 'fromUserId', old."CRMLeadTransfer_FromUserID", 'toUserId', old."CRMLeadTransfer_ToUserID") end;
    v_new := jsonb_build_object('pendingTransferStatus', new."CRMLeadTransfer_Status", 'fromUserId', new."CRMLeadTransfer_FromUserID", 'toUserId', new."CRMLeadTransfer_ToUserID", 'decisionReason', new."CRMLeadTransfer_DecisionReason");
  else
    v_source_id := new."CommDelivery_MessageID";
    select owner."Company_ID" into v_company_id
    from public."Comm_Messages" message
    join public."Comm_Mailboxes" mailbox on mailbox."CommMailbox_ID" = message."CommMessage_MailboxID"
    join public."Comm_ProviderConnections" connection on connection."CommConn_ID" = mailbox."CommMailbox_ConnectionID"
    join public."cmp_Users" owner on owner."User_ID" = connection."CommConn_UserID"
    where message."CommMessage_ID" = new."CommDelivery_MessageID";
    v_new := jsonb_build_object('deliveryStatus', new."CommDelivery_EventTypeCode", 'eventAt', new."CommDelivery_EventAt",
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

drop trigger if exists "TR_CRM_LeadTransferRequests_dexter_watch" on public."CRM_LeadTransferRequests";
create trigger "TR_CRM_LeadTransferRequests_dexter_watch" after insert or update of "CRMLeadTransfer_Status" on public."CRM_LeadTransferRequests"
for each row execute function public._multideck_dexter_crm_essential_signal('leads');
drop trigger if exists "TR_Comm_DeliveryEvents_dexter_watch" on public."Comm_DeliveryEvents";
create trigger "TR_Comm_DeliveryEvents_dexter_watch" after insert on public."Comm_DeliveryEvents"
for each row execute function public._multideck_dexter_crm_essential_signal('email');

create or replace function public.multideck_dexter_action_request_lead_transfer(p_company_id uuid, p_user_id uuid, p_arguments jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, auth as $$
begin
  return public.multideck_crm_request_lead_transfer((p_arguments->>'target_id')::uuid, p_arguments->>'reason');
end; $$;
create or replace function public.multideck_dexter_action_approve_lead_transfer(p_company_id uuid, p_user_id uuid, p_arguments jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, auth as $$
begin
  return public.multideck_crm_decide_lead_transfer((p_arguments->>'request_id')::uuid, 'approved', p_arguments->>'reason');
end; $$;
create or replace function public.multideck_dexter_action_decline_lead_transfer(p_company_id uuid, p_user_id uuid, p_arguments jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, auth as $$
begin
  return public.multideck_crm_decide_lead_transfer((p_arguments->>'request_id')::uuid, 'declined', p_arguments->>'reason');
end; $$;
create or replace function public.multideck_dexter_action_mark_deal_won(p_company_id uuid, p_user_id uuid, p_arguments jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, auth as $$
begin
  return public.multideck_crm_win_deal((p_arguments->>'target_id')::uuid, (p_arguments->>'conversion_stage_id')::uuid, p_arguments->>'reason');
end; $$;

insert into public."sys_AIDexterActions" ("AIDexterAction_Code", "AIDexterAction_DomainCode", "AIDexterAction_Name", "AIDexterAction_Description", "AIDexterAction_Function", "AIDexterAction_ParametersJSON", "AIDexterAction_SortOrder", "AIDexterAction_IsActive", "AIDexterAction_UpdatedAt")
values
('request_lead_transfer','leads','Request lead ownership','Ask the current owner to transfer a lead to the signed-in user.','multideck_dexter_action_request_lead_transfer','{"type":"object","properties":{"target_id":{"type":"string"},"reason":{"type":"string"}},"required":["target_id","reason"],"additionalProperties":false}',22,true,now()),
('approve_lead_transfer','leads','Approve lead transfer','Approve a pending transfer request as the current lead owner.','multideck_dexter_action_approve_lead_transfer','{"type":"object","properties":{"request_id":{"type":"string"},"reason":{"type":"string"}},"required":["request_id","reason"],"additionalProperties":false}',23,true,now()),
('decline_lead_transfer','leads','Decline lead transfer','Decline a pending transfer request as the current lead owner.','multideck_dexter_action_decline_lead_transfer','{"type":"object","properties":{"request_id":{"type":"string"},"reason":{"type":"string"}},"required":["request_id","reason"],"additionalProperties":false}',24,true,now()),
('mark_deal_won','deals','Mark deal won','Mark a deal won and activate its organisation as an operational customer.','multideck_dexter_action_mark_deal_won','{"type":"object","properties":{"target_id":{"type":"string"},"conversion_stage_id":{"type":"string"},"reason":{"type":"string"}},"required":["target_id","conversion_stage_id","reason"],"additionalProperties":false}',32,true,now())
on conflict ("AIDexterAction_Code") do update set "AIDexterAction_DomainCode"=excluded."AIDexterAction_DomainCode", "AIDexterAction_Name"=excluded."AIDexterAction_Name", "AIDexterAction_Description"=excluded."AIDexterAction_Description", "AIDexterAction_Function"=excluded."AIDexterAction_Function", "AIDexterAction_ParametersJSON"=excluded."AIDexterAction_ParametersJSON", "AIDexterAction_IsActive"=true, "AIDexterAction_UpdatedAt"=now();

revoke all on function public._multideck_dexter_crm_essential_signal() from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_request_lead_transfer(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_approve_lead_transfer(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_decline_lead_transfer(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_mark_deal_won(uuid, uuid, jsonb) from public, anon, authenticated;

commit;
