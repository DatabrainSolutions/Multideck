-- Correct the bounded lead register to use the canonical score column.
-- The replacement keeps this migration safe for projects where the corrected
-- 154000 definition was already applied, while repairing projects that received
-- the earlier invalid column reference.

begin;

do $$
declare
  v_signature regprocedure := to_regprocedure(
    'public.multideck_crm_lead_register_page(text,text,uuid,boolean,text,text,text,text,boolean,text,text,integer,integer)'
  );
  v_definition text;
begin
  if v_signature is null then
    raise exception 'CRM lead register paging function is missing.';
  end if;

  select pg_get_functiondef(v_signature) into v_definition;
  v_definition := replace(
    v_definition,
    'lead."CRMLead_QualificationScore"',
    'lead."CRMLead_Score"'
  );

  execute v_definition;

  if strpos(
    pg_get_functiondef(to_regprocedure(
      'public.multideck_crm_lead_register_page(text,text,uuid,boolean,text,text,text,text,boolean,text,text,integer,integer)'
    )),
    'lead."CRMLead_Score"'
  ) = 0 then
    raise exception 'CRM lead register score correction was not applied.';
  end if;
end;
$$;

revoke all on function public.multideck_crm_lead_register_page(
  text, text, uuid, boolean, text, text, text, text, boolean, text, text, integer, integer
) from public, anon;
grant execute on function public.multideck_crm_lead_register_page(
  text, text, uuid, boolean, text, text, text, text, boolean, text, text, integer, integer
) to authenticated, service_role;

commit;
