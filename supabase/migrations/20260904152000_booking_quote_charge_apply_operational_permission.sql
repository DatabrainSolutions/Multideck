-- Accepted quote charges are operational job costing lines. Applying them to
-- an existing booking must use the same Bookings.Write boundary as the other
-- accepted quote fields; Finance.Management.Prepare remains reserved for
-- period-end accrual and WIP work.

begin;

do $$
declare
  function_definition text;
  finance_gate text := E'  if selected_fields ? ''charges''\n     and not booking_api.has_permission(caller_auth_user_id,''Finance.Management.Prepare'') then\n    raise exception ''Financial quote changes require finance preparation access.'' using errcode=''42501'';\n  end if;\n\n';
begin
  select pg_get_functiondef(
    'public.booking_workflow_apply_quote_sync_before_payer_20260904(uuid,uuid,uuid,jsonb)'::regprocedure
  ) into function_definition;

  if strpos(function_definition, finance_gate) = 0 then
    raise exception 'The accepted-quote charge permission boundary has changed; review this migration before applying.';
  end if;

  function_definition := replace(function_definition, finance_gate, '');
  execute function_definition;
end;
$$;

comment on function public.booking_workflow_apply_quote_sync(uuid, uuid, uuid, jsonb)
is 'Applies operator-approved accepted-quote fields through Bookings.Write. Quote charges are operational job costing; protected customer finance master data remains outside this workflow. UI approval is required and every application remains audited.';

commit;
