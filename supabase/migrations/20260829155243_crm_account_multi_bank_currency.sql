-- A CRM company may trade in several currencies and hold several bank
-- accounts. Keep that operational configuration together, but retain only
-- masked counterparty bank identifiers inside Multideck.

begin;

create or replace function public._multideck_crm_mask_account_bank_details()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_preferences jsonb := coalesce(new."CRMAccountOps_InvoicePreferencesJSON", '{}'::jsonb);
  v_source_banks jsonb := '[]'::jsonb;
  v_banks jsonb := '[]'::jsonb;
  v_operating jsonb := '[]'::jsonb;
  v_bank jsonb;
  v_key text;
  v_masked text;
  v_currency text;
  v_country text;
  v_bank_id text;
  v_seen_ids text[] := array[]::text[];
  v_seen_currencies text[] := array[]::text[];
  v_default_currencies text[] := array[]::text[];
begin
  if jsonb_typeof(v_preferences) <> 'object' then
    raise exception 'Account invoice preferences must be an object.' using errcode = '22023';
  end if;

  if v_preferences ? 'operatingCurrencies'
    and jsonb_typeof(v_preferences -> 'operatingCurrencies') <> 'array' then
    raise exception 'Operating currencies must be a list.' using errcode = '22023';
  end if;
  if v_preferences ? 'bankAccounts'
    and jsonb_typeof(v_preferences -> 'bankAccounts') <> 'array' then
    raise exception 'Bank accounts must be a list.' using errcode = '22023';
  end if;

  v_source_banks := coalesce(v_preferences -> 'bankAccounts', '[]'::jsonb);

  -- Move the original single-bank fields into the first structured account.
  if jsonb_array_length(v_source_banks) = 0 and exists (
    select 1
    from jsonb_each_text(v_preferences) entry
    where entry.key = any(array[
      'bankAccountHolder', 'bankName', 'bankCountryCode', 'bankCurrency',
      'bankAccountNumberMasked', 'bankIbanMasked', 'bankRoutingCodeMasked',
      'bankBic', 'remittanceEmail', 'bankDetailsNotes'
    ])
      and nullif(btrim(entry.value), '') is not null
  ) then
    v_source_banks := jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid()::text,
      'accountName', coalesce(nullif(btrim(v_preferences ->> 'bankName'), ''), 'Bank account'),
      'accountHolder', coalesce(v_preferences ->> 'bankAccountHolder', ''),
      'bankName', coalesce(v_preferences ->> 'bankName', ''),
      'countryCode', coalesce(v_preferences ->> 'bankCountryCode', ''),
      'currencyCode', coalesce(v_preferences ->> 'bankCurrency', v_preferences ->> 'primaryCurrency', ''),
      'accountNumberMasked', coalesce(v_preferences ->> 'bankAccountNumberMasked', ''),
      'ibanMasked', coalesce(v_preferences ->> 'bankIbanMasked', ''),
      'routingCodeMasked', coalesce(v_preferences ->> 'bankRoutingCodeMasked', ''),
      'bic', coalesce(v_preferences ->> 'bankBic', ''),
      'remittanceEmail', coalesce(v_preferences ->> 'remittanceEmail', ''),
      'notes', coalesce(v_preferences ->> 'bankDetailsNotes', ''),
      'isDefault', true
    ));
  end if;

  if jsonb_array_length(v_source_banks) > 25 then
    raise exception 'Enter no more than 25 bank accounts for one company.' using errcode = '22023';
  end if;

  for v_bank in select value from jsonb_array_elements(v_source_banks) loop
    if jsonb_typeof(v_bank) <> 'object' then
      raise exception 'Every bank account must be an object.' using errcode = '22023';
    end if;

    v_bank_id := coalesce(nullif(btrim(v_bank ->> 'id'), ''), gen_random_uuid()::text);
    if v_bank_id = any(v_seen_ids) then
      raise exception 'Every bank account needs a unique identifier.' using errcode = '22023';
    end if;
    v_seen_ids := array_append(v_seen_ids, v_bank_id);

    v_currency := upper(coalesce(nullif(btrim(v_bank ->> 'currencyCode'), ''), ''));
    v_country := upper(coalesce(nullif(btrim(v_bank ->> 'countryCode'), ''), ''));
    if v_currency <> '' and v_currency !~ '^[A-Z]{3}$' then
      raise exception 'Bank currencies must use three-letter ISO codes.' using errcode = '22023';
    end if;
    if v_country <> '' and v_country !~ '^[A-Z]{2}$' then
      raise exception 'Bank countries must use two-letter ISO codes.' using errcode = '22023';
    end if;
    if v_bank ? 'isDefault' and jsonb_typeof(v_bank -> 'isDefault') <> 'boolean' then
      raise exception 'The default-bank value must be true or false.' using errcode = '22023';
    end if;
    if coalesce((v_bank ->> 'isDefault')::boolean, false) and v_currency <> '' then
      if v_currency = any(v_default_currencies) then
        raise exception 'Choose only one default bank account for each currency.' using errcode = '22023';
      end if;
      v_default_currencies := array_append(v_default_currencies, v_currency);
    end if;

    v_bank := jsonb_set(v_bank, '{id}', to_jsonb(v_bank_id), true);
    v_bank := jsonb_set(v_bank, '{currencyCode}', to_jsonb(v_currency), true);
    v_bank := jsonb_set(v_bank, '{countryCode}', to_jsonb(v_country), true);
    v_bank := jsonb_set(v_bank, '{accountName}', to_jsonb(left(coalesce(v_bank ->> 'accountName', ''), 180)), true);
    v_bank := jsonb_set(v_bank, '{accountHolder}', to_jsonb(left(coalesce(v_bank ->> 'accountHolder', ''), 180)), true);
    v_bank := jsonb_set(v_bank, '{bankName}', to_jsonb(left(coalesce(v_bank ->> 'bankName', ''), 180)), true);
    v_bank := jsonb_set(v_bank, '{bic}', to_jsonb(left(upper(coalesce(v_bank ->> 'bic', '')), 20)), true);
    v_bank := jsonb_set(v_bank, '{remittanceEmail}', to_jsonb(left(coalesce(v_bank ->> 'remittanceEmail', ''), 320)), true);
    v_bank := jsonb_set(v_bank, '{notes}', to_jsonb(left(coalesce(v_bank ->> 'notes', ''), 2000)), true);
    v_bank := jsonb_set(v_bank, '{isDefault}', to_jsonb(coalesce((v_bank ->> 'isDefault')::boolean, false)), true);

    foreach v_key in array array['accountNumberMasked', 'ibanMasked', 'routingCodeMasked'] loop
      if v_bank ? v_key then
        v_masked := public._multideck_crm_mask_bank_reference(v_bank ->> v_key);
        if v_masked is null then
          v_bank := v_bank - v_key;
        else
          v_bank := jsonb_set(v_bank, array[v_key], to_jsonb(v_masked), true);
        end if;
      end if;
    end loop;

    v_banks := v_banks || jsonb_build_array(v_bank);
    if v_currency <> '' and not (v_currency = any(v_seen_currencies)) then
      v_seen_currencies := array_append(v_seen_currencies, v_currency);
      v_operating := v_operating || to_jsonb(v_currency);
    end if;
  end loop;

  -- Retain the explicit list. Legacy primary, invoice and purchase currencies
  -- are also included so existing account data is not lost on rollout.
  for v_currency in
    select upper(btrim(value))
    from jsonb_array_elements_text(coalesce(v_preferences -> 'operatingCurrencies', '[]'::jsonb)) values_list(value)
  loop
    if v_currency !~ '^[A-Z]{3}$' then
      raise exception 'Operating currencies must use three-letter ISO codes.' using errcode = '22023';
    end if;
    if not (v_currency = any(v_seen_currencies)) then
      v_seen_currencies := array_append(v_seen_currencies, v_currency);
      v_operating := v_operating || to_jsonb(v_currency);
    end if;
  end loop;

  for v_currency in
    select currency_code
    from (
      select upper(btrim(coalesce(v_preferences ->> 'primaryCurrency', ''))) as currency_code
      union all
      select upper(btrim(value)) from jsonb_array_elements_text(
        case when jsonb_typeof(v_preferences -> 'supportedCurrencies') = 'array'
          then v_preferences -> 'supportedCurrencies' else '[]'::jsonb end
      ) sales(value)
      union all
      select upper(btrim(value)) from jsonb_array_elements_text(
        case when jsonb_typeof(v_preferences -> 'supportedPurchaseCurrencies') = 'array'
          then v_preferences -> 'supportedPurchaseCurrencies' else '[]'::jsonb end
      ) purchases(value)
    ) legacy
    where currency_code ~ '^[A-Z]{3}$'
  loop
    if not (v_currency = any(v_seen_currencies)) then
      v_seen_currencies := array_append(v_seen_currencies, v_currency);
      v_operating := v_operating || to_jsonb(v_currency);
    end if;
  end loop;

  v_preferences := v_preferences - array[
    'bankAccountHolder', 'bankName', 'bankCountryCode', 'bankCurrency',
    'bankAccountNumberMasked', 'bankIbanMasked', 'bankRoutingCodeMasked',
    'bankBic', 'remittanceEmail', 'bankDetailsNotes'
  ];
  v_preferences := jsonb_set(v_preferences, '{operatingCurrencies}', v_operating, true);
  v_preferences := jsonb_set(v_preferences, '{bankAccounts}', v_banks, true);
  new."CRMAccountOps_InvoicePreferencesJSON" := v_preferences;
  return new;
end;
$$;

revoke all on function public._multideck_crm_mask_account_bank_details()
  from public, anon, authenticated;
grant execute on function public._multideck_crm_mask_account_bank_details()
  to service_role;

-- Re-run the trigger once for existing rows to migrate the former flat bank
-- values and derive each company's operating currencies.
update public."CRM_AccountOperationalProfiles"
set "CRMAccountOps_InvoicePreferencesJSON" = "CRMAccountOps_InvoicePreferencesJSON";

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description" = 'Companies, roles, operational addresses, multi-currency receivable and payable preferences, masked bank-account registers, customs profiles, recurring instructions, documents and contact relationships available to the signed-in operator.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'customers';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description" = 'Watch company roles, operating currencies, masked bank-account changes, finance/customs readiness, operational instructions, document records and address booking rules for meaningful changes.',
  "AIDexterWatchCapability_FieldsJSON" = (
    select jsonb_agg(value order by value)
    from (
      select distinct value
      from jsonb_array_elements_text(
        coalesce("AIDexterWatchCapability_FieldsJSON", '[]'::jsonb)
        || '["operatingCurrencies","bankAccounts"]'::jsonb
      ) fields(value)
    ) distinct_fields
  ),
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'customers';

comment on trigger "TR_CRM_AccountOperationalProfiles_mask_bank_details"
  on public."CRM_AccountOperationalProfiles" is
  'Normalises multi-currency bank-account registers and prevents complete counterparty account, IBAN and routing identifiers from being retained.';

commit;
