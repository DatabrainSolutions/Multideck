begin;

-- A production VAT period ends on a UK civil date, independent of the
-- connection pool or worker session time zone.

-- The application must persist dispatching before sending a return. A lost
-- response therefore cannot cause a second POST with the same declaration.
create table public."FIN_HmrcVatSubmissionAttempts" (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  approval_id uuid not null unique references public."FIN_IndirectTaxFilingApprovals"(id) on delete restrict,
  tenant_project_ref text not null,
  environment text not null check (environment in ('sandbox','production')),
  registration_id uuid not null references public."FIN_LegalEntityComplianceRegistrations"("FINComplianceReg_ID") on delete restrict,
  vrn char(9) not null check (vrn ~ '^[0-9]{9}$'),
  period_key text not null,
  payload_body text not null check (length(payload_body) between 100 and 2000),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'reserved' check (status in ('reserved','dispatching','cancelled')),
  reserved_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  reserved_at timestamptz not null default clock_timestamp(),
  dispatching_at timestamptz,
  cancelled_at timestamptz,
  constraint vat_attempt_status_times check (
    (status='reserved' and dispatching_at is null and cancelled_at is null)
    or (status='dispatching' and dispatching_at is not null and cancelled_at is null)
    or (status='cancelled' and dispatching_at is null and cancelled_at is not null))
);
create unique index "UX_FIN_HmrcVatSubmissionAttempts_blocking_period"
  on public."FIN_HmrcVatSubmissionAttempts"(period_id) where status in ('reserved','dispatching');
create index "IX_FIN_HmrcVatSubmissionAttempts_period"
  on public."FIN_HmrcVatSubmissionAttempts"(period_id,reserved_at desc);
alter table public."FIN_HmrcVatSubmissionAttempts" enable row level security;
revoke all on public."FIN_HmrcVatSubmissionAttempts" from public,anon,authenticated,service_role;
grant select on public."FIN_HmrcVatSubmissionAttempts" to service_role;

create function public.multideck_uk_vat_reserve_submission(
  p_actor uuid,p_entity uuid,p_project_ref text,p_approval uuid,p_payload_body text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_approval public."FIN_IndirectTaxFilingApprovals"%rowtype;
  v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_connection public."FIN_HmrcVatConnections"%rowtype;
  v_expected jsonb; v_payload jsonb; v_freshness jsonb;
  v_id uuid; v_at timestamptz; v_hash text;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_project_ref is null or length(p_project_ref) not between 4 and 120
    or p_payload_body is null or length(p_payload_body) not between 100 and 2000 then
    raise exception 'The tenant and exact approved VAT return body are required.' using errcode='22023';
  end if;
  select approval.* into v_approval from public."FIN_IndirectTaxFilingApprovals" approval
    join public."FIN_IndirectTaxPeriods" period on period.id=approval.period_id
    where approval.id=p_approval and period.legal_entity_id=p_entity
      and period.jurisdiction_code='GB' for update of period;
  if not found or v_approval.tenant_project_ref<>p_project_ref
    or exists(select 1 from public."FIN_IndirectTaxFilingApprovalRevocations"
      where approval_id=p_approval) then
    raise exception 'An active VAT approval for this tenant is required.' using errcode='22023';
  end if;
  select * into v_period from public."FIN_IndirectTaxPeriods" where id=v_approval.period_id;
  if v_period.status<>'review_locked' or v_period.active_review_lock_id<>v_approval.review_lock_id
    or (v_approval.environment='production' and v_period.end_date>=(now() at time zone 'Europe/London')::date) then
    raise exception 'This VAT period is not ready for HMRC dispatch.' using errcode='22023';
  end if;
  if exists(select 1 from public."FIN_HmrcVatSubmissionAttempts"
    where period_id=v_period.id and status in ('reserved','dispatching'))
    or exists(select 1 from public."FIN_HmrcVatSubmissionAttempts"
      where approval_id=p_approval) then
    raise exception 'This VAT return already has a submission attempt.' using errcode='22023';
  end if;
  if not exists(select 1 from public."FIN_HmrcVatObligationVerifications" observation
    where observation.id=v_approval.obligation_verification_id
      and observation.period_id=v_period.id and observation.tenant_project_ref=p_project_ref
      and observation.registration_id=v_approval.registration_id
      and observation.vrn=v_approval.vrn and observation.period_key=v_approval.period_key
      and observation.environment=v_approval.environment
      and observation.observed_at between now()-interval '15 minutes' and now()) then
    raise exception 'Refresh the exact HMRC obligation before dispatch.' using errcode='22023';
  end if;
  select connection.* into v_connection from public."FIN_HmrcVatConnections" connection
    join public."FIN_HmrcVatObligationVerifications" observation
      on observation.connection_id=connection.id
    where observation.id=v_approval.obligation_verification_id
      and connection.tenant_project_ref=p_project_ref
      and connection.legal_entity_id=p_entity
      and connection.registration_id=v_approval.registration_id
      and connection.vrn=v_approval.vrn and connection.environment=v_approval.environment
      and connection.status='connected' and connection.authority_expires_at>now()
      and connection.access_expires_at>now() and connection.refresh_lease_id is null;
  if not found then raise exception 'HMRC VAT authority needs renewal.' using errcode='42501'; end if;
  perform public._multideck_uk_vat_access(v_connection.granted_by_actor_id,p_entity);
  v_freshness:=public.multideck_uk_vat_review_lock_freshness(p_actor,p_entity,v_period.id);
  if v_freshness->>'ready'<>'true'
    or v_freshness->>'lockFingerprint'<>v_approval.lock_fingerprint then
    raise exception 'The VAT review lock is stale.' using errcode='22023';
  end if;
  if v_approval.environment='production' and not exists(
    select 1 from public."FIN_LegalEntityComplianceRegistrations" registration
    join public."FIN_ComplianceObligations" obligation
      on obligation."FINCompliance_ID"=registration."FINComplianceReg_ObligationID"
    join public."FIN_LocalisationPacks" pack
      on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
    where registration."FINComplianceReg_ID"=v_approval.registration_id
      and registration."FINComplianceReg_LegalEntityID"=p_entity
      and registration."FINComplianceReg_RegistrationReference"=v_approval.vrn
      and registration."FINComplianceReg_StatusCode"='production_verified'
      and registration."FINComplianceReg_SettingsJSON"->>'schemeCode'=v_period.scheme_code
      and pack."FINLocPack_ComplianceStatusCode"='production_ready') then
    raise exception 'UK VAT production filing is not approved.' using errcode='42501';
  end if;
  -- JSONB equality checks every number and exact key set; the original wire
  -- bytes are retained for the later sender and independently SHA-256 hashed.
  v_expected:=jsonb_build_object(
    'periodKey',v_approval.period_key,
    'vatDueSales',v_approval.filed_boxes->'1',
    'vatDueAcquisitions',v_approval.filed_boxes->'2',
    'totalVatDue',v_approval.filed_boxes->'3',
    'vatReclaimedCurrPeriod',v_approval.filed_boxes->'4',
    'netVatDue',v_approval.filed_boxes->'5',
    'totalValueSalesExVAT',v_approval.filed_boxes->'6',
    'totalValuePurchasesExVAT',v_approval.filed_boxes->'7',
    'totalValueGoodsSuppliedExVAT',v_approval.filed_boxes->'8',
    'totalAcquisitionsExVAT',v_approval.filed_boxes->'9',
    'finalised',true);
  begin v_payload:=p_payload_body::jsonb;
  exception when invalid_text_representation then
    raise exception 'The HMRC VAT return body must be valid JSON.' using errcode='22023';
  end;
  if v_payload<>v_expected then
    raise exception 'The HMRC VAT return body differs from the approved boxes.' using errcode='22023';
  end if;
  v_hash:=encode(sha256(convert_to(p_payload_body,'UTF8')),'hex');
  insert into public."FIN_HmrcVatSubmissionAttempts"(
    period_id,approval_id,tenant_project_ref,environment,registration_id,vrn,
    period_key,payload_body,payload_sha256,reserved_by
  ) values (v_period.id,p_approval,p_project_ref,v_approval.environment,
    v_approval.registration_id,v_approval.vrn,v_approval.period_key,
    p_payload_body,v_hash,p_actor) returning id,reserved_at into v_id,v_at;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values ('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_HmrcVatSubmissionAttempts','hmrc_vat_submission_attempt',v_id,
    'reserve_hmrc_vat_submission','HMRC VAT submission reserved',
    jsonb_build_object('periodId',v_period.id,'approvalId',p_approval,
      'environment',v_approval.environment,'payloadSha256',v_hash));
  return jsonb_build_object('attemptId',v_id,'periodId',v_period.id,
    'reservedAt',v_at,'payloadSha256',v_hash,'status','reserved');
end; $$;
revoke all on function public.multideck_uk_vat_reserve_submission(uuid,uuid,text,uuid,text)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_reserve_submission(uuid,uuid,text,uuid,text)
  to service_role;

create function public.multideck_uk_vat_claim_submission_dispatch(
  p_actor uuid,p_entity uuid,p_project_ref text,p_attempt uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_attempt public."FIN_HmrcVatSubmissionAttempts"%rowtype;
  v_approval public."FIN_IndirectTaxFilingApprovals"%rowtype;
  v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_connection public."FIN_HmrcVatConnections"%rowtype;
  v_freshness jsonb; v_at timestamptz;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  select attempt.* into v_attempt from public."FIN_HmrcVatSubmissionAttempts" attempt
    join public."FIN_IndirectTaxPeriods" period on period.id=attempt.period_id
    where attempt.id=p_attempt and period.legal_entity_id=p_entity
      and attempt.tenant_project_ref=p_project_ref for update of attempt;
  if not found or v_attempt.status<>'reserved' then
    raise exception 'Only an unclaimed VAT submission reservation can be dispatched.' using errcode='22023';
  end if;
  select * into v_approval from public."FIN_IndirectTaxFilingApprovals"
    where id=v_attempt.approval_id;
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=v_attempt.period_id for update;
  if v_period.status<>'review_locked'
    or v_period.active_review_lock_id<>v_approval.review_lock_id
    or exists(select 1 from public."FIN_IndirectTaxFilingApprovalRevocations"
      where approval_id=v_attempt.approval_id)
    or (v_attempt.environment='production' and v_period.end_date>=(now() at time zone 'Europe/London')::date) then
    raise exception 'The approved VAT review is no longer ready for dispatch.' using errcode='22023';
  end if;
  if not exists(select 1 from public."FIN_HmrcVatObligationVerifications" observation
    where observation.id=v_approval.obligation_verification_id
      and observation.period_id=v_period.id and observation.tenant_project_ref=p_project_ref
      and observation.registration_id=v_attempt.registration_id
      and observation.vrn=v_attempt.vrn and observation.period_key=v_attempt.period_key
      and observation.environment=v_attempt.environment
      and observation.observed_at between now()-interval '15 minutes' and now()) then
    raise exception 'Refresh the exact HMRC obligation before dispatch.' using errcode='22023';
  end if;
  select connection.* into v_connection from public."FIN_HmrcVatConnections" connection
    join public."FIN_HmrcVatObligationVerifications" observation
      on observation.connection_id=connection.id
    where observation.id=v_approval.obligation_verification_id
      and connection.tenant_project_ref=p_project_ref and connection.legal_entity_id=p_entity
      and connection.registration_id=v_attempt.registration_id
      and connection.vrn=v_attempt.vrn and connection.environment=v_attempt.environment
      and connection.status='connected' and connection.authority_expires_at>now()
      and connection.access_expires_at>now() and connection.refresh_lease_id is null;
  if not found then raise exception 'HMRC VAT authority needs renewal.' using errcode='42501'; end if;
  perform public._multideck_uk_vat_access(v_connection.granted_by_actor_id,p_entity);
  v_freshness:=public.multideck_uk_vat_review_lock_freshness(p_actor,p_entity,v_period.id);
  if v_freshness->>'ready'<>'true'
    or v_freshness->>'lockFingerprint'<>v_approval.lock_fingerprint then
    raise exception 'The VAT review lock is stale.' using errcode='22023';
  end if;
  -- The irreversible transition is committed by the caller before any POST.
  if v_attempt.environment='production' and not exists(
    select 1 from public."FIN_LegalEntityComplianceRegistrations" registration
    join public."FIN_ComplianceObligations" obligation
      on obligation."FINCompliance_ID"=registration."FINComplianceReg_ObligationID"
    join public."FIN_LocalisationPacks" pack
      on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
    where registration."FINComplianceReg_ID"=v_attempt.registration_id
      and registration."FINComplianceReg_LegalEntityID"=p_entity
      and registration."FINComplianceReg_RegistrationReference"=v_attempt.vrn
      and registration."FINComplianceReg_StatusCode"='production_verified'
      and registration."FINComplianceReg_SettingsJSON"->>'schemeCode'=v_period.scheme_code
      and pack."FINLocPack_ComplianceStatusCode"='production_ready') then
    raise exception 'UK VAT production filing is not approved.' using errcode='42501';
  end if;
  -- If the caller loses this response, it must reconcile with HMRC, never retry.
  update public."FIN_HmrcVatSubmissionAttempts" set status='dispatching',
    dispatching_at=clock_timestamp() where id=p_attempt returning dispatching_at into v_at;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values ('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_HmrcVatSubmissionAttempts','hmrc_vat_submission_attempt',p_attempt,
    'claim_hmrc_vat_dispatch','HMRC VAT dispatch claimed',
    jsonb_build_object('periodId',v_attempt.period_id,'approvalId',v_attempt.approval_id,
      'payloadSha256',v_attempt.payload_sha256));
  return jsonb_build_object('attemptId',p_attempt,'status','dispatching',
    'dispatchingAt',v_at,'payloadBody',v_attempt.payload_body,
    'payloadSha256',v_attempt.payload_sha256);
end; $$;
revoke all on function public.multideck_uk_vat_claim_submission_dispatch(uuid,uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_claim_submission_dispatch(uuid,uuid,text,uuid)
  to service_role;

create function public.multideck_uk_vat_cancel_submission_reservation(
  p_actor uuid,p_entity uuid,p_project_ref text,p_attempt uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_attempt public."FIN_HmrcVatSubmissionAttempts"%rowtype;
  v_at timestamptz;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_reason is null or length(btrim(p_reason)) not between 10 and 2000 then
    raise exception 'Explain why this unsent VAT reservation is cancelled.' using errcode='22023';
  end if;
  select attempt.* into v_attempt from public."FIN_HmrcVatSubmissionAttempts" attempt
    join public."FIN_IndirectTaxPeriods" period on period.id=attempt.period_id
    where attempt.id=p_attempt and period.legal_entity_id=p_entity
      and attempt.tenant_project_ref=p_project_ref for update of attempt;
  if not found or v_attempt.status<>'reserved' then
    raise exception 'A claimed VAT dispatch cannot be cancelled as unsent.' using errcode='22023';
  end if;
  update public."FIN_HmrcVatSubmissionAttempts" set status='cancelled',
    cancelled_at=clock_timestamp() where id=p_attempt returning cancelled_at into v_at;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values ('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_HmrcVatSubmissionAttempts','hmrc_vat_submission_attempt',p_attempt,
    'cancel_hmrc_vat_reservation',btrim(p_reason),'Unsent HMRC VAT reservation cancelled',
    jsonb_build_object('periodId',v_attempt.period_id,'approvalId',v_attempt.approval_id));
  return jsonb_build_object('attemptId',p_attempt,'status','cancelled','cancelledAt',v_at);
end; $$;
revoke all on function public.multideck_uk_vat_cancel_submission_reservation(uuid,uuid,text,uuid,text)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cancel_submission_reservation(uuid,uuid,text,uuid,text)
  to service_role;

-- Direct table writes to the older evidence tables must obey the same boundary.
create function public._multideck_uk_vat_attempt_blocks_change()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare v_period uuid;
begin
  v_period:=new.period_id;
  if exists(select 1 from public."FIN_HmrcVatSubmissionAttempts" attempt
    where attempt.period_id=v_period and attempt.status in ('reserved','dispatching')) then
    raise exception 'Resolve the HMRC VAT submission attempt before changing this declaration.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_uk_vat_attempt_blocks_change() from public,anon,authenticated;
create trigger vat_attempt_blocks_approval_revocation before insert
  on public."FIN_IndirectTaxFilingApprovalRevocations"
  for each row execute function public._multideck_uk_vat_attempt_blocks_change();
create trigger vat_attempt_blocks_review_unlock before insert
  on public."FIN_IndirectTaxPeriodReviewUnlocks"
  for each row execute function public._multideck_uk_vat_attempt_blocks_change();

commit;
