-- Local release candidate: Booking scope and immutable customer information PDFs.
-- Do not apply to the shared backend until the document template and migration are reviewed.
begin;
set local lock_timeout = '5s';

-- Extend only operator-owned Booking overrides. The accepted Quote stays frozen.
alter function booking_api.save_booking_detail_fields(uuid, uuid, jsonb)
  rename to save_booking_detail_fields_before_scope_20260924;

create function booking_api.save_booking_detail_fields(
  caller_auth_user_id uuid, requested_job_id uuid, payload jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  additions jsonb := '{}'::jsonb;
  entry record;
begin
  perform booking_api.save_booking_detail_fields_before_scope_20260924(caller_auth_user_id, requested_job_id, payload);
  for entry in select key, value from jsonb_each(coalesce(payload->'editableDetails', '{}'::jsonb)) loop
    if entry.key in ('scopeCollection', 'scopeMainTransport', 'scopeDelivery') then
      if jsonb_typeof(entry.value) <> 'boolean' then
        raise exception 'Booking service scope must be selected explicitly.' using errcode = '22023';
      end if;
      additions := additions || jsonb_build_object(entry.key, entry.value);
    elsif entry.key in ('collectionRemarks', 'deliveryRemarks', 'specialInstructions') then
      if jsonb_typeof(entry.value) <> 'string' or length(entry.value #>> '{}') > 4000 then
        raise exception 'Booking instructions must be text of up to 4,000 characters.' using errcode = '22023';
      end if;
      additions := additions || jsonb_build_object(entry.key, entry.value);
    end if;
  end loop;
  if additions <> '{}'::jsonb then
    update public."Job_Header" job
    set "Job_EditableDetailsJSON" = job."Job_EditableDetailsJSON" || additions
    where job."Job_ID" = requested_job_id;
  end if;
end $$;
revoke all on function booking_api.save_booking_detail_fields(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function booking_api.save_booking_detail_fields(uuid,uuid,jsonb) to service_role;

-- A safe, current-price review. The renderer recomputes this projection and
-- checks its token; neither prices nor customer-facing text come from the browser.
create function document_api.booking_confirmation_review(
  caller_auth_user_id uuid, requested_job_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor record;
  job record;
  details jsonb;
  scope jsonb;
  cargo_lines jsonb;
  routes jsonb;
  price_lines jsonb;
  price_totals jsonb;
  invalid_price_count integer;
  visible_price_count integer;
  price_available boolean;
  review jsonb;
begin
  select u."User_ID", u."Company_ID",
    nullif(btrim(concat_ws(' ', u."User_Firstname", u."User_Lastname")), '') as name
  into strict actor from public."cmp_Users" u
  where u."Auth_User_ID" = caller_auth_user_id and u."User_AccessStatus" = 'active';
  if not document_api.has_permission(caller_auth_user_id, 'Documents.Generate')
     or not booking_api.has_permission(caller_auth_user_id, 'Bookings.Read') then
    raise exception 'Booking document generation is not authorised.' using errcode = '42501';
  end if;
  select j.* into strict job from public."Job_Header" j
  join public."cmp_Offices" o on o."Office_ID" = coalesce(j."Job_OrgOfficeID", j."Job_OfficeID")
    and o."Company_ID" = actor."Company_ID" and o."Office_IsActive"
  join public."cmp_Users_Offices" uo on uo."Office_ID" = o."Office_ID"
    and uo."User_ID" = actor."User_ID"
  where j."Job_ID" = requested_job_id and not j."Job_IsDeleted";
  if lower(job."Job_Status") = 'cancelled' then
    raise exception 'Reopen the Booking before creating a customer document.' using errcode = '55000';
  end if;
  if job."Job_Customer" is null then
    raise exception 'Choose a customer before creating a Booking PDF.' using errcode = '22023';
  end if;
  details := coalesce(job."Job_EditableDetailsJSON", '{}'::jsonb);
  scope := jsonb_build_object(
    'collection', details->>'scopeCollection' = 'true',
    'mainTransport', details->>'scopeMainTransport' = 'true',
    'delivery', details->>'scopeDelivery' = 'true'
  );
  if not ((scope->>'collection')::boolean or (scope->>'mainTransport')::boolean or (scope->>'delivery')::boolean) then
    raise exception 'Choose the work Jenkar is arranging before creating a Booking PDF.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'description', c."JobCargo_Description", 'marksAndNumbers', coalesce(
      nullif(c."JobCargo_CargoJSON"->>'marksAndNumbers', ''), c."JobCargo_MarksNumbers"),
    'packages', c."JobCargo_PackageQty", 'packageType', c."JobCargo_PackageTypeCodeSnapshot",
    'grossWeightKg', c."JobCargo_GrossKilos", 'volumeCbm', c."JobCargo_VolumeCBM"
  )) order by c."JobCargo_LineNo", c."JobCargo_ID"), '[]'::jsonb)
  into cargo_lines from public."Job_Cargo" c
  where c."JobCargo_JobID" = requested_job_id and not c."JobCargo_IsDeleted";

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'sequence', r."JobRoute_OrderNo", 'mode', r."JobRoute_ModeCode",
    'origin', coalesce(r."JobRoute_OriginNameSnapshot", r."JobRoute_OriginUNLocode"),
    'destination', coalesce(r."JobRoute_DestinationNameSnapshot", r."JobRoute_DestinationUNLocode"),
    'plannedDepartureAt', r."JobRoute_PlannedDepartureAt", 'plannedArrivalAt', r."JobRoute_PlannedArrivalAt",
    'carrierBookingReference', r."JobRoute_CarrierBookingReference",
    'flightNumber', r."JobRoute_FlightNumber", 'vessel', r."JobRoute_Vessel",
    'voyageNumber', r."JobRoute_VoyageNumber", 'railService', r."JobRoute_RailService"
  )) order by r."JobRoute_OrderNo", r."JobRoute_ID"), '[]'::jsonb)
  into routes from public."Job_Routing" r where r."Job_ID" = requested_job_id;

  with visible as (
    select c."JobCostingLine_ID" as id, c."JobCostingLine_Number" as line_number,
      c."JobCostingLine_Description" as description,
      c."JobCostingLine_RevenueAmountCurrency" as amount,
      coalesce(
        c."JobCostingLine_SourceMetadataJSON" #>> '{bookingCharge,sellCurrency}',
        c."JobCostingLine_SourceMetadataJSON" #>> '{quoteCharge,sellCurrency}',
        c."JobCostingLine_SourceMetadataJSON" #>> '{planningCharge,sellCurrency}'
      ) as currency
    from public."Job_Costing_Lines" c
    where c."Job_ID" = requested_job_id
      and c."JobCostingLine_DomainCode" = 'freight'
      and c."JobCostingLine_ShowToCustomer" = true
  )
  select count(*), count(*) filter (where amount is null or currency is null or currency !~ '^[A-Z]{3}$'
    or nullif(btrim(description), '') is null),
    coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'description', description, 'sellAmount', amount, 'currency', currency
    ) order by line_number, id), '[]'::jsonb)
  into visible_price_count, invalid_price_count, price_lines from visible;

  price_available := lower(job."Job_Status") in ('open', 'in_progress')
    and visible_price_count > 0 and invalid_price_count = 0;
  if price_available then
    select coalesce(jsonb_agg(jsonb_build_object('currency', currency, 'amount', amount) order by currency), '[]'::jsonb)
    into price_totals from (
      select line->>'currency' as currency, sum((line->>'sellAmount')::numeric) as amount
      from jsonb_array_elements(price_lines) line group by line->>'currency'
    ) totals;
  else
    price_totals := '[]'::jsonb;
  end if;

  review := jsonb_build_object(
    'jobId', job."Job_ID", 'bookingReference', job."Job_BookingReference",
    'customerReference', coalesce(nullif(details->>'customerReference', ''), nullif(job."Job_CustomerReference", '')),
    'sourceQuoteVersionId', job."Job_SourceQuoteVersionID",
    'status', job."Job_Status", 'provisional', lower(job."Job_Status") in ('draft', 'provisional'),
    'preparedBy', coalesce(actor.name, 'Multideck operator'),
    'customer', jsonb_build_object('id', job."Job_Customer", 'name',
      (select o."Org_Name" from public."Org_Master" o where o."Org_id" = job."Job_Customer")),
    'scope', scope,
    'collection', case when (scope->>'collection')::boolean then jsonb_build_object(
      'address', job."Job_CollectionAddress", 'plannedAt',
      coalesce((select min(r."JobRoute_PlannedPickupAt")::text from public."Job_Routing" r where r."Job_ID" = requested_job_id), job."Job_ReadyDate"::text),
      'plannedAtLabel', coalesce(
        (select to_char(min(r."JobRoute_PlannedPickupAt") at time zone 'UTC', 'DD Mon YYYY')
         from public."Job_Routing" r where r."Job_ID" = requested_job_id),
        to_char(job."Job_ReadyDate", 'DD Mon YYYY')),
      'remarks', nullif(details->>'collectionRemarks', '')) end,
    'mainTransport', case when (scope->>'mainTransport')::boolean then routes end,
    'delivery', case when (scope->>'delivery')::boolean then jsonb_build_object(
      'address', job."Job_DeliveryAddress", 'plannedAt',
      coalesce((select max(r."JobRoute_PlannedDeliveryAt")::text from public."Job_Routing" r where r."Job_ID" = requested_job_id), job."Job_RequiredDeliveryDate"::text),
      'plannedAtLabel', coalesce(
        (select to_char(max(r."JobRoute_PlannedDeliveryAt") at time zone 'UTC', 'DD Mon YYYY')
         from public."Job_Routing" r where r."Job_ID" = requested_job_id),
        to_char(job."Job_RequiredDeliveryDate", 'DD Mon YYYY')),
      'remarks', nullif(details->>'deliveryRemarks', '')) end,
    'cargo', cargo_lines, 'specialInstructions', nullif(details->>'specialInstructions', ''),
    'priceAvailable', price_available, 'chargeLines', price_lines, 'chargeTotals', price_totals
  );
  return review || jsonb_build_object('reviewToken', md5(review::text));
exception
  when no_data_found or too_many_rows then
    raise exception 'Booking document identity is incomplete.' using errcode = '42501';
end $$;
revoke all on function document_api.booking_confirmation_review(uuid,uuid) from public,anon,authenticated;
grant execute on function document_api.booking_confirmation_review(uuid,uuid) to service_role;

create function public.booking_confirmation_review(caller_auth_user_id uuid, requested_job_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select document_api.booking_confirmation_review(caller_auth_user_id, requested_job_id)
$$;
revoke all on function public.booking_confirmation_review(uuid,uuid) from public,anon,authenticated;
grant execute on function public.booking_confirmation_review(uuid,uuid) to service_role;

create function document_api.prepare_booking_confirmation(
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
      || jsonb_build_object('priceStatus', case when confirm_customer_prices then 'confirmed' else 'Price to be confirmed' end,
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

-- Add generated confirmations to the Booking Documents feed. Older PDFs remain
-- independently downloadable and retain their original stored object IDs.
alter function booking_api.workspace_documents(uuid,uuid)
  rename to workspace_documents_before_confirmation_20260924;
create function booking_api.workspace_documents(caller_auth_user_id uuid, requested_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  existing jsonb;
  generated jsonb;
begin
  existing := booking_api.workspace_documents_before_confirmation_20260924(caller_auth_user_id, requested_job_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d."DOCBGD_ID", 'category', 'job', 'typeCode', 'booking_confirmation',
    'title', 'Booking information', 'source', 'document_builder', 'status', 'ready',
    'fileName', d."DOCBGD_FileName", 'mimeType', d."DOCBGD_MimeType",
    'fileSizeBytes', d."DOCBGD_FileSizeBytes", 'version', d."DOCBGD_VersionNo",
    'isCurrent', d."DOCBGD_IsCurrentVersion", 'createdAt', d."DOCBGD_CreatedAt",
    'sourceRecordId', requested_job_id, 'sourceReference', j."Job_BookingReference",
    'metadata', jsonb_build_object('renderJobId', r."DOCBRJ_ID", 'templateVersionId', d."DOCBGD_TemplateVersionID")
  ) order by d."DOCBGD_CreatedAt" desc, d."DOCBGD_ID" desc), '[]'::jsonb)
  into generated from public."DOCB_GeneratedDocuments" d
  join public."DOCB_RenderJobs" r on r."DOCBRJ_ID" = d."DOCBGD_RenderJobID"
  join public."DOCB_DocumentTemplates" t on t."DOCBT_ID" = d."DOCBGD_TemplateID"
  join public."Job_Header" j on j."Job_ID" = r."DOCBRJ_JobID"
  join public."cmp_Offices" o on o."Office_ID" = coalesce(j."Job_OrgOfficeID", j."Job_OfficeID")
  join public."cmp_Users" u on u."Company_ID" = o."Company_ID"
    and u."Auth_User_ID" = caller_auth_user_id and u."User_AccessStatus" = 'active'
  join public."cmp_Users_Offices" uo on uo."Office_ID" = o."Office_ID" and uo."User_ID" = u."User_ID"
  where r."DOCBRJ_JobID" = requested_job_id and t."DOCBT_Code" = 'JOB_CONFIRMATION'
    and r."DOCBRJ_StatusCode" in ('completed', 'completed_with_warnings')
    and document_api.has_permission(caller_auth_user_id, 'Documents.Read');
  return existing || generated;
end $$;
revoke all on function booking_api.workspace_documents(uuid,uuid) from public,anon,authenticated;
grant execute on function booking_api.workspace_documents(uuid,uuid) to service_role;

-- Number each generated Booking confirmation for its own Booking, without
-- marking historical files non-current (the download API requires current).
alter function document_api.complete_job_render(uuid,uuid,uuid,text,text,text,text,bigint,text)
  rename to complete_job_render_before_confirmation_20260924;
create function document_api.complete_job_render(
  caller_auth_user_id uuid, requested_render_job_id uuid,
  generated_document_id uuid, storage_bucket text, storage_path text,
  original_file_name text, mime_type text, file_size_bytes bigint, sha256 text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target_job_id uuid;
  next_version integer;
  result jsonb;
begin
  select r."DOCBRJ_JobID" into target_job_id from public."DOCB_RenderJobs" r
  join public."DOCB_DocumentTemplates" t on t."DOCBT_ID" = r."DOCBRJ_TemplateID"
  where r."DOCBRJ_ID" = requested_render_job_id and t."DOCBT_Code" = 'JOB_CONFIRMATION';
  if target_job_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(target_job_id::text || ':JOB_CONFIRMATION', 0));
    select coalesce(max(d."DOCBGD_VersionNo"), 0) + 1 into next_version
    from public."DOCB_GeneratedDocuments" d
    join public."DOCB_RenderJobs" r on r."DOCBRJ_ID" = d."DOCBGD_RenderJobID"
    join public."DOCB_DocumentTemplates" t on t."DOCBT_ID" = d."DOCBGD_TemplateID"
    where r."DOCBRJ_JobID" = target_job_id and t."DOCBT_Code" = 'JOB_CONFIRMATION';
  end if;
  result := document_api.complete_job_render_before_confirmation_20260924(
    caller_auth_user_id, requested_render_job_id, generated_document_id,
    storage_bucket, storage_path, original_file_name, mime_type, file_size_bytes, sha256);
  if target_job_id is not null then
    update public."DOCB_GeneratedDocuments" set "DOCBGD_VersionNo" = next_version
    where "DOCBGD_ID" = generated_document_id;
  end if;
  return result;
end $$;
revoke all on function document_api.complete_job_render(uuid,uuid,uuid,text,text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function document_api.complete_job_render(uuid,uuid,uuid,text,text,text,text,bigint,text) to service_role;

commit;
