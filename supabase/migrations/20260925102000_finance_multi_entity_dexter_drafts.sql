-- Dexter's allowlisted Finance drafts identify one active legal entity inside the
-- signed-in company. The Finance Edge Function remains the write authority.
begin;

update public."sys_AIDexterActions"
set "AIDexterAction_Description" = case "AIDexterAction_Code"
      when 'create_finance_document_draft' then 'Create one reviewed invoice or credit draft for an exact active legal entity in the signed-in company through the Finance boundary. Statutory treatments require local advice; the zero-rate DEMO-NONTAX treatment is accepted only for a verified ERPNext sandbox and remains subject to normal human posting approval.'
      else 'Create one reviewed customer receipt or supplier payment draft for an exact active legal entity in the signed-in company, including exact open-document allocations, through the Finance validation boundary.'
    end,
    "AIDexterAction_ParametersJSON" = jsonb_set(
      jsonb_set("AIDexterAction_ParametersJSON", '{properties,legalEntityId}', '{"type":"string"}'::jsonb, true),
      '{required}',
      case when ("AIDexterAction_ParametersJSON" -> 'required') ? 'legalEntityId'
        then "AIDexterAction_ParametersJSON" -> 'required'
        else ("AIDexterAction_ParametersJSON" -> 'required') || '["legalEntityId"]'::jsonb
      end,
      true
    ),
    "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" in ('create_finance_document_draft', 'create_finance_cash_draft');

update public."sys_AIDexterActions"
set "AIDexterAction_ParametersJSON" = jsonb_set(
      "AIDexterAction_ParametersJSON",
      '{properties,lines,items,properties,jobCostingLineId}',
      '{"type":["string","null"]}'::jsonb,
      true
    ),
    "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'create_finance_document_draft';

do $$
begin
  -- Schema-only snapshots have no reference rows. A provisioned tenant must
  -- have either both actions or neither; one missing row is a broken release.
  if (select count(*) from public."sys_AIDexterActions"
      where "AIDexterAction_Code" in ('create_finance_document_draft', 'create_finance_cash_draft')) > 0
    and (select count(*) from public."sys_AIDexterActions"
      where "AIDexterAction_Code" in ('create_finance_document_draft', 'create_finance_cash_draft')
        and ("AIDexterAction_ParametersJSON" -> 'required') ? 'legalEntityId') <> 2 then
    raise exception 'Both Finance draft actions must require a selected legal entity';
  end if;
end $$;

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Description" = 'Event-driven finance document, tax-readiness, receipt, payment, allocation, provider-sync and approved configuration changes for permitted records in the signed-in company and legal entity.',
    "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'finance';

commit;
