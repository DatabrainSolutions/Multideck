-- Return the saved revision's readiness and audit summary without a second
-- workspace load. No new mutations/events: Dexter's existing save adapter and
-- deterministic quote watches continue to use the same authorised lifecycle.
begin;

create or replace function public.quote_workflow_save_quote(
  caller_auth_user_id uuid,
  requested_quote_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved jsonb;
  saved_quote_id uuid;
  saved_version_id uuid;
  version_summary jsonb;
  committed_events jsonb;
begin
  if requested_quote_id is not null
     and quote_api.has_permission(caller_auth_user_id, 'Quotes.Write')
     and exists (
       select 1
       from public."CusQuote_Header" quote
       join public."cmp_Offices" office
         on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
       join public."cmp_Users" app_user
         on app_user."Auth_User_ID" = caller_auth_user_id
        and app_user."Company_ID" = office."Company_ID"
        and app_user."User_AccessStatus" = 'active'
       where quote."CusQuoteHeader_ID" = requested_quote_id
         and quote."CusQuoteHeader_LifecycleCode" = 'accepted'
         and not quote."CusQuoteHeader_IsDeleted"
     ) then
    update public."CusQuote_Header" set
      "CusQuoteHeader_LifecycleCode" = 'revised',
      "CusQuoteHeader_Status" = 1
    where "CusQuoteHeader_ID" = requested_quote_id;
  end if;

  saved := quote_api.save_quote(caller_auth_user_id, requested_quote_id, payload);
  saved_quote_id := (saved ->> 'quoteId')::uuid;
  saved_version_id := (saved ->> 'versionId')::uuid;

  -- The underlying save holds the quote lock and enforces the existing write
  -- permission/company boundary. Read its committed evidence in this same
  -- transaction, so failure rolls everything back rather than reporting a
  -- failed save after a separate enrichment request has already committed.
  select jsonb_build_object(
    'CusQuoteVersion_ID', version."CusQuoteVersion_ID",
    'CusQuoteVersion_Number', version."CusQuoteVersion_Number",
    'CusQuoteVersion_StatusCode', version."CusQuoteVersion_StatusCode",
    'CusQuoteVersion_IsCurrent', version."CusQuoteVersion_IsCurrent",
    'CusQuoteVersion_CreatedAt', version."CusQuoteVersion_CreatedAt"
  ) into strict version_summary
  from public."CusQuote_Versions" version
  where version."CusQuoteHeader_ID" = saved_quote_id
    and version."CusQuoteVersion_ID" = saved_version_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'CusQuoteEvent_ID', event."CusQuoteEvent_ID",
    'CusQuoteEvent_TypeCode', event."CusQuoteEvent_TypeCode",
    'CusQuoteEvent_Summary', event."CusQuoteEvent_Summary",
    'CusQuoteEvent_OccurredAt', event."CusQuoteEvent_OccurredAt",
    'CusQuoteEvent_MetadataJSON', event."CusQuoteEvent_MetadataJSON",
    'cmp_Users', jsonb_build_object('User_Firstname', actor."User_Firstname", 'User_Lastname', actor."User_Lastname")
  ) order by event."CusQuoteEvent_OccurredAt" desc), '[]'::jsonb) into committed_events
  from public."CusQuote_Events" event
  left join public."cmp_Users" actor on actor."User_ID" = event."CusQuoteEvent_ActorUserID"
  where event."CusQuoteHeader_ID" = saved_quote_id
    and event."CusQuoteVersion_ID" = saved_version_id;

  return saved || jsonb_build_object(
    'readiness', booking_api.quote_readiness(saved_quote_id),
    'version', version_summary,
    'events', committed_events
  );
end;
$$;

revoke all on function public.quote_workflow_save_quote(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.quote_workflow_save_quote(uuid, uuid, jsonb) to service_role;
commit;
