-- Make the master quote reference and applied/proposed version visible on bookings.

begin;

create or replace function booking_api.workspace_with_document_groups(
  caller_auth_user_id uuid,
  requested_reference text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  job_id uuid;
  source_quote jsonb;
  applied_version_number integer;
  pending_version_number integer;
  sync_status text;
begin
  result := booking_api.workspace_extended(caller_auth_user_id, requested_reference);
  job_id := nullif(result->'booking'->>'jobId', '')::uuid;
  result := jsonb_set(
    result,
    '{documents}',
    booking_api.workspace_documents(caller_auth_user_id, job_id),
    true
  );

  if nullif(result->'booking'->>'sourceQuoteId', '') is not null then
    select
      applied."CusQuoteVersion_Number",
      pending."CusQuoteVersion_Number",
      job."Job_QuoteSyncStatus"
    into applied_version_number, pending_version_number, sync_status
    from public."Job_Header" job
    left join public."CusQuote_Versions" applied
      on applied."CusQuoteVersion_ID"=job."Job_SourceQuoteVersionID"
    left join public."CusQuote_Versions" pending
      on pending."CusQuoteVersion_ID"=job."Job_PendingQuoteVersionID"
    where job."Job_ID"=job_id and not job."Job_IsDeleted";

    source_quote := coalesce(result->'sourceQuote', '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'appliedVersionNumber', applied_version_number,
      'pendingVersionNumber', pending_version_number,
      'syncStatus', sync_status
    ));
    result := jsonb_set(result, '{sourceQuote}', source_quote, true);
  end if;

  return result;
end;
$$;

create or replace function public.booking_workflow_quote_sync_review(
  caller_auth_user_id uuid,
  requested_job_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  app_user record;
  review_row record;
begin
  if caller_auth_user_id is null or not booking_api.has_permission(caller_auth_user_id,'Bookings.Read') then
    raise exception 'Booking access is not authorised.' using errcode='42501';
  end if;
  select "User_ID","Company_ID" into strict app_user from public."cmp_Users"
  where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active';
  select
    review.*,
    coalesce(quote."CusQuoteHeader_CustomerReference", 'Q-' || quote."CusQuoteHeader_Number") as quote_reference,
    applied."CusQuoteVersion_Number" as applied_version_number,
    proposed."CusQuoteVersion_Number" as proposed_version_number
  into review_row
  from booking_api.quote_sync_reviews review
  join public."CusQuote_Header" quote on quote."CusQuoteHeader_ID"=review.quote_id
  left join public."CusQuote_Versions" applied on applied."CusQuoteVersion_ID"=review.applied_version_id
  join public."CusQuote_Versions" proposed on proposed."CusQuoteVersion_ID"=review.proposed_version_id
  where review.job_id=requested_job_id and review.company_id=app_user."Company_ID"
    and review.status_code in ('pending','partially_applied')
  order by review.created_at desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'reviewId',review_row.review_id,'jobId',review_row.job_id,'quoteId',review_row.quote_id,
    'quoteReference',review_row.quote_reference,
    'appliedVersionId',review_row.applied_version_id,'appliedVersionNumber',review_row.applied_version_number,
    'proposedVersionId',review_row.proposed_version_id,'proposedVersionNumber',review_row.proposed_version_number,
    'status',review_row.status_code,'differences',review_row.differences,
    'appliedFields',review_row.applied_fields,'createdAt',review_row.created_at
  );
exception when no_data_found or too_many_rows then
  raise exception 'Your workspace identity is incomplete.' using errcode='42501';
end;
$$;

revoke all on function booking_api.workspace_with_document_groups(uuid,text) from public, anon, authenticated;
revoke all on function public.booking_workflow_quote_sync_review(uuid,uuid) from public, anon, authenticated;
grant execute on function booking_api.workspace_with_document_groups(uuid,text) to service_role;
grant execute on function public.booking_workflow_quote_sync_review(uuid,uuid) to service_role;

commit;
