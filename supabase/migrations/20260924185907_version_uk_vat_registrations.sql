begin;

-- Effective dates are UK civil dates. Compare them explicitly in London time
-- without changing the caller's time zone or VAT calculation fingerprints.

-- Periods and HMRC grants retain the registration row they were created for.
-- New terms receive a new row; date ranges for the same obligation cannot
-- overlap, and only one row may remain open-ended.
alter table public."FIN_LegalEntityComplianceRegistrations"
  drop constraint "UQ_FIN_LegalEntityCompliance_registration";
alter table public."FIN_LegalEntityComplianceRegistrations"
  add constraint "EX_FIN_LegalEntityCompliance_effective_dates" exclude using gist (
    "FINComplianceReg_LegalEntityID" with =,
    "FINComplianceReg_ObligationID" with =,
    daterange("FINComplianceReg_EffectiveFrom","FINComplianceReg_EffectiveTo",'[]') with &&
  );
create unique index "UQ_FIN_LegalEntityCompliance_open_registration"
  on public."FIN_LegalEntityComplianceRegistrations"(
    "FINComplianceReg_LegalEntityID","FINComplianceReg_ObligationID"
  ) where "FINComplianceReg_EffectiveTo" is null;

create or replace function public.multideck_uk_vat_registration(p_actor uuid,p_entity uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_registration public."FIN_LegalEntityComplianceRegistrations"%rowtype;
  v_scheduled public."FIN_LegalEntityComplianceRegistrations"%rowtype;
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
    and registration."FINComplianceReg_EffectiveFrom"<=(now() at time zone 'Europe/London')::date
  order by registration."FINComplianceReg_EffectiveFrom" desc,registration."FINComplianceReg_ID" desc limit 1;
  select registration.* into v_scheduled
  from public."FIN_LegalEntityComplianceRegistrations" registration
  join public."FIN_ComplianceObligations" obligation
    on obligation."FINCompliance_ID"=registration."FINComplianceReg_ObligationID"
  join public."FIN_LocalisationPacks" pack
    on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
  where registration."FINComplianceReg_LegalEntityID"=p_entity
    and obligation."FINCompliance_Code"='gb-vat-mtd'
    and pack."FINLocPack_Code"='gb-v1'
    and pack."FINLocPack_CountryCode"='GB'
    and registration."FINComplianceReg_EffectiveFrom">(now() at time zone 'Europe/London')::date
  order by registration."FINComplianceReg_EffectiveFrom",registration."FINComplianceReg_ID" limit 1;
  return jsonb_build_object(
    'registration',case when v_registration."FINComplianceReg_ID" is null then null else jsonb_build_object(
      'registrationId',v_registration."FINComplianceReg_ID",
      'status',v_registration."FINComplianceReg_StatusCode",
      'vrn',v_registration."FINComplianceReg_RegistrationReference",
      'schemeCode',v_registration."FINComplianceReg_SettingsJSON"->>'schemeCode',
      'accountingBasis',v_registration."FINComplianceReg_SettingsJSON"->>'accountingBasis',
      'effectiveFrom',v_registration."FINComplianceReg_EffectiveFrom",
      'effectiveTo',v_registration."FINComplianceReg_EffectiveTo",
      'updatedAt',v_registration."FINComplianceReg_UpdatedAt") end,
    'scheduledRegistration',case when v_scheduled."FINComplianceReg_ID" is null then null else jsonb_build_object(
      'registrationId',v_scheduled."FINComplianceReg_ID",
      'status',v_scheduled."FINComplianceReg_StatusCode",
      'vrn',v_scheduled."FINComplianceReg_RegistrationReference",
      'schemeCode',v_scheduled."FINComplianceReg_SettingsJSON"->>'schemeCode',
      'accountingBasis',v_scheduled."FINComplianceReg_SettingsJSON"->>'accountingBasis',
      'effectiveFrom',v_scheduled."FINComplianceReg_EffectiveFrom",
      'effectiveTo',v_scheduled."FINComplianceReg_EffectiveTo",
      'updatedAt',v_scheduled."FINComplianceReg_UpdatedAt") end);
end; $$;

create or replace function public.multideck_uk_vat_create_draft_period(
  p_actor uuid,p_entity uuid,p_start date,p_end date
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_obligation uuid; v_registration public."FIN_LegalEntityComplianceRegistrations"%rowtype;
  v_period uuid; v_currency text; v_scheme text; v_existing record;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_start is null or p_end is null or p_end<p_start or p_end>=p_start+interval '2 years' then
    raise exception 'Choose a valid UK VAT period.' using errcode='22023';
  end if;
  select upper("LegalEntity_BaseCurrencyCodeSnapshot") into v_currency
    from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity;
  if v_currency<>'GBP' then
    raise exception 'UK VAT calculation requires a GBP native ledger for this legal entity.' using errcode='22023';
  end if;
  select obligation."FINCompliance_ID" into v_obligation
    from public."FIN_ComplianceObligations" obligation
    join public."FIN_LocalisationPacks" pack on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
    where obligation."FINCompliance_Code"='gb-vat-mtd'
      and pack."FINLocPack_Code"='gb-v1' and pack."FINLocPack_CountryCode"='GB';
  if v_obligation is null then raise exception 'The UK VAT obligation pack is not installed.' using errcode='22023'; end if;
  select * into v_registration from public."FIN_LegalEntityComplianceRegistrations"
    where "FINComplianceReg_LegalEntityID"=p_entity
      and "FINComplianceReg_ObligationID"=v_obligation
      and "FINComplianceReg_EffectiveFrom"<=p_start
      and ("FINComplianceReg_EffectiveTo" is null or "FINComplianceReg_EffectiveTo">=p_end);
  if not found then
    raise exception 'One effective UK VAT registration must cover the complete period.' using errcode='22023';
  end if;
  if v_registration."FINComplianceReg_EffectiveTo"<(now() at time zone 'Europe/London')::date then
    raise exception 'A closed VAT registration cannot start another historical draft period.' using errcode='22023';
  end if;
  v_scheme:=v_registration."FINComplianceReg_SettingsJSON"->>'schemeCode';
  if v_scheme not in ('standard','annual') or v_scheme is null
    or v_registration."FINComplianceReg_StatusCode" not in ('configured','sandbox_verified','production_verified')
    or not coalesce(v_registration."FINComplianceReg_RegistrationReference" ~ '^[0-9]{9}$',false) then
    raise exception 'One effective, reviewed standard or annual UK VAT registration is required.' using errcode='22023';
  end if;
  insert into public."FIN_IndirectTaxPeriods"(
    legal_entity_id,obligation_id,registration_id,jurisdiction_code,scheme_code,
    reporting_currency,start_date,end_date,created_by
  ) values (p_entity,v_obligation,v_registration."FINComplianceReg_ID",'GB',v_scheme,'GBP',p_start,p_end,p_actor)
  on conflict (legal_entity_id,obligation_id,start_date,end_date) do nothing returning id into v_period;
  if v_period is null then
    select id,registration_id,scheme_code into v_existing from public."FIN_IndirectTaxPeriods"
      where legal_entity_id=p_entity and obligation_id=v_obligation and start_date=p_start and end_date=p_end;
    if v_existing.registration_id is distinct from v_registration."FINComplianceReg_ID"
      or v_existing.scheme_code is distinct from v_scheme then
      raise exception 'The existing VAT period uses a different registration or scheme.' using errcode='22023';
    end if;
    v_period:=v_existing.id;
  end if;
  return jsonb_build_object('periodId',v_period,'status','draft','start',p_start,'end',p_end,
    'authorityObligationVerified',false);
end; $$;

create function public.multideck_uk_vat_schedule_registration(
  p_actor uuid,p_entity uuid,p_vrn text,p_scheme text,p_effective_from date,
  p_invoice_basis_confirmed boolean,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_obligation uuid; v_current public."FIN_LegalEntityComplianceRegistrations"%rowtype;
  v_new uuid; v_at timestamptz:=now(); v_connection record;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if not exists(select 1 from public."cmp_LegalEntities" entity
    where entity."LegalEntity_ID"=p_entity
      and upper(entity."LegalEntity_BaseCurrencyCodeSnapshot")='GBP') then
    raise exception 'UK VAT registration changes require a GBP native ledger.' using errcode='22023';
  end if;
  if p_vrn is null or p_vrn !~ '^[0-9]{9}$'
    or p_scheme not in ('standard','annual') or p_scheme is null
    or p_effective_from is null or p_effective_from<(now() at time zone 'Europe/London')::date
    or p_invoice_basis_confirmed is distinct from true
    or p_reason is null or length(btrim(p_reason)) not between 10 and 2000 then
    raise exception 'Enter supported new VAT terms, a prospective date, invoice-basis confirmation and a reason.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat-registration:'||p_entity::text,0));
  select obligation."FINCompliance_ID" into v_obligation
  from public."FIN_ComplianceObligations" obligation
  join public."FIN_LocalisationPacks" pack on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
  where obligation."FINCompliance_Code"='gb-vat-mtd'
    and obligation."FINCompliance_ObligationTypeCode"='indirect_tax'
    and obligation."FINCompliance_IsActive"
    and pack."FINLocPack_Code"='gb-v1' and pack."FINLocPack_IsActive";
  if v_obligation is null then raise exception 'The active UK VAT obligation is unavailable.' using errcode='22023'; end if;
  select * into v_current from public."FIN_LegalEntityComplianceRegistrations"
    where "FINComplianceReg_LegalEntityID"=p_entity
      and "FINComplianceReg_ObligationID"=v_obligation
      and "FINComplianceReg_EffectiveTo" is null for update;
  if not found or v_current."FINComplianceReg_StatusCode" not in ('configured','sandbox_verified','production_verified')
    or p_effective_from<=v_current."FINComplianceReg_EffectiveFrom" then
    raise exception 'A current UK VAT registration and later effective date are required.' using errcode='22023';
  end if;
  if p_vrn=v_current."FINComplianceReg_RegistrationReference"
    and p_scheme=v_current."FINComplianceReg_SettingsJSON"->>'schemeCode' then
    raise exception 'The new VAT registration terms are unchanged.' using errcode='22023';
  end if;
  if exists(select 1 from public."FIN_IndirectTaxPeriods" period
    where period.registration_id=v_current."FINComplianceReg_ID"
      and period.end_date>=p_effective_from) then
    raise exception 'A prepared VAT period crosses the registration change date.' using errcode='22023';
  end if;
  if exists(select 1 from public."FIN_IndirectTaxPeriods" period
    where period.registration_id=v_current."FINComplianceReg_ID"
      and not exists(select 1 from public."FIN_HmrcVatSubmissionAttempts" attempt
        where attempt.period_id=period.id and attempt.registration_id=v_current."FINComplianceReg_ID"
          and attempt.environment='production'
          and attempt.status in ('accepted','accepted_readback'))) then
    raise exception 'Resolve every prepared VAT period for the current registration before changing its terms.' using errcode='22023';
  end if;
  if exists(select 1 from public."FIN_HmrcVatSubmissionAttempts" attempt
    where attempt.registration_id=v_current."FINComplianceReg_ID"
      and attempt.status in ('reserved','dispatching','reconciliation_required')) then
    raise exception 'Resolve the outstanding HMRC submission before changing registration terms.' using errcode='22023';
  end if;
  update public."FIN_LegalEntityComplianceRegistrations"
    set "FINComplianceReg_EffectiveTo"=p_effective_from-1,
      "FINComplianceReg_UpdatedAt"=v_at,"FINComplianceReg_UpdatedBy"=p_actor
    where "FINComplianceReg_ID"=v_current."FINComplianceReg_ID";
  insert into public."FIN_LegalEntityComplianceRegistrations"(
    "FINComplianceReg_LegalEntityID","FINComplianceReg_ObligationID",
    "FINComplianceReg_StatusCode","FINComplianceReg_RegistrationReference",
    "FINComplianceReg_FilingMethodCode","FINComplianceReg_EffectiveFrom",
    "FINComplianceReg_SettingsJSON","FINComplianceReg_UpdatedAt","FINComplianceReg_UpdatedBy"
  ) values (p_entity,v_obligation,'configured',p_vrn,'mtd_api',p_effective_from,
    jsonb_build_object('schemeCode',p_scheme,'accountingBasis','invoice'),v_at,p_actor)
  returning "FINComplianceReg_ID" into v_new;
  if p_effective_from=(now() at time zone 'Europe/London')::date then
    for v_connection in select id from public."FIN_HmrcVatConnections"
      where legal_entity_id=p_entity and registration_id=v_current."FINComplianceReg_ID"
        and status='connected' order by id loop
      perform public._multideck_hmrc_vat_require_reauthorisation(v_connection.id,p_actor,'registration_changed');
    end loop;
  end if;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values ('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_LegalEntityComplianceRegistrations','uk_vat_registration',v_new,
    'schedule_uk_vat_registration',btrim(p_reason),'UK VAT registration terms changed',
    jsonb_build_object('previousRegistrationId',v_current."FINComplianceReg_ID",
      'previousVrn',v_current."FINComplianceReg_RegistrationReference",
      'previousScheme',v_current."FINComplianceReg_SettingsJSON"->>'schemeCode',
      'newVrn',p_vrn,'newScheme',p_scheme,'effectiveFrom',p_effective_from,
      'invoiceBasisConfirmed',true,'hmrcVerification','required'));
  return jsonb_build_object('newRegistrationId',v_new,
    'previousRegistrationId',v_current."FINComplianceReg_ID",
    'effectiveFrom',p_effective_from,'hmrcVerification','required');
end; $$;
revoke all on function public.multideck_uk_vat_schedule_registration(uuid,uuid,text,text,date,boolean,text)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_schedule_registration(uuid,uuid,text,text,date,boolean,text)
  to service_role;

-- A scheduled change can become effective between requests. Show the old
-- connection as needing new consent even before a token-refresh call clears it.
create or replace function public.multideck_hmrc_vat_connection_status(
  p_actor uuid,p_entity uuid,p_project_ref text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_rows jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  select coalesce(jsonb_agg(to_jsonb(item) order by item.environment,item.authorised_at desc),'[]'::jsonb)
    into v_rows from (
    select connection.id connection_id,connection.environment,connection.vrn,
      connection.granted_by_actor_id,
      case when connection.status='connected' and (
        connection.authority_expires_at<=now() or not exists (
          select 1 from public."FIN_LegalEntityComplianceRegistrations" registration
          where registration."FINComplianceReg_ID"=connection.registration_id
            and registration."FINComplianceReg_LegalEntityID"=p_entity
            and registration."FINComplianceReg_RegistrationReference"=connection.vrn
            and registration."FINComplianceReg_StatusCode" in ('configured','sandbox_verified','production_verified')
            and registration."FINComplianceReg_EffectiveFrom"<=(now() at time zone 'Europe/London')::date
            and (registration."FINComplianceReg_EffectiveTo" is null
              or registration."FINComplianceReg_EffectiveTo">=(now() at time zone 'Europe/London')::date)
        )) then 'reauthorisation_required' else connection.status end status,
      connection.authorised_at,connection.authority_expires_at,connection.access_expires_at
    from public."FIN_HmrcVatConnections" connection
    where connection.tenant_project_ref=p_project_ref and connection.legal_entity_id=p_entity
  ) item;
  return jsonb_build_object('legalEntityId',p_entity,'connections',v_rows);
end; $$;

commit;
