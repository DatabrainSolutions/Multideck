-- Approved, effective-dated tax treatments are the only treatments that may
-- reach an accounting transaction. Universal catalogue rows remain setup
-- suggestions until a finance administrator confirms local tax advice.

begin;

create or replace function public._multideck_finance_normalise_revision_readiness()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_missing jsonb;
begin
  if coalesce(new."FINAdminRevision_ConfigJSON" #>> '{taxSettings,localAdviceConfirmed}', 'false') = 'true' then
    return new;
  end if;

  v_missing := case
    when jsonb_typeof(new."FINAdminRevision_ReadinessJSON" -> 'missing') = 'array'
      then new."FINAdminRevision_ReadinessJSON" -> 'missing'
    else '[]'::jsonb
  end;
  if not (v_missing ? 'tax_advice') then
    v_missing := v_missing || jsonb_build_array('tax_advice');
  end if;

  new."FINAdminRevision_ReadinessJSON" := jsonb_set(
    jsonb_set(coalesce(new."FINAdminRevision_ReadinessJSON", '{}'::jsonb), '{missing}', v_missing, true),
    '{ready}',
    'false'::jsonb,
    true
  );
  return new;
end;
$$;

drop trigger if exists "TR_FIN_AdministrationRevisions_tax_readiness" on public."FIN_AdministrationRevisions";
create trigger "TR_FIN_AdministrationRevisions_tax_readiness"
before insert or update of "FINAdminRevision_ConfigJSON", "FINAdminRevision_ReadinessJSON"
on public."FIN_AdministrationRevisions"
for each row execute function public._multideck_finance_normalise_revision_readiness();

-- Correct earlier readiness evidence, if any, without changing the approved
-- configuration or creating a new approval.
update public."FIN_AdministrationRevisions"
set "FINAdminRevision_ReadinessJSON" = "FINAdminRevision_ReadinessJSON"
where coalesce("FINAdminRevision_ConfigJSON" #>> '{taxSettings,localAdviceConfirmed}', 'false') <> 'true';

create or replace function public._multideck_finance_apply_approved_line_tax()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_legal_entity_id uuid;
  v_document_type text;
  v_document_date date;
  v_exchange_rate numeric;
  v_direction text;
  v_match_count integer;
  v_tax_id uuid;
  v_tax_code text;
  v_tax_rate numeric;
  v_sign numeric;
  v_net numeric;
  v_tax numeric;
begin
  select
    document."FINDoc_LegalEntityID",
    document."FINDoc_TypeCode",
    document."FINDoc_DocumentDate",
    document."FINDoc_ExchangeRate"
  into v_legal_entity_id, v_document_type, v_document_date, v_exchange_rate
  from public."FIN_Documents" document
  where document."FINDoc_ID" = new."FINDocLine_DocumentID";

  if v_legal_entity_id is null then
    raise exception 'The finance document for this line does not exist.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1
    from public."FIN_AdministrationRevisions" revision
    where revision."FINAdminRevision_LegalEntityID" = v_legal_entity_id
      and revision."FINAdminRevision_StatusCode" = 'approved'
      and coalesce(revision."FINAdminRevision_ConfigJSON" #>> '{taxSettings,localAdviceConfirmed}', 'false') = 'true'
  ) then
    raise exception 'Finance must approve local tax advice before a document line can be created.' using errcode = '22023';
  end if;
  if nullif(btrim(new."FINDocLine_TaxCodeSnapshot"), '') is null then
    raise exception 'Choose an approved tax treatment for every finance line.' using errcode = '22023';
  end if;

  v_direction := case when v_document_type in ('sl_invoice', 'credit_note') then 'sales' else 'purchase' end;
  select
    count(*),
    (array_agg(tax."FINTax_ID" order by tax."FINTax_EffectiveFrom" desc))[1],
    (array_agg(tax."FINTax_Code" order by tax."FINTax_EffectiveFrom" desc))[1],
    (array_agg(tax."FINTax_RatePercent" order by tax."FINTax_EffectiveFrom" desc))[1]
  into v_match_count, v_tax_id, v_tax_code, v_tax_rate
  from public."FIN_TaxCodes" tax
  where tax."FINTax_LegalEntityID" = v_legal_entity_id
    and tax."FINTax_Code" = btrim(new."FINDocLine_TaxCodeSnapshot")
    and tax."FINTax_IsActive"
    and tax."FINTax_ApprovedAt" is not null
    and tax."FINTax_TransactionTypeCode" in ('both', v_direction)
    and tax."FINTax_EffectiveFrom" <= v_document_date
    and (tax."FINTax_EffectiveTo" is null or tax."FINTax_EffectiveTo" >= v_document_date);

  if v_match_count = 0 then
    raise exception 'The selected tax treatment is not approved for this legal entity, date and ledger.' using errcode = '22023';
  end if;
  if v_match_count > 1 then
    raise exception 'The selected tax treatment has overlapping effective rules. Finance must correct the setup.' using errcode = '22023';
  end if;
  if new."FINDocLine_Quantity" <= 0 or new."FINDocLine_UnitAmount" < 0 then
    raise exception 'Check the finance line quantity and unit amount.' using errcode = '22023';
  end if;

  v_sign := case when v_document_type in ('credit_note', 'debit_note') then -1 else 1 end;
  v_net := round(new."FINDocLine_Quantity" * new."FINDocLine_UnitAmount", 4) * v_sign;
  v_tax := round(abs(v_net) * v_tax_rate / 100, 4) * v_sign;

  new."FINDocLine_TaxCodeID" := v_tax_id;
  new."FINDocLine_TaxCodeSnapshot" := v_tax_code;
  new."FINDocLine_TaxRatePercent" := v_tax_rate;
  new."FINDocLine_NetAmount" := v_net;
  new."FINDocLine_TaxAmount" := v_tax;
  new."FINDocLine_GrossAmount" := v_net + v_tax;
  new."FINDocLine_LocalNetAmount" := round(v_net * v_exchange_rate, 4);
  new."FINDocLine_LocalTaxAmount" := round(v_tax * v_exchange_rate, 4);
  new."FINDocLine_LocalGrossAmount" := round((v_net + v_tax) * v_exchange_rate, 4);
  return new;
end;
$$;

drop trigger if exists "TR_FIN_DocumentLines_approved_tax" on public."FIN_DocumentLines";
create trigger "TR_FIN_DocumentLines_approved_tax"
before insert or update of
  "FINDocLine_DocumentID", "FINDocLine_Quantity", "FINDocLine_UnitAmount",
  "FINDocLine_TaxCodeSnapshot", "FINDocLine_TaxRatePercent",
  "FINDocLine_NetAmount", "FINDocLine_TaxAmount", "FINDocLine_GrossAmount",
  "FINDocLine_LocalNetAmount", "FINDocLine_LocalTaxAmount", "FINDocLine_LocalGrossAmount"
on public."FIN_DocumentLines"
for each row execute function public._multideck_finance_apply_approved_line_tax();

create or replace function public._multideck_finance_validate_document_tax_review()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new."FINDoc_StatusCode" not in ('awaiting_approval', 'approved')
    or new."FINDoc_StatusCode" is not distinct from old."FINDoc_StatusCode" then
    return new;
  end if;

  if not exists (
    select 1
    from public."FIN_AdministrationRevisions" revision
    where revision."FINAdminRevision_LegalEntityID" = new."FINDoc_LegalEntityID"
      and revision."FINAdminRevision_StatusCode" = 'approved'
      and coalesce(revision."FINAdminRevision_ConfigJSON" #>> '{taxSettings,localAdviceConfirmed}', 'false') = 'true'
  ) then
    raise exception 'Finance must approve local tax advice before this document can enter review.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public."FIN_DocumentLines" line
    left join public."FIN_TaxCodes" tax
      on tax."FINTax_ID" = line."FINDocLine_TaxCodeID"
      and tax."FINTax_LegalEntityID" = new."FINDoc_LegalEntityID"
      and tax."FINTax_IsActive"
      and tax."FINTax_ApprovedAt" is not null
      and tax."FINTax_Code" = line."FINDocLine_TaxCodeSnapshot"
      and tax."FINTax_RatePercent" = line."FINDocLine_TaxRatePercent"
      and tax."FINTax_TransactionTypeCode" in ('both', case when new."FINDoc_TypeCode" in ('sl_invoice', 'credit_note') then 'sales' else 'purchase' end)
      and tax."FINTax_EffectiveFrom" <= new."FINDoc_DocumentDate"
      and (tax."FINTax_EffectiveTo" is null or tax."FINTax_EffectiveTo" >= new."FINDoc_DocumentDate")
    where line."FINDocLine_DocumentID" = new."FINDoc_ID"
      and tax."FINTax_ID" is null
  ) then
    raise exception 'One or more finance lines no longer uses an approved effective tax treatment.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_FIN_Documents_approved_tax_review" on public."FIN_Documents";
create trigger "TR_FIN_Documents_approved_tax_review"
before update of "FINDoc_StatusCode"
on public."FIN_Documents"
for each row execute function public._multideck_finance_validate_document_tax_review();

revoke all on function public._multideck_finance_normalise_revision_readiness() from public, anon, authenticated;
revoke all on function public._multideck_finance_apply_approved_line_tax() from public, anon, authenticated;
revoke all on function public._multideck_finance_validate_document_tax_review() from public, anon, authenticated;

-- Dexter selects the approved treatment code. The Finance boundary resolves
-- the statutory rate, so chat cannot propose or override a rate.
update public."sys_AIDexterActions" set
  "AIDexterAction_Description" = 'Create one reviewed sales invoice, customer credit, purchase invoice or supplier credit draft using approved legal-entity tax treatments through the Finance validation boundary.',
  "AIDexterAction_ParametersJSON" = '{"type":"object","properties":{"type":{"type":"string","enum":["sl_invoice","credit_note","pl_invoice","debit_note"]},"legalEntityId":{"type":"string"},"partyOrgId":{"type":"string"},"documentDate":{"type":"string"},"dueDate":{"type":["string","null"]},"currencyCode":{"type":"string"},"exchangeRate":{"type":"number","exclusiveMinimum":0},"sourceJobId":{"type":["string","null"]},"lines":{"type":"array","minItems":1,"maxItems":100,"items":{"type":"object","properties":{"description":{"type":"string"},"quantity":{"type":"number","exclusiveMinimum":0},"unitAmount":{"type":"number","minimum":0},"taxCode":{"type":"string"},"chargeCode":{"type":["string","null"]},"lineType":{"type":"string","enum":["service","ancillary"]}},"required":["description","quantity","unitAmount","taxCode","chargeCode","lineType"],"additionalProperties":false}},"reason":{"type":"string"}},"required":["type","legalEntityId","partyOrgId","documentDate","dueDate","currencyCode","exchangeRate","sourceJobId","lines","reason"],"additionalProperties":false}'::jsonb,
  "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'create_finance_document_draft';

comment on function public._multideck_finance_apply_approved_line_tax() is
  'Resolves every document line to one approved, legal-entity-scoped, effective-dated tax treatment and derives its tax totals deterministically.';

commit;
