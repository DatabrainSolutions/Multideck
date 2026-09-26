begin;

-- Bind the read-only exit source inventory to recorded, consecutive VAT terms.
-- This does not enable Cash periods, a transition calculation or filing.
create function public.multideck_uk_vat_cash_exit_verified_inventory(
  p_actor uuid,p_entity uuid,p_cash_registration uuid,p_final_cash_period uuid
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_cash public."FIN_LegalEntityComplianceRegistrations"%rowtype;
  v_standard public."FIN_LegalEntityComplianceRegistrations"%rowtype;
  v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_inventory jsonb; v_context jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  select registration.* into v_cash
  from public."FIN_LegalEntityComplianceRegistrations" registration
  join public."FIN_ComplianceObligations" obligation
    on obligation."FINCompliance_ID"=registration."FINComplianceReg_ObligationID"
  join public."FIN_LocalisationPacks" pack
    on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
  where registration."FINComplianceReg_ID"=p_cash_registration
    and registration."FINComplianceReg_LegalEntityID"=p_entity
    and registration."FINComplianceReg_SettingsJSON"->>'schemeCode'='cash'
    and registration."FINComplianceReg_StatusCode" in
      ('configured','sandbox_verified','production_verified')
    and registration."FINComplianceReg_FilingMethodCode"='mtd_api'
    and registration."FINComplianceReg_RegistrationReference" ~ '^[0-9]{9}$'
    and registration."FINComplianceReg_EffectiveTo" is not null
    and registration."FINComplianceReg_EffectiveFrom"<=registration."FINComplianceReg_EffectiveTo"
    and obligation."FINCompliance_Code"='gb-vat-mtd'
    and obligation."FINCompliance_ObligationTypeCode"='indirect_tax'
    and pack."FINLocPack_Code"='gb-v1'
    and pack."FINLocPack_CountryCode"='GB';
  if not found then
    raise exception 'A closed UK Cash Accounting registration is required.' using errcode='22023';
  end if;
  select period.* into v_period from public."FIN_IndirectTaxPeriods" period
  where period.id=p_final_cash_period
    and period.legal_entity_id=p_entity
    and period.obligation_id=v_cash."FINComplianceReg_ObligationID"
    and period.registration_id=v_cash."FINComplianceReg_ID"
    and period.jurisdiction_code='GB' and period.scheme_code='cash'
    and period.reporting_currency='GBP'
    and period.start_date>=v_cash."FINComplianceReg_EffectiveFrom"
    and period.end_date=v_cash."FINComplianceReg_EffectiveTo";
  if not found then
    raise exception 'The final Cash period must end on the recorded exit date.' using errcode='22023';
  end if;
  select registration.* into v_standard
  from public."FIN_LegalEntityComplianceRegistrations" registration
  where registration."FINComplianceReg_LegalEntityID"=p_entity
    and registration."FINComplianceReg_ObligationID"=v_cash."FINComplianceReg_ObligationID"
    and registration."FINComplianceReg_EffectiveFrom"=v_cash."FINComplianceReg_EffectiveTo"+1
    and registration."FINComplianceReg_SettingsJSON"->>'schemeCode'='standard'
    and registration."FINComplianceReg_StatusCode" in
      ('configured','sandbox_verified','production_verified')
    and registration."FINComplianceReg_FilingMethodCode"='mtd_api'
    and registration."FINComplianceReg_RegistrationReference"=
      v_cash."FINComplianceReg_RegistrationReference";
  if not found then
    raise exception 'A consecutive Standard Accounting term for the same VAT registration is required.'
      using errcode='22023';
  end if;
  v_inventory:=public.multideck_uk_vat_cash_exit_invoice_inventory(
    p_actor,p_entity,v_cash."FINComplianceReg_EffectiveFrom",
    v_cash."FINComplianceReg_EffectiveTo");
  v_context:=jsonb_build_object(
    'cashRegistrationId',v_cash."FINComplianceReg_ID",
    'cashRegistrationUpdatedAt',v_cash."FINComplianceReg_UpdatedAt",
    'finalCashPeriodId',v_period.id,
    'finalCashPeriodStatus',v_period.status,
    'nextStandardRegistrationId',v_standard."FINComplianceReg_ID",
    'nextStandardRegistrationUpdatedAt',v_standard."FINComplianceReg_UpdatedAt",
    'schemeEntryDate',v_cash."FINComplianceReg_EffectiveFrom",
    'schemeExitDate',v_cash."FINComplianceReg_EffectiveTo");
  return v_inventory||jsonb_build_object(
    'verifiedTransition',v_context,
    'sourceDigest',case when v_inventory->>'truncated'='true' then null
      else encode(sha256(convert_to(jsonb_build_object(
        'inventoryDigest',v_inventory->>'sourceDigest',
        'verifiedTransition',v_context)::text,'UTF8')),'hex') end);
end; $$;
revoke all on function public.multideck_uk_vat_cash_exit_verified_inventory(uuid,uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_exit_verified_inventory(uuid,uuid,uuid,uuid)
  to service_role;

commit;
