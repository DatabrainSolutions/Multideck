-- A quoted leg can change mode without changing the overall Job mode.
-- Keep the existing review token, selection, permission and audit boundary.
begin;

create function booking_api.routing_mode_review_required(current_routes jsonb, proposed_routes jsonb)
returns boolean language plpgsql stable set search_path='' as $$
declare current_modes text[]; proposed_modes text[];
begin
  if jsonb_typeof(current_routes) is distinct from 'array'
    or jsonb_typeof(proposed_routes) is distinct from 'array' then return true; end if;
  select coalesce(array_agg(booking_api.normalise_mode(value->>'mode') order by ordinality),'{}')
    into current_modes from jsonb_array_elements(current_routes) with ordinality;
  select coalesce(array_agg(booking_api.normalise_mode(value->>'mode') order by ordinality),'{}')
    into proposed_modes from jsonb_array_elements(proposed_routes) with ordinality;
  -- An unknown mode is not evidence of an unchanged mode. Never infer Road.
  if array_position(current_modes,null) is not null or array_position(proposed_modes,null) is not null then return true; end if;
  -- Application matches existing Quote-owned rows in route order. Detect any
  -- changed overlapping position, plus introducing/removing a distinct mode.
  -- Another same-mode leg at the end is not by itself a mode change.
  return exists(select 1 from generate_series(1,least(cardinality(current_modes),cardinality(proposed_modes))) n
      where current_modes[n] is distinct from proposed_modes[n])
    or not (current_modes @> proposed_modes and current_modes <@ proposed_modes);
end;
$$;

alter function booking_api.quote_sync_differences(jsonb,jsonb,jsonb)
  rename to quote_sync_differences_before_route_mode_review_20260905;
create function booking_api.quote_sync_differences(baseline jsonb,booking jsonb,proposed jsonb)
returns jsonb language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(case
    when value->>'key'='routing' and booking_api.routing_mode_review_required(booking->'routing',proposed->'routing')
      then value || jsonb_build_object('requiresConfirmation',true,'warningCode','mode_change','recommendation','review',
        'reviewNote','The routing plan changes transport modes. Review each leg before applying; previous references remain in Booking audit history.')
    else value end order by ordinality),'[]'::jsonb)
  from jsonb_array_elements(booking_api.quote_sync_differences_before_route_mode_review_20260905(baseline,booking,proposed)) with ordinality
$$;

do $migration$
declare definition text; anchor text;
begin
  definition:=pg_get_functiondef('public.booking_workflow_apply_quote_sync_v2(uuid,uuid,uuid,jsonb,text,boolean)'::regprocedure);
  anchor:='if selected ? ''mode'' and not coalesce(confirm_mode_change,false) then';
  if position(anchor in definition)=0 then raise exception 'Review the v2 apply boundary before adding routing mode confirmation.'; end if;
  execute replace(definition,anchor,$guard$if (selected ? 'mode' or (selected ? 'routing' and
    booking_api.routing_mode_review_required(refreshed#>'{booking,routing}',refreshed#>'{proposed,routing}')))
    and not coalesce(confirm_mode_change,false) then$guard$);
  definition:=pg_get_functiondef('public.booking_workflow_apply_quote_sync_v2(uuid,uuid,uuid,jsonb,text,boolean)'::regprocedure);
  anchor:='  select * into strict review_row from booking_api.quote_sync_reviews where review_id=requested_review_id;';
  if position(anchor in definition)=0 then raise exception 'Review the v2 completion stage before recording mode approval.'; end if;
  execute replace(definition,anchor,$guard$  if coalesce(confirm_mode_change,false) and (selected ? 'mode' or (selected ? 'routing' and
      booking_api.routing_mode_review_required(refreshed#>'{booking,routing}',refreshed#>'{proposed,routing}'))) then
    insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
      values(app_user."Company_ID",requested_job_id,'quote_mode_change_confirmed',
        'The operator confirmed transport mode changes when applying the accepted Quote revision.',
        jsonb_build_object('reviewId',requested_review_id,'quoteVersionId',review_row.proposed_version_id,
          'appliedFields',selected,'modeChangeConfirmed',true,'reviewToken',expected_review_token),app_user."User_ID");
  end if;
  select * into strict review_row from booking_api.quote_sync_reviews where review_id=requested_review_id;$guard$);

  definition:=pg_get_functiondef('public.booking_workflow_apply_quote_sync_confirmed(uuid,uuid,uuid,jsonb,boolean)'::regprocedure);
  anchor:='    perform booking_api.apply_quote_routing_plan(';
  if position(anchor in definition)=0 then raise exception 'Review the internal routing apply stage before adding mode confirmation.'; end if;
  execute replace(definition,anchor,$guard$    if not coalesce(confirm_mode_change,false) and booking_api.routing_mode_review_required(
      booking_api.current_quote_sync_projection(requested_job_id)->'routing',review_row.proposed_snapshot->'routing') then
      raise exception 'Confirm the routing mode change before applying it to the Booking.' using errcode='22023';
    end if;
    perform booking_api.apply_quote_routing_plan($guard$);

  -- A revised multi-leg plan can legitimately become A-B again. Previously
  -- this returned without writing, although the review marked routing applied.
  definition:=pg_get_functiondef('booking_api.apply_quote_routing_plan_before_labels_and_order_20260904(uuid,uuid,uuid)'::regprocedure);
  anchor:='if jsonb_typeof(proposed_routes)<>''array'' or jsonb_array_length(proposed_routes)<=1 then return; end if;';
  if position(anchor in definition)=0 then raise exception 'Review routing replacement before supporting a reduced plan.'; end if;
  execute replace(definition,anchor,$guard$if jsonb_typeof(proposed_routes) is distinct from 'array' then
    raise exception 'The accepted Quote needs a valid routing plan.' using errcode='22023'; end if;
  if jsonb_array_length(proposed_routes) not between 1 and 30 or exists(
    select 1 from jsonb_array_elements(proposed_routes) item where booking_api.normalise_mode(item->>'mode') is null) then
    raise exception 'The accepted Quote needs one to thirty routing legs with supported modes.' using errcode='22023'; end if;$guard$);
  definition:=pg_get_functiondef('booking_api.apply_quote_routing_plan(uuid,uuid,uuid)'::regprocedure);
  anchor:='if quote_route_count<=1 then return; end if;';
  if position(anchor in definition)=0 then raise exception 'Review operational-leg ordering before supporting a reduced plan.'; end if;
  execute replace(definition,anchor,'if quote_route_count=0 then return; end if;');

  -- Reordering an operator-added leg must not rewrite its compatibility data.
  -- Only a real reference/mode change (or explicit review) needs that work.
  definition:=pg_get_functiondef('booking_api.preserve_route_mode_references()'::regprocedure);
  anchor:='  -- A review is one-use request evidence, never a permanent approval flag.';
  if position(anchor in definition)=0 then raise exception 'Review the reference history trigger before excluding unrelated route edits.'; end if;
  execute replace(definition,anchor,$guard$  if from_mode is not distinct from to_mode and before_refs is not distinct from after_refs and review is null then
    return new;
  end if;
  -- A review is one-use request evidence, never a permanent approval flag.$guard$);
end;
$migration$;

-- Current Edge callers use v2. Older stages remain available to its definer,
-- not as direct service RPCs that bypass the fresh token/latest-version guard.
revoke all on function public.booking_workflow_apply_quote_sync(uuid,uuid,uuid,jsonb),
  public.booking_workflow_apply_quote_sync_confirmed(uuid,uuid,uuid,jsonb,boolean),
  booking_api.routing_mode_review_required(jsonb,jsonb),
  booking_api.quote_sync_differences_before_route_mode_review_20260905(jsonb,jsonb,jsonb),
  booking_api.quote_sync_differences(jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
commit;
