-- Some deployed App projects have the warehouse schema without the historical
-- Dexter Edge-only action guard. Restore only this deny-only prerequisite;
-- do not replay the unrelated operational create/edit parity migration.
begin;
do $migration$
begin
  if to_regprocedure('public._multideck_dexter_edge_action_only()') is null then
    execute $definition$
      create function public._multideck_dexter_edge_action_only()
      returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $body$
      begin
        raise exception 'This action must be completed through its authenticated product runtime.' using errcode='42501';
      end;
      $body$;
    $definition$;
  end if;
end;
$migration$;
revoke all on function public._multideck_dexter_edge_action_only() from public,anon,authenticated;
commit;
