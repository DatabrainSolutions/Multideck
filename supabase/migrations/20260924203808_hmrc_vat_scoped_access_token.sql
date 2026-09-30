begin;

-- Edge Functions may read an access token only for a named VAT operation and
-- a period in the same physical tenant. Never return refresh tokens, Vault
-- references or the bundle. The caller must still collect valid fraud headers
-- and revalidate the claim before any submission POST.
create function public.multideck_hmrc_vat_access_for_period(
  p_actor uuid,p_entity uuid,p_project_ref text,p_period uuid,
  p_connection uuid,p_purpose text,p_attempt uuid default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,vault as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_connection public."FIN_HmrcVatConnections"%rowtype;
  v_secret text; v_bundle jsonb; v_token text;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_project_ref is null or length(p_project_ref) not between 4 and 120
    or p_purpose is null or p_purpose not in ('obligations','submission','readback')
    or (p_purpose='obligations' and p_attempt is not null)
    or (p_purpose<>'obligations' and p_attempt is null) then
    raise exception 'Choose a scoped HMRC VAT token purpose.' using errcode='22023';
  end if;
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=p_period and legal_entity_id=p_entity and jurisdiction_code='GB';
  if not found then raise exception 'UK VAT period is unavailable.' using errcode='42501'; end if;
  select * into v_connection from public."FIN_HmrcVatConnections"
    where id=p_connection and tenant_project_ref=p_project_ref
      and legal_entity_id=p_entity and registration_id=v_period.registration_id
      and status='connected' and granted_scope='read:vat write:vat'
      and authority_expires_at>now() and access_expires_at>now()+interval '1 minute'
      and refresh_lease_id is null;
  if not found then raise exception 'HMRC VAT authority needs renewal.' using errcode='42501'; end if;
  perform public._multideck_uk_vat_access(v_connection.granted_by_actor_id,p_entity);
  if p_purpose='submission' and not exists (
    select 1 from public."FIN_HmrcVatSubmissionAttempts" attempt
    join public."FIN_IndirectTaxFilingApprovals" approval on approval.id=attempt.approval_id
    where attempt.id=p_attempt and attempt.period_id=p_period
      and attempt.tenant_project_ref=p_project_ref
      and attempt.registration_id=v_connection.registration_id
      and attempt.vrn=v_connection.vrn and attempt.environment=v_connection.environment
      and attempt.status='reserved' and v_period.status='review_locked'
      and v_period.active_review_lock_id=approval.review_lock_id
      and not exists(select 1 from public."FIN_IndirectTaxFilingApprovalRevocations" revocation
        where revocation.approval_id=approval.id)
  ) then
    raise exception 'A current reserved VAT submission is required.' using errcode='22023';
  end if;
  if p_purpose='readback' and not exists (
    select 1 from public."FIN_HmrcVatSubmissionAttempts" attempt
    where attempt.id=p_attempt and attempt.period_id=p_period
      and attempt.tenant_project_ref=p_project_ref
      and attempt.registration_id=v_connection.registration_id
      and attempt.vrn=v_connection.vrn and attempt.environment=v_connection.environment
      and attempt.status in ('dispatching','reconciliation_required')
  ) then
    raise exception 'A claimed unresolved VAT submission is required.' using errcode='22023';
  end if;
  select secret.decrypted_secret into v_secret from vault.decrypted_secrets secret
    where secret.id=substring(v_connection.token_secret_ref from 16)::uuid;
  if v_secret is null then raise exception 'HMRC VAT access authority is unavailable.' using errcode='42501'; end if;
  begin v_bundle:=v_secret::jsonb;
  exception when invalid_text_representation then
    raise exception 'HMRC VAT access authority is unavailable.' using errcode='42501';
  end;
  v_token:=v_bundle->>'access_token';
  if v_bundle->>'token_type'<>'bearer' or v_token is null
    or length(v_token) not between 10 and 8000
    or v_token !~ '^[!-~]+$' or v_token ~ '[[:space:]]' then
    raise exception 'HMRC VAT access authority is unavailable.' using errcode='42501';
  end if;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values ('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_HmrcVatConnections','hmrc_vat_connection',p_connection,
    'read_hmrc_vat_access_token','HMRC VAT access used',
    jsonb_build_object('periodId',p_period,'purpose',p_purpose,'attemptId',p_attempt,
      'environment',v_connection.environment));
  return jsonb_build_object('accessToken',v_token,'environment',v_connection.environment,
    'vrn',v_connection.vrn,'connectionId',p_connection,'periodId',p_period,
    'accessExpiresAt',v_connection.access_expires_at);
end; $$;
revoke all on function public.multideck_hmrc_vat_access_for_period(uuid,uuid,text,uuid,uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_hmrc_vat_access_for_period(uuid,uuid,text,uuid,uuid,text,uuid)
  to service_role;

commit;
