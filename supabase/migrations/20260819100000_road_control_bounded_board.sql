-- Bounded Road Control reads. The list returns one paged stage; the Kanban
-- returns at most p_limit rows per stage plus exact counts. The security-invoker
-- function reads the existing RLS-protected booking view and creates no data.

begin;

create or replace function public.multideck_road_control_page(
  p_scope text default 'All Jobs',
  p_operator_code text default null,
  p_stage text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_scope text := case when p_scope in ('All Jobs', 'My Jobs', 'Starred Jobs') then p_scope else 'All Jobs' end;
  v_stage text := case when p_stage in ('intake', 'ready', 'carrier', 'live', 'close') then p_stage end;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;

  with base as materialized (
    select
      booking."Job_ID",
      booking."Booking_Reference",
      booking."Customer_Name",
      booking."Carrier",
      booking."Mode",
      booking."Shipment_Type",
      booking."Eta_Display",
      booking."Status",
      booking."Progress",
      booking."Owner_Code",
      booking."Tone",
      booking."Customer_Reference",
      booking."Origin",
      booking."Destination",
      booking."Is_Favourite",
      booking."Updated_At",
      case
        when coalesce(booking."Progress", 0) < 30 then 'intake'
        when coalesce(booking."Progress", 0) < 50 then 'ready'
        when coalesce(booking."Progress", 0) < 60 then 'carrier'
        when coalesce(booking."Progress", 0) < 90 then 'live'
        else 'close'
      end as road_stage
    from public."App_Live_Bookings" booking
    where upper(coalesce(booking."Mode", '')) = 'ROAD'
      and (v_scope <> 'My Jobs' or booking."Owner_Code" = coalesce(nullif(btrim(p_operator_code), ''), ''))
      and (v_scope <> 'Starred Jobs' or coalesce(booking."Is_Favourite", false))
  ), ranked as (
    select *, row_number() over (
      partition by road_stage
      order by "Updated_At" desc nulls last, "Booking_Reference"
    ) as ordinal
    from base
    where v_stage is null or road_stage = v_stage
  ), page as (
    select *
    from ranked
    where case
      when v_stage is null then ordinal <= v_limit
      else ordinal > v_offset and ordinal <= v_offset + v_limit
    end
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(to_jsonb(item) - 'ordinal' order by item.road_stage, item.ordinal)
      from page item
    ), '[]'::jsonb),
    'counts', jsonb_build_object(
      'intake', (select count(*) from base where road_stage = 'intake'),
      'ready', (select count(*) from base where road_stage = 'ready'),
      'carrier', (select count(*) from base where road_stage = 'carrier'),
      'live', (select count(*) from base where road_stage = 'live'),
      'close', (select count(*) from base where road_stage = 'close')
    ),
    'total', (select count(*) from base),
    'filteredTotal', case
      when v_stage is null then (select count(*) from base)
      else (select count(*) from base where road_stage = v_stage)
    end,
    'limit', v_limit,
    'offset', case when v_stage is null then 0 else v_offset end
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.multideck_road_control_page(text,text,text,integer,integer) from public, anon;
grant execute on function public.multideck_road_control_page(text,text,text,integer,integer) to authenticated, service_role;

comment on function public.multideck_road_control_page(text,text,text,integer,integer)
is 'RLS-preserving Road Control read with exact stage counts, maximum-50-row list pages and maximum-50-card Kanban lanes.';

-- Dexter exception: this read model only bounds the existing Road Control UI.
-- It changes no road-job capability, write semantics or event source, so the
-- existing Dexter booking domain and event-driven watches remain authoritative.

commit;
