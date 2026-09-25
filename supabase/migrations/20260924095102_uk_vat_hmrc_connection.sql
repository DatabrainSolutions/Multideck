begin;

-- Registration validity uses the UK civil date explicitly. Keep function
-- session time zones unchanged: VAT evidence fingerprints may serialize times.

-- HMRC authorisation is per tenant project, legal entity, registration,
-- environment and granting Multideck actor. Tokens and PKCE verifiers live in
-- the tenant Vault. The browser never receives either one.
create table public."FIN_HmrcVatOAuthStates" (
  id uuid primary key default gen_random_uuid(),
  tenant_project_ref text not null check (length(tenant_project_ref) between 4 and 120),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  registration_id uuid not null references public."FIN_LegalEntityComplianceRegistrations"("FINComplianceReg_ID") on delete restrict,
  vrn char(9) not null check (vrn ~ '^[0-9]{9}$'),
  environment text not null check (environment in ('sandbox','production')),
  actor_id uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  auth_user_id uuid not null,
  state_hash text not null unique check (state_hash ~ '^[a-f0-9]{64}$'),
  pkce_secret_ref text not null check (pkce_secret_ref ~ '^supabase-vault:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  redirect_uri text not null check (redirect_uri ~ '^https://[^#[:space:]]+$'),
  scope text not null default 'read:vat write:vat' check (scope='read:vat write:vat'),
  status text not null default 'pending' check (status in ('pending','claimed','completed','denied')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '10 minutes'),
  claimed_at timestamptz,
  completed_at timestamptz,
  check (expires_at>created_at and expires_at<=created_at+interval '10 minutes'),
  check ((status='pending' and claimed_at is null and completed_at is null)
    or (status='claimed' and claimed_at is not null and completed_at is null)
    or (status='completed' and claimed_at is not null and completed_at is not null)
    or (status='denied' and completed_at is not null))
);
create index "IX_FIN_HmrcVatOAuthStates_expiry" on public."FIN_HmrcVatOAuthStates"(expires_at)
  where status in ('pending','claimed');

create table public."FIN_HmrcVatConnections" (
  id uuid primary key default gen_random_uuid(),
  tenant_project_ref text not null check (length(tenant_project_ref) between 4 and 120),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  registration_id uuid not null references public."FIN_LegalEntityComplianceRegistrations"("FINComplianceReg_ID") on delete restrict,
  vrn char(9) not null check (vrn ~ '^[0-9]{9}$'),
  environment text not null check (environment in ('sandbox','production')),
  granted_by_actor_id uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  token_secret_ref text check (token_secret_ref ~ '^supabase-vault:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  granted_scope text not null check (granted_scope='read:vat write:vat'),
  status text not null check (status in ('connected','reauthorisation_required','disconnected')),
  authorised_at timestamptz not null,
  authority_expires_at timestamptz not null,
  access_expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  last_error_code text,
  refresh_lease_id uuid,
  refresh_lease_expires_at timestamptz,
  refresh_revision integer not null default 0 check (refresh_revision >= 0),
  unique (tenant_project_ref,legal_entity_id,registration_id,environment,granted_by_actor_id),
  check (authority_expires_at>authorised_at and access_expires_at>authorised_at),
  check (status<>'connected' or token_secret_ref is not null),
  check ((refresh_lease_id is null)=(refresh_lease_expires_at is null))
);
create index "IX_FIN_HmrcVatConnections_entity" on public."FIN_HmrcVatConnections"(legal_entity_id,environment,status);

alter table public."FIN_HmrcVatOAuthStates" enable row level security;
alter table public."FIN_HmrcVatConnections" enable row level security;
revoke all on public."FIN_HmrcVatOAuthStates",public."FIN_HmrcVatConnections" from public,anon,authenticated;
-- OAuth state and token references change only through the guarded functions.
-- A service-role table update could otherwise forge consent, grantor or lease.
grant select on public."FIN_HmrcVatOAuthStates",public."FIN_HmrcVatConnections" to service_role;

-- The caller supplies a random state hash and a PKCE verifier, never a
-- Government Gateway password. Vault creation and state insert are atomic.
create function public.multideck_hmrc_vat_begin(
  p_actor uuid,p_auth_user uuid,p_entity uuid,p_project_ref text,p_environment text,
  p_state_hash text,p_pkce_verifier text,p_redirect_uri text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,vault as $$
declare v_registration public."FIN_LegalEntityComplianceRegistrations"%rowtype;
  v_pack_status text; v_matches integer; v_secret uuid; v_state uuid;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if not exists(select 1 from public."cmp_Users" actor
    where actor."User_ID"=p_actor and actor."Auth_User_ID"=p_auth_user) then
    raise exception 'The HMRC grantor does not match the signed-in tenant account.' using errcode='42501';
  end if;
  if p_auth_user is null or p_project_ref is null or length(p_project_ref) not between 4 and 120
    or p_environment not in ('sandbox','production')
    or p_state_hash !~ '^[a-f0-9]{64}$'
    or p_pkce_verifier !~ '^[A-Za-z0-9._~-]{43,128}$'
    or p_redirect_uri !~ '^https://[^#[:space:]]+$' then
    raise exception 'HMRC VAT connection setup is invalid.' using errcode='22023';
  end if;
  select count(*) into v_matches
  from public."FIN_LegalEntityComplianceRegistrations" registration
  join public."FIN_ComplianceObligations" obligation on obligation."FINCompliance_ID"=registration."FINComplianceReg_ObligationID"
  join public."FIN_LocalisationPacks" pack on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
  where registration."FINComplianceReg_LegalEntityID"=p_entity
    and obligation."FINCompliance_Code"='gb-vat-mtd' and pack."FINLocPack_CountryCode"='GB'
    and registration."FINComplianceReg_StatusCode" in ('configured','sandbox_verified','production_verified')
    and registration."FINComplianceReg_RegistrationReference" ~ '^[0-9]{9}$'
    and registration."FINComplianceReg_SettingsJSON"->>'schemeCode' in ('standard','annual')
    and registration."FINComplianceReg_EffectiveFrom"<=(now() at time zone 'Europe/London')::date
    and (registration."FINComplianceReg_EffectiveTo" is null or registration."FINComplianceReg_EffectiveTo">=(now() at time zone 'Europe/London')::date);
  if v_matches<>1 then
    raise exception 'Choose one currently effective UK VAT registration before connecting HMRC.' using errcode='22023';
  end if;
  select registration.* into v_registration
  from public."FIN_LegalEntityComplianceRegistrations" registration
  join public."FIN_ComplianceObligations" obligation on obligation."FINCompliance_ID"=registration."FINComplianceReg_ObligationID"
  join public."FIN_LocalisationPacks" pack on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
  where registration."FINComplianceReg_LegalEntityID"=p_entity
    and obligation."FINCompliance_Code"='gb-vat-mtd' and pack."FINLocPack_CountryCode"='GB'
    and registration."FINComplianceReg_StatusCode" in ('configured','sandbox_verified','production_verified')
    and registration."FINComplianceReg_RegistrationReference" ~ '^[0-9]{9}$'
    and registration."FINComplianceReg_SettingsJSON"->>'schemeCode' in ('standard','annual')
    and registration."FINComplianceReg_EffectiveFrom"<=(now() at time zone 'Europe/London')::date
    and (registration."FINComplianceReg_EffectiveTo" is null or registration."FINComplianceReg_EffectiveTo">=(now() at time zone 'Europe/London')::date);
  select pack."FINLocPack_ComplianceStatusCode" into v_pack_status
  from public."FIN_ComplianceObligations" obligation
  join public."FIN_LocalisationPacks" pack on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
  where obligation."FINCompliance_ID"=v_registration."FINComplianceReg_ObligationID";
  if p_environment='production' and (v_registration."FINComplianceReg_StatusCode"<>'production_verified'
    or v_pack_status<>'production_ready') then
    raise exception 'HMRC production access is not approved for this VAT registration.' using errcode='42501';
  end if;
  select vault.create_secret(p_pkce_verifier,'hmrc-vat-pkce-'||gen_random_uuid()::text,
    'Multideck HMRC VAT OAuth PKCE verifier') into v_secret;
  if v_secret is null then raise exception 'Tenant Vault could not secure HMRC connection state.' using errcode='55000'; end if;
  insert into public."FIN_HmrcVatOAuthStates"(
    tenant_project_ref,legal_entity_id,registration_id,vrn,environment,actor_id,auth_user_id,
    state_hash,pkce_secret_ref,redirect_uri
  ) values (p_project_ref,p_entity,v_registration."FINComplianceReg_ID",
    v_registration."FINComplianceReg_RegistrationReference",p_environment,p_actor,p_auth_user,
    p_state_hash,'supabase-vault:'||v_secret::text,p_redirect_uri) returning id into v_state;
  return jsonb_build_object('stateId',v_state,'environment',p_environment,'vrn',v_registration."FINComplianceReg_RegistrationReference");
end; $$;
revoke all on function public.multideck_hmrc_vat_begin(uuid,uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.multideck_hmrc_vat_begin(uuid,uuid,uuid,text,text,text,text,text) to service_role;

-- Claim exactly once before exchanging HMRC's single-use authorisation code.
-- The grantor and registration are rechecked after the user returns from HMRC.
create function public.multideck_hmrc_vat_claim(p_state_hash text,p_project_ref text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,vault as $$
declare v_state public."FIN_HmrcVatOAuthStates"%rowtype; v_verifier text;
begin
  select * into v_state from public."FIN_HmrcVatOAuthStates"
    where state_hash=p_state_hash and tenant_project_ref=p_project_ref for update;
  if not found or v_state.status<>'pending' or v_state.expires_at<=now() then
    raise exception 'HMRC connection state is invalid or expired.' using errcode='22023';
  end if;
  perform public._multideck_uk_vat_access(v_state.actor_id,v_state.legal_entity_id);
  if not exists(select 1 from public."cmp_Users" actor
    where actor."User_ID"=v_state.actor_id and actor."Auth_User_ID"=v_state.auth_user_id) then
    raise exception 'The HMRC grantor account changed during authorisation.' using errcode='42501';
  end if;
  if not exists(select 1 from public."FIN_LegalEntityComplianceRegistrations" registration
    join public."FIN_ComplianceObligations" obligation on obligation."FINCompliance_ID"=registration."FINComplianceReg_ObligationID"
    join public."FIN_LocalisationPacks" pack on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
    where registration."FINComplianceReg_ID"=v_state.registration_id
      and registration."FINComplianceReg_LegalEntityID"=v_state.legal_entity_id
      and registration."FINComplianceReg_RegistrationReference"=v_state.vrn
      and registration."FINComplianceReg_StatusCode" in ('configured','sandbox_verified','production_verified')
      and registration."FINComplianceReg_SettingsJSON"->>'schemeCode' in ('standard','annual')
      and obligation."FINCompliance_Code"='gb-vat-mtd' and pack."FINLocPack_CountryCode"='GB'
      and (v_state.environment<>'production' or
        (registration."FINComplianceReg_StatusCode"='production_verified'
          and pack."FINLocPack_ComplianceStatusCode"='production_ready'))
      and registration."FINComplianceReg_EffectiveFrom"<=(now() at time zone 'Europe/London')::date
      and (registration."FINComplianceReg_EffectiveTo" is null or registration."FINComplianceReg_EffectiveTo">=(now() at time zone 'Europe/London')::date)) then
    raise exception 'The VAT registration changed during HMRC authorisation.' using errcode='22023';
  end if;
  select secret.decrypted_secret into v_verifier from vault.decrypted_secrets secret
    where secret.id=substring(v_state.pkce_secret_ref from 16)::uuid;
  if v_verifier is null then raise exception 'HMRC connection verifier is missing.' using errcode='55000'; end if;
  update public."FIN_HmrcVatOAuthStates" set status='claimed',claimed_at=now() where id=v_state.id;
  return jsonb_build_object('stateId',v_state.id,'legalEntityId',v_state.legal_entity_id,
    'registrationId',v_state.registration_id,'vrn',v_state.vrn,'environment',v_state.environment,
    'redirectUri',v_state.redirect_uri,'codeVerifier',v_verifier,'actorId',v_state.actor_id);
end; $$;
revoke all on function public.multideck_hmrc_vat_claim(text,text) from public,anon,authenticated;
grant execute on function public.multideck_hmrc_vat_claim(text,text) to service_role;

create function public.multideck_hmrc_vat_deny(p_state_hash text,p_project_ref text)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,vault as $$
declare v_state public."FIN_HmrcVatOAuthStates"%rowtype;
begin
  select * into v_state from public."FIN_HmrcVatOAuthStates"
    where state_hash=p_state_hash and tenant_project_ref=p_project_ref for update;
  if not found or v_state.status not in ('pending','claimed') then return false; end if;
  update public."FIN_HmrcVatOAuthStates" set status='denied',completed_at=now() where id=v_state.id;
  delete from vault.secrets where id=substring(v_state.pkce_secret_ref from 16)::uuid;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values ('finance_lifecycle',v_state.actor_id,v_state.legal_entity_id,'multideck-app','finance','public',
    'FIN_HmrcVatOAuthStates','hmrc_vat_oauth_state',v_state.id,'hmrc_vat_consent_not_completed',
    'HMRC VAT authority was not connected',jsonb_build_object('environment',v_state.environment,
      'vrn',v_state.vrn));
  return true;
end; $$;
revoke all on function public.multideck_hmrc_vat_deny(text,text) from public,anon,authenticated;
grant execute on function public.multideck_hmrc_vat_deny(text,text) to service_role;

-- Save HMRC tokens only in the tenant Vault, in the same database transaction
-- that creates or rotates the connection reference. No token is returned.
create function public.multideck_hmrc_vat_complete(
  p_state_id uuid,p_project_ref text,p_token_bundle jsonb,p_expires_in integer,p_scope text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,vault as $$
declare v_state public."FIN_HmrcVatOAuthStates"%rowtype;
  v_existing public."FIN_HmrcVatConnections"%rowtype;
  v_secret uuid; v_connection uuid; v_authorised timestamptz:=now();
begin
  select * into v_state from public."FIN_HmrcVatOAuthStates"
    where id=p_state_id and tenant_project_ref=p_project_ref for update;
  if not found or v_state.status<>'claimed' or v_state.claimed_at<now()-interval '10 minutes' then
    raise exception 'HMRC connection claim has expired or was already used.' using errcode='22023';
  end if;
  perform public._multideck_uk_vat_access(v_state.actor_id,v_state.legal_entity_id);
  if not exists(select 1 from public."cmp_Users" actor
    where actor."User_ID"=v_state.actor_id and actor."Auth_User_ID"=v_state.auth_user_id) then
    raise exception 'The HMRC grantor account changed during authorisation.' using errcode='42501';
  end if;
  if not exists(select 1 from public."FIN_LegalEntityComplianceRegistrations" registration
    join public."FIN_ComplianceObligations" obligation on obligation."FINCompliance_ID"=registration."FINComplianceReg_ObligationID"
    join public."FIN_LocalisationPacks" pack on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
    where registration."FINComplianceReg_ID"=v_state.registration_id
      and registration."FINComplianceReg_LegalEntityID"=v_state.legal_entity_id
      and registration."FINComplianceReg_RegistrationReference"=v_state.vrn
      and registration."FINComplianceReg_StatusCode" in ('configured','sandbox_verified','production_verified')
      and registration."FINComplianceReg_SettingsJSON"->>'schemeCode' in ('standard','annual')
      and obligation."FINCompliance_Code"='gb-vat-mtd' and pack."FINLocPack_CountryCode"='GB'
      and (v_state.environment<>'production' or
        (registration."FINComplianceReg_StatusCode"='production_verified'
          and pack."FINLocPack_ComplianceStatusCode"='production_ready'))
      and registration."FINComplianceReg_EffectiveFrom"<=(now() at time zone 'Europe/London')::date
      and (registration."FINComplianceReg_EffectiveTo" is null or registration."FINComplianceReg_EffectiveTo">=(now() at time zone 'Europe/London')::date)) then
    raise exception 'The UK VAT registration changed during HMRC consent.' using errcode='22023';
  end if;
  if p_token_bundle is null or jsonb_typeof(p_token_bundle)<>'object'
    or length(coalesce(p_token_bundle->>'access_token','')) not between 10 and 8000
    or length(coalesce(p_token_bundle->>'refresh_token','')) not between 10 and 8000
    or lower(coalesce(p_token_bundle->>'token_type',''))<>'bearer'
    or p_expires_in is null or p_expires_in not between 1 and 14400
    or p_scope<>'read:vat write:vat' then
    raise exception 'HMRC did not return a valid renewable VAT authority.' using errcode='22023';
  end if;
  select * into v_existing from public."FIN_HmrcVatConnections"
    where tenant_project_ref=p_project_ref and legal_entity_id=v_state.legal_entity_id
      and registration_id=v_state.registration_id and environment=v_state.environment
      and granted_by_actor_id=v_state.actor_id for update;
  select vault.create_secret(p_token_bundle::text,'hmrc-vat-token-'||gen_random_uuid()::text,
    'Multideck tenant HMRC VAT authorisation token') into v_secret;
  if v_secret is null then raise exception 'Tenant Vault could not secure HMRC authority.' using errcode='55000'; end if;
  if v_existing.id is null then
    insert into public."FIN_HmrcVatConnections"(
      tenant_project_ref,legal_entity_id,registration_id,vrn,environment,granted_by_actor_id,
      token_secret_ref,granted_scope,status,authorised_at,authority_expires_at,access_expires_at
    ) values (p_project_ref,v_state.legal_entity_id,v_state.registration_id,v_state.vrn,v_state.environment,
      v_state.actor_id,'supabase-vault:'||v_secret::text,p_scope,'connected',v_authorised,
      v_authorised+interval '18 months',v_authorised+(p_expires_in||' seconds')::interval)
    returning id into v_connection;
  else
    update public."FIN_HmrcVatConnections" set vrn=v_state.vrn,
      token_secret_ref='supabase-vault:'||v_secret::text,granted_scope=p_scope,status='connected',
      authorised_at=v_authorised,authority_expires_at=v_authorised+interval '18 months',
      access_expires_at=v_authorised+(p_expires_in||' seconds')::interval,
      refresh_lease_id=null,refresh_lease_expires_at=null,
      refresh_revision=v_existing.refresh_revision+1,
      updated_at=v_authorised,last_error_code=null where id=v_existing.id returning id into v_connection;
    if v_existing.token_secret_ref is not null then
      delete from vault.secrets where id=substring(v_existing.token_secret_ref from 16)::uuid;
    end if;
  end if;
  update public."FIN_HmrcVatOAuthStates" set status='completed',completed_at=v_authorised where id=v_state.id;
  delete from vault.secrets where id=substring(v_state.pkce_secret_ref from 16)::uuid;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values ('finance_lifecycle',v_state.actor_id,v_state.legal_entity_id,'multideck-app','finance','public',
    'FIN_HmrcVatConnections','hmrc_vat_connection',v_connection,'hmrc_vat_connected',
    'HMRC VAT authority connected',jsonb_build_object('environment',v_state.environment,
      'vrn',v_state.vrn,'scope',p_scope,'authorityExpiresAt',v_authorised+interval '18 months'));
  return jsonb_build_object('connectionId',v_connection,'status','connected',
    'environment',v_state.environment,'legalEntityId',v_state.legal_entity_id,
    'vrn',v_state.vrn,'authorityExpiresAt',v_authorised+interval '18 months');
end; $$;
revoke all on function public.multideck_hmrc_vat_complete(uuid,text,jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.multideck_hmrc_vat_complete(uuid,text,jsonb,integer,text) to service_role;

-- Fail closed after a consumed, rejected or uncertain refresh. Reusing an old
-- HMRC refresh token could invalidate a newer grant or conceal a lost reply.
create function public._multideck_hmrc_vat_require_reauthorisation(
  p_connection uuid,p_actor uuid,p_reason text
) returns void language plpgsql security definer set search_path=pg_catalog,public,vault as $$
declare v_connection public."FIN_HmrcVatConnections"%rowtype;
begin
  if p_reason is null or p_reason not in ('authority_expired','grantor_revoked','registration_changed',
    'refresh_outcome_unknown','refresh_rejected','refresh_lease_expired','token_missing') then
    raise exception 'HMRC authority failure reason is invalid.' using errcode='22023';
  end if;
  select * into v_connection from public."FIN_HmrcVatConnections" where id=p_connection for update;
  if not found or v_connection.status='disconnected' then return; end if;
  if v_connection.token_secret_ref is not null then
    delete from vault.secrets where id=substring(v_connection.token_secret_ref from 16)::uuid;
  end if;
  update public."FIN_HmrcVatConnections" set status='reauthorisation_required',token_secret_ref=null,
    refresh_lease_id=null,refresh_lease_expires_at=null,last_error_code=p_reason,updated_at=now()
    where id=p_connection;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values ('finance_lifecycle',p_actor,v_connection.legal_entity_id,'multideck-app','finance','public',
    'FIN_HmrcVatConnections','hmrc_vat_connection',p_connection,'hmrc_vat_reauthorisation_required',
    'HMRC VAT authority needs renewal',jsonb_build_object('environment',v_connection.environment,
      'vrn',v_connection.vrn,'reason',p_reason));
end; $$;
revoke all on function public._multideck_hmrc_vat_require_reauthorisation(uuid,uuid,text) from public,anon,authenticated,service_role;

-- A transaction lock and a short lease allow exactly one worker to send the
-- single-use refresh token. An expired lease is treated as an unknown outcome,
-- never as permission to send the old token a second time.
create function public.multideck_hmrc_vat_claim_refresh(
  p_actor uuid,p_entity uuid,p_project_ref text,p_connection uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,vault as $$
declare v_connection public."FIN_HmrcVatConnections"%rowtype;
  v_secret text; v_bundle jsonb; v_lease uuid; v_grantor_valid boolean:=true;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  select * into v_connection from public."FIN_HmrcVatConnections"
    where id=p_connection and legal_entity_id=p_entity and tenant_project_ref=p_project_ref for update;
  if not found then raise exception 'HMRC VAT connection was not found.' using errcode='P0002'; end if;
  if v_connection.status='reauthorisation_required' then
    return jsonb_build_object('status','reauthorisation_required');
  end if;
  if v_connection.status<>'connected' then
    raise exception 'This HMRC VAT connection is disconnected.' using errcode='22023';
  end if;
  if v_connection.authority_expires_at<=now() then
    perform public._multideck_hmrc_vat_require_reauthorisation(p_connection,p_actor,'authority_expired');
    return jsonb_build_object('status','reauthorisation_required');
  end if;
  begin
    perform public._multideck_uk_vat_access(v_connection.granted_by_actor_id,p_entity);
  exception when sqlstate '42501' then v_grantor_valid:=false;
  end;
  if not v_grantor_valid then
    perform public._multideck_hmrc_vat_require_reauthorisation(p_connection,p_actor,'grantor_revoked');
    return jsonb_build_object('status','reauthorisation_required');
  end if;
  if not exists(select 1 from public."FIN_LegalEntityComplianceRegistrations" registration
    join public."FIN_ComplianceObligations" obligation on obligation."FINCompliance_ID"=registration."FINComplianceReg_ObligationID"
    join public."FIN_LocalisationPacks" pack on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
    where registration."FINComplianceReg_ID"=v_connection.registration_id
      and registration."FINComplianceReg_LegalEntityID"=p_entity
      and registration."FINComplianceReg_RegistrationReference"=v_connection.vrn
      and registration."FINComplianceReg_StatusCode" in ('configured','sandbox_verified','production_verified')
      and registration."FINComplianceReg_SettingsJSON"->>'schemeCode' in ('standard','annual')
      and obligation."FINCompliance_Code"='gb-vat-mtd' and pack."FINLocPack_CountryCode"='GB'
      and (v_connection.environment<>'production' or
        (registration."FINComplianceReg_StatusCode"='production_verified'
          and pack."FINLocPack_ComplianceStatusCode"='production_ready'))
      and registration."FINComplianceReg_EffectiveFrom"<=(now() at time zone 'Europe/London')::date
      and (registration."FINComplianceReg_EffectiveTo" is null or registration."FINComplianceReg_EffectiveTo">=(now() at time zone 'Europe/London')::date)) then
    perform public._multideck_hmrc_vat_require_reauthorisation(p_connection,p_actor,'registration_changed');
    return jsonb_build_object('status','reauthorisation_required');
  end if;
  if v_connection.refresh_lease_id is not null then
    if v_connection.refresh_lease_expires_at>now() then
      return jsonb_build_object('status','refresh_in_progress');
    end if;
    perform public._multideck_hmrc_vat_require_reauthorisation(p_connection,p_actor,'refresh_lease_expired');
    return jsonb_build_object('status','reauthorisation_required');
  end if;
  if v_connection.access_expires_at>now()+interval '5 minutes' then
    return jsonb_build_object('status','current','accessExpiresAt',v_connection.access_expires_at);
  end if;
  select secret.decrypted_secret into v_secret from vault.decrypted_secrets secret
    where secret.id=substring(v_connection.token_secret_ref from 16)::uuid;
  if v_secret is null then
    perform public._multideck_hmrc_vat_require_reauthorisation(p_connection,p_actor,'token_missing');
    return jsonb_build_object('status','reauthorisation_required');
  end if;
  begin
    v_bundle:=v_secret::jsonb;
  exception when invalid_text_representation then
    perform public._multideck_hmrc_vat_require_reauthorisation(p_connection,p_actor,'token_missing');
    return jsonb_build_object('status','reauthorisation_required');
  end;
  if length(coalesce(v_bundle->>'refresh_token',''))<10 then
    perform public._multideck_hmrc_vat_require_reauthorisation(p_connection,p_actor,'token_missing');
    return jsonb_build_object('status','reauthorisation_required');
  end if;
  v_lease:=gen_random_uuid();
  update public."FIN_HmrcVatConnections" set refresh_lease_id=v_lease,
    refresh_lease_expires_at=now()+interval '2 minutes',updated_at=now() where id=p_connection;
  return jsonb_build_object('status','claimed','leaseId',v_lease,
    'environment',v_connection.environment,'refreshToken',v_bundle->>'refresh_token');
end; $$;
revoke all on function public.multideck_hmrc_vat_claim_refresh(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.multideck_hmrc_vat_claim_refresh(uuid,uuid,text,uuid) to service_role;

create function public.multideck_hmrc_vat_finish_refresh(
  p_actor uuid,p_entity uuid,p_project_ref text,p_connection uuid,p_lease uuid,
  p_token_bundle jsonb,p_expires_in integer,p_scope text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,vault as $$
declare v_connection public."FIN_HmrcVatConnections"%rowtype;
  v_grantor_valid boolean:=true;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  select * into v_connection from public."FIN_HmrcVatConnections"
    where id=p_connection and legal_entity_id=p_entity and tenant_project_ref=p_project_ref for update;
  if not found or v_connection.status<>'connected' or v_connection.refresh_lease_id is distinct from p_lease
    or v_connection.refresh_lease_expires_at<=now() then
    raise exception 'HMRC VAT refresh claim is stale or already finished.' using errcode='22023';
  end if;
  if v_connection.authority_expires_at<=now()
    or p_token_bundle is null or jsonb_typeof(p_token_bundle)<>'object'
    or length(coalesce(p_token_bundle->>'access_token','')) not between 10 and 8000
    or length(coalesce(p_token_bundle->>'refresh_token','')) not between 10 and 8000
    or lower(coalesce(p_token_bundle->>'token_type',''))<>'bearer'
    or p_expires_in is null or p_expires_in not between 1 and 14400
    or p_scope<>'read:vat write:vat' then
    raise exception 'HMRC did not return a valid rotated VAT token.' using errcode='22023';
  end if;
  begin
    perform public._multideck_uk_vat_access(v_connection.granted_by_actor_id,p_entity);
  exception when sqlstate '42501' then v_grantor_valid:=false;
  end;
  if not v_grantor_valid or not exists(select 1 from public."FIN_LegalEntityComplianceRegistrations" registration
    join public."FIN_ComplianceObligations" obligation on obligation."FINCompliance_ID"=registration."FINComplianceReg_ObligationID"
    join public."FIN_LocalisationPacks" pack on pack."FINLocPack_ID"=obligation."FINCompliance_PackID"
    where registration."FINComplianceReg_ID"=v_connection.registration_id
      and registration."FINComplianceReg_LegalEntityID"=p_entity
      and registration."FINComplianceReg_RegistrationReference"=v_connection.vrn
      and registration."FINComplianceReg_StatusCode" in ('configured','sandbox_verified','production_verified')
      and registration."FINComplianceReg_SettingsJSON"->>'schemeCode' in ('standard','annual')
      and obligation."FINCompliance_Code"='gb-vat-mtd' and pack."FINLocPack_CountryCode"='GB'
      and (v_connection.environment<>'production' or
        (registration."FINComplianceReg_StatusCode"='production_verified'
          and pack."FINLocPack_ComplianceStatusCode"='production_ready'))
      and registration."FINComplianceReg_EffectiveFrom"<=(now() at time zone 'Europe/London')::date
      and (registration."FINComplianceReg_EffectiveTo" is null or registration."FINComplianceReg_EffectiveTo">=(now() at time zone 'Europe/London')::date)) then
    raise exception 'HMRC VAT grantor or registration changed during refresh.' using errcode='42501';
  end if;
  perform vault.update_secret(substring(v_connection.token_secret_ref from 16)::uuid,p_token_bundle::text);
  update public."FIN_HmrcVatConnections" set access_expires_at=now()+(p_expires_in||' seconds')::interval,
    refresh_lease_id=null,refresh_lease_expires_at=null,refresh_revision=refresh_revision+1,
    updated_at=now(),last_error_code=null where id=p_connection;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values ('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_HmrcVatConnections','hmrc_vat_connection',p_connection,'hmrc_vat_token_rotated',
    'HMRC VAT token rotated',jsonb_build_object('environment',v_connection.environment,
      'vrn',v_connection.vrn,'revision',v_connection.refresh_revision+1));
  return jsonb_build_object('status','connected','accessExpiresAt',
    now()+(p_expires_in||' seconds')::interval,'refreshRevision',v_connection.refresh_revision+1);
end; $$;
revoke all on function public.multideck_hmrc_vat_finish_refresh(uuid,uuid,text,uuid,uuid,jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.multideck_hmrc_vat_finish_refresh(uuid,uuid,text,uuid,uuid,jsonb,integer,text) to service_role;

create function public.multideck_hmrc_vat_fail_refresh(
  p_actor uuid,p_entity uuid,p_project_ref text,p_connection uuid,p_lease uuid,p_reason text
) returns boolean language plpgsql security definer set search_path=pg_catalog,public,vault as $$
declare v_connection public."FIN_HmrcVatConnections"%rowtype;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  select * into v_connection from public."FIN_HmrcVatConnections"
    where id=p_connection and legal_entity_id=p_entity and tenant_project_ref=p_project_ref for update;
  if not found or v_connection.status<>'connected' or v_connection.refresh_lease_id is distinct from p_lease then
    return false;
  end if;
  if p_reason is null or p_reason not in ('refresh_outcome_unknown','refresh_rejected') then
    raise exception 'HMRC refresh failure reason is invalid.' using errcode='22023';
  end if;
  perform public._multideck_hmrc_vat_require_reauthorisation(p_connection,p_actor,p_reason);
  return true;
end; $$;
revoke all on function public.multideck_hmrc_vat_fail_refresh(uuid,uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.multideck_hmrc_vat_fail_refresh(uuid,uuid,text,uuid,uuid,text) to service_role;

create function public.multideck_hmrc_vat_connection_status(p_actor uuid,p_entity uuid,p_project_ref text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_rows jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  select coalesce(jsonb_agg(to_jsonb(item) order by item.environment,item.authorised_at desc),'[]'::jsonb)
    into v_rows from (
    select id connection_id,environment,vrn,granted_by_actor_id,
      case when status='connected' and authority_expires_at<=now() then 'reauthorisation_required'
        else status end status,authorised_at,authority_expires_at,access_expires_at
    from public."FIN_HmrcVatConnections"
    where tenant_project_ref=p_project_ref and legal_entity_id=p_entity
  ) item;
  return jsonb_build_object('legalEntityId',p_entity,'connections',v_rows);
end; $$;
revoke all on function public.multideck_hmrc_vat_connection_status(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.multideck_hmrc_vat_connection_status(uuid,uuid,text) to service_role;

commit;
