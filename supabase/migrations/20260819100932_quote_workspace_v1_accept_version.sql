-- Bind accepted quotes and lifecycle events to the immutable quote version.

begin;

create or replace function quote_api.transition_quote(
  caller_auth_user_id uuid,
  requested_quote_id uuid,
  requested_transition text,
  requested_note text default null,
  requested_follow_up_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_user record;
  quote_row record;
  current_version_id uuid;
  next_lifecycle text := lower(btrim(requested_transition));
begin
  if caller_auth_user_id is null
     or not quote_api.has_permission(caller_auth_user_id, 'Quotes.Write') then
    raise exception 'Quote management is not authorised.' using errcode = '42501';
  end if;
  if next_lifecycle not in ('calculated', 'sent', 'revised', 'accepted', 'declined', 'ghosted') then
    raise exception 'Choose a supported quote action.' using errcode = '22023';
  end if;

  select "User_ID", "Company_ID" into strict app_user
  from public."cmp_Users"
  where "Auth_User_ID" = caller_auth_user_id and "User_AccessStatus" = 'active';

  select quote.* into quote_row
  from public."CusQuote_Header" quote
  join public."cmp_Offices" office
    on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
  where quote."CusQuoteHeader_ID" = requested_quote_id
    and office."Company_ID" = app_user."Company_ID"
    and not quote."CusQuoteHeader_IsDeleted"
  for update;
  if not found then
    raise exception 'That quote is outside this workspace.' using errcode = '42501';
  end if;
  if coalesce(quote_row."CusQuoteHeader_LifecycleCode", 'draft') = 'accepted' then
    raise exception 'An accepted quote cannot be changed.' using errcode = '22023';
  end if;

  select version."CusQuoteVersion_ID" into current_version_id
  from public."CusQuote_Versions" version
  where version."CusQuoteHeader_ID" = requested_quote_id
    and version."CusQuoteVersion_IsCurrent"
  limit 1;

  update public."CusQuote_Header" set
    "CusQuoteHeader_LifecycleCode" = next_lifecycle,
    "CusQuoteHeader_Status" = case next_lifecycle
      when 'calculated' then 2 when 'sent' then 4 when 'accepted' then 5
      when 'declined' then 6 when 'ghosted' then 7 else 1 end,
    "CusQuoteHeader_OutcomeNotes" = case
      when next_lifecycle in ('accepted', 'declined', 'ghosted')
        then nullif(btrim(requested_note), '')
      else "CusQuoteHeader_OutcomeNotes" end,
    "CusQuoteHeader_FollowUpAt" = coalesce(
      requested_follow_up_at, "CusQuoteHeader_FollowUpAt"
    ),
    "CusQuoteHeader_AcceptedVersionID" = case
      when next_lifecycle = 'accepted' then current_version_id
      else "CusQuoteHeader_AcceptedVersionID" end,
    "CusQuoteHeader_LastEditedBy" = app_user."User_ID",
    "CusQuoteHeader_LastEditedDate" = now()
  where "CusQuoteHeader_ID" = requested_quote_id;

  insert into public."CusQuote_Events" (
    "Company_ID", "CusQuoteHeader_ID", "CusQuoteVersion_ID", "CusQuoteEvent_TypeCode",
    "CusQuoteEvent_Summary", "CusQuoteEvent_MetadataJSON",
    "CusQuoteEvent_ActorUserID"
  ) values (
    app_user."Company_ID", requested_quote_id, current_version_id, next_lifecycle,
    initcap(next_lifecycle) ||
      case when nullif(btrim(requested_note), '') is null
        then '.' else ': ' || left(btrim(requested_note), 500) end,
    jsonb_strip_nulls(jsonb_build_object('followUpAt', requested_follow_up_at)),
    app_user."User_ID"
  );

  return jsonb_build_object(
    'quoteId', requested_quote_id,
    'lifecycle', next_lifecycle
  );
exception
  when no_data_found or too_many_rows then
    raise exception 'User identity is incomplete or ambiguous.' using errcode = '42501';
end;
$$;


update public."CusQuote_Header" quote
set "CusQuoteHeader_AcceptedVersionID" = current_version."CusQuoteVersion_ID"
from public."CusQuote_Versions" current_version
where quote."CusQuoteHeader_ID" = current_version."CusQuoteHeader_ID"
  and current_version."CusQuoteVersion_IsCurrent"
  and quote."CusQuoteHeader_LifecycleCode" = 'accepted'
  and quote."CusQuoteHeader_AcceptedVersionID" is null
  and quote."CusQuoteHeader_WorkflowVersionCode" = 'quotes-v1';

update public."CusQuote_Events" event
set "CusQuoteVersion_ID" = current_version."CusQuoteVersion_ID"
from public."CusQuote_Header" quote
join public."CusQuote_Versions" current_version
  on current_version."CusQuoteHeader_ID" = quote."CusQuoteHeader_ID"
 and current_version."CusQuoteVersion_IsCurrent"
where event."CusQuoteHeader_ID" = quote."CusQuoteHeader_ID"
  and event."CusQuoteVersion_ID" is null
  and event."CusQuoteEvent_TypeCode" in (
    'calculated', 'sent', 'revised', 'accepted', 'declined', 'ghosted'
  )
  and quote."CusQuoteHeader_WorkflowVersionCode" = 'quotes-v1';

commit;

