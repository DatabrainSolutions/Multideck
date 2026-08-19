begin;

create or replace function public.multideck_customs_declaration_register_page(
  p_direction text,
  p_scope text,
  p_search text default null,
  p_status text default null,
  p_destination text default null,
  p_sort text default 'lastSaved',
  p_sort_direction text default 'desc',
  p_limit integer default 10,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_direction text := lower(coalesce(nullif(btrim(p_direction), ''), ''));
  v_scope text := lower(coalesce(nullif(btrim(p_scope), ''), ''));
  v_search text := nullif(btrim(p_search), '');
  v_status text := nullif(btrim(p_status), '');
  v_destination text := upper(nullif(btrim(p_destination), ''));
  v_sort text := coalesce(nullif(btrim(p_sort), ''), 'lastSaved');
  v_sort_direction text := lower(coalesce(nullif(btrim(p_sort_direction), ''), 'desc'));
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if v_direction not in ('export', 'import') then
    raise exception 'Choose a valid declaration direction.' using errcode = '22023';
  end if;
  if v_scope not in ('standalone', 'job-related') then
    raise exception 'Choose a valid declaration scope.' using errcode = '22023';
  end if;
  if v_sort_direction not in ('asc', 'desc') then
    raise exception 'Choose a valid sort direction.' using errcode = '22023';
  end if;
  if v_sort not in ('submittedBy','reference','jobReference','status','traderReference','items','destination','value','lastSaved') then
    raise exception 'Choose a valid declaration sort.' using errcode = '22023';
  end if;

  with
  scoped as materialized (
    select
      declaration."CUST_id" as id,
      declaration."CUST_CreatedBy"::text as submitted_by,
      declaration."CUST_JobID" as job_id,
      booking."Job_Reference"::text as job_reference,
      booking."Booking_Reference"::text as booking_reference,
      booking."Customer_Name"::text as customer_name,
      booking."Route"::text as route,
      coalesce(declaration."CUST_LocalReferenceNumber", declaration."CUST_id"::text) as reference,
      declaration."CUST_TraderReference"::text as trader_reference,
      declaration."CUST_Status"::text as status,
      declaration."CUST_CountryOfDestinationCodeSnapshot"::text as destination_country,
      declaration."CUST_InvoiceAmount" as amount,
      declaration."CUST_InvoiceCurrencyCodeSnapshot"::text as currency,
      case
        when jsonb_typeof(declaration."CUST_GenericPayloadJSON" -> 'items') = 'array'
          then jsonb_array_length(declaration."CUST_GenericPayloadJSON" -> 'items')
        else 0
      end as item_count,
      declaration."CUST_CreatedAt" as created_at,
      declaration."CUST_UpdatedAt" as updated_at
    from public."Customs_Declarations" declaration
    left join public."App_Live_Bookings" booking on booking."Job_ID" = declaration."CUST_JobID"
    where declaration."CUST_Direction" = v_direction
      and declaration."CUST_DeclarationKind" = 'cds_' || v_direction
      and not declaration."CUST_IsDeleted"
      and case when v_scope = 'standalone' then declaration."CUST_JobID" is null else declaration."CUST_JobID" is not null end
  ),
  searchable as materialized (
    select
      scoped.*,
      concat_ws(' ', reference, job_reference, booking_reference, customer_name, route, trader_reference, status, destination_country, currency, amount::text) as search_text
    from scoped
  ),
  filtered as materialized (
    select *
    from searchable
    where (v_status is null or status = v_status)
      and (v_destination is null or destination_country = v_destination)
      and (v_search is null or strpos(lower(search_text), lower(v_search)) > 0)
  ),
  ranked as materialized (
    select *, row_number() over (
      order by
        case when v_sort_direction = 'asc' then case v_sort
          when 'submittedBy' then lower(submitted_by)
          when 'reference' then lower(reference)
          when 'jobReference' then lower(coalesce(job_reference, job_id::text))
          when 'status' then lower(status)
          when 'traderReference' then lower(trader_reference)
          when 'destination' then lower(destination_country)
        end end asc nulls last,
        case when v_sort_direction = 'desc' then case v_sort
          when 'submittedBy' then lower(submitted_by)
          when 'reference' then lower(reference)
          when 'jobReference' then lower(coalesce(job_reference, job_id::text))
          when 'status' then lower(status)
          when 'traderReference' then lower(trader_reference)
          when 'destination' then lower(destination_country)
        end end desc nulls last,
        case when v_sort_direction = 'asc' then case v_sort when 'items' then item_count when 'value' then amount end end asc nulls last,
        case when v_sort_direction = 'desc' then case v_sort when 'items' then item_count when 'value' then amount end end desc nulls last,
        case when v_sort_direction = 'asc' and v_sort = 'lastSaved' then updated_at end asc nulls last,
        case when v_sort_direction = 'desc' and v_sort = 'lastSaved' then updated_at end desc nulls last,
        updated_at desc,
        id
    ) as ordinal
    from filtered
  ),
  page as materialized (
    select * from ranked where ordinal > v_offset and ordinal <= v_offset + v_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id,
      'submittedBy', submitted_by,
      'jobId', job_id,
      'jobReference', job_reference,
      'bookingReference', booking_reference,
      'customerName', customer_name,
      'route', route,
      'reference', reference,
      'traderReference', trader_reference,
      'status', status,
      'destinationCountry', destination_country,
      'amount', amount,
      'currency', currency,
      'itemCount', item_count,
      'createdAt', created_at,
      'updatedAt', updated_at
    ) order by ordinal) from page), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'availableTotal', (select count(*) from scoped),
    'facets', jsonb_build_object(
      'statuses', coalesce((select jsonb_agg(status order by status) from (select distinct status from scoped where nullif(btrim(status), '') is not null) valueset), '[]'::jsonb),
      'destinations', coalesce((select jsonb_agg(destination_country order by destination_country) from (select distinct destination_country from scoped where nullif(btrim(destination_country), '') is not null) valueset), '[]'::jsonb)
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.multideck_customs_declaration_register_page(text,text,text,text,text,text,text,integer,integer) from public, anon;
grant execute on function public.multideck_customs_declaration_register_page(text,text,text,text,text,text,text,integer,integer) to authenticated, service_role;

comment on function public.multideck_customs_declaration_register_page(text,text,text,text,text,text,text,integer,integer)
is 'RLS-preserving Customs declaration register read with exact totals/facets and a maximum 50-row page.';

-- Dexter exception: this is a bounded form of the existing Customs declaration
-- read. It adds no new record, mutation, permission or watch event, so the
-- existing Customs capability and event-driven watches remain authoritative.

commit;
