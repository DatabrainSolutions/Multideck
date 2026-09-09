-- Run against an authenticated CRM.Read fixture with at least two reachable leads:
-- set local request.jwt.claim.sub = '<fixture auth user id>';
-- Everything is read-only. Caller owns the transaction.
do $test$
declare
  baseline jsonb;
  first_name text;
  second_name text;
  query jsonb;
  result jsonb;
begin
  baseline := public.multideck_crm_lead_register_page(p_limit => 2);
  if jsonb_array_length(baseline -> 'rows') < 2 then
    raise exception 'Test requires two reachable leads.';
  end if;
  first_name := baseline #>> '{rows,0,companyName}';
  second_name := baseline #>> '{rows,1,companyName}';
  query := jsonb_build_object('match', 'any', 'groups', jsonb_build_array(
    jsonb_build_object('match', 'all', 'conditions', jsonb_build_array(
      jsonb_build_object('field', 'lead', 'operator', 'is', 'value', first_name))),
    jsonb_build_object('match', 'all', 'conditions', jsonb_build_array(
      jsonb_build_object('field', 'lead', 'operator', 'is', 'value', second_name)))
  ));
  result := public.multideck_crm_lead_register_filtered_page(query, p_limit => 1);
  if (result ->> 'total')::int < 2 or jsonb_array_length(result -> 'rows') <> 1 then
    raise exception 'OR groups must filter before pagination.';
  end if;
  if public.multideck_crm_lead_register_filtered_page(query, p_limit => 1, p_offset => 1) #>> '{rows,0,id}'
    = result #>> '{rows,0,id}' then
    raise exception 'Filtered pages must advance.';
  end if;
  query := jsonb_set(query, '{match}', '"all"');
  if first_name <> second_name and (public.multideck_crm_lead_register_filtered_page(query) ->> 'total')::int <> 0 then
    raise exception 'AND groups must intersect.';
  end if;
  if public.multideck_crm_lead_register_filtered_page(null, p_limit => 2) <> baseline then
    raise exception 'An empty query must preserve the original response.';
  end if;
  if has_function_privilege('anon',
    'public.multideck_crm_lead_register_filtered_page(jsonb,text,text,uuid,boolean,text,text,text,text,boolean,text,text,integer,integer)', 'EXECUTE') then
    raise exception 'Anonymous access must remain denied.';
  end if;
end;
$test$;
