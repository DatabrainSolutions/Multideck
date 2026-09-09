begin;

create or replace function public.multideck_dashboard_overview(
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_series_end timestamptz,
  p_now timestamptz,
  p_cutoff_at timestamptz,
  p_time_zone text default 'UTC',
  p_operator_name text default null,
  p_row_limit integer default 50
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_row_limit, 50), 50));
  v_time_zone text := coalesce(nullif(btrim(p_time_zone), ''), 'UTC');
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_window_start is null or p_window_end is null or p_window_end <= p_window_start then
    raise exception 'Choose a valid dashboard date range.' using errcode = '22007';
  end if;
  if p_series_end is null or p_series_end <= p_window_start or p_series_end > p_window_end then
    raise exception 'Choose a valid dashboard series range.' using errcode = '22007';
  end if;
  if p_now is null or p_cutoff_at is null then
    raise exception 'Dashboard timing context is required.' using errcode = '22007';
  end if;
  perform 1 from pg_catalog.pg_timezone_names where name = v_time_zone;
  if not found then
    raise exception 'Choose a valid dashboard time zone.' using errcode = '22023';
  end if;

  with
  booking_base as materialized (
    select
      booking."Booking_Reference"::text as reference,
      booking."Customer_Name"::text as customer,
      booking."Route"::text as route,
      upper(booking."Mode"::text) as mode,
      booking."Status"::text as status,
      booking."Progress"::integer as progress,
      booking."Owner_Code"::text as owner,
      booking."Tone"::text as tone,
      booking."Eta_Display"::text as eta,
      booking."Origin"::text as origin,
      booking."Destination"::text as destination,
      coalesce(
        booking."Departure_At",
        pg_catalog.timezone(v_time_zone, booking."Departure_Date"::timestamp)
      ) as start_at,
      coalesce(
        booking."Arrival_At",
        pg_catalog.timezone(v_time_zone, (booking."Arrival_Date" + 1)::timestamp)
      ) as end_at,
      booking."Updated_At"::timestamptz as updated_at
    from public."App_Live_Bookings" booking
  ),
  quote_base as materialized (
    select
      quote."Quote_Reference"::text as reference,
      quote."Customer_Name"::text as customer,
      quote."Origin"::text as origin,
      quote."Destination"::text as destination,
      quote."Quote_Status"::text as status,
      quote."Quote_Status_Tone"::text as status_tone,
      quote."Priority_Tone"::text as priority_tone,
      quote."Workflow_Stage"::text as workflow_stage,
      quote."Sales_Owner"::text as owner,
      case when quote."Estimated_Departure" is null then null
        else pg_catalog.timezone(v_time_zone, quote."Estimated_Departure"::timestamp)
      end as start_at,
      case when quote."Estimated_Arrival" is null then null
        else pg_catalog.timezone(v_time_zone, (quote."Estimated_Arrival" + 1)::timestamp)
      end as end_at,
      quote."Created_At"::timestamptz as created_at,
      quote."Updated_At"::timestamptz as updated_at
    from public."App_Live_Quotes" quote
  ),
  active_bookings as materialized (
    select * from booking_base where progress < 100
  ),
  range_bookings as materialized (
    select *
    from active_bookings
    where case
      when start_at is not null and end_at is not null then start_at < p_window_end and end_at > p_window_start
      when start_at is not null then start_at >= p_window_start and start_at < p_window_end
      when end_at is not null then end_at > p_window_start and end_at <= p_window_end
      else updated_at >= p_window_start and updated_at < p_window_end
    end
  ),
  range_quotes as materialized (
    select *
    from quote_base
    where case
      when start_at is not null and end_at is not null then start_at < p_window_end and end_at > p_window_start
      when start_at is not null then start_at >= p_window_start and start_at < p_window_end
      when end_at is not null then end_at > p_window_start and end_at <= p_window_end
      else created_at >= p_window_start and created_at < p_window_end
    end
  ),
  points as materialized (
    select
      point_index,
      p_window_start + ((p_series_end - p_window_start) / 10) * point_index as point_at
    from generate_series(1, 10) point_index
  ),
  kpi_series as materialized (
    select
      point.point_index,
      (
        select count(*) from range_bookings booking
        where case
          when booking.start_at is not null and booking.end_at is not null then booking.start_at <= point.point_at and booking.end_at > point.point_at
          when booking.start_at is not null then booking.start_at <= point.point_at
          when booking.end_at is not null then booking.end_at > point.point_at
          else booking.updated_at <= point.point_at
        end
      ) as active_jobs,
      (
        select count(*) from range_bookings booking
        where booking.status <> 'On track'
          and case
            when booking.start_at is not null and booking.end_at is not null then booking.start_at <= point.point_at and booking.end_at > point.point_at
            when booking.start_at is not null then booking.start_at <= point.point_at
            when booking.end_at is not null then booking.end_at > point.point_at
            else booking.updated_at <= point.point_at
          end
      ) as exceptions,
      (
        select count(*) from range_quotes quote
        where case
          when quote.start_at is not null and quote.end_at is not null then quote.start_at <= point.point_at and quote.end_at > point.point_at
          when quote.start_at is not null then quote.start_at <= point.point_at
          when quote.end_at is not null then quote.end_at > point.point_at
          else quote.created_at <= point.point_at
        end
      ) as quotes,
      (
        select count(*) from range_quotes quote
        where quote.status = 'Ready to send'
          and case
            when quote.start_at is not null and quote.end_at is not null then quote.start_at <= point.point_at and quote.end_at > point.point_at
            when quote.start_at is not null then quote.start_at <= point.point_at
            when quote.end_at is not null then quote.end_at > point.point_at
            else quote.created_at <= point.point_at
          end
      ) as ready_quotes
    from points point
  ),
  dashboard_modes(mode, label, colour, mode_order) as (
    values
      ('OCEAN'::text, 'Ocean'::text, 'var(--md-accent)'::text, 1),
      ('AIR', 'Air', 'var(--md-blue)', 2),
      ('ROAD', 'Road', 'var(--md-amber)', 3),
      ('MULTIMODAL', 'Multimodal', 'var(--md-accent-glow-warm)', 4)
  ),
  mode_series as materialized (
    select
      mode.mode,
      mode.label,
      mode.colour,
      mode.mode_order,
      (
        select count(*)
        from active_bookings booking
        where (case when booking.mode = 'SEA' then 'OCEAN' else booking.mode end) = mode.mode
      ) as total,
      jsonb_agg((
        select count(*)
        from active_bookings candidate
        where (case when candidate.mode = 'SEA' then 'OCEAN' else candidate.mode end) = mode.mode
          and case
            when candidate.start_at is not null and candidate.end_at is not null then candidate.start_at <= point.point_at and candidate.end_at > point.point_at
            when candidate.start_at is not null then candidate.start_at <= point.point_at
            when candidate.end_at is not null then candidate.end_at > point.point_at
            else candidate.updated_at <= point.point_at
          end
      ) order by point.point_index) as values
    from dashboard_modes mode
    cross join points point
    group by mode.mode, mode.label, mode.colour, mode.mode_order
  ),
  priority_rows as materialized (
    select
      'booking:' || booking.reference as row_key,
      booking.updated_at,
      booking.updated_at + greatest(1, round((100 - booking.progress)::numeric / 20)::integer) * interval '1 hour' as due_at,
      1 as category_order,
      jsonb_build_object(
        'id', 'booking:' || booking.reference,
        'kind', 'exception',
        'reference', booking.reference,
        'task', case when booking.status = 'Exception' then 'Resolve tracking exception' else 'Review revised delivery plan' end,
        'customer', booking.customer,
        'context', booking.route,
        'status', booking.status,
        'owner', booking.owner,
        'dueAt', extract(epoch from (booking.updated_at + greatest(1, round((100 - booking.progress)::numeric / 20)::integer) * interval '1 hour')) * 1000,
        'dueKind', 'action',
        'tone', booking.tone,
        'bookingId', booking.reference
      ) as item
    from active_bookings booking
    where booking.status <> 'On track'

    union all

    select
      'quote-send:' || quote.reference,
      quote.updated_at,
      least(coalesce(quote.start_at, p_cutoff_at), p_cutoff_at),
      2,
      jsonb_build_object(
        'id', 'quote-send:' || quote.reference,
        'kind', 'quote-send',
        'reference', quote.reference,
        'task', 'Send priced quote',
        'customer', quote.customer,
        'context', quote.origin || ' → ' || quote.destination,
        'status', quote.status,
        'owner', quote.owner,
        'dueAt', extract(epoch from least(coalesce(quote.start_at, p_cutoff_at), p_cutoff_at)) * 1000,
        'dueKind', case when quote.start_at is not null and quote.start_at < p_cutoff_at then 'departure' else 'cutoff' end,
        'tone', quote.status_tone,
        'quoteReference', quote.reference
      )
    from quote_base quote
    where quote.status = 'Ready to send'

    union all

    select
      'quote-progress:' || quote.reference,
      quote.updated_at,
      coalesce(quote.start_at, p_cutoff_at),
      3,
      jsonb_build_object(
        'id', 'quote-progress:' || quote.reference,
        'kind', 'quote-progress',
        'reference', quote.reference,
        'task', 'Progress ' || lower(quote.workflow_stage),
        'customer', quote.customer,
        'context', quote.origin || ' → ' || quote.destination,
        'status', quote.status,
        'owner', quote.owner,
        'dueAt', extract(epoch from coalesce(quote.start_at, p_cutoff_at)) * 1000,
        'dueKind', case when quote.start_at is null then 'cutoff' else 'departure' end,
        'tone', quote.priority_tone,
        'quoteReference', quote.reference
      )
    from quote_base quote
    where quote.status not in ('Sent', 'Accepted', 'Ready to send')
  ),
  priority_page as materialized (
    select *
    from priority_rows
    order by due_at, category_order, updated_at desc nulls last, row_key
    limit v_limit
  ),
  priority_mine_page as materialized (
    select *
    from priority_rows
    where item ->> 'owner' = coalesce(p_operator_name, '')
    order by due_at, category_order, updated_at desc nulls last, row_key
    limit v_limit
  ),
  live_page as materialized (
    select
      booking.updated_at,
      booking.reference,
      jsonb_build_object(
        'id', booking.reference,
        'lane', booking.route,
        'mode', case
          when booking.mode in ('OCEAN', 'SEA') then 'Ocean'
          when booking.mode = 'AIR' then 'Air'
          when booking.mode = 'ROAD' then 'Road'
          when booking.mode = 'MULTIMODAL' then 'Multimodal'
          else booking.mode
        end,
        'customer', booking.customer,
        'milestone', booking.status,
        'progress', booking.progress,
        'eta', booking.eta,
        'updatedAt', booking.updated_at,
        'tone', booking.tone,
        'origin', booking.origin,
        'destination', booking.destination
      ) as item
    from active_bookings booking
    order by booking.updated_at desc nulls last, booking.reference
    limit v_limit
  ),
  region_terms(code, terms, region_order) as (
    values
      ('LAX'::text, array['Los Angeles','Long Beach','USLAX']::text[], 1),
      ('CHI', array['Chicago','USCHI']::text[], 2),
      ('NYC', array['New York','JFK','USJFK']::text[], 3),
      ('YYZ', array['Toronto','CATOR']::text[], 4),
      ('GRU', array['Sao Paulo','Santos','BRSSZ']::text[], 5),
      ('LDN', array['London','Heathrow','GBLHR','Felixstowe','GBFXT','Bristol','GBBRS','Southampton','GBSOU','Gateway','Manchester','Birmingham']::text[], 6),
      ('AMS', array['Amsterdam','Rotterdam','NLRTM']::text[], 7),
      ('FRA', array['Frankfurt','DEFRA','Hamburg','DEHAM']::text[], 8),
      ('IST', array['Istanbul','TRIST']::text[], 9),
      ('DXB', array['Dubai','AEDXB']::text[], 10),
      ('BOM', array['Mumbai','Nhava Sheva','INNSA']::text[], 11),
      ('SIN', array['Singapore','SGSIN']::text[], 12),
      ('HKG', array['Hong Kong','HKHKG']::text[], 13),
      ('SHA', array['Shanghai','CNSHA','Yantian','CNYTN','Ningbo','CNNGB']::text[], 14),
      ('TYO', array['Tokyo','Narita','JPTYO','Kobe','JPUKB']::text[], 15),
      ('SYD', array['Sydney','AUSYD','Melbourne','AUMEL']::text[], 16)
  ),
  region_counts as materialized (
    select
      region.code,
      region.region_order,
      (
        select count(*) from quote_base quote
        where quote.status not in ('Sent', 'Accepted')
          and exists (
            select 1 from unnest(region.terms) term
            where strpos(lower(coalesce(quote.origin, '') || ' ' || coalesce(quote.destination, '')), lower(term)) > 0
          )
      ) as open_rfqs,
      (
        select count(*) from booking_base booking
        where booking.status <> 'On track'
          and exists (
            select 1 from unnest(region.terms) term
            where strpos(lower(coalesce(booking.origin, '') || ' ' || coalesce(booking.destination, '')), lower(term)) > 0
          )
      ) as need_action,
      (
        select count(*) from quote_base quote
        where quote.status = 'Ready to send'
          and exists (
            select 1 from unnest(region.terms) term
            where strpos(lower(coalesce(quote.origin, '') || ' ' || coalesce(quote.destination, '')), lower(term)) > 0
          )
      ) as ready_to_quote
    from region_terms region
  ),
  quote_stage_counts as materialized (
    select
      workflow_stage as name,
      count(*) as value,
      max(updated_at) as latest
    from quote_base
    where status not in ('Sent', 'Accepted') and nullif(btrim(workflow_stage), '') is not null
    group by workflow_stage
    order by value desc, latest desc nulls last, workflow_stage
    limit 5
  )
  select jsonb_build_object(
    'windowStart', p_window_start,
    'windowEnd', p_window_end,
    'seriesEnd', p_series_end,
    'generatedAt', p_now,
    'counts', jsonb_build_object(
      'activeJobs', (select count(*) from range_bookings),
      'exceptions', (select count(*) from range_bookings where status <> 'On track'),
      'openQuotes', (select count(*) from range_quotes where status not in ('Sent', 'Accepted')),
      'readyQuotes', (select count(*) from range_quotes where status = 'Ready to send'),
      'totalQuotes', (select count(*) from range_quotes),
      'priority', (select count(*) from priority_rows),
      'priorityMine', (select count(*) from priority_rows where item ->> 'owner' = coalesce(p_operator_name, '')),
      'liveBookings', (select count(*) from active_bookings),
      'liveExceptions', (select count(*) from active_bookings where status <> 'On track')
    ),
    'series', jsonb_build_object(
      'activeJobs', (select jsonb_agg(active_jobs order by point_index) from kpi_series),
      'exceptions', (select jsonb_agg(exceptions order by point_index) from kpi_series),
      'quotes', (select jsonb_agg(quotes order by point_index) from kpi_series),
      'readyQuotes', (select jsonb_agg(ready_quotes order by point_index) from kpi_series),
      'modes', coalesce((select jsonb_object_agg(mode, values order by mode_order) from mode_series where total > 0), '{}'::jsonb)
    ),
    'modeDefinitions', coalesce((select jsonb_agg(jsonb_build_object('key', mode, 'label', label, 'color', colour) order by mode_order) from mode_series where total > 0), '[]'::jsonb),
    'clockQueues', coalesce((select jsonb_object_agg(code, jsonb_build_object('openRfqs', open_rfqs, 'needAction', need_action, 'readyToQuote', ready_to_quote) order by region_order) from region_counts), '{}'::jsonb),
    'statusCounts', jsonb_build_object(
      'Exception', (select count(*) from active_bookings where status = 'Exception'),
      'Delayed', (select count(*) from active_bookings where status = 'Delayed'),
      'On track', (select count(*) from active_bookings where status = 'On track')
    ),
    'quoteStages', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'value', value) order by value desc, latest desc nulls last, name) from quote_stage_counts), '[]'::jsonb),
    'priorityItems', coalesce((select jsonb_agg(item order by due_at, category_order, updated_at desc nulls last, row_key) from priority_page), '[]'::jsonb),
    'priorityMineItems', coalesce((select jsonb_agg(item order by due_at, category_order, updated_at desc nulls last, row_key) from priority_mine_page), '[]'::jsonb),
    'liveBookings', coalesce((select jsonb_agg(item order by updated_at desc nulls last, reference) from live_page), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.multideck_dashboard_drilldown_page(
  p_kind text,
  p_value text,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_time_zone text default 'UTC',
  p_limit integer default 50,
  p_cursor_sort_at timestamptz default null,
  p_cursor_row_key text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_kind text := lower(coalesce(nullif(btrim(p_kind), ''), ''));
  v_value text := upper(coalesce(nullif(btrim(p_value), ''), ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 50));
  v_time_zone text := coalesce(nullif(btrim(p_time_zone), ''), 'UTC');
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if v_kind not in ('active_jobs', 'booking_exceptions', 'open_quotes', 'ready_quotes', 'region') then
    raise exception 'Choose a valid dashboard drilldown.' using errcode = '22023';
  end if;
  if v_kind = 'region' and v_value not in ('LAX','CHI','NYC','YYZ','GRU','LDN','AMS','FRA','IST','DXB','BOM','SIN','HKG','SHA','TYO','SYD') then
    raise exception 'Choose a valid dashboard operating region.' using errcode = '22023';
  end if;
  if p_window_start is null or p_window_end is null or p_window_end <= p_window_start then
    raise exception 'Choose a valid dashboard date range.' using errcode = '22007';
  end if;
  if (p_cursor_sort_at is null) <> (p_cursor_row_key is null) then
    raise exception 'The dashboard cursor is incomplete.' using errcode = '22023';
  end if;
  perform 1 from pg_catalog.pg_timezone_names where name = v_time_zone;
  if not found then
    raise exception 'Choose a valid dashboard time zone.' using errcode = '22023';
  end if;

  with
  region_terms(code, terms) as (
    values
      ('LAX'::text, array['Los Angeles','Long Beach','USLAX']::text[]),
      ('CHI', array['Chicago','USCHI']::text[]),
      ('NYC', array['New York','JFK','USJFK']::text[]),
      ('YYZ', array['Toronto','CATOR']::text[]),
      ('GRU', array['Sao Paulo','Santos','BRSSZ']::text[]),
      ('LDN', array['London','Heathrow','GBLHR','Felixstowe','GBFXT','Bristol','GBBRS','Southampton','GBSOU','Gateway','Manchester','Birmingham']::text[]),
      ('AMS', array['Amsterdam','Rotterdam','NLRTM']::text[]),
      ('FRA', array['Frankfurt','DEFRA','Hamburg','DEHAM']::text[]),
      ('IST', array['Istanbul','TRIST']::text[]),
      ('DXB', array['Dubai','AEDXB']::text[]),
      ('BOM', array['Mumbai','Nhava Sheva','INNSA']::text[]),
      ('SIN', array['Singapore','SGSIN']::text[]),
      ('HKG', array['Hong Kong','HKHKG']::text[]),
      ('SHA', array['Shanghai','CNSHA','Yantian','CNYTN','Ningbo','CNNGB']::text[]),
      ('TYO', array['Tokyo','Narita','JPTYO','Kobe','JPUKB']::text[]),
      ('SYD', array['Sydney','AUSYD','Melbourne','AUMEL']::text[])
  ),
  booking_base as materialized (
    select
      booking."Booking_Reference"::text as reference,
      booking."Customer_Name"::text as customer,
      booking."Route"::text as route,
      booking."Status"::text as status,
      booking."Progress"::integer as progress,
      booking."Tone"::text as tone,
      booking."Origin"::text as origin,
      booking."Destination"::text as destination,
      coalesce(booking."Departure_At", pg_catalog.timezone(v_time_zone, booking."Departure_Date"::timestamp)) as start_at,
      coalesce(booking."Arrival_At", pg_catalog.timezone(v_time_zone, (booking."Arrival_Date" + 1)::timestamp)) as end_at,
      booking."Updated_At"::timestamptz as sort_at
    from public."App_Live_Bookings" booking
  ),
  quote_base as materialized (
    select
      quote."Quote_Reference"::text as reference,
      quote."Customer_Name"::text as customer,
      quote."Origin"::text as origin,
      quote."Destination"::text as destination,
      quote."Quote_Status"::text as status,
      quote."Quote_Status_Tone"::text as tone,
      quote."Created_At"::timestamptz as created_at,
      quote."Updated_At"::timestamptz as sort_at,
      case when quote."Estimated_Departure" is null then null else pg_catalog.timezone(v_time_zone, quote."Estimated_Departure"::timestamp) end as start_at,
      case when quote."Estimated_Arrival" is null then null else pg_catalog.timezone(v_time_zone, (quote."Estimated_Arrival" + 1)::timestamp) end as end_at
    from public."App_Live_Quotes" quote
  ),
  eligible as materialized (
    select
      'booking:' || booking.reference as row_key,
      booking.sort_at,
      jsonb_build_object(
        'id', booking.reference,
        'detail', booking.customer || ' · ' || booking.route,
        'status', booking.status,
        'tone', booking.tone,
        'recordType', 'booking'
      ) as item
    from booking_base booking
    where (
      v_kind = 'active_jobs'
      and booking.progress < 100
      and case
        when booking.start_at is not null and booking.end_at is not null then booking.start_at < p_window_end and booking.end_at > p_window_start
        when booking.start_at is not null then booking.start_at >= p_window_start and booking.start_at < p_window_end
        when booking.end_at is not null then booking.end_at > p_window_start and booking.end_at <= p_window_end
        else booking.sort_at >= p_window_start and booking.sort_at < p_window_end
      end
    ) or (
      v_kind = 'booking_exceptions'
      and booking.progress < 100
      and booking.status <> 'On track'
      and case
        when booking.start_at is not null and booking.end_at is not null then booking.start_at < p_window_end and booking.end_at > p_window_start
        when booking.start_at is not null then booking.start_at >= p_window_start and booking.start_at < p_window_end
        when booking.end_at is not null then booking.end_at > p_window_start and booking.end_at <= p_window_end
        else booking.sort_at >= p_window_start and booking.sort_at < p_window_end
      end
    ) or (
      v_kind = 'region'
      and exists (
        select 1 from region_terms region, unnest(region.terms) term
        where region.code = v_value
          and strpos(lower(coalesce(booking.origin, '') || ' ' || coalesce(booking.destination, '')), lower(term)) > 0
      )
    )

    union all

    select
      'quote:' || quote.reference,
      quote.sort_at,
      jsonb_build_object(
        'id', quote.reference,
        'detail', quote.customer || ' · ' || quote.origin || ' → ' || quote.destination,
        'status', quote.status,
        'tone', quote.tone,
        'recordType', 'quote'
      )
    from quote_base quote
    where (
      v_kind = 'open_quotes'
      and quote.status not in ('Sent', 'Accepted')
      and case
        when quote.start_at is not null and quote.end_at is not null then quote.start_at < p_window_end and quote.end_at > p_window_start
        when quote.start_at is not null then quote.start_at >= p_window_start and quote.start_at < p_window_end
        when quote.end_at is not null then quote.end_at > p_window_start and quote.end_at <= p_window_end
        else quote.created_at >= p_window_start and quote.created_at < p_window_end
      end
    ) or (
      v_kind = 'ready_quotes'
      and quote.status = 'Ready to send'
      and case
        when quote.start_at is not null and quote.end_at is not null then quote.start_at < p_window_end and quote.end_at > p_window_start
        when quote.start_at is not null then quote.start_at >= p_window_start and quote.start_at < p_window_end
        when quote.end_at is not null then quote.end_at > p_window_start and quote.end_at <= p_window_end
        else quote.created_at >= p_window_start and quote.created_at < p_window_end
      end
    ) or (
      v_kind = 'region'
      and exists (
        select 1 from region_terms region, unnest(region.terms) term
        where region.code = v_value
          and strpos(lower(coalesce(quote.origin, '') || ' ' || coalesce(quote.destination, '')), lower(term)) > 0
      )
    )
  ),
  cursor_page as materialized (
    select *
    from eligible
    where p_cursor_sort_at is null or (sort_at, row_key) < (p_cursor_sort_at, p_cursor_row_key)
    order by sort_at desc nulls last, row_key desc
    limit v_limit + 1
  ),
  numbered as materialized (
    select *, row_number() over (order by sort_at desc nulls last, row_key desc) as ordinal
    from cursor_page
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(item order by ordinal) from numbered where ordinal <= v_limit), '[]'::jsonb),
    'total', (select count(*) from eligible),
    'hasMore', exists(select 1 from numbered where ordinal > v_limit),
    'nextCursor', case when exists(select 1 from numbered where ordinal > v_limit) then (
      select jsonb_build_object('sortAt', sort_at, 'rowKey', row_key)
      from numbered where ordinal = v_limit
    ) else null end
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.multideck_dashboard_overview(timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,text,text,integer) from public, anon;
revoke all on function public.multideck_dashboard_drilldown_page(text,text,timestamptz,timestamptz,text,integer,timestamptz,text) from public, anon;
grant execute on function public.multideck_dashboard_overview(timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,text,text,integer) to authenticated, service_role;
grant execute on function public.multideck_dashboard_drilldown_page(text,text,timestamptz,timestamptz,text,integer,timestamptz,text) to authenticated, service_role;

comment on function public.multideck_dashboard_overview(timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,text,text,integer)
is 'RLS-preserving Overview read model: exact dashboard aggregates plus no more than 50 priority and live-booking rows.';
comment on function public.multideck_dashboard_drilldown_page(text,text,timestamptz,timestamptz,text,integer,timestamptz,text)
is 'RLS-preserving, maximum-50-row keyset page for Overview metric and operating-region drilldowns.';

-- Dexter exception: these functions only bound and aggregate existing Bookings
-- and Quotes reads. They add no new data, mutation, permission, action, or watch
-- semantics, so the existing Dexter domains and event-driven watches remain the
-- correct capability surfaces.

commit;
