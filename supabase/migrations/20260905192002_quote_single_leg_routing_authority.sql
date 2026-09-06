-- An explicit route remains authoritative even when only one leg is planned.
-- Patch the existing private implementations without replacing their later
-- cargo, payer, goods-value or mode-review wrappers. No historical rows change.
begin;

do $migration$
declare
  definition text;
  anchor text;
begin
  definition := pg_get_functiondef('booking_api.quote_sync_projection_before_payer_20260904(jsonb)'::regprocedure);
  anchor := 'jsonb_array_length(facts->''routingLegs'')>1';
  if strpos(definition, anchor)=0 then raise exception 'Expected explicit Quote routing projection guard missing'; end if;
  definition := replace(definition, anchor, 'jsonb_array_length(facts->''routingLegs'')>0');

  anchor := 'jsonb_build_object(''routing'', route_plan.routes)';
  if strpos(definition, anchor)=0 then raise exception 'Expected Quote routing projection result missing'; end if;
  definition := replace(definition, anchor, $replacement$jsonb_build_object(
      'routing', route_plan.routes,
      'routingIsExplicit', case when jsonb_typeof(snapshot#>'{quote,shipmentFacts,routingLegs}')='array'
        then jsonb_array_length(snapshot#>'{quote,shipmentFacts,routingLegs}')>0 else false end
    )$replacement$);

  -- The editor serialises a cleared UN/LOCODE as "", not null. A deliberately
  -- free-text place must not disappear from the accepted routing plan.
  foreach anchor in array array['origin','destination'] loop
    definition := replace(definition,
      format('coalesce(leg#>>''{%s,unlocode}'', leg#>>''{%s,place}'')', anchor, anchor),
      format('coalesce(nullif(btrim(leg#>>''{%s,unlocode}''), ''''), leg#>>''{%s,place}'')', anchor, anchor));
  end loop;
  execute definition;

  definition := pg_get_functiondef('booking_api.quote_sync_differences_before_payer_20260904(jsonb,jsonb,jsonb)'::regprocedure);
  anchor := ')>1 as has_multi_leg_plan';
  if strpos(definition, anchor)=0 then raise exception 'Expected Quote routing comparison guard missing'; end if;
  definition := replace(definition, anchor, $replacement$)>1
      or baseline->'routingIsExplicit'='true'::jsonb
      or proposed->'routingIsExplicit'='true'::jsonb as has_multi_leg_plan$replacement$);
  -- Absent markers in existing persisted review baselines mean legacy A-B,
  -- not SQL NULL. Keep ordinary A-B fields individually selectable.
  definition := replace(definition, 'baseline->''routingIsExplicit''=''true''::jsonb',
    'coalesce(baseline->''routingIsExplicit''=''true''::jsonb, false)');
  definition := replace(definition, 'proposed->''routingIsExplicit''=''true''::jsonb',
    'coalesce(proposed->''routingIsExplicit''=''true''::jsonb, false)');
  execute definition;
end;
$migration$;

-- CREATE OR REPLACE preserves existing ACLs. These are internal projections,
-- never independent application RPCs.
revoke all on function booking_api.quote_sync_projection_before_payer_20260904(jsonb) from public, anon, authenticated, service_role;
revoke all on function booking_api.quote_sync_differences_before_payer_20260904(jsonb,jsonb,jsonb) from public, anon, authenticated, service_role;
commit;
