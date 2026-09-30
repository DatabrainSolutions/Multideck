begin;

-- Annual Accounting was an early prototype. Standard is the default product
-- offer; Cash Accounting remains blocked until its full source and filing
-- controls are ready. Keep historical Annual rows readable and finishable,
-- but do not allow a new Annual registration or period through service-role SQL.
create function public._multideck_uk_vat_registration_offer_guard()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $$
declare v_obligation text;
declare v_old_obligation text;
begin
  select obligation."FINCompliance_Code" into v_obligation
  from public."FIN_ComplianceObligations" obligation
  where obligation."FINCompliance_ID"=new."FINComplianceReg_ObligationID";
  if v_obligation<>'gb-vat-mtd'
    or new."FINComplianceReg_SettingsJSON"->>'schemeCode'<>'annual' then
    return new;
  end if;
  if tg_op='INSERT' then
    raise exception 'New UK Annual Accounting registrations are no longer offered.' using errcode='22023';
  end if;
  select obligation."FINCompliance_Code" into v_old_obligation
  from public."FIN_ComplianceObligations" obligation
  where obligation."FINCompliance_ID"=old."FINComplianceReg_ObligationID";
  if old."FINComplianceReg_SettingsJSON"->>'schemeCode' is distinct from 'annual'
    or v_old_obligation is distinct from 'gb-vat-mtd'
    or (old."FINComplianceReg_StatusCode"='not_configured'
      and new."FINComplianceReg_StatusCode"<>'not_configured') then
    raise exception 'New UK Annual Accounting registrations are no longer offered.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_uk_vat_registration_offer_guard()
  from public,anon,authenticated;
create trigger uk_vat_registration_offer_guard
  before insert or update on public."FIN_LegalEntityComplianceRegistrations"
  for each row execute function public._multideck_uk_vat_registration_offer_guard();

create function public._multideck_uk_vat_period_offer_guard()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if new.jurisdiction_code='GB' and new.scheme_code='annual' then
    if tg_op='INSERT' then
      raise exception 'New UK Annual Accounting periods are no longer offered.' using errcode='22023';
    end if;
    if old.scheme_code is distinct from 'annual'
      or old.jurisdiction_code is distinct from 'GB' then
      raise exception 'New UK Annual Accounting periods are no longer offered.' using errcode='22023';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public._multideck_uk_vat_period_offer_guard()
  from public,anon,authenticated;
create trigger uk_vat_period_offer_guard
  before insert or update on public."FIN_IndirectTaxPeriods"
  for each row execute function public._multideck_uk_vat_period_offer_guard();

commit;
