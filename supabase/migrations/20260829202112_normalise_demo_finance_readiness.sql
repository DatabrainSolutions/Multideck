-- Readiness must describe the same narrow sandbox demo exception that the
-- posting triggers enforce. It must never label demo evidence as statutory
-- advice, and production connections must continue to require local advice.

begin;

create or replace function public._multideck_finance_normalise_revision_readiness()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_missing jsonb;
  v_tax_ready boolean := false;
  v_demo_ready boolean := false;
begin
  v_demo_ready :=
    coalesce(new."FINAdminRevision_ConfigJSON" #>> '{taxSettings,demoOnlyConfirmed}', 'false') = 'true'
    and coalesce(new."FINAdminRevision_ConfigJSON" #>> '{taxSettings,localAdviceConfirmed}', 'false') <> 'true'
    and exists (
      select 1
      from public."ACCI_Connections" connection
      where connection."ACCIC_LegalEntityID" = new."FINAdminRevision_LegalEntityID"
        and connection."ACCIC_ProviderCode" = 'erpnext'
        and connection."ACCIC_StatusCode" = 'active'
        and connection."ACCIC_Environment" = 'sandbox'
    );
  v_tax_ready :=
    coalesce(new."FINAdminRevision_ConfigJSON" #>> '{taxSettings,localAdviceConfirmed}', 'false') = 'true'
    or v_demo_ready;

  v_missing := case
    when jsonb_typeof(new."FINAdminRevision_ReadinessJSON" -> 'missing') = 'array'
      then new."FINAdminRevision_ReadinessJSON" -> 'missing'
    else '[]'::jsonb
  end;

  if v_tax_ready then
    select coalesce(jsonb_agg(item.value order by item.ordinality), '[]'::jsonb)
    into v_missing
    from jsonb_array_elements_text(v_missing) with ordinality item(value, ordinality)
    where item.value <> 'tax_advice';
  elsif not (v_missing ? 'tax_advice') then
    v_missing := v_missing || jsonb_build_array('tax_advice');
  end if;

  new."FINAdminRevision_ReadinessJSON" := jsonb_set(
    jsonb_set(coalesce(new."FINAdminRevision_ReadinessJSON", '{}'::jsonb), '{missing}', v_missing, true),
    '{ready}',
    to_jsonb(jsonb_array_length(v_missing) = 0),
    true
  );
  return new;
end;
$$;

revoke all on function public._multideck_finance_normalise_revision_readiness() from public, anon, authenticated;

-- Re-evaluate existing approved evidence without changing its approved
-- configuration, approver or revision number.
update public."FIN_AdministrationRevisions"
set "FINAdminRevision_ReadinessJSON" = "FINAdminRevision_ReadinessJSON"
where "FINAdminRevision_StatusCode" = 'approved';

comment on function public._multideck_finance_normalise_revision_readiness() is
  'Marks tax ready for confirmed statutory advice or the exact verified ERPNext sandbox demo exception, while keeping those two evidence states distinct.';

commit;
