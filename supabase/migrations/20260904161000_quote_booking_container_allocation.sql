-- Preserve structured quote container requests when a quote becomes a booking.
-- A single requested container receives the quote-level goods totals. Multiple
-- containers are created individually but deliberately left unallocated so an
-- operator can split packages, weight and volume without an unsafe assumption.

begin;

create or replace function booking_api.quote_container_rows(
  snapshot jsonb,
  source_code text default 'accepted_quote',
  quote_version_id uuid default null
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  payload jsonb;
  facts jsonb;
  cargo jsonb;
  requests jsonb;
  normalised_requests jsonb := '[]'::jsonb;
  result_rows jsonb := '[]'::jsonb;
  request_item jsonb;
  request_type text;
  request_quantity integer;
  request_index integer;
  unit_index integer;
  total_quantity integer := 0;
  summary_value text;
  summary_part text;
  summary_match text[];
  package_quantity text;
  package_type text;
  gross_weight text;
  volume_cbm text;
begin
  snapshot := coalesce(snapshot, '{}'::jsonb);
  payload := case when jsonb_typeof(snapshot->'quote') = 'object' then snapshot->'quote' else snapshot end;
  facts := case when jsonb_typeof(payload->'shipmentFacts') = 'object' then payload->'shipmentFacts' else payload end;
  cargo := case when jsonb_typeof(snapshot->'cargo') = 'object' then snapshot->'cargo' else '{}'::jsonb end;
  requests := case
    when jsonb_typeof(facts->'containerRequests') = 'array' then facts->'containerRequests'
    when jsonb_typeof(snapshot->'containerRequests') = 'array' then snapshot->'containerRequests'
    else '[]'::jsonb
  end;

  request_index := 0;
  for request_item in select item.value from jsonb_array_elements(requests) item loop
    request_type := nullif(btrim(request_item->>'type'), '');
    request_quantity := case
      when coalesce(request_item->>'quantity', '') ~ '^[0-9]+$' then (request_item->>'quantity')::integer
      else 0
    end;
    if request_type is not null and request_quantity > 0 then
      request_index := request_index + 1;
      total_quantity := total_quantity + request_quantity;
      if total_quantity > 100 then
        raise exception 'A quote cannot create more than 100 booking container lines.' using errcode = '22023';
      end if;
      normalised_requests := normalised_requests || jsonb_build_array(jsonb_build_object(
        'type', left(request_type, 40),
        'quantity', request_quantity,
        'requestIndex', request_index
      ));
    end if;
  end loop;

  if total_quantity = 0 then
    summary_value := nullif(btrim(coalesce(facts->>'container', facts->>'equipment', snapshot->>'equipment')), '');
    if summary_value is not null then
      for summary_part in select part from regexp_split_to_table(summary_value, '\s*;\s*') part loop
        summary_match := regexp_match(summary_part, '^\s*([0-9]+)\s*[xX×]\s*(.+?)\s*$');
        request_quantity := case when summary_match is null then 1 else summary_match[1]::integer end;
        request_type := left(nullif(btrim(case when summary_match is null then summary_part else summary_match[2] end), ''), 40);
        if request_type is not null and request_quantity > 0 then
          request_index := request_index + 1;
          total_quantity := total_quantity + request_quantity;
          if total_quantity > 100 then
            raise exception 'A quote cannot create more than 100 booking container lines.' using errcode = '22023';
          end if;
          normalised_requests := normalised_requests || jsonb_build_array(jsonb_build_object(
            'type', request_type,
            'quantity', request_quantity,
            'requestIndex', request_index
          ));
        end if;
      end loop;
    end if;
  end if;

  package_quantity := nullif(coalesce(cargo->>'packageQuantity', facts->>'packageQuantity', facts->>'pieces'), '');
  package_type := nullif(btrim(coalesce(cargo->>'packageType', facts->>'packageType')), '');
  gross_weight := nullif(coalesce(cargo->>'grossWeightKg', facts->>'grossWeightKg'), '');
  volume_cbm := nullif(coalesce(cargo->>'volumeCbm', facts->>'volumeCbm'), '');

  for request_item in select item.value from jsonb_array_elements(normalised_requests) item loop
    request_quantity := (request_item->>'quantity')::integer;
    for unit_index in 1..request_quantity loop
      result_rows := result_rows || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'type', request_item->>'type',
        'equipmentKind', 'container',
        'status', 'planned',
        'packages', case when total_quantity = 1 then package_quantity end,
        'packageType', case when total_quantity = 1 then package_type end,
        'grossWeightKg', case when total_quantity = 1 then gross_weight end,
        'volumeCbm', case when total_quantity = 1 then volume_cbm end,
        'data', jsonb_strip_nulls(jsonb_build_object(
          'source', coalesce(nullif(btrim(source_code), ''), 'accepted_quote'),
          'quoteVersionId', quote_version_id,
          'requestIndex', (request_item->>'requestIndex')::integer,
          'unitIndex', unit_index,
          'requestedQuantity', request_quantity,
          'packageType', case when total_quantity = 1 then package_type end,
          'packages', case when total_quantity = 1 then package_quantity end,
          'volumeCbm', case when total_quantity = 1 then volume_cbm end
        ))
      )));
    end loop;
  end loop;

  return result_rows;
end;
$$;

create or replace function booking_api.quote_container_summary(snapshot jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  with expanded as (
    select item.value->>'type' as type_code, item.ordinality
    from jsonb_array_elements(booking_api.quote_container_rows(snapshot, 'projection', null)) with ordinality item(value, ordinality)
  ), grouped as (
    select type_code, count(*) as quantity, min(ordinality) as first_position
    from expanded
    where nullif(btrim(type_code), '') is not null
    group by type_code
  )
  select string_agg(quantity::text || ' × ' || type_code, '; ' order by first_position)
  from grouped
$$;

create or replace function booking_api.replace_quote_containers(
  requested_job_id uuid,
  actor_user_id uuid,
  snapshot jsonb,
  source_code text,
  quote_version_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  rows_value jsonb;
  line jsonb;
  inserted_count integer := 0;
begin
  rows_value := booking_api.quote_container_rows(snapshot, source_code, quote_version_id);

  update public."Job_Containers"
  set "JobContainer_IsDeleted" = true,
      "JobContainer_UpdatedAt" = now(),
      "JobContainer_UpdatedBy" = actor_user_id
  where "Job_ID" = requested_job_id
    and not "JobContainer_IsDeleted";

  for line in select item.value from jsonb_array_elements(rows_value) item loop
    insert into public."Job_Containers" (
      "Job_ID", "JobContainer_Number", "JobContainer_TypeCodeSnapshot", "JobContainer_EquipmentKind",
      "JobContainer_Status", "JobContainer_GrossKilos", "JobContainer_Notes", "JobContainer_JSON", "JobContainer_UpdatedBy"
    ) values (
      requested_job_id,
      left(nullif(btrim(line->>'number'), ''), 50),
      left(nullif(btrim(line->>'type'), ''), 40),
      coalesce(left(nullif(btrim(line->>'equipmentKind'), ''), 40), 'container'),
      coalesce(left(nullif(btrim(line->>'status'), ''), 40), 'planned'),
      nullif(line->>'grossWeightKg', '')::numeric,
      nullif(btrim(line->>'notes'), ''),
      line,
      actor_user_id
    );
    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;

alter function booking_api.quote_sync_projection(jsonb)
  rename to quote_sync_projection_before_container_allocation_20260904;

create or replace function booking_api.quote_sync_projection(snapshot jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select booking_api.quote_sync_projection_before_container_allocation_20260904(snapshot)
    || jsonb_build_object(
      'equipment', booking_api.quote_container_summary(snapshot),
      'containerRequests', coalesce(
        case
          when jsonb_typeof(snapshot#>'{quote,shipmentFacts,containerRequests}') = 'array'
            then snapshot#>'{quote,shipmentFacts,containerRequests}'
          when jsonb_typeof(snapshot->'containerRequests') = 'array'
            then snapshot->'containerRequests'
        end,
        '[]'::jsonb
      )
    )
$$;

alter function booking_api.current_quote_sync_projection(uuid)
  rename to current_quote_sync_projection_before_container_allocation_20260904;

create or replace function booking_api.current_quote_sync_projection(requested_job_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with container_groups as (
    select
      container."JobContainer_TypeCodeSnapshot" as type_code,
      count(*) as quantity,
      min(container."JobContainer_CreatedAt") as first_created
    from public."Job_Containers" container
    where container."Job_ID" = requested_job_id
      and not container."JobContainer_IsDeleted"
      and nullif(btrim(container."JobContainer_TypeCodeSnapshot"), '') is not null
    group by container."JobContainer_TypeCodeSnapshot"
  ), container_projection as (
    select
      string_agg(quantity::text || ' × ' || type_code, '; ' order by first_created) as equipment,
      coalesce(jsonb_agg(jsonb_build_object('quantity', quantity, 'type', type_code) order by first_created), '[]'::jsonb) as requests
    from container_groups
  )
  select booking_api.current_quote_sync_projection_before_container_allocation_20260904(requested_job_id)
    || jsonb_build_object('equipment', container_projection.equipment, 'containerRequests', container_projection.requests)
  from container_projection
$$;

alter function booking_api.convert_accepted_quote(uuid, uuid, uuid)
  rename to convert_accepted_quote_before_container_allocation_20260904;

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
  conversion_result jsonb;
  target_job record;
  version_snapshot jsonb;
begin
  conversion_result := booking_api.convert_accepted_quote_before_container_allocation_20260904(
    requested_quote_id,
    requested_actor_user_id,
    requested_response_id
  );

  if not coalesce((conversion_result->>'reused')::boolean, false)
     and not coalesce((conversion_result->>'outOfSync')::boolean, false) then
    select job.* into target_job
    from public."Job_Header" job
    where job."Job_ID" = (conversion_result->>'jobId')::uuid
    for update;

    if found and booking_api.normalise_mode(target_job."Job_TransportModeSummary") in ('sea', 'ocean') then
      select version."CusQuoteVersion_SnapshotJSON" into version_snapshot
      from public."CusQuote_Versions" version
      where version."CusQuoteVersion_ID" = target_job."Job_SourceQuoteVersionID";

      perform booking_api.replace_quote_containers(
        target_job."Job_ID",
        coalesce(requested_actor_user_id, target_job."Job_UpdatedBy", target_job."Job_CreatedBy"),
        version_snapshot,
        'accepted_quote',
        target_job."Job_SourceQuoteVersionID"
      );
    end if;
  end if;

  return conversion_result;
end;
$$;

alter function public.booking_workflow_apply_quote_sync(uuid, uuid, uuid, jsonb)
  rename to booking_workflow_apply_quote_sync_before_container_allocation_20260904;

create or replace function public.booking_workflow_apply_quote_sync(
  caller_auth_user_id uuid,
  requested_job_id uuid,
  requested_review_id uuid,
  requested_fields jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  apply_result jsonb;
  app_user_id uuid;
  review_row record;
  refreshed_snapshot jsonb;
begin
  apply_result := public.booking_workflow_apply_quote_sync_before_container_allocation_20260904(
    caller_auth_user_id,
    requested_job_id,
    requested_review_id,
    requested_fields
  );

  if requested_fields ? 'equipment' then
    select app_user."User_ID" into strict app_user_id
    from public."cmp_Users" app_user
    where app_user."Auth_User_ID" = caller_auth_user_id
      and app_user."User_AccessStatus" = 'active';

    select review.* into strict review_row
    from booking_api.quote_sync_reviews review
    where review.review_id = requested_review_id
      and review.job_id = requested_job_id;

    if review_row.proposed_snapshot->>'mode' in ('sea', 'ocean') then
      perform booking_api.replace_quote_containers(
        requested_job_id,
        app_user_id,
        review_row.proposed_snapshot,
        'accepted_quote_update',
        review_row.proposed_version_id
      );

      refreshed_snapshot := booking_api.current_quote_sync_projection(requested_job_id);
      update booking_api.events event
      set metadata = jsonb_set(event.metadata, '{after}', refreshed_snapshot, true)
      where event.event_id = (
        select candidate.event_id
        from booking_api.events candidate
        where candidate.job_id = requested_job_id
          and candidate.metadata->>'reviewId' = requested_review_id::text
        order by candidate.occurred_at desc
        limit 1
      );

      apply_result := jsonb_set(
        apply_result,
        '{workspace}',
        booking_api.workspace_with_document_groups(caller_auth_user_id, (apply_result#>>'{workspace,booking,bookingReference}')::text),
        true
      );
    end if;
  end if;

  return apply_result;
exception
  when no_data_found or too_many_rows then
    raise exception 'The quote update review is unavailable in this workspace.' using errcode = 'P0002';
end;
$$;

-- Reconcile only untouched quote-generated placeholders. Operational container
-- numbers, seals, notes and manually allocated rows are intentionally excluded.
do $$
declare
  target record;
  inserted_count integer;
begin
  for target in
    select
      job."Job_ID" as job_id,
      job."Job_SourceQuoteVersionID" as version_id,
      coalesce(job."Job_UpdatedBy", job."Job_CreatedBy") as actor_user_id,
      version."CusQuoteVersion_SnapshotJSON" as snapshot,
      office."Company_ID" as company_id
    from public."Job_Header" job
    join public."cmp_Offices" office
      on office."Office_ID" = coalesce(job."Job_OrgOfficeID", job."Job_OfficeID")
    join public."CusQuote_Versions" version
      on version."CusQuoteVersion_ID" = job."Job_SourceQuoteVersionID"
    where not job."Job_IsDeleted"
      and booking_api.normalise_mode(job."Job_TransportModeSummary") in ('sea', 'ocean')
      and (
        select count(*)
        from public."Job_Containers" container
        where container."Job_ID" = job."Job_ID" and not container."JobContainer_IsDeleted"
      ) = 1
      and exists (
        select 1
        from public."Job_Containers" container
        where container."Job_ID" = job."Job_ID"
          and not container."JobContainer_IsDeleted"
          and nullif(btrim(container."JobContainer_Number"), '') is null
          and nullif(btrim(container."JobContainer_Notes"), '') is null
          and container."JobContainer_JSON"->>'source' in ('accepted_quote', 'accepted_quote_update')
      )
      and jsonb_array_length(booking_api.quote_container_rows(version."CusQuoteVersion_SnapshotJSON", 'accepted_quote', job."Job_SourceQuoteVersionID")) > 0
  loop
    inserted_count := booking_api.replace_quote_containers(
      target.job_id,
      target.actor_user_id,
      target.snapshot,
      'accepted_quote_reconciled',
      target.version_id
    );

    insert into booking_api.events (company_id, job_id, event_type, summary, metadata, actor_user_id)
    values (
      target.company_id,
      target.job_id,
      'quote_container_plan_reconciled',
      'Quote container requests were expanded into individual booking lines.',
      jsonb_build_object('quoteVersionId', target.version_id, 'containerCount', inserted_count),
      target.actor_user_id
    );
  end loop;
end;
$$;

-- Dexter keeps using the existing tenant-safe bookings domain and booking watch
-- signal. Enrich the read result with the individual container plan; the quote
-- conversion and apply transactions already emit one booking signal through
-- the existing Job_Header adapter.
alter function public.multideck_dexter_domain_bookings(uuid, text, integer)
  rename to multideck_dexter_domain_bookings_before_container_allocation_20260904;

create or replace function public.multideck_dexter_domain_bookings(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
  select coalesce(jsonb_agg(
    item.value || jsonb_strip_nulls(jsonb_build_object(
      'equipment', container_plan.equipment,
      'containers', coalesce(container_plan.lines, '[]'::jsonb)
    ))
    order by item.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(
    public.multideck_dexter_domain_bookings_before_container_allocation_20260904(p_company_id, p_search, p_take)
  ) with ordinality item(value, ordinality)
  left join lateral (
    select
      booking_api.quote_container_summary(jsonb_build_object(
        'containerRequests', coalesce(jsonb_agg(jsonb_build_object(
          'quantity', grouped.quantity,
          'type', grouped.type_code
        ) order by grouped.first_created), '[]'::jsonb)
      )) as equipment,
      coalesce(jsonb_agg(jsonb_build_object(
        'type', grouped.type_code,
        'quantity', grouped.quantity
      ) order by grouped.first_created), '[]'::jsonb) as lines
    from (
      select
        container."JobContainer_TypeCodeSnapshot" as type_code,
        count(*) as quantity,
        min(container."JobContainer_CreatedAt") as first_created
      from public."Job_Containers" container
      where container."Job_ID" = (item.value->>'recordId')::uuid
        and not container."JobContainer_IsDeleted"
        and nullif(btrim(container."JobContainer_TypeCodeSnapshot"), '') is not null
      group by container."JobContainer_TypeCodeSnapshot"
    ) grouped
  ) container_plan on true
$$;

update public."sys_AIDexterDataDomains"
set "AIDexterDomain_Description" = 'Freight jobs and bookings, including customer, route, mode, carrier, container plan, dates, tracking status and operational risk. This is separate from warehouse orders and dock activity.',
    "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'bookings';

comment on function booking_api.quote_container_rows(jsonb, text, uuid) is
  'Expands structured quote container quantities into one booking row per physical container. Copies quote goods totals only when exactly one container was requested.';
comment on function booking_api.replace_quote_containers(uuid, uuid, jsonb, text, uuid) is
  'Audit-preserving replacement of active booking container placeholders from an accepted quote snapshot.';
comment on function booking_api.convert_accepted_quote(uuid, uuid, uuid) is
  'Creates or reviews a booking from an accepted quote and preserves each structured sea-container request as an individual booking line.';

revoke all on function booking_api.quote_container_rows(jsonb, text, uuid) from public, anon, authenticated;
revoke all on function booking_api.quote_container_summary(jsonb) from public, anon, authenticated;
revoke all on function booking_api.replace_quote_containers(uuid, uuid, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function booking_api.quote_sync_projection_before_container_allocation_20260904(jsonb) from public, anon, authenticated, service_role;
revoke all on function booking_api.current_quote_sync_projection_before_container_allocation_20260904(uuid) from public, anon, authenticated, service_role;
revoke all on function booking_api.convert_accepted_quote_before_container_allocation_20260904(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.booking_workflow_apply_quote_sync_before_container_allocation_20260904(uuid, uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.multideck_dexter_domain_bookings_before_container_allocation_20260904(uuid, text, integer) from public, anon, authenticated, service_role;
revoke all on function booking_api.convert_accepted_quote(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.booking_workflow_apply_quote_sync(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_bookings(uuid, text, integer) from public, anon, authenticated;
grant execute on function booking_api.convert_accepted_quote(uuid, uuid, uuid) to service_role;
grant execute on function public.booking_workflow_apply_quote_sync(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.multideck_dexter_domain_bookings(uuid, text, integer) to service_role;

commit;
