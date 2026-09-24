-- Incoming changes are compared with retained delivery evidence, never posted.
begin;
-- Failed deliveries retain identity without claiming a successful sync time.
alter table public."ACCI_ExternalRefs" alter column "ACCIER_LastSyncedAt" drop not null;
alter table public."ACCI_WebhookEvents"
  add column "ACCIWH_LeaseToken" uuid,
  add column "ACCIWH_LeaseUntil" timestamptz,
  add column "ACCIWH_Attempts" integer not null default 0,
  add column "ACCIWH_NextAttemptAt" timestamptz not null default now(),
  add column "ACCIWH_ProcessingEvidence" jsonb;
alter table public."ACCI_ReconciliationIssues"
  add column "ACCIRI_WebhookEventID" uuid references public."ACCI_WebhookEvents"("ACCIWH_ID");
create unique index "UX_ACCI_ReconciliationIssues_webhook" on public."ACCI_ReconciliationIssues"("ACCIRI_WebhookEventID");
create index "IX_ACCI_WebhookEvents_pending" on public."ACCI_WebhookEvents"("ACCIWH_NextAttemptAt")
  where "ACCIWH_ProcessingStatusCode" in ('queued','failed','processing');

create function public.multideck_erpnext_claim_inbound(p_limit integer default 5)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_jobs jsonb;
begin
  with candidates as (
    select "ACCIWH_ID" from public."ACCI_WebhookEvents"
    where "ACCIWH_ProviderCode"='erpnext' and "ACCIWH_SignatureVerified"
      and "ACCIWH_DeliveryKey" is not null
      and (("ACCIWH_ProcessingStatusCode" in ('queued','failed') and "ACCIWH_Attempts" < 8 and "ACCIWH_NextAttemptAt"<=now())
        or ("ACCIWH_ProcessingStatusCode"='processing' and "ACCIWH_LeaseUntil"<now()))
    order by "ACCIWH_ReceivedAt", "ACCIWH_ID"
    limit greatest(1,least(coalesce(p_limit,5),10)) for update skip locked
  ), claimed as (
    update public."ACCI_WebhookEvents" e set "ACCIWH_ProcessingStatusCode"='processing',
      "ACCIWH_LeaseToken"=gen_random_uuid(), "ACCIWH_LeaseUntil"=now()+interval '5 minutes',
      "ACCIWH_Attempts"=least("ACCIWH_Attempts"+1,8)
    from candidates c where c."ACCIWH_ID"=e."ACCIWH_ID" returning e.*
  ) select coalesce(jsonb_agg(to_jsonb(claimed)), '[]'::jsonb) into v_jobs from claimed;
  return v_jobs;
end $$;

-- One transaction retains processing evidence, creates the review issue and
-- publishes the audit event. Old workers cannot complete a reclaimed receipt.
create function public.multideck_erpnext_finish_inbound(p_id uuid,p_token uuid,p_result jsonb)
returns boolean language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  v_event public."ACCI_WebhookEvents"; v_connection public."ACCI_Connections";
  v_ref public."ACCI_ExternalRefs"; v_outcome text; v_status text; v_message text;
  v_scope boolean; v_ref_count integer;
begin
  select * into v_event from public."ACCI_WebhookEvents" where "ACCIWH_ID"=p_id for update;
  if not found or v_event."ACCIWH_ProcessingStatusCode"<>'processing'
    or v_event."ACCIWH_LeaseToken" is distinct from p_token or v_event."ACCIWH_LeaseUntil"<=now() then return false; end if;
  if jsonb_typeof(p_result) is distinct from 'object' or octet_length(p_result::text)>262144
    or coalesce(p_result->>'outcome','') not in ('matched','review','retry') then
    raise exception 'Invalid inbound result.' using errcode='22023';
  end if;
  v_outcome:=p_result->>'outcome';
  v_message:=left(coalesce(p_result->>'message','ERPNext change needs review.'),500);
  select * into v_connection from public."ACCI_Connections" where "ACCIC_ID"=v_event."ACCIWH_ConnectionID" for share;
  select true into v_scope from public."cmp_LegalEntities" where "LegalEntity_ID"=v_connection."ACCIC_LegalEntityID"
    and "LegalEntity_IsActive" and "Company_ID" is not null for share;
  if not coalesce(v_scope,false) or v_connection."ACCIC_StatusCode" is distinct from 'active'
    or v_connection."ACCIC_ProviderCode" is distinct from 'erpnext'
    or v_connection."ACCIC_ExternalTenantName" is distinct from v_event."ACCIWH_ExternalCompany" then
    v_outcome:='review'; v_message:='The ERPNext connection scope changed. Review this retained event.';
  end if;
  select count(*) into v_ref_count from public."ACCI_ExternalRefs"
    where "ACCIER_ConnectionID"=v_event."ACCIWH_ConnectionID"
      and "ACCIER_ExternalObjectType"=v_event."ACCIWH_ExternalObjectType" and "ACCIER_ExternalID"=v_event."ACCIWH_ExternalID";
  if v_ref_count=1 then
    select * into v_ref from public."ACCI_ExternalRefs"
      where "ACCIER_ConnectionID"=v_event."ACCIWH_ConnectionID"
        and "ACCIER_ExternalObjectType"=v_event."ACCIWH_ExternalObjectType" and "ACCIER_ExternalID"=v_event."ACCIWH_ExternalID" for share;
  end if;
  -- Bind a green result to precisely the retained reference read by the worker.
  if v_outcome='matched' and (nullif(p_result->>'reviewedSite','') is null
    or p_result->>'reviewedSite' is distinct from v_connection."ACCIC_SettingsJSON"#>>'{partySync,siteOrigin}'
    or v_ref_count<>1 or v_ref."ACCIER_SyncStatusCode" is distinct from 'synced'
    or p_result->>'referenceId' is distinct from v_ref."ACCIER_ID"::text
    or p_result->'expectedPayload' is distinct from v_ref."ACCIER_LastPayloadJSON") then
    v_outcome:='retry'; v_message:='Delivery evidence changed during the check. A fresh check is required.';
  end if;
  if v_outcome='retry' and v_event."ACCIWH_Attempts">=8 then
    v_outcome:='review'; v_message:='ERPNext incoming change could not be verified after eight attempts. Review the connection and retained event.';
  end if;
  v_status:=case v_outcome when 'matched' then 'synced' when 'review' then 'blocked' else 'failed' end;
  update public."ACCI_WebhookEvents" set "ACCIWH_ProcessingStatusCode"=v_status,
    "ACCIWH_LeaseToken"=null,"ACCIWH_LeaseUntil"=null,
    "ACCIWH_ProcessedAt"=case when v_outcome='retry' then null else now() end,
    "ACCIWH_ErrorMessage"=case when v_outcome='matched' then null else v_message end,
    "ACCIWH_NextAttemptAt"=now()+make_interval(secs=>least(3600,30*power(2,v_event."ACCIWH_Attempts")::integer)),
    "ACCIWH_ProcessingEvidence"=(p_result-'expectedPayload')||jsonb_build_object('outcome',v_outcome,'scope','document_delivery','checkedAt',now(),'fullLedgerReconciled',false)
    where "ACCIWH_ID"=p_id;
  -- A deleted connection still leaves its event blocked, without inventing a
  -- new tenant or transferring the evidence to a different connection.
  if v_connection."ACCIC_ID" is not null and v_outcome<>'retry' then
    if v_outcome='review' then
      insert into public."ACCI_ReconciliationIssues"("ACCIRI_ConnectionID","ACCIRI_ExternalRefID","ACCIRI_LocalTable","ACCIRI_LocalID",
        "ACCIRI_IssueType","ACCIRI_Severity","ACCIRI_StatusCode","ACCIRI_Title","ACCIRI_DetailText","ACCIRI_WebhookEventID")
      values(v_connection."ACCIC_ID",v_ref."ACCIER_ID",v_ref."ACCIER_LocalTable",v_ref."ACCIER_LocalID",
        'provider_inbound_review','error','queued','ERPNext change needs reconciliation',v_message,p_id)
      on conflict ("ACCIRI_WebhookEventID") do nothing;
    end if;
    insert into public."ACCI_SyncEvents"("ACCISE_ConnectionID","ACCISE_Severity","ACCISE_EventCode","ACCISE_Message",
      "ACCISE_LocalTable","ACCISE_LocalID","ACCISE_ExternalObjectType","ACCISE_ExternalID","ACCISE_RequestID","ACCISE_ResponsePayloadJSON")
    values(v_connection."ACCIC_ID",case when v_outcome='matched' then 'info' else 'error' end,
      'provider_inbound_'||v_outcome,v_message,v_ref."ACCIER_LocalTable",v_ref."ACCIER_LocalID",
      v_event."ACCIWH_ExternalObjectType",v_event."ACCIWH_ExternalID",p_id::text,
      jsonb_build_object('receiptId',p_id,'outcome',v_outcome,'scope','document_delivery','fullLedgerReconciled',false));
  end if;
  return true;
end $$;
revoke all on function public.multideck_erpnext_claim_inbound(integer),public.multideck_erpnext_finish_inbound(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_erpnext_claim_inbound(integer),public.multideck_erpnext_finish_inbound(uuid,uuid,jsonb) to service_role;
create function public.multideck_erpnext_inbound_health(p_connection uuid)
returns jsonb language sql security invoker set search_path = pg_catalog,public as $$
  select jsonb_build_object('scope','document_delivery','fullLedgerReconciled',false,
    'pending',count(*) filter(where "ACCIWH_ProcessingStatusCode" in ('queued','processing','failed')),
    'matched',count(*) filter(where "ACCIWH_ProcessingStatusCode"='synced'),
    'attention',count(*) filter(where "ACCIWH_ProcessingStatusCode"='blocked'),
    'issues',coalesce((select jsonb_agg(row_to_json(r)) from (
      select "ACCIWH_ID" as id,"ACCIWH_ExternalObjectType" as document_type,"ACCIWH_ExternalID" as document_number,
        "ACCIWH_ErrorMessage" as message,"ACCIWH_ReceivedAt" as received_at
      from public."ACCI_WebhookEvents" where "ACCIWH_ConnectionID"=p_connection
        and "ACCIWH_ProcessingStatusCode"='blocked' order by "ACCIWH_ReceivedAt" desc limit 100
    ) r),'[]'::jsonb))
  from public."ACCI_WebhookEvents" where "ACCIWH_ConnectionID"=p_connection and "ACCIWH_DeliveryKey" is not null;
$$;
revoke all on function public.multideck_erpnext_inbound_health(uuid) from public,anon,authenticated;
grant execute on function public.multideck_erpnext_inbound_health(uuid) to service_role;
commit;
