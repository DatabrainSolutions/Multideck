-- A changed watch reports each real field transition, including consecutive
-- transitions on the same record. Threshold watches remain edge-triggered.
begin;

do $patch$
declare
  definition text;
  marker text := 'if v_matches and (';
begin
  definition := pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
  if (length(definition) - length(replace(definition, marker, ''))) / length(marker) <> 1 then
    raise exception 'Review the current Dexter watch evaluator before applying changed-watch reliability fix.';
  end if;
  execute replace(definition, marker,
    marker || 'watch."AIDexterWatch_RuleJSON"->>''operator'' = ''changed'' or ');
end $patch$;

commit;
