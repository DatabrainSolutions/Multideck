-- Counterparty bank references entered in the CRM account workspace are
-- retained only as masked identifiers. The tenant accounting/payment provider
-- remains the authoritative location for complete banking credentials.

begin;

create or replace function public._multideck_crm_mask_bank_reference(p_value text)
returns text
language sql
immutable
strict
security invoker
set search_path = pg_catalog
as $$
  select case
    when nullif(btrim(p_value), '') is null then null
    else '•••• ' || right(regexp_replace(upper(p_value), '[^A-Z0-9]', '', 'g'), 4)
  end
$$;

create or replace function public._multideck_crm_mask_account_bank_details()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_key text;
  v_masked text;
begin
  foreach v_key in array array[
    'bankAccountNumberMasked',
    'bankIbanMasked',
    'bankRoutingCodeMasked'
  ] loop
    if new."CRMAccountOps_InvoicePreferencesJSON" ? v_key then
      v_masked := public._multideck_crm_mask_bank_reference(
        new."CRMAccountOps_InvoicePreferencesJSON" ->> v_key
      );

      if v_masked is null then
        new."CRMAccountOps_InvoicePreferencesJSON" :=
          new."CRMAccountOps_InvoicePreferencesJSON" - v_key;
      else
        new."CRMAccountOps_InvoicePreferencesJSON" := jsonb_set(
          new."CRMAccountOps_InvoicePreferencesJSON",
          array[v_key],
          to_jsonb(v_masked),
          true
        );
      end if;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists "TR_CRM_AccountOperationalProfiles_mask_bank_details"
  on public."CRM_AccountOperationalProfiles";

create trigger "TR_CRM_AccountOperationalProfiles_mask_bank_details"
before insert or update of "CRMAccountOps_InvoicePreferencesJSON"
on public."CRM_AccountOperationalProfiles"
for each row
execute function public._multideck_crm_mask_account_bank_details();

revoke all on function public._multideck_crm_mask_bank_reference(text)
  from public, anon, authenticated;
revoke all on function public._multideck_crm_mask_account_bank_details()
  from public, anon, authenticated;
grant execute on function public._multideck_crm_mask_bank_reference(text)
  to service_role;
grant execute on function public._multideck_crm_mask_account_bank_details()
  to service_role;

comment on function public._multideck_crm_mask_bank_reference(text) is
  'Returns only the final four alphanumeric characters of a counterparty bank reference.';
comment on trigger "TR_CRM_AccountOperationalProfiles_mask_bank_details"
  on public."CRM_AccountOperationalProfiles" is
  'Prevents complete counterparty bank account, IBAN and routing identifiers from being retained in Multideck CRM.';

commit;
