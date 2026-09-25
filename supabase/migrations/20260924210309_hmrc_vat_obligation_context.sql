begin;

-- Only a scoped backend operation may select dates and registration details
-- for an HMRC obligations GET. A caller cannot substitute browser dates.
create function public.multideck_hmrc_vat_obligation_context(
  p_actor uuid,p_entity uuid,p_project_ref text,p_period uuid,p_connection uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_connection public."FIN_HmrcVatConnections"%rowtype;
  v_registration public."FIN_LegalEntityComplianceRegistrations"%rowtype;
  v_pack_status text;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_project_ref is null or length(p_project_ref) not between 4 and 120
    or p_period is null or p_connection is null then
    raise exception 'Choose a scoped HMRC VAT obligation check.' using errcode='22023';
  end if;
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=p_period and legal_entity_id=p_entity and jurisdiction_code='GB'
      and status in ('draft','review_locked');
  if not found or v_period.scheme_code not in ('standard','annual') then
    raise exception 'An active UK VAT period is required.' using errcode='22023';
  end if;
  select * into v_connection from public."FIN_HmrcVatConnections"
    where id=p_connection and tenant_project_ref=p_project_ref
      and legal_entity_id=p_entity and registration_id=v_period.registration_id
      and status='connected' and granted_scope='read:vat write:vat'
      and authority_expires_at>now() and access_expires_at>now()+interval '1 minute'
      and refresh_lease_id is null;
  if not found then raise exception 'Current HMRC VAT authority is required.' using errcode='42501'; end if;
  perform public._multideck_uk_vat_access(v_connection.granted_by_actor_id,p_entity);
  select * into v_registration from public."FIN_LegalEntityComplianceRegistrations"
    where "FINComplianceReg_ID"=v_period.registration_id
      and "FINComplianceReg_LegalEntityID"=p_entity
      and "FINComplianceReg_RegistrationReference"=v_connection.vrn
      and "FINComplianceReg_StatusCode" in ('configured','sandbox_verified','production_verified')
      and "FINComplianceReg_SettingsJSON"->>'schemeCode'=v_period.scheme_code
      and "FINComplianceReg_EffectiveFrom"<=v_period.start_date
      and ("FINComplianceReg_EffectiveTo" is null
        or "FINComplianceReg_EffectiveTo">=v_period.end_date);
  if not found then raise exception 'The period VAT registration changed.' using errcode='22023'; end if;
  select pack."FINLocPack_ComplianceStatusCode" into v_pack_status
    from public."FIN_ComplianceObligations" obligation
    join public."FIN_LocalisationPacks" pack on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
    where obligation."FINCompliance_ID"=v_period.obligation_id
      and obligation."FINCompliance_Code"='gb-vat-mtd'
      and pack."FINLocPack_CountryCode"='GB';
  if v_pack_status is null or (v_connection.environment='production'
    and (v_pack_status<>'production_ready'
      or v_registration."FINComplianceReg_StatusCode"<>'production_verified')) then
    raise exception 'HMRC VAT environment is not approved for this registration.' using errcode='42501';
  end if;
  return jsonb_build_object('periodId',v_period.id,'connectionId',v_connection.id,
    'environment',v_connection.environment,'vrn',v_connection.vrn,
    'startDate',v_period.start_date,'endDate',v_period.end_date);
end; $$;
revoke all on function public.multideck_hmrc_vat_obligation_context(uuid,uuid,text,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_hmrc_vat_obligation_context(uuid,uuid,text,uuid,uuid)
  to service_role;

commit;
