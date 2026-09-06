-- Keep the accepted quote's requested container order stable even when rows
-- share the same database creation timestamp.

begin;

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
      min(case
        when coalesce(container."JobContainer_JSON"#>>'{data,requestIndex}', '') ~ '^[0-9]+$'
          then (container."JobContainer_JSON"#>>'{data,requestIndex}')::integer
        else 2147483647
      end) as request_order,
      min(container."JobContainer_CreatedAt") as first_created
    from public."Job_Containers" container
    where container."Job_ID" = requested_job_id
      and not container."JobContainer_IsDeleted"
      and nullif(btrim(container."JobContainer_TypeCodeSnapshot"), '') is not null
    group by container."JobContainer_TypeCodeSnapshot"
  ), container_projection as (
    select
      string_agg(quantity::text || ' × ' || type_code, '; ' order by request_order, first_created, type_code) as equipment,
      coalesce(jsonb_agg(jsonb_build_object('quantity', quantity, 'type', type_code) order by request_order, first_created, type_code), '[]'::jsonb) as requests
    from container_groups
  )
  select booking_api.current_quote_sync_projection_before_container_allocation_20260904(requested_job_id)
    || jsonb_build_object('equipment', container_projection.equipment, 'containerRequests', container_projection.requests)
  from container_projection
$$;

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
        ) order by grouped.request_order, grouped.first_created, grouped.type_code), '[]'::jsonb)
      )) as equipment,
      coalesce(jsonb_agg(jsonb_build_object(
        'type', grouped.type_code,
        'quantity', grouped.quantity
      ) order by grouped.request_order, grouped.first_created, grouped.type_code), '[]'::jsonb) as lines
    from (
      select
        container."JobContainer_TypeCodeSnapshot" as type_code,
        count(*) as quantity,
        min(case
          when coalesce(container."JobContainer_JSON"#>>'{data,requestIndex}', '') ~ '^[0-9]+$'
            then (container."JobContainer_JSON"#>>'{data,requestIndex}')::integer
          else 2147483647
        end) as request_order,
        min(container."JobContainer_CreatedAt") as first_created
      from public."Job_Containers" container
      where container."Job_ID" = (item.value->>'recordId')::uuid
        and not container."JobContainer_IsDeleted"
        and nullif(btrim(container."JobContainer_TypeCodeSnapshot"), '') is not null
      group by container."JobContainer_TypeCodeSnapshot"
    ) grouped
  ) container_plan on true
$$;

revoke all on function booking_api.current_quote_sync_projection(uuid) from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_bookings(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.multideck_dexter_domain_bookings(uuid, text, integer) to service_role;

commit;
