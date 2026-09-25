begin;

-- Configuration records the tenant's declared registration. HMRC verification
-- and production approval are separate, server-controlled transitions.
create function public.multideck_uk_vat_registration(p_actor uuid,p_entity uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_registration public."FIN_LegalEntityComplianceRegistrations"%rowtype;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  select registration.* into v_registration
  from public."FIN_LegalEntityComplianceRegistrations" registration
  join public."FIN_ComplianceObligations" obligation
    on obligation."FINCompliance_ID"=registration."FINComplianceReg_ObligationID"
  join public."FIN_LocalisationPacks" pack
    on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
  where registration."FINComplianceReg_LegalEntityID"=p_entity
    and obligation."FINCompliance_Code"='gb-vat-mtd'
    and pack."FINLocPack_Code"='gb-v1'
    and pack."FINLocPack_CountryCode"='GB'
  order by registration."FINComplianceReg_UpdatedAt" desc limit 1;
  return jsonb_build_object('registration',case when v_registration."FINComplianceReg_ID" is null then null
    else jsonb_build_object(
      'registrationId',v_registration."FINComplianceReg_ID",
      'status',v_registration."FINComplianceReg_StatusCode",
      'vrn',v_registration."FINComplianceReg_RegistrationReference",
      'schemeCode',v_registration."FINComplianceReg_SettingsJSON"->>'schemeCode',
      'accountingBasis',v_registration."FINComplianceReg_SettingsJSON"->>'accountingBasis',
      'effectiveFrom',v_registration."FINComplianceReg_EffectiveFrom",
      'effectiveTo',v_registration."FINComplianceReg_EffectiveTo",
      'updatedAt',v_registration."FINComplianceReg_UpdatedAt"
    ) end);
end; $$;
revoke all on function public.multideck_uk_vat_registration(uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_registration(uuid,uuid) to service_role;

create function public.multideck_uk_vat_configure_registration(
  p_actor uuid,p_entity uuid,p_vrn text,p_scheme text,p_effective_from date,p_invoice_basis_confirmed boolean
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_obligation uuid; v_count integer; v_existing public."FIN_LegalEntityComplianceRegistrations"%rowtype;
  v_registration uuid; v_at timestamptz:=now();
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if not exists(select 1 from public."cmp_LegalEntities" entity
    where entity."LegalEntity_ID"=p_entity
      and upper(entity."LegalEntity_BaseCurrencyCodeSnapshot")='GBP') then
    raise exception 'UK VAT registration setup requires a GBP native ledger.' using errcode='22023';
  end if;
  if p_vrn is null or p_vrn !~ '^[0-9]{9}$'
    or p_scheme not in ('standard','annual') or p_scheme is null
    or p_effective_from is null or p_invoice_basis_confirmed is distinct from true then
    raise exception 'Enter a nine-digit UK VAT number, supported invoice-basis scheme and effective date.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat-registration:'||p_entity::text,0));
  select count(*)::integer,(array_agg(obligation."FINCompliance_ID"))[1] into v_count,v_obligation
  from public."FIN_ComplianceObligations" obligation
  join public."FIN_LocalisationPacks" pack on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
  where obligation."FINCompliance_Code"='gb-vat-mtd'
    and obligation."FINCompliance_ObligationTypeCode"='indirect_tax'
    and obligation."FINCompliance_IsActive"
    and pack."FINLocPack_Code"='gb-v1'
    and pack."FINLocPack_CountryCode"='GB'
    and pack."FINLocPack_IsActive";
  if v_count<>1 then
    raise exception 'The active UK VAT obligation is unavailable or ambiguous.' using errcode='22023';
  end if;
  select * into v_existing from public."FIN_LegalEntityComplianceRegistrations"
    where "FINComplianceReg_LegalEntityID"=p_entity
      and "FINComplianceReg_ObligationID"=v_obligation for update;
  if found and (v_existing."FINComplianceReg_StatusCode"<>'not_configured'
    or exists(select 1 from public."FIN_IndirectTaxPeriods" period
      where period.legal_entity_id=p_entity and period.obligation_id=v_obligation)
    or exists(select 1 from public."FIN_HmrcVatConnections" connection
      where connection.legal_entity_id=p_entity and connection.registration_id=v_existing."FINComplianceReg_ID")) then
    raise exception 'This UK VAT registration is already configured; changes require a controlled revision.' using errcode='22023';
  end if;
  if found then
    update public."FIN_LegalEntityComplianceRegistrations" set
      "FINComplianceReg_StatusCode"='configured',
      "FINComplianceReg_RegistrationReference"=p_vrn,
      "FINComplianceReg_FilingMethodCode"='mtd_api',
      "FINComplianceReg_EffectiveFrom"=p_effective_from,
      "FINComplianceReg_EffectiveTo"=null,
      "FINComplianceReg_SettingsJSON"=jsonb_build_object('schemeCode',p_scheme,'accountingBasis','invoice'),
      "FINComplianceReg_UpdatedAt"=v_at,"FINComplianceReg_UpdatedBy"=p_actor
    where "FINComplianceReg_ID"=v_existing."FINComplianceReg_ID"
    returning "FINComplianceReg_ID" into v_registration;
  else
    insert into public."FIN_LegalEntityComplianceRegistrations"(
      "FINComplianceReg_LegalEntityID","FINComplianceReg_ObligationID",
      "FINComplianceReg_StatusCode","FINComplianceReg_RegistrationReference",
      "FINComplianceReg_FilingMethodCode","FINComplianceReg_EffectiveFrom",
      "FINComplianceReg_SettingsJSON","FINComplianceReg_UpdatedAt","FINComplianceReg_UpdatedBy"
    ) values (p_entity,v_obligation,'configured',p_vrn,'mtd_api',p_effective_from,
      jsonb_build_object('schemeCode',p_scheme,'accountingBasis','invoice'),v_at,p_actor)
    returning "FINComplianceReg_ID" into v_registration;
  end if;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values ('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_LegalEntityComplianceRegistrations','uk_vat_registration',v_registration,
    'configure_uk_vat_registration','UK VAT registration configured',
    jsonb_build_object('obligationId',v_obligation,'schemeCode',p_scheme,
      'accountingBasis','invoice','invoiceBasisConfirmed',true,
      'effectiveFrom',p_effective_from,'priorStatus',
      case when v_existing."FINComplianceReg_ID" is null then null else v_existing."FINComplianceReg_StatusCode" end));
  return public.multideck_uk_vat_registration(p_actor,p_entity);
end; $$;
revoke all on function public.multideck_uk_vat_configure_registration(uuid,uuid,text,text,date,boolean) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_configure_registration(uuid,uuid,text,text,date,boolean) to service_role;

commit;
