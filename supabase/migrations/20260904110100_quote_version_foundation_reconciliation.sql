-- Reconcile the pre-lifecycle autosave history and preserve the enriched save
-- response introduced on origin/dev. A quote exposes only submitted evidence
-- plus one current mutable draft, with customer-facing version numbers kept
-- sequential.

begin;

-- Some pre-link workflow versions carry explicit sent/accepted/declined audit
-- evidence even though the old row did not have an IsSubmitted flag. Promote
-- those rows before removing autosave-only drafts.
update public."CusQuote_Versions" version
set
  "CusQuoteVersion_IsSubmitted" = true,
  "CusQuoteVersion_SubmittedAt" = coalesce(version."CusQuoteVersion_SubmittedAt", evidence.occurred_at),
  "CusQuoteVersion_SubmittedBy" = coalesce(version."CusQuoteVersion_SubmittedBy", evidence.actor_user_id),
  "CusQuoteVersion_StatusCode" = evidence.status_code
from (
  select
    event."CusQuoteVersion_ID" as version_id,
    min(event."CusQuoteEvent_OccurredAt") as occurred_at,
    (array_agg(event."CusQuoteEvent_ActorUserID" order by event."CusQuoteEvent_OccurredAt")
      filter (where event."CusQuoteEvent_ActorUserID" is not null))[1] as actor_user_id,
    case
      when bool_or(event."CusQuoteEvent_TypeCode" in ('accepted', 'customer_accepted')) then 'accepted'
      when bool_or(event."CusQuoteEvent_TypeCode" in ('declined', 'customer_declined')) then 'declined'
      when bool_or(event."CusQuoteEvent_TypeCode" in ('challenged', 'customer_challenged')) then 'changes_requested'
      else 'submitted'
    end as status_code
  from public."CusQuote_Events" event
  where event."CusQuoteEvent_TypeCode" in (
      'sent', 'accepted', 'declined', 'challenged',
      'customer_accepted', 'customer_declined', 'customer_challenged'
    )
  group by event."CusQuoteVersion_ID"
) evidence
where not version."CusQuoteVersion_IsSubmitted"
  and evidence.version_id = version."CusQuoteVersion_ID"
  and evidence.occurred_at is not null;

create temporary table quote_versions_to_remove on commit drop as
select version."CusQuoteVersion_ID" as version_id
from public."CusQuote_Versions" version
where not version."CusQuoteVersion_IsSubmitted"
  and not version."CusQuoteVersion_IsCurrent"
  and not exists (
    select 1 from quote_api.customer_response_links link
    where link.quote_version_id = version."CusQuoteVersion_ID"
  )
  and not exists (
    select 1 from quote_api.customer_responses response
    where response.quote_version_id = version."CusQuoteVersion_ID"
  )
  and not exists (
    select 1 from public."Job_Header" job
    where job."Job_SourceQuoteVersionID" = version."CusQuoteVersion_ID"
      or job."Job_PendingQuoteVersionID" = version."CusQuoteVersion_ID"
  )
  and not exists (
    select 1 from booking_api.quote_sync_reviews review
    where review.applied_version_id = version."CusQuoteVersion_ID"
      or review.proposed_version_id = version."CusQuoteVersion_ID"
  )
  and not exists (
    select 1 from public."CusQuote_Events" event
    where event."CusQuoteVersion_ID" = version."CusQuoteVersion_ID"
      and event."CusQuoteEvent_TypeCode" not in ('created', 'saved')
  );

delete from public."CusQuote_Events" event
using quote_versions_to_remove stale
where event."CusQuoteVersion_ID" = stale.version_id;

delete from public."CusQuote_Versions" version
using quote_versions_to_remove stale
where version."CusQuoteVersion_ID" = stale.version_id;

-- Submitted rows are immutable during normal operation. Temporarily suspend
-- that guard only for this one deterministic repair, then restore it before
-- the transaction commits.
alter table public."CusQuote_Versions"
  disable trigger "TR_CusQuote_Versions_prevent_submitted_mutation";

create temporary table quote_version_resequence on commit drop as
select
  version."CusQuoteVersion_ID" as version_id,
  row_number() over (
    partition by version."CusQuoteHeader_ID"
    order by
      coalesce(version."CusQuoteVersion_SubmittedAt", version."CusQuoteVersion_CreatedAt"),
      version."CusQuoteVersion_CreatedAt",
      version."CusQuoteVersion_ID"
  )::integer as version_number
from public."CusQuote_Versions" version;

-- Move into a collision-free temporary range before assigning the final
-- sequential numbers covered by the existing quote/version unique key.
update public."CusQuote_Versions" version
set "CusQuoteVersion_Number" = -repair.version_number
from quote_version_resequence repair
where repair.version_id = version."CusQuoteVersion_ID";

update public."CusQuote_Versions" version
set
  "CusQuoteVersion_Number" = repair.version_number,
  "CusQuoteVersion_StatusCode" = case
    when version."CusQuoteVersion_IsCurrent" and not version."CusQuoteVersion_IsSubmitted" then 'draft'
    else version."CusQuoteVersion_StatusCode"
  end
from quote_version_resequence repair
where repair.version_id = version."CusQuoteVersion_ID";

update public."CusQuote_Events" event
set "CusQuoteEvent_MetadataJSON" = coalesce(event."CusQuoteEvent_MetadataJSON", '{}'::jsonb)
  || jsonb_build_object('versionNumber', repair.version_number)
from quote_version_resequence repair
where event."CusQuoteVersion_ID" = repair.version_id
  and event."CusQuoteEvent_TypeCode" in ('created', 'saved', 'sent', 'customer_accepted', 'customer_declined', 'customer_challenged');

alter table public."CusQuote_Versions"
  enable trigger "TR_CusQuote_Versions_prevent_submitted_mutation";

-- Keep origin/dev's committed readiness/version/event response while also
-- honouring the one-draft lifecycle and the distinct changes-requested state.
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
         and quote."CusQuoteHeader_LifecycleCode" in ('accepted', 'changes_requested')
         and not quote."CusQuoteHeader_IsDeleted"
     ) then
    update public."CusQuote_Header"
    set
      "CusQuoteHeader_LifecycleCode" = 'revised',
      "CusQuoteHeader_Status" = 1
    where "CusQuoteHeader_ID" = requested_quote_id;
  end if;

  saved := quote_api.save_quote(caller_auth_user_id, requested_quote_id, payload);
  saved_quote_id := (saved ->> 'quoteId')::uuid;
  saved_version_id := (saved ->> 'versionId')::uuid;

  select jsonb_build_object(
    'CusQuoteVersion_ID', version."CusQuoteVersion_ID",
    'CusQuoteVersion_Number', version."CusQuoteVersion_Number",
    'CusQuoteVersion_StatusCode', version."CusQuoteVersion_StatusCode",
    'CusQuoteVersion_IsCurrent', version."CusQuoteVersion_IsCurrent",
    'CusQuoteVersion_IsSubmitted', version."CusQuoteVersion_IsSubmitted",
    'CusQuoteVersion_CreatedAt', version."CusQuoteVersion_CreatedAt",
    'CusQuoteVersion_SubmittedAt', version."CusQuoteVersion_SubmittedAt",
    'CusQuoteVersion_SubmittedBy', version."CusQuoteVersion_SubmittedBy",
    'CusQuoteVersion_SnapshotJSON', version."CusQuoteVersion_SnapshotJSON"
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
    'cmp_Users', jsonb_build_object(
      'User_Firstname', actor."User_Firstname",
      'User_Lastname', actor."User_Lastname"
    )
  ) order by event."CusQuoteEvent_OccurredAt" desc), '[]'::jsonb)
  into committed_events
  from public."CusQuote_Events" event
  left join public."cmp_Users" actor
    on actor."User_ID" = event."CusQuoteEvent_ActorUserID"
  where event."CusQuoteHeader_ID" = saved_quote_id
    and event."CusQuoteVersion_ID" = saved_version_id;

  return saved || jsonb_build_object(
    'readiness', booking_api.quote_readiness(saved_quote_id),
    'version', version_summary,
    'events', committed_events
  );
end;
$$;

revoke all on function public.quote_workflow_save_quote(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.quote_workflow_save_quote(uuid, uuid, jsonb)
  to service_role;

commit;
