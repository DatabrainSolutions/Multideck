-- Secure-link acceptance updates the quote header and also asks for the
-- booking result explicitly. The header trigger may therefore reach the same
-- accepted version first. Reuse that active review instead of superseding it
-- and emitting a duplicate booking notification.

begin;

alter function booking_api.convert_accepted_quote(uuid, uuid, uuid)
  rename to convert_accepted_quote_before_idempotent_review_20260904;

create or replace function booking_api.convert_accepted_quote(
  requested_quote_id uuid,
  requested_actor_user_id uuid default null,
  requested_response_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_job record;
  quote_row record;
  active_review record;
begin
  select job.* into existing_job
  from public."Job_Header" job
  where job."Job_SourceQuoteID" = requested_quote_id
    and not job."Job_IsDeleted"
  order by job."Job_CreatedDate"
  limit 1
  for update;

  if found then
    select quote.* into strict quote_row
    from public."CusQuote_Header" quote
    where quote."CusQuoteHeader_ID" = requested_quote_id
      and quote."CusQuoteHeader_LifecycleCode" = 'accepted'
      and not quote."CusQuoteHeader_IsDeleted";

    select review.* into active_review
    from booking_api.quote_sync_reviews review
    where review.job_id = existing_job."Job_ID"
      and review.quote_id = requested_quote_id
      and review.proposed_version_id = quote_row."CusQuoteHeader_AcceptedVersionID"
      and review.status_code in ('pending', 'partially_applied')
    order by review.created_at desc
    limit 1
    for update;

    if found then
      if requested_response_id is not null then
        update booking_api.quote_sync_reviews
        set proposed_response_id = coalesce(proposed_response_id, requested_response_id)
        where review_id = active_review.review_id;

        update public."Job_Header"
        set "Job_PendingQuoteResponseID" = coalesce("Job_PendingQuoteResponseID", requested_response_id),
            "Job_UpdatedAt" = now()
        where "Job_ID" = existing_job."Job_ID";
      end if;

      return jsonb_build_object(
        'jobId', existing_job."Job_ID",
        'bookingReference', existing_job."Job_BookingReference",
        'status', existing_job."Job_Status",
        'requiresCustomerLink', existing_job."Job_Customer" is null,
        'reused', true,
        'outOfSync', true,
        'quoteSyncReviewId', active_review.review_id
      );
    end if;
  end if;

  return booking_api.convert_accepted_quote_before_idempotent_review_20260904(
    requested_quote_id,
    requested_actor_user_id,
    requested_response_id
  );
exception
  when no_data_found or too_many_rows then
    raise exception 'The accepted quote or booking workspace is incomplete.' using errcode = 'P0002';
end;
$$;

comment on function booking_api.convert_accepted_quote(uuid, uuid, uuid) is
  'Creates or updates a booking from an accepted quote. Repeated conversion of the same accepted version reuses its active review, preserves the customer response link, and emits no duplicate review or notification.';

revoke all on function booking_api.convert_accepted_quote_before_idempotent_review_20260904(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function booking_api.convert_accepted_quote(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function booking_api.convert_accepted_quote(uuid, uuid, uuid) to service_role;

commit;
