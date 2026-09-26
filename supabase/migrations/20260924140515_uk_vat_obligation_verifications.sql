begin;

-- Server-recorded observations of an actual HMRC obligations response. This
-- table is evidence for a later approval gate, not filing permission itself.
create table public."FIN_HmrcVatObligationVerifications" (
  id uuid primary key default gen_random_uuid(),
  tenant_project_ref text not null check (length(tenant_project_ref) between 4 and 120),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  connection_id uuid not null references public."FIN_HmrcVatConnections"(id) on delete restrict,
  registration_id uuid not null references public."FIN_LegalEntityComplianceRegistrations"("FINComplianceReg_ID") on delete restrict,
  vrn char(9) not null check (vrn ~ '^[0-9]{9}$'),
  environment text not null check (environment in ('sandbox','production')),
  period_key text not null check (period_key ~ '^(#[A-Za-z0-9]{3}|[A-Za-z0-9]{4})$'),
  start_date date not null,
  end_date date not null,
  due_date date not null,
  hmrc_correlation_id text not null check (hmrc_correlation_id ~ '^[!-~]{36}$'),
  observed_at timestamptz not null default now(),
  recorded_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  unique (connection_id,hmrc_correlation_id,period_key),
  check (start_date<=end_date and due_date>=end_date)
);
create index "IX_FIN_HmrcVatObligationVerifications_period"
  on public."FIN_HmrcVatObligationVerifications"(period_id,environment,observed_at desc);
alter table public."FIN_HmrcVatObligationVerifications" enable row level security;
revoke all on public."FIN_HmrcVatObligationVerifications" from public,anon,authenticated;
grant select on public."FIN_HmrcVatObligationVerifications" to service_role;
create trigger hmrc_vat_obligation_verification_immutable before update or delete
  on public."FIN_HmrcVatObligationVerifications"
  for each row execute function public._multideck_indirect_tax_immutable();

create function public.multideck_hmrc_vat_record_obligation(
  p_actor uuid,p_entity uuid,p_project_ref text,p_connection uuid,p_period uuid,
  p_obligation jsonb,p_correlation_id text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_connection public."FIN_HmrcVatConnections"%rowtype;
  v_registration public."FIN_LegalEntityComplianceRegistrations"%rowtype;
  v_pack_status text; v_id uuid; v_at timestamptz;
  v_start date; v_end date; v_due date; v_key text;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_project_ref is null or length(p_project_ref) not between 4 and 120
    or p_obligation is null or jsonb_typeof(p_obligation)<>'object'
    or p_correlation_id is null or p_correlation_id !~ '^[!-~]{36}$' then
    raise exception 'HMRC VAT obligation evidence is invalid.' using errcode='22023';
  end if;
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=p_period and legal_entity_id=p_entity and jurisdiction_code='GB'
      and status in ('draft','review_locked') for share;
  if not found then raise exception 'UK VAT period was not found.' using errcode='P0002'; end if;
  select * into v_connection from public."FIN_HmrcVatConnections"
    where id=p_connection and tenant_project_ref=p_project_ref
      and legal_entity_id=p_entity and registration_id=v_period.registration_id
      and status='connected' and authority_expires_at>now()
      and access_expires_at>now() and refresh_lease_id is null for share;
  if not found then raise exception 'A current tenant HMRC VAT authority is required.' using errcode='42501'; end if;
  perform public._multideck_uk_vat_access(v_connection.granted_by_actor_id,p_entity);
  select * into v_registration from public."FIN_LegalEntityComplianceRegistrations"
    where "FINComplianceReg_ID"=v_period.registration_id
      and "FINComplianceReg_LegalEntityID"=p_entity
      and "FINComplianceReg_RegistrationReference"=v_connection.vrn
      and "FINComplianceReg_StatusCode" in ('configured','sandbox_verified','production_verified')
      and "FINComplianceReg_SettingsJSON"->>'schemeCode'=v_period.scheme_code
      and "FINComplianceReg_EffectiveFrom"<=v_period.start_date
      and ("FINComplianceReg_EffectiveTo" is null or "FINComplianceReg_EffectiveTo">=v_period.end_date);
  if not found or v_period.scheme_code not in ('standard','annual') then
    raise exception 'The period VAT registration changed.' using errcode='22023';
  end if;
  select pack."FINLocPack_ComplianceStatusCode" into v_pack_status
    from public."FIN_ComplianceObligations" obligation
    join public."FIN_LocalisationPacks" pack on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
    where obligation."FINCompliance_ID"=v_period.obligation_id
      and obligation."FINCompliance_Code"='gb-vat-mtd' and pack."FINLocPack_CountryCode"='GB';
  if v_pack_status is null or (v_connection.environment='production'
    and (v_pack_status<>'production_ready' or v_registration."FINComplianceReg_StatusCode"<>'production_verified')) then
    raise exception 'HMRC VAT environment is not approved for this registration.' using errcode='42501';
  end if;
  if p_obligation->>'status' is distinct from 'O' or p_obligation ? 'received'
    or coalesce(p_obligation->>'periodKey','') !~ '^(#[A-Za-z0-9]{3}|[A-Za-z0-9]{4})$'
    or coalesce(p_obligation->>'start','') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(p_obligation->>'end','') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(p_obligation->>'due','') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'HMRC did not return one valid open VAT obligation.' using errcode='22023';
  end if;
  v_start:=(p_obligation->>'start')::date;
  v_end:=(p_obligation->>'end')::date;
  v_due:=(p_obligation->>'due')::date;
  v_key:=p_obligation->>'periodKey';
  if v_start<>v_period.start_date or v_end<>v_period.end_date or v_due<v_end
    or v_connection.vrn<>v_registration."FINComplianceReg_RegistrationReference" then
    raise exception 'HMRC obligation does not match this VAT period.' using errcode='22023';
  end if;
  insert into public."FIN_HmrcVatObligationVerifications"(
    tenant_project_ref,legal_entity_id,period_id,connection_id,registration_id,vrn,
    environment,period_key,start_date,end_date,due_date,hmrc_correlation_id,recorded_by
  ) values (p_project_ref,p_entity,p_period,p_connection,v_period.registration_id,
    v_connection.vrn,v_connection.environment,v_key,v_start,v_end,v_due,p_correlation_id,p_actor)
  returning id,observed_at into v_id,v_at;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values ('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_HmrcVatObligationVerifications','hmrc_vat_obligation_verification',v_id,
    'verify_hmrc_vat_obligation','HMRC VAT obligation observed',
    jsonb_build_object('periodId',p_period,'connectionId',p_connection,
      'environment',v_connection.environment,'vrn',v_connection.vrn,
      'periodKey',v_key,'correlationId',p_correlation_id));
  return jsonb_build_object('verificationId',v_id,'periodId',p_period,
    'periodKey',v_key,'due',v_due,'environment',v_connection.environment,
    'observedAt',v_at);
end; $$;
revoke all on function public.multideck_hmrc_vat_record_obligation(uuid,uuid,text,uuid,uuid,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.multideck_hmrc_vat_record_obligation(uuid,uuid,text,uuid,uuid,jsonb,text)
  to service_role;

commit;
