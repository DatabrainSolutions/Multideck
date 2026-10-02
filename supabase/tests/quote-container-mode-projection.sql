-- Read-only assertions against the deployed projection (no operational writes).
do $test$
declare s jsonb; spec jsonb; expected integer;
begin
  for spec in select value from jsonb_array_elements('[
    ["air","AIR",[],0], ["air","FCL",[],0], ["sea","LCL",[],0],
    ["sea","FCL - FCL",[],2], ["rail","CONTAINER",[],2],
    ["multimodal","FCL",[{"mode":"sea"}],2], ["warehouse","WAREHOUSE",[],0],
    ["","",[],2]
  ]'::jsonb) loop
    s := jsonb_build_object('quote', jsonb_build_object('mode',spec->>0,'shipmentType',spec->>1,
      'shipmentFacts',jsonb_build_object('routingLegs',spec->2,
      'containerRequests','[{"type":"40GP","quantity":1},{"type":"20GP","quantity":1}]'::jsonb)));
    expected := (spec->>3)::integer;
    if jsonb_array_length(booking_api.quote_container_rows(s)) <> expected then
      raise exception 'Container projection failed for %',spec;
    end if;
  end loop;
end $test$;
