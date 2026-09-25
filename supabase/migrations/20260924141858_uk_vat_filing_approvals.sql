begin;

-- A human's declaration is separate from a review lock and from dispatch.
-- Only a direct-business declaration is supported until agent client-approval
-- evidence and its separate HMRC declaration flow are implemented.
create table public."FIN_IndirectTaxFilingApprovals" (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  review_lock_id uuid not null references public."FIN_IndirectTaxPeriodReviewLocks"(id) on delete restrict,
  obligation_verification_id uuid not null references public."FIN_HmrcVatObligationVerifications"(id) on delete restrict,
  tenant_project_ref text not null check (length(tenant_project_ref) between 4 and 120),
  environment text not null check (environment in ('sandbox','production')),
  registration_id uuid not null references public."FIN_LegalEntityComplianceRegistrations"("FINComplianceReg_ID") on delete restrict,
  vrn char(9) not null check (vrn ~ '^[0-9]{9}$'),
  period_key text not null check (period_key ~ '^(#[A-Za-z0-9]{3}|[A-Za-z0-9]{4})$'),
  lock_fingerprint text not null check (lock_fingerprint ~ '^[a-f0-9]{64}$'),
  filed_boxes jsonb not null check (jsonb_typeof(filed_boxes)='object'),
  declaration_code text not null check (declaration_code='hmrc-vat-business-v1'),
  approval_fingerprint text not null check (approval_fingerprint ~ '^[a-f0-9]{64}$'),
  confirmed_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  confirmed_at timestamptz not null default clock_timestamp()
);
create index "IX_FIN_IndirectTaxFilingApprovals_period"
  on public."FIN_IndirectTaxFilingApprovals"(period_id,confirmed_at desc);
create table public."FIN_IndirectTaxFilingApprovalRevocations" (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null unique references public."FIN_IndirectTaxFilingApprovals"(id) on delete restrict,
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  revoked_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  revoked_at timestamptz not null default clock_timestamp(),
  reason text not null check (length(btrim(reason)) between 10 and 2000)
);
create index "IX_FIN_IndirectTaxFilingApprovalRevocations_period"
  on public."FIN_IndirectTaxFilingApprovalRevocations"(period_id,revoked_at desc);
create trigger indirect_tax_filing_approval_immutable before update or delete
  on public."FIN_IndirectTaxFilingApprovals"
  for each row execute function public._multideck_indirect_tax_immutable();
create trigger indirect_tax_filing_approval_revocation_immutable before update or delete
  on public."FIN_IndirectTaxFilingApprovalRevocations"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxFilingApprovals" enable row level security;
alter table public."FIN_IndirectTaxFilingApprovalRevocations" enable row level security;
revoke all on public."FIN_IndirectTaxFilingApprovals",public."FIN_IndirectTaxFilingApprovalRevocations"
  from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxFilingApprovals",public."FIN_IndirectTaxFilingApprovalRevocations"
  to service_role;

create function public.multideck_uk_vat_confirm_filing_approval(
  p_actor uuid,p_entity uuid,p_project_ref text,p_period uuid,
  p_verification uuid,p_lock_fingerprint text,p_declaration_code text,p_confirmed boolean
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_lock public."FIN_IndirectTaxPeriodReviewLocks"%rowtype;
  v_observation public."FIN_HmrcVatObligationVerifications"%rowtype;
  v_connection public."FIN_HmrcVatConnections"%rowtype;
  v_projection public."FIN_IndirectTaxFilingProjections"%rowtype;
  v_freshness jsonb; v_pack_status text; v_registration_status text;
  v_fingerprint text; v_id uuid; v_at timestamptz;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_project_ref is null or length(p_project_ref) not between 4 and 120
    or p_lock_fingerprint is null or p_lock_fingerprint !~ '^[a-f0-9]{64}$'
    or p_declaration_code is distinct from 'hmrc-vat-business-v1'
    or p_confirmed is distinct from true then
    raise exception 'Confirm the direct-business VAT declaration for the reviewed return.' using errcode='22023';
  end if;
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=p_period and legal_entity_id=p_entity and jurisdiction_code='GB' for update;
  if not found or v_period.status<>'review_locked' or v_period.active_review_lock_id is null then
    raise exception 'A review-locked UK VAT period is required for final declaration.' using errcode='22023';
  end if;
  if exists(select 1 from public."FIN_IndirectTaxFilingApprovals" approval
    where approval.period_id=p_period and not exists(select 1
      from public."FIN_IndirectTaxFilingApprovalRevocations" revocation
      where revocation.approval_id=approval.id)) then
    raise exception 'This VAT period already has an active filing approval.' using errcode='22023';
  end if;
  select * into v_lock from public."FIN_IndirectTaxPeriodReviewLocks"
    where id=v_period.active_review_lock_id and period_id=p_period
      and lock_fingerprint=p_lock_fingerprint;
  if not found then raise exception 'The VAT review lock changed.' using errcode='22023'; end if;
  select * into v_observation from public."FIN_HmrcVatObligationVerifications"
    where id=p_verification and period_id=p_period and legal_entity_id=p_entity
      and tenant_project_ref=p_project_ref and registration_id=v_period.registration_id
      and vrn=(select registration."FINComplianceReg_RegistrationReference"
        from public."FIN_LegalEntityComplianceRegistrations" registration
        where registration."FINComplianceReg_ID"=v_period.registration_id)
      and observed_at>=now()-interval '15 minutes' and observed_at<=now();
  if not found then
    raise exception 'A fresh HMRC obligation for this exact VAT period is required.' using errcode='22023';
  end if;
  select * into v_connection from public."FIN_HmrcVatConnections"
    where id=v_observation.connection_id and tenant_project_ref=p_project_ref
      and legal_entity_id=p_entity and registration_id=v_period.registration_id
      and vrn=v_observation.vrn and environment=v_observation.environment
      and status='connected' and authority_expires_at>now()
      and access_expires_at>now() and refresh_lease_id is null;
  if not found then raise exception 'HMRC VAT authority needs renewal.' using errcode='42501'; end if;
  perform public._multideck_uk_vat_access(v_connection.granted_by_actor_id,p_entity);
  select registration."FINComplianceReg_StatusCode",pack."FINLocPack_ComplianceStatusCode"
    into v_registration_status,v_pack_status
  from public."FIN_LegalEntityComplianceRegistrations" registration
  join public."FIN_ComplianceObligations" obligation
    on obligation."FINCompliance_ID"=registration."FINComplianceReg_ObligationID"
  join public."FIN_LocalisationPacks" pack
    on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
  where registration."FINComplianceReg_ID"=v_period.registration_id
    and registration."FINComplianceReg_LegalEntityID"=p_entity
    and registration."FINComplianceReg_RegistrationReference"=v_observation.vrn
    and registration."FINComplianceReg_SettingsJSON"->>'schemeCode'=v_period.scheme_code
    and registration."FINComplianceReg_EffectiveFrom"<=v_period.start_date
    and (registration."FINComplianceReg_EffectiveTo" is null
      or registration."FINComplianceReg_EffectiveTo">=v_period.end_date)
    and obligation."FINCompliance_ID"=v_period.obligation_id
    and obligation."FINCompliance_Code"='gb-vat-mtd'
    and pack."FINLocPack_CountryCode"='GB';
  if not found or v_registration_status not in ('configured','sandbox_verified','production_verified')
    or (v_observation.environment='production'
      and (v_registration_status<>'production_verified' or v_pack_status<>'production_ready')) then
    raise exception 'The VAT registration or production approval changed.' using errcode='42501';
  end if;
  v_freshness:=public.multideck_uk_vat_review_lock_freshness(p_actor,p_entity,p_period);
  if v_freshness->>'ready'<>'true'
    or v_freshness->>'lockFingerprint'<>p_lock_fingerprint then
    raise exception 'The VAT review lock is stale; reopen and review current evidence.' using errcode='22023';
  end if;
  select * into v_projection from public."FIN_IndirectTaxFilingProjections"
    where id=v_lock.filing_projection_id and period_id=p_period
      and source_digest=v_lock.source_digest
      and control_fingerprint=v_lock.control_fingerprint
      and projection_fingerprint=v_lock.projection_fingerprint;
  if not found or (select count(*) from jsonb_object_keys(v_projection.filed_boxes))<>9 then
    raise exception 'The reviewed VAT filing values changed.' using errcode='22023';
  end if;
  v_fingerprint:=encode(sha256(convert_to(v_lock.id::text||v_observation.id::text||
    v_lock.lock_fingerprint||v_projection.filed_boxes::text||p_declaration_code,'UTF8')),'hex');
  insert into public."FIN_IndirectTaxFilingApprovals"(
    period_id,review_lock_id,obligation_verification_id,tenant_project_ref,environment,
    registration_id,vrn,period_key,lock_fingerprint,filed_boxes,declaration_code,
    approval_fingerprint,confirmed_by
  ) values (p_period,v_lock.id,v_observation.id,p_project_ref,v_observation.environment,
    v_period.registration_id,v_observation.vrn,v_observation.period_key,
    v_lock.lock_fingerprint,v_projection.filed_boxes,p_declaration_code,
    v_fingerprint,p_actor) returning id,confirmed_at into v_id,v_at;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values ('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_IndirectTaxFilingApprovals','indirect_tax_filing_approval',v_id,
    'confirm_vat_filing_approval','UK VAT declaration confirmed',
    jsonb_build_object('periodId',p_period,'reviewLockId',v_lock.id,
      'obligationVerificationId',v_observation.id,'environment',v_observation.environment,
      'approvalFingerprint',v_fingerprint,'declarationCode',p_declaration_code));
  return jsonb_build_object('approvalId',v_id,'periodId',p_period,
    'environment',v_observation.environment,'confirmedAt',v_at,
    'status','approved_for_dispatch_review');
end; $$;
revoke all on function public.multideck_uk_vat_confirm_filing_approval(uuid,uuid,text,uuid,uuid,text,text,boolean)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_confirm_filing_approval(uuid,uuid,text,uuid,uuid,text,text,boolean)
  to service_role;

create function public.multideck_uk_vat_revoke_filing_approval(
  p_actor uuid,p_entity uuid,p_approval uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_approval public."FIN_IndirectTaxFilingApprovals"%rowtype;
  v_id uuid; v_at timestamptz;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_reason is null or length(btrim(p_reason)) not between 10 and 2000 then
    raise exception 'Explain why the VAT filing approval is being revoked.' using errcode='22023';
  end if;
  select approval.* into v_approval from public."FIN_IndirectTaxFilingApprovals" approval
    join public."FIN_IndirectTaxPeriods" period on period.id=approval.period_id
    where approval.id=p_approval and period.legal_entity_id=p_entity
      and period.jurisdiction_code='GB' for update of period;
  if not found or exists(select 1 from public."FIN_IndirectTaxFilingApprovalRevocations"
    where approval_id=p_approval) then
    raise exception 'An active VAT filing approval is required.' using errcode='22023';
  end if;
  insert into public."FIN_IndirectTaxFilingApprovalRevocations"(
    approval_id,period_id,revoked_by,reason
  ) values (p_approval,v_approval.period_id,p_actor,btrim(p_reason))
    returning id,revoked_at into v_id,v_at;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values ('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_IndirectTaxFilingApprovalRevocations','indirect_tax_filing_approval_revocation',v_id,
    'revoke_vat_filing_approval',btrim(p_reason),'UK VAT filing approval revoked',
    jsonb_build_object('periodId',v_approval.period_id,'approvalId',p_approval));
  return jsonb_build_object('revocationId',v_id,'approvalId',p_approval,
    'periodId',v_approval.period_id,'revokedAt',v_at,'status','revoked');
end; $$;
revoke all on function public.multideck_uk_vat_revoke_filing_approval(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_revoke_filing_approval(uuid,uuid,uuid,text)
  to service_role;

-- A direct service-role unlock cannot silently discard a confirmed legal
-- declaration; its revocation must be recorded first.
create function public._multideck_uk_vat_approval_blocks_unlock()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public."FIN_IndirectTaxFilingApprovals" approval
    where approval.period_id=new.period_id and approval.review_lock_id=new.lock_id
      and not exists(select 1 from public."FIN_IndirectTaxFilingApprovalRevocations" revocation
        where revocation.approval_id=approval.id)) then
    raise exception 'Revoke the VAT filing approval before reopening its review lock.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_uk_vat_approval_blocks_unlock() from public,anon,authenticated;
create trigger vat_approval_blocks_review_unlock before insert
  on public."FIN_IndirectTaxPeriodReviewUnlocks"
  for each row execute function public._multideck_uk_vat_approval_blocks_unlock();

commit;
