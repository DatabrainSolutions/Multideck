-- Party-level accounting configuration remains with the CRM organisation,
-- while legal-entity controls remain in Admin > Finance. Validate the JSON
-- contract before it can be used for invoices, credits, cash or provider data.

begin;

create or replace function public._multideck_crm_validate_account_finance_preferences()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_preferences jsonb := coalesce(new."CRMAccountOps_InvoicePreferencesJSON", '{}'::jsonb);
  v_bank jsonb;
  v_key text;
  v_value text;
  v_entity_id uuid;
  v_effective_from date;
  v_effective_to date;
begin
  if jsonb_typeof(v_preferences) <> 'object' then
    raise exception 'Organisation finance preferences must be an object.' using errcode = '22023';
  end if;

  if coalesce(nullif(v_preferences ->> 'customerAccountingStatusCode', ''), 'active') not in ('active','on_hold','blocked') then
    raise exception 'Choose a valid customer accounting status.' using errcode = '22023';
  end if;
  if coalesce(nullif(v_preferences ->> 'supplierAccountingStatusCode', ''), 'active') not in ('active','on_hold','blocked') then
    raise exception 'Choose a valid supplier accounting status.' using errcode = '22023';
  end if;
  if coalesce(nullif(v_preferences ->> 'preferredReceiptMethodCode', ''), 'bank_transfer') not in ('bank_transfer','direct_debit','card','cheque','cash','offset')
    or coalesce(nullif(v_preferences ->> 'preferredPaymentMethodCode', ''), 'bank_transfer') not in ('bank_transfer','direct_debit','card','cheque','cash','offset') then
    raise exception 'Choose a valid receipt and payment method.' using errcode = '22023';
  end if;
  if coalesce(nullif(v_preferences ->> 'salesInvoiceGroupingCode', ''), 'per_job') not in ('per_job','daily','weekly','monthly') then
    raise exception 'Choose a valid invoice grouping rule.' using errcode = '22023';
  end if;
  if coalesce(nullif(v_preferences ->> 'statementFrequencyCode', ''), 'monthly') not in ('never','weekly','monthly') then
    raise exception 'Choose a valid statement frequency.' using errcode = '22023';
  end if;
  if coalesce(nullif(v_preferences ->> 'paymentRunGroupCode', ''), 'weekly') not in ('manual','daily','weekly','monthly') then
    raise exception 'Choose a valid payment run group.' using errcode = '22023';
  end if;
  if coalesce(nullif(v_preferences ->> 'purchaseInvoiceMatchingCode', ''), 'two_way') not in ('none','two_way','three_way') then
    raise exception 'Choose a valid purchase invoice matching rule.' using errcode = '22023';
  end if;

  foreach v_key in array array['defaultSalesLegalEntityId','defaultPurchaseLegalEntityId'] loop
    v_value := nullif(btrim(v_preferences ->> v_key), '');
    if v_value is not null then
      begin v_entity_id := v_value::uuid;
      exception when invalid_text_representation then
        raise exception 'Choose a valid legal entity for organisation finance.' using errcode = '22023';
      end;
      if not exists (
        select 1 from public."cmp_LegalEntities" e
        where e."LegalEntity_ID" = v_entity_id
          and e."Company_ID" = new."CRMAccountOps_CompanyID"
      ) then
        raise exception 'The selected finance legal entity is outside this workspace.' using errcode = '42501';
      end if;
    end if;
  end loop;

  foreach v_key in array array[
    'creditHold','requiresCustomerPurchaseOrder','requiresJobReferenceOnInvoice','sendStatements',
    'receivableEndOfMonth','supplierPaymentHold','purchaseOrderRequired','selfBillingAllowed',
    'separateRemittanceAdvice','payableEndOfMonth'
  ] loop
    if v_preferences ? v_key and jsonb_typeof(v_preferences -> v_key) <> 'boolean' then
      raise exception 'Organisation finance switch % must be true or false.', v_key using errcode = '22023';
    end if;
  end loop;

  foreach v_key in array array[
    'creditLimit','receivableTermDays','receivableDueDay','payableTermDays','payableDueDay','purchaseMatchTolerancePercent'
  ] loop
    v_value := nullif(btrim(v_preferences ->> v_key), '');
    if v_value is not null and v_value !~ '^[0-9]+([.][0-9]{1,4})?$' then
      raise exception 'Organisation finance amount % must be a non-negative number.', v_key using errcode = '22023';
    end if;
  end loop;

  v_value := lower(nullif(btrim(v_preferences ->> 'invoiceLanguageCode'), ''));
  if v_value is not null and v_value !~ '^[a-z]{2}(-[a-z]{2})?$' then
    raise exception 'Invoice language must use a two-letter language code.' using errcode = '22023';
  end if;
  if v_value is not null then v_preferences := jsonb_set(v_preferences, '{invoiceLanguageCode}', to_jsonb(v_value), true); end if;

  foreach v_key in array array[
    'customerTaxRegistrationNo','supplierTaxRegistrationNo','salesPaymentTermCode','purchasePaymentTermCode',
    'salesTaxTreatmentCode','purchaseTaxTreatmentCode','receivableAccountCode','payableAccountCode',
    'invoiceEmail','statementEmail','purchaseInvoiceEmail','remittanceAdviceEmail','invoiceDeliveryMethod',
    'purchaseInvoiceDeliveryMethod'
  ] loop
    if v_preferences ? v_key then
      v_preferences := jsonb_set(v_preferences, array[v_key], to_jsonb(left(coalesce(v_preferences ->> v_key, ''), case when v_key like '%Email' then 320 else 180 end)), true);
    end if;
  end loop;

  if jsonb_typeof(coalesce(v_preferences -> 'bankAccounts', '[]'::jsonb)) <> 'array' then
    raise exception 'Bank accounts must be a list.' using errcode = '22023';
  end if;
  for v_bank in select value from jsonb_array_elements(coalesce(v_preferences -> 'bankAccounts', '[]'::jsonb)) loop
    if coalesce(nullif(v_bank ->> 'verificationStatusCode', ''), 'pending') not in ('pending','verified','rejected') then
      raise exception 'Choose a valid bank verification status.' using errcode = '22023';
    end if;
    foreach v_key in array array['useForPayments','useForRefunds','useForDirectDebit','isDefault'] loop
      if v_bank ? v_key and jsonb_typeof(v_bank -> v_key) <> 'boolean' then
        raise exception 'Bank usage switch % must be true or false.', v_key using errcode = '22023';
      end if;
    end loop;
    begin
      v_effective_from := nullif(v_bank ->> 'effectiveFrom', '')::date;
      v_effective_to := nullif(v_bank ->> 'effectiveTo', '')::date;
      perform nullif(v_bank ->> 'verifiedAt', '')::date;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Bank verification and effective dates must be valid dates.' using errcode = '22023';
    end;
    if v_effective_from is not null and v_effective_to is not null and v_effective_to < v_effective_from then
      raise exception 'A bank account effective-to date cannot be before its effective-from date.' using errcode = '22023';
    end if;
    if coalesce(v_bank ->> 'verificationStatusCode', 'pending') = 'verified'
      and (nullif(btrim(v_bank ->> 'verificationReference'), '') is null or nullif(v_bank ->> 'verifiedAt', '') is null) then
      raise exception 'A verified bank account needs a verification reference and date.' using errcode = '22023';
    end if;
  end loop;

  new."CRMAccountOps_InvoicePreferencesJSON" := v_preferences;
  return new;
end;
$$;

revoke all on function public._multideck_crm_validate_account_finance_preferences() from public, anon, authenticated;
grant execute on function public._multideck_crm_validate_account_finance_preferences() to service_role;

drop trigger if exists "TR_CRM_AccountOperationalProfiles_validate_finance" on public."CRM_AccountOperationalProfiles";
create trigger "TR_CRM_AccountOperationalProfiles_validate_finance"
before insert or update of "CRMAccountOps_InvoicePreferencesJSON"
on public."CRM_AccountOperationalProfiles"
for each row execute function public._multideck_crm_validate_account_finance_preferences();

-- Dexter reads these party defaults as customer-domain evidence and receives
-- the existing event-driven invoicePreferences signal. There is deliberately
-- no Dexter write action for statutory or counterparty-bank configuration.
update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description" = 'Companies, roles, legal-entity defaults, AR/AP status, controlled payment and tax terms, multi-currency preferences, masked verified bank-account registers, customs profiles, instructions, documents and contact relationships.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'customers';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description" = 'Event-driven company, AR/AP status, credit/payment hold, payment terms, tax treatment, operating currency, masked bank verification, instruction, document and address-rule changes.',
  "AIDexterWatchCapability_FieldsJSON" = (
    select jsonb_agg(value order by value)
    from (
      select distinct value
      from jsonb_array_elements_text(
        coalesce("AIDexterWatchCapability_FieldsJSON", '[]'::jsonb)
        || '["customerAccountingStatusCode","supplierAccountingStatusCode","creditHold","supplierPaymentHold","salesPaymentTermCode","purchasePaymentTermCode","salesTaxTreatmentCode","purchaseTaxTreatmentCode","defaultSalesLegalEntityId","defaultPurchaseLegalEntityId","bankAccounts"]'::jsonb
      ) fields(value)
    ) distinct_fields
  ),
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'customers';

comment on function public._multideck_crm_validate_account_finance_preferences() is
  'Validates party-level AR, AP, tax, legal-entity, payment and verified masked-bank settings before accounting transactions use them.';

commit;
