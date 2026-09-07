-- Ensure note creation supplies the application user, not the Auth ID, to audit triggers.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public._multideck_add_lifecycle_note(uuid,text,uuid,text,jsonb)'::regprocedure);
  if position('perform set_config(''app.user_id''' in definition) = 0 then
    definition := replace(definition, '  insert into public."OPS_LifecycleNotes" (',
      '  perform set_config(''app.user_id'', v_context.actor_user_id::text, true);
  perform set_config(''app.auth_user_id'', p_auth_user_id::text, true);
  perform set_config(''app.actor_type'', ''user'', true);
  perform set_config(''app.source_app'', ''Multideck App'', true);
  perform set_config(''app.source_module'', ''lifecycle_notes'', true);

  insert into public."OPS_LifecycleNotes" (');
    execute definition;
  end if;
end;
$migration$;
