-- Sandbox demonstrations need a real posting lifecycle without pretending that
-- statutory tax advice has been supplied. This exception is deliberately
-- narrow: one zero-rate demo treatment, an approved demo-only revision and an
-- active ERPNext sandbox connection must all agree.

begin;

create or replace function public._multideck_finance_demo_tax_allowed(p_legal_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public."ACCI_Connections" connection
    join public."FIN_AdministrationRevisions" revision
      on revision."FINAdminRevision_LegalEntityID" = connection."ACCIC_LegalEntityID"
     and revision."FINAdminRevision_StatusCode" = 'approved'
    where connection."ACCIC_LegalEntityID" = p_legal_entity_id
      and connection."ACCIC_ProviderCode" = 'erpnext'
      and connection."ACCIC_StatusCode" = 'active'
      and connection."ACCIC_Environment" = 'sandbox'
      and coalesce(revision."FINAdminRevision_ConfigJSON" #>> '{taxSettings,demoOnlyConfirmed}', 'false') = 'true'
      and coalesce(revision."FINAdminRevision_ConfigJSON" #>> '{taxSettings,localAdviceConfirmed}', 'false') <> 'true'
  );
$$;

create or replace function public._multideck_finance_validate_demo_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_demo_only boolean := coalesce(new."FINAdminRevision_ConfigJSON" #>> '{taxSettings,demoOnlyConfirmed}', 'false') = 'true';
begin
  if not v_demo_only then return new; end if;

  if coalesce(new."FINAdminRevision_ConfigJSON" #>> '{taxSettings,localAdviceConfirmed}', 'false') = 'true' then
    raise exception 'Demo-only tax review cannot claim statutory local advice.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public."ACCI_Connections" connection
    where connection."ACCIC_LegalEntityID" = new."FINAdminRevision_LegalEntityID"
      and connection."ACCIC_ProviderCode" = 'erpnext'
      and connection."ACCIC_StatusCode" = 'active'
      and connection."ACCIC_Environment" = 'sandbox'
  ) then
    raise exception 'Demo-only tax review requires an active ERPNext sandbox connection.' using errcode = '22023';
  end if;
  if jsonb_typeof(new."FINAdminRevision_ConfigJSON" -> 'taxCodes') <> 'array'
    or not exists (
      select 1
      from jsonb_array_elements(new."FINAdminRevision_ConfigJSON" -> 'taxCodes') item
      where coalesce((item ->> 'isActive')::boolean, true)
        and item ->> 'code' = 'DEMO-NONTAX'
        and coalesce((item ->> 'ratePercent')::numeric, 0) = 0
        and coalesce((item #>> '{settings,demoOnly}')::boolean, false)
    )
  then
    raise exception 'Demo-only tax review requires the zero-rate DEMO-NONTAX treatment.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(new."FINAdminRevision_ConfigJSON" -> 'taxCodes') item
    where coalesce((item ->> 'isActive')::boolean, true)
      and (
        item ->> 'code' <> 'DEMO-NONTAX'
        or coalesce((item ->> 'ratePercent')::numeric, 0) <> 0
        or not coalesce((item #>> '{settings,demoOnly}')::boolean, false)
      )
  ) then
    raise exception 'A demo-only revision may approve only the zero-rate DEMO-NONTAX treatment.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_FIN_AdministrationRevisions_demo_guard" on public."FIN_AdministrationRevisions";
create trigger "TR_FIN_AdministrationRevisions_demo_guard"
before insert or update of "FINAdminRevision_ConfigJSON"
on public."FIN_AdministrationRevisions"
for each row execute function public._multideck_finance_validate_demo_revision();

create or replace function public._multideck_finance_apply_approved_line_tax()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_legal_entity_id uuid;
  v_document_type text;
  v_document_status text;
  v_document_date date;
  v_exchange_rate numeric;
  v_direction text;
  v_match_count integer := 0;
  v_tax_id uuid;
  v_tax_code text;
  v_tax_rate numeric := 0;
  v_sign numeric;
  v_net numeric;
  v_tax numeric;
  v_has_approved_tax_advice boolean := false;
  v_demo_tax_allowed boolean := false;
begin
  select
    document."FINDoc_LegalEntityID",
    document."FINDoc_TypeCode",
    document."FINDoc_StatusCode",
    document."FINDoc_DocumentDate",
    document."FINDoc_ExchangeRate"
  into v_legal_entity_id, v_document_type, v_document_status, v_document_date, v_exchange_rate
  from public."FIN_Documents" document
  where document."FINDoc_ID" = new."FINDocLine_DocumentID";

  if v_legal_entity_id is null then
    raise exception 'The finance document for this line does not exist.' using errcode = 'P0002';
  end if;
  if new."FINDocLine_Quantity" <= 0 or new."FINDocLine_UnitAmount" < 0 then
    raise exception 'Check the finance line quantity and unit amount.' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public."FIN_AdministrationRevisions" revision
    where revision."FINAdminRevision_LegalEntityID" = v_legal_entity_id
      and revision."FINAdminRevision_StatusCode" = 'approved'
      and coalesce(revision."FINAdminRevision_ConfigJSON" #>> '{taxSettings,localAdviceConfirmed}', 'false') = 'true'
  ) into v_has_approved_tax_advice;
  v_demo_tax_allowed := public._multideck_finance_demo_tax_allowed(v_legal_entity_id);

  new."FINDocLine_TaxCodeSnapshot" := nullif(left(btrim(new."FINDocLine_TaxCodeSnapshot"), 80), '');
  v_direction := case when v_document_type in ('sl_invoice', 'credit_note') then 'sales' else 'purchase' end;

  if (v_has_approved_tax_advice or v_demo_tax_allowed) and new."FINDocLine_TaxCodeSnapshot" is not null then
    select
      count(*),
      (array_agg(tax."FINTax_ID" order by tax."FINTax_EffectiveFrom" desc))[1],
      (array_agg(tax."FINTax_Code" order by tax."FINTax_EffectiveFrom" desc))[1],
      (array_agg(tax."FINTax_RatePercent" order by tax."FINTax_EffectiveFrom" desc))[1]
    into v_match_count, v_tax_id, v_tax_code, v_tax_rate
    from public."FIN_TaxCodes" tax
    where tax."FINTax_LegalEntityID" = v_legal_entity_id
      and tax."FINTax_Code" = new."FINDocLine_TaxCodeSnapshot"
      and tax."FINTax_IsActive"
      and tax."FINTax_ApprovedAt" is not null
      and tax."FINTax_TransactionTypeCode" in ('both', v_direction)
      and tax."FINTax_EffectiveFrom" <= v_document_date
      and (tax."FINTax_EffectiveTo" is null or tax."FINTax_EffectiveTo" >= v_document_date)
      and (
        (v_has_approved_tax_advice and not coalesce((tax."FINTax_SettingsJSON" ->> 'demoOnly')::boolean, false))
        or (v_demo_tax_allowed and tax."FINTax_Code" = 'DEMO-NONTAX' and tax."FINTax_RatePercent" = 0 and coalesce((tax."FINTax_SettingsJSON" ->> 'demoOnly')::boolean, false))
      );

    if v_match_count > 1 then
      raise exception 'The selected tax treatment has overlapping effective rules. Finance must correct the setup.' using errcode = '22023';
    end if;
  end if;

  if v_match_count = 1 then
    new."FINDocLine_TaxCodeID" := v_tax_id;
    new."FINDocLine_TaxCodeSnapshot" := v_tax_code;
    new."FINDocLine_TaxRatePercent" := v_tax_rate;
  else
    if v_document_status <> 'draft' then
      if not v_has_approved_tax_advice and not v_demo_tax_allowed then
        raise exception 'Finance must approve local tax advice before this document can enter review.' using errcode = '22023';
      end if;
      raise exception 'Every finance line must use one approved effective tax treatment before review.' using errcode = '22023';
    end if;
    new."FINDocLine_TaxCodeID" := null;
    new."FINDocLine_TaxRatePercent" := 0;
    v_tax_rate := 0;
  end if;

  v_sign := case when v_document_type in ('credit_note', 'debit_note') then -1 else 1 end;
  v_net := round(new."FINDocLine_Quantity" * new."FINDocLine_UnitAmount", 4) * v_sign;
  v_tax := round(abs(v_net) * v_tax_rate / 100, 4) * v_sign;
  new."FINDocLine_NetAmount" := v_net;
  new."FINDocLine_TaxAmount" := v_tax;
  new."FINDocLine_GrossAmount" := v_net + v_tax;
  new."FINDocLine_LocalNetAmount" := round(v_net * v_exchange_rate, 4);
  new."FINDocLine_LocalTaxAmount" := round(v_tax * v_exchange_rate, 4);
  new."FINDocLine_LocalGrossAmount" := round((v_net + v_tax) * v_exchange_rate, 4);
  return new;
end;
$$;

create or replace function public._multideck_finance_validate_document_tax_review()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_has_approved_tax_advice boolean := false;
  v_demo_tax_allowed boolean := false;
begin
  if new."FINDoc_StatusCode" not in ('awaiting_approval', 'approved')
    or new."FINDoc_StatusCode" is not distinct from old."FINDoc_StatusCode" then
    return new;
  end if;

  select exists (
    select 1
    from public."FIN_AdministrationRevisions" revision
    where revision."FINAdminRevision_LegalEntityID" = new."FINDoc_LegalEntityID"
      and revision."FINAdminRevision_StatusCode" = 'approved'
      and coalesce(revision."FINAdminRevision_ConfigJSON" #>> '{taxSettings,localAdviceConfirmed}', 'false') = 'true'
  ) into v_has_approved_tax_advice;
  v_demo_tax_allowed := public._multideck_finance_demo_tax_allowed(new."FINDoc_LegalEntityID");

  if not v_has_approved_tax_advice and not v_demo_tax_allowed then
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
      and (
        (v_has_approved_tax_advice and not coalesce((tax."FINTax_SettingsJSON" ->> 'demoOnly')::boolean, false))
        or (v_demo_tax_allowed and tax."FINTax_Code" = 'DEMO-NONTAX' and tax."FINTax_RatePercent" = 0 and coalesce((tax."FINTax_SettingsJSON" ->> 'demoOnly')::boolean, false))
      )
    where line."FINDocLine_DocumentID" = new."FINDoc_ID"
      and tax."FINTax_ID" is null
  ) then
    raise exception 'One or more finance lines no longer uses an approved effective tax treatment.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public._multideck_finance_demo_tax_allowed(uuid) from public, anon, authenticated;
revoke all on function public._multideck_finance_validate_demo_revision() from public, anon, authenticated;
revoke all on function public._multideck_finance_apply_approved_line_tax() from public, anon, authenticated;
revoke all on function public._multideck_finance_validate_document_tax_review() from public, anon, authenticated;

update public."sys_AIDexterActions"
set "AIDexterAction_Description" = 'Create one reviewed invoice or credit draft through the Finance boundary. Statutory treatments require local advice; the zero-rate DEMO-NONTAX treatment is accepted only for a verified ERPNext sandbox and remains subject to normal human posting approval.',
    "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'create_finance_document_draft';

comment on function public._multideck_finance_demo_tax_allowed(uuid) is
  'Allows only an explicit zero-rate demo treatment when the legal entity has an approved demo-only revision and an active ERPNext sandbox connection.';

commit;
