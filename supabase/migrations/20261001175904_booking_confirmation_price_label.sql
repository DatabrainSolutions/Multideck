-- Omitting prices is a document variant, not an assertion that pricing is unconfirmed.
create or replace function document_api.prepare_booking_confirmation(
  caller_auth_user_id uuid, requested_render_job_id uuid,
  expected_review_token text, confirm_customer_prices boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid;
  render record;
  review jsonb;
  safe_snapshot jsonb;
begin
  select u."User_ID" into strict actor_id from public."cmp_Users" u
  where u."Auth_User_ID" = caller_auth_user_id and u."User_AccessStatus" = 'active';
  select r.* into strict render from public."DOCB_RenderJobs" r
  join public."DOCB_DocumentTemplates" t on t."DOCBT_ID" = r."DOCBRJ_TemplateID"
  where r."DOCBRJ_ID" = requested_render_job_id and r."DOCBRJ_CreatedBy" = actor_id
    and r."DOCBRJ_StatusCode" = 'rendering' and t."DOCBT_Code" = 'JOB_CONFIRMATION'
    and r."DOCBRJ_OutputFormatCode" = 'pdf'
  for update of r;
  review := document_api.booking_confirmation_review(caller_auth_user_id, render."DOCBRJ_JobID");
  if expected_review_token is null or expected_review_token <> review->>'reviewToken' then
    raise exception 'The Booking changed. Review the latest information before generating the PDF.' using errcode = '40001';
  end if;
  if confirm_customer_prices and not (review->>'priceAvailable')::boolean then
    raise exception 'Customer prices are not ready to confirm on this Booking.' using errcode = '22023';
  end if;
  safe_snapshot := jsonb_build_object(
    'meta', jsonb_build_object('schemaVersion', 2),
    'customer', review->'customer',
    'bookingConfirmation', (review - 'reviewToken' - 'priceAvailable' - 'chargeLines' - 'chargeTotals')
      || jsonb_build_object('priceStatus', case when confirm_customer_prices then 'confirmed' else 'Prices not included' end,
        'chargeLines', case when confirm_customer_prices then review->'chargeLines' else '[]'::jsonb end,
        'chargeTotals', case when confirm_customer_prices then review->'chargeTotals' else '[]'::jsonb end)
  );
  update public."DOCB_RenderJobs" set
    "DOCBRJ_InputSnapshotJSON" = safe_snapshot,
    "DOCBRJ_RenderSettingsJSON" = "DOCBRJ_RenderSettingsJSON" || jsonb_build_object(
      'bookingConfirmationReviewToken', expected_review_token,
      'customerPricesConfirmed', confirm_customer_prices)
  where "DOCBRJ_ID" = requested_render_job_id;
  return safe_snapshot;
exception
  when no_data_found or too_many_rows then
    raise exception 'Booking document generation is not authorised.' using errcode = '42501';
end $$;
revoke all on function document_api.prepare_booking_confirmation(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function document_api.prepare_booking_confirmation(uuid,uuid,text,boolean) to service_role;


