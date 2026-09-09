-- Manual customer outcomes belong to the latest version actually submitted,
-- never to a newer working draft that the customer has not seen.

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
  current_version record;
  outcome_version record;
  selected_version_id uuid;
  selected_version_number integer;
  next_lifecycle text := lower(btrim(requested_transition));
begin
  if caller_auth_user_id is null
     or not quote_api.has_permission(caller_auth_user_id, 'Quotes.Write') then
    raise exception 'Quote management is not authorised.' using errcode = '42501';
  end if;
  if next_lifecycle not in ('calculated', 'sent', 'revised', 'accepted', 'declined', 'ghosted') then
    raise exception 'Choose a supported quote action.' using errcode = '22023';
  end if;
  if next_lifecycle = 'declined' and nullif(btrim(requested_note), '') is null then
    raise exception 'Choose why this quote was lost.' using errcode = '22023';
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
  if coalesce(quote_row."CusQuoteHeader_LifecycleCode", 'draft') = 'accepted'
     and next_lifecycle <> 'declined' then
    raise exception 'An accepted quote can only be marked lost.' using errcode = '22023';
  end if;

  select version.* into current_version
  from public."CusQuote_Versions" version
  where version."CusQuoteHeader_ID" = requested_quote_id
    and version."CusQuoteVersion_IsCurrent"
  limit 1;

  if next_lifecycle in ('accepted', 'declined') then
    select version.* into outcome_version
    from public."CusQuote_Versions" version
    where version."CusQuoteHeader_ID" = requested_quote_id
      and version."CusQuoteVersion_IsSubmitted"
    order by version."CusQuoteVersion_SubmittedAt" desc nulls last,
      version."CusQuoteVersion_Number" desc
    limit 1
    for update;
  end if;

  if next_lifecycle = 'accepted' and outcome_version."CusQuoteVersion_ID" is null then
    raise exception 'Submit the quote before recording customer acceptance.' using errcode = '22023';
  end if;
  if next_lifecycle = 'accepted'
     and outcome_version."CusQuoteVersion_StatusCode" in ('declined', 'changes_requested') then
    raise exception 'Create and submit a new quote version before recording fresh customer acceptance.' using errcode = '22023';
  end if;

  selected_version_id := coalesce(outcome_version."CusQuoteVersion_ID", current_version."CusQuoteVersion_ID");
  selected_version_number := coalesce(outcome_version."CusQuoteVersion_Number", current_version."CusQuoteVersion_Number");
  if selected_version_id is null then
    raise exception 'The quote version is unavailable.' using errcode = 'P0002';
  end if;

  if outcome_version."CusQuoteVersion_ID" is not null then
    update public."CusQuote_Versions"
    set "CusQuoteVersion_StatusCode" = case next_lifecycle
      when 'accepted' then 'accepted'
      when 'declined' then 'declined'
      else "CusQuoteVersion_StatusCode"
    end
    where "CusQuoteVersion_ID" = outcome_version."CusQuoteVersion_ID";
  end if;

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
      when next_lifecycle = 'accepted' then selected_version_id
      when next_lifecycle = 'declined' then null
      else "CusQuoteHeader_AcceptedVersionID" end,
    "CusQuoteHeader_LastEditedBy" = app_user."User_ID",
    "CusQuoteHeader_LastEditedDate" = now()
  where "CusQuoteHeader_ID" = requested_quote_id;

  insert into public."CusQuote_Events" (
    "Company_ID", "CusQuoteHeader_ID", "CusQuoteVersion_ID", "CusQuoteEvent_TypeCode",
    "CusQuoteEvent_Summary", "CusQuoteEvent_MetadataJSON",
    "CusQuoteEvent_ActorUserID"
  ) values (
    app_user."Company_ID", requested_quote_id, selected_version_id, next_lifecycle,
    case
      when next_lifecycle = 'accepted' then 'Accepted manually using ' || case when selected_version_number = 1 then 'the original quote' else 'V' || selected_version_number end || '.'
      when next_lifecycle = 'declined' then 'Lost' || case when nullif(btrim(requested_note), '') is null then '.' else ': ' || left(btrim(requested_note), 500) end
      else initcap(next_lifecycle) || case when nullif(btrim(requested_note), '') is null then '.' else ': ' || left(btrim(requested_note), 500) end
    end,
    jsonb_strip_nulls(jsonb_build_object(
      'followUpAt', requested_follow_up_at,
      'lossReason', case when next_lifecycle = 'declined' then btrim(requested_note) end,
      'outcomeSource', case when next_lifecycle in ('accepted', 'declined') then 'manual' end,
      'selectedVersionId', selected_version_id,
      'selectedVersionNumber', selected_version_number,
      'workingDraftPreserved', current_version."CusQuoteVersion_ID" is distinct from selected_version_id
    )),
    app_user."User_ID"
  );

  return jsonb_build_object(
    'quoteId', requested_quote_id,
    'lifecycle', next_lifecycle,
    'versionId', selected_version_id,
    'versionNumber', selected_version_number,
    'workingDraftPreserved', current_version."CusQuoteVersion_ID" is distinct from selected_version_id,
    'lossReason', case when next_lifecycle = 'declined' then btrim(requested_note) end
  );
exception
  when no_data_found or too_many_rows then
    raise exception 'User identity is incomplete or ambiguous.' using errcode = '42501';
end;
$$;

revoke all on function quote_api.transition_quote(uuid,uuid,text,text,timestamptz)
  from public,anon,authenticated;
grant execute on function quote_api.transition_quote(uuid,uuid,text,text,timestamptz)
  to service_role;

update public."sys_AIDexterActions" set
  "AIDexterAction_Description"='Record operator-confirmed customer acceptance against the latest submitted quote version and create or reuse its booking. A newer unsubmitted working draft is preserved and never applied.',
  "AIDexterAction_UpdatedAt"=now()
where "AIDexterAction_Code"='mark_quote_won';

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Customer quote versions, delivery evidence, manual or secure-link outcomes, routing and commercial evidence. Manual acceptance always names the latest submitted version and preserves newer working drafts.',
  "AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code"='quotes';

commit;
