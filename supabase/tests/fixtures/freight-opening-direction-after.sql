-- Full-row and unrelated-function preservation is also asserted by road-open-after.
do $$declare signature text;begin
  if (select proacl from pg_proc where oid='booking_api.open_booking(uuid,uuid,text)'::regprocedure)
    is distinct from (select proacl from freight_rehearsal.direction_opener_before)
    then raise exception 'Compatibility opener grants changed';end if;
  if exists((select * from quote_api.booking_reference_sequences except select * from freight_rehearsal.direction_sequences_before)
    union all (select * from freight_rehearsal.direction_sequences_before except select * from quote_api.booking_reference_sequences))
    or exists((select * from quote_api.reference_reservations except select * from freight_rehearsal.direction_reservations_before)
    union all (select * from freight_rehearsal.direction_reservations_before except select * from quote_api.reference_reservations))
    then raise exception 'Migration changed numbering data';end if;
  foreach signature in array array['public.booking_workflow_open(uuid,uuid,text,text)',
    'public.booking_workflow_open_road(uuid,uuid,text,text)'] loop
    if to_regprocedure(signature) is null or has_function_privilege('anon',signature,'execute')
      or has_function_privilege('authenticated',signature,'execute')
      or not has_function_privilege('service_role',signature,'execute') then raise exception 'Direction adapter grants incorrect';end if;
    if not exists(select 1 from pg_proc where oid=to_regprocedure(signature)
      and prosecdef and proconfig @> array['search_path=""']) then raise exception 'Direction adapter search path incorrect';end if;
  end loop;
  if has_function_privilege('anon','booking_api.open_booking(uuid,uuid,text,text)','execute')
    or has_function_privilege('authenticated','booking_api.open_booking(uuid,uuid,text,text)','execute')
    or has_function_privilege('service_role','booking_api.open_booking(uuid,uuid,text,text)','execute')
    then raise exception 'Private direction opener exposed';end if;
end $$;
