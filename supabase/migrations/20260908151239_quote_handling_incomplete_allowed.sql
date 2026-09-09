begin;
set local lock_timeout='5s';
-- Missing handling information is an operational Booking gate, not a Quote gate.
-- Keep schema/type validation, safety-flag consistency and all unrelated checks.
do $migration$
declare definition text; block text;
begin
  definition:=pg_get_functiondef('quote_api.normalise_cargo_lines(jsonb,boolean)'::regprocedure);
  block:=$block$      if require_complete and cardinality(quote_api.cargo_handling_missing(normalised,true))>0 then
        raise exception 'Supply selected handling details or explicitly mark them TBC before issuing the Quote.' using errcode='22023';
      end if;$block$;
  if position(block in definition)=0 then raise exception 'Quote handling submission check changed; review before updating.'; end if;
  execute replace(definition,block,'');
  definition:=pg_get_functiondef('quote_api.cargo_issue_missing(jsonb,text,text)'::regprocedure);
  block:=$block$    if cardinality(quote_api.cargo_handling_missing(item,true))>0 then
      missing:=array_append(missing,format('Cargo line %s: supply handling details or explicitly select Details TBC',line_number));
    end if;$block$;
  if position(block in definition)=0 then raise exception 'Quote handling issue check changed; review before updating.'; end if;
  execute replace(definition,block,'');
end $migration$;
commit;
