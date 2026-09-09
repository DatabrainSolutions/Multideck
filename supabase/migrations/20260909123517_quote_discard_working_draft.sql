-- Filename matches the shared-development migration ledger.
begin;
set local lock_timeout = '5s';

alter table public."CusQuote_Versions"
  add column "CusQuoteVersion_DiscardedAt" timestamptz,
  add column "CusQuoteVersion_DiscardedToID" uuid references public."CusQuote_Versions"("CusQuoteVersion_ID");

create function quote_api.protect_discarded_draft() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old."CusQuoteVersion_DiscardedAt" is not null then
    raise exception 'Discarded drafts are retained for audit and cannot be changed.' using errcode='22023';
  end if;
  if tg_op='UPDATE' and new."CusQuoteVersion_DiscardedAt" is not null
    and (new."CusQuoteVersion_IsSubmitted" or new."CusQuoteVersion_IsCurrent") then
    raise exception 'Only an unsent, inactive draft can be discarded.' using errcode='22023';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
create trigger quote_protect_discarded_draft before update or delete on public."CusQuote_Versions"
for each row execute function quote_api.protect_discarded_draft();
revoke all on function quote_api.protect_discarded_draft() from public,anon,authenticated,service_role;

-- Keep the canonical validation/projection path, with a locked version boundary
-- outside it. Older clients fail closed on Quotes which have used discard.
alter function public.quote_workflow_save_quote(uuid,uuid,jsonb)
rename to quote_workflow_save_before_discard_20260909;
revoke all on function public.quote_workflow_save_before_discard_20260909(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.quote_workflow_save_quote(caller_auth_user_id uuid,requested_quote_id uuid,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_version public."CusQuote_Versions"; guarded boolean;
begin
  if requested_quote_id is not null then
    if not coalesce(quote_api.has_permission(caller_auth_user_id,'Quotes.Write'),false) then
      raise exception 'Quote management is not authorised.' using errcode='42501';
    end if;
    perform 1 from public."CusQuote_Header" q
    join public."cmp_Offices" o on o."Office_ID"=coalesce(q."CusQuoteHeader_OrgOfficeID",q."OrgOffice_ID")
    join public."cmp_Users" u on u."Company_ID"=o."Company_ID" and u."Auth_User_ID"=caller_auth_user_id and u."User_AccessStatus"='active'
    where q."CusQuoteHeader_ID"=requested_quote_id and not q."CusQuoteHeader_IsDeleted" for update of q;
    if not found then raise exception 'Quote is outside this workspace.' using errcode='42501'; end if;
    select * into strict current_version from public."CusQuote_Versions"
    where "CusQuoteHeader_ID"=requested_quote_id and "CusQuoteVersion_IsCurrent" for update;
    guarded := payload ? '_expectedVersionId' or exists(select 1 from public."CusQuote_Versions"
      where "CusQuoteHeader_ID"=requested_quote_id and "CusQuoteVersion_DiscardedAt" is not null);
    if guarded and (payload->>'_expectedVersionId') is distinct from current_version."CusQuoteVersion_ID"::text then
      raise exception 'This Quote version has changed. Reload before editing.' using errcode='40001';
    end if;
    if guarded and current_version."CusQuoteVersion_IsSubmitted" and coalesce(payload->>'_createVersion','false') <> 'true' then
      raise exception 'Create a new working version before editing this submitted Quote.' using errcode='40001';
    end if;
  end if;
  return public.quote_workflow_save_before_discard_20260909(caller_auth_user_id,requested_quote_id,payload-array['_expectedVersionId','_createVersion']);
end;
$$;
revoke all on function public.quote_workflow_save_quote(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.quote_workflow_save_quote(uuid,uuid,jsonb) to service_role;

create function public.quote_workflow_discard_draft(
 caller_auth_user_id uuid, requested_quote_id uuid, requested_version_id uuid, expected_snapshot jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor record; draft public."CusQuote_Versions"; target public."CusQuote_Versions"; saved jsonb; q public."CusQuote_Header"; prior_restore text;
begin
  if not coalesce(quote_api.has_permission(caller_auth_user_id,'Quotes.Write'),false) then
    raise exception 'Quote management is not authorised.' using errcode='42501';
  end if;
  select "User_ID","Company_ID" into strict actor from public."cmp_Users"
  where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active';
  select header.* into q from public."CusQuote_Header" header
  join public."cmp_Offices" office on office."Office_ID"=coalesce(header."CusQuoteHeader_OrgOfficeID",header."OrgOffice_ID")
  where header."CusQuoteHeader_ID"=requested_quote_id and not header."CusQuoteHeader_IsDeleted"
    and office."Company_ID"=actor."Company_ID" for update of header;
  if not found then raise exception 'Quote is outside this workspace.' using errcode='42501'; end if;
  select * into draft from public."CusQuote_Versions" where "CusQuoteVersion_ID"=requested_version_id
    and "CusQuoteHeader_ID"=requested_quote_id and "Company_ID"=actor."Company_ID" for update;
  if not found then raise exception 'That draft is unavailable.' using errcode='22023'; end if;
  if draft."CusQuoteVersion_DiscardedAt" is not null then
    return jsonb_build_object('restoredVersionId',draft."CusQuoteVersion_DiscardedToID",'alreadyDiscarded',true);
  end if;
  if draft."CusQuoteVersion_IsSubmitted" or not draft."CusQuoteVersion_IsCurrent" then
    raise exception 'Only the current unsent working draft can be discarded.' using errcode='22023';
  end if;
  if draft."CusQuoteVersion_SnapshotJSON" is distinct from expected_snapshot then
    raise exception 'The draft changed after you opened it. Reload before discarding.' using errcode='40001';
  end if;
  if exists(select 1 from quote_api.customer_response_links where quote_version_id=requested_version_id)
    or exists(select 1 from quote_api.customer_responses where quote_version_id=requested_version_id) then
    raise exception 'This draft has delivery or response activity. Resolve that activity before discarding.' using errcode='22023';
  end if;
  select * into target from public."CusQuote_Versions"
  where "CusQuoteHeader_ID"=requested_quote_id and "CusQuoteVersion_IsSubmitted"
    and "CusQuoteVersion_DiscardedAt" is null
  order by ("CusQuoteVersion_StatusCode"='accepted') desc,"CusQuoteVersion_Number" desc limit 1 for update;
  if not found or jsonb_typeof(target."CusQuoteVersion_SnapshotJSON"->'quote') is distinct from 'object' then
    raise exception 'No readable submitted version is available to return to.' using errcode='22023';
  end if;
  -- Reuse the established Quote projection, but never issue, accept or convert.
  saved := public.quote_workflow_save_before_discard_20260909(caller_auth_user_id,requested_quote_id,target."CusQuoteVersion_SnapshotJSON"->'quote');
  if (saved->>'versionId')::uuid <> draft."CusQuoteVersion_ID" then
    raise exception 'The draft lifecycle changed. Reload before discarding.' using errcode='40001';
  end if;
  update public."CusQuote_Versions" set "CusQuoteVersion_IsCurrent"=false,
    "CusQuoteVersion_SnapshotJSON"=draft."CusQuoteVersion_SnapshotJSON",
    "CusQuoteVersion_DiscardedAt"=now(),"CusQuoteVersion_DiscardedToID"=target."CusQuoteVersion_ID"
    where "CusQuoteVersion_ID"=draft."CusQuoteVersion_ID";
  update public."CusQuote_Versions" set "CusQuoteVersion_IsCurrent"=true where "CusQuoteVersion_ID"=target."CusQuoteVersion_ID";
  prior_restore := current_setting('quote_api.discard_restore_quote',true);
  perform set_config('quote_api.discard_restore_quote',requested_quote_id::text,true);
  update public."CusQuote_Header" set "CusQuoteHeader_LifecycleCode"=target."CusQuoteVersion_StatusCode",
    "CusQuoteHeader_Status"=case target."CusQuoteVersion_StatusCode" when 'accepted' then 5 when 'declined' then 6 when 'sent' then 4 when 'submitted' then 4 else 1 end,
    "CusQuoteHeader_LastEditedDate"=now(),"CusQuoteHeader_LastEditedBy"=actor."User_ID"
    where "CusQuoteHeader_ID"=requested_quote_id;
  perform set_config('quote_api.discard_restore_quote',coalesce(prior_restore,''),true);
  insert into public."CusQuote_Events"("Company_ID","CusQuoteHeader_ID","CusQuoteVersion_ID","CusQuoteEvent_TypeCode","CusQuoteEvent_Summary","CusQuoteEvent_MetadataJSON","CusQuoteEvent_ActorUserID")
  values(actor."Company_ID",requested_quote_id,draft."CusQuoteVersion_ID",'draft_discarded',
    format('Working draft V%s discarded; returned to V%s.',draft."CusQuoteVersion_Number",target."CusQuoteVersion_Number"),
    jsonb_build_object('discardedVersionId',draft."CusQuoteVersion_ID",'restoredVersionId',target."CusQuoteVersion_ID"),actor."User_ID");
  return jsonb_build_object('restoredVersionId',target."CusQuoteVersion_ID",'restoredVersionNumber',target."CusQuoteVersion_Number");
end;
$$;
revoke all on function public.quote_workflow_discard_draft(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.quote_workflow_discard_draft(uuid,uuid,uuid,jsonb) to service_role;

-- Restoring an existing acceptance is not a customer acceptance event. Require
-- both the scoped restoration context and a draft archived in this transaction.
create or replace function booking_api.on_quote_accepted_create_booking()
returns trigger language plpgsql security definer set search_path='' as $$
declare conversion jsonb; actor_id uuid;
begin
  if current_setting('quote_api.discard_restore_quote',true)=new."CusQuoteHeader_ID"::text
    and exists(select 1 from public."CusQuote_Versions" discarded
      join public."CusQuote_Versions" restored on restored."CusQuoteVersion_ID"=discarded."CusQuoteVersion_DiscardedToID"
      where discarded."CusQuoteHeader_ID"=new."CusQuoteHeader_ID"
        and discarded."CusQuoteVersion_DiscardedAt"=transaction_timestamp()
        and restored."CusQuoteVersion_IsCurrent" and restored."CusQuoteVersion_IsSubmitted") then
    return new;
  end if;
  if new."CusQuoteHeader_LifecycleCode"='accepted'
    and old."CusQuoteHeader_LifecycleCode" is distinct from new."CusQuoteHeader_LifecycleCode" then
    actor_id:=coalesce(new."CusQuoteHeader_LastEditedBy",new."CusQuoteHeader_CreatedBy");
    conversion:=booking_api.convert_accepted_quote(new."CusQuoteHeader_ID",actor_id,null);
    perform booking_api.hydrate_accepted_quote_booking((conversion->>'jobId')::uuid,actor_id);
    perform booking_api.correct_accepted_quote_booking((conversion->>'jobId')::uuid,actor_id);
  end if;
  return new;
end;
$$;
revoke all on function booking_api.on_quote_accepted_create_booking() from public,anon,authenticated,service_role;

-- Explicit parity exception: destructive version selection is operator-only.
update public."sys_AIDexterDataDomains" set "AIDexterDomain_Description"="AIDexterDomain_Description" || ' Discarding working Quote drafts is operator-only; direct the user to Quote actions. Do not claim to discard or recover drafts.' where "AIDexterDomain_Code"='quotes';
update public."sys_AIDexterWatchCapabilities" set "AIDexterWatchCapability_Description"="AIDexterWatchCapability_Description" || ' Dedicated draft-discard watches are unsupported; do not promise them. Existing lifecycle watches retain their existing meaning.' where "AIDexterWatchCapability_Code"='quotes';
commit;
