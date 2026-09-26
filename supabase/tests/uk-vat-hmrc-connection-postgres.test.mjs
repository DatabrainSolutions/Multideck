import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

const migration = readFileSync(new URL("../migrations/20260924095102_uk_vat_hmrc_connection.sql", import.meta.url), "utf8")
const obligationVerifications = readFileSync(new URL("../migrations/20260924140515_uk_vat_obligation_verifications.sql", import.meta.url), "utf8")
const scopedAccess = readFileSync(new URL("../migrations/20260924203808_hmrc_vat_scoped_access_token.sql", import.meta.url), "utf8")
const readbackContext = readFileSync(new URL("../migrations/20260924205317_hmrc_vat_readback_context.sql", import.meta.url), "utf8")
const obligationContext = readFileSync(new URL("../migrations/20260924210309_hmrc_vat_obligation_context.sql", import.meta.url), "utf8")

test("HMRC VAT consent state and token references remain scoped and single-use", () => {
  const bin = process.env.PG_TEST_BIN || "/opt/homebrew/opt/postgresql@17/bin"
  const directory = mkdtempSync(join(tmpdir(), "uk-vat-hmrc-"))
  let started = false
  const run = (name, args, input) => {
    const result = spawnSync(join(bin, name), args, { input, encoding: "utf8", timeout: 30000 })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const sql = (input) => run("psql", ["-X", "-qAt", "-h", directory, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], input)
  try {
    run("initdb", ["-D", join(directory, "data"), "-A", "trust", "-U", "postgres", "--no-locale", "--no-sync", "-E", "UTF8"])
    run("pg_ctl", ["-D", join(directory, "data"), "-l", join(directory, "log"), "-o", `-k ${directory} -c listen_addresses=''`, "-w", "start"])
    started = true
    sql(`
      create schema vault;
      create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create table vault.secrets(id uuid primary key default gen_random_uuid(),name text,decrypted_secret text);
      create view vault.decrypted_secrets as select id,name,decrypted_secret from vault.secrets;
      create function vault.create_secret(p_secret text,p_name text,p_description text) returns uuid language plpgsql as $$
      declare v_id uuid; begin insert into vault.secrets(name,decrypted_secret) values(p_name,p_secret) returning id into v_id; return v_id; end $$;
      create function vault.update_secret(p_id uuid,p_secret text) returns void language plpgsql as $$
      begin update vault.secrets set decrypted_secret=p_secret where id=p_id; if not found then raise exception 'missing vault secret'; end if; end $$;
      create table "cmp_LegalEntities"("LegalEntity_ID" uuid primary key,"Company_ID" uuid not null,"LegalEntity_IsActive" boolean not null,"LegalEntity_CountryCode" text not null);
      create table "cmp_Users"("User_ID" uuid primary key,"Company_ID" uuid not null,"User_AccessStatus" text not null,"Auth_User_ID" uuid);
      create table "FIN_LocalisationPacks"("FINLocPack_ID" uuid primary key,"FINLocPack_CountryCode" text not null,"FINLocPack_ComplianceStatusCode" text not null);
      create table "FIN_ComplianceObligations"("FINCompliance_ID" uuid primary key,"FINCompliance_PackID" uuid not null,"FINCompliance_Code" text not null);
      create table "FIN_LegalEntityComplianceRegistrations"("FINComplianceReg_ID" uuid primary key,"FINComplianceReg_LegalEntityID" uuid not null,"FINComplianceReg_ObligationID" uuid not null,"FINComplianceReg_StatusCode" text not null,"FINComplianceReg_RegistrationReference" text not null,"FINComplianceReg_SettingsJSON" jsonb not null,"FINComplianceReg_EffectiveFrom" date not null,"FINComplianceReg_EffectiveTo" date);
      create table "FIN_IndirectTaxPeriods"(id uuid primary key default gen_random_uuid(),legal_entity_id uuid not null,obligation_id uuid not null,registration_id uuid not null,jurisdiction_code text not null,scheme_code text not null,start_date date not null,end_date date not null,status text not null,active_review_lock_id uuid);
      create table "FIN_IndirectTaxFilingApprovals"(id uuid primary key,review_lock_id uuid);
      create table "FIN_IndirectTaxFilingApprovalRevocations"(approval_id uuid);
      create table "FIN_HmrcVatSubmissionAttempts"(id uuid primary key,approval_id uuid,period_id uuid,tenant_project_ref text,registration_id uuid,vrn char(9),environment text,status text,period_key text default '#001',payload_body text default '{"periodKey":"#001"}');
      create table "Audit_Events"("AuditEvent_EventTypeCode" text,"AuditEvent_UserID" uuid,"AuditEvent_LegalEntityID" uuid,"AuditEvent_SourceApp" text,"AuditEvent_SourceModule" text,"AuditEvent_SourceTableSchema" text,"AuditEvent_SourceTableName" text,"AuditEvent_RecordTypeCode" text,"AuditEvent_RecordID" uuid,"AuditEvent_Action" text,"AuditEvent_Title" text,"AuditEvent_MetadataJSON" jsonb);
      create function public._multideck_uk_vat_access(p_actor uuid,p_entity uuid) returns void language plpgsql as $$
      begin if not exists(select 1 from "cmp_Users" actor join "cmp_LegalEntities" entity on entity."Company_ID"=actor."Company_ID"
        where actor."User_ID"=p_actor and actor."User_AccessStatus"='active' and entity."LegalEntity_ID"=p_entity
          and entity."LegalEntity_IsActive" and entity."LegalEntity_CountryCode"='GB'
          and p_actor='00000000-0000-0000-0000-000000000003'::uuid) then
        raise exception 'denied' using errcode='42501'; end if; end $$;
      create function public._multideck_uk_vat_read_access(p_actor uuid,p_entity uuid) returns void language plpgsql as $$
      begin perform public._multideck_uk_vat_access(p_actor,p_entity); end $$;
      create function public._multideck_indirect_tax_immutable() returns trigger language plpgsql as $$
      begin raise exception 'immutable' using errcode='22023'; end $$;
    `)
    sql(migration)
    sql(obligationVerifications)
    sql(scopedAccess)
    sql(readbackContext)
    sql(obligationContext)
    assert.equal(sql(`select count(*) from pg_class where relname in ('FIN_HmrcVatOAuthStates','FIN_HmrcVatConnections','FIN_HmrcVatObligationVerifications') and relrowsecurity`), "3")
    assert.equal(sql(`select count(*) from information_schema.role_table_grants where grantee='authenticated' and table_name like 'FIN_HmrcVat%'`), "0")
    assert.equal(sql(`select count(*) from information_schema.role_table_grants
      where grantee='service_role' and table_name in
        ('FIN_HmrcVatOAuthStates','FIN_HmrcVatConnections')
        and privilege_type in ('INSERT','UPDATE','DELETE')`), "0")
    assert.equal(sql(`select has_function_privilege('service_role',
      'public._multideck_hmrc_vat_require_reauthorisation(uuid,uuid,text)','EXECUTE')`), "f")
    assert.equal(sql(`select has_function_privilege('authenticated',
      'public.multideck_hmrc_vat_access_for_period(uuid,uuid,text,uuid,uuid,text,uuid)','EXECUTE')`), "f")
    assert.equal(sql(`select has_function_privilege('service_role',
      'public.multideck_hmrc_vat_access_for_period(uuid,uuid,text,uuid,uuid,text,uuid)','EXECUTE')`), "t")
    assert.equal(sql(`select has_function_privilege('authenticated',
      'public.multideck_uk_vat_readback_context(uuid,uuid,text,uuid,uuid,uuid)','EXECUTE')`), "f")
    assert.equal(sql(`select has_function_privilege('service_role',
      'public.multideck_uk_vat_readback_context(uuid,uuid,text,uuid,uuid,uuid)','EXECUTE')`), "t")
    assert.equal(sql(`select has_function_privilege('authenticated',
      'public.multideck_hmrc_vat_obligation_context(uuid,uuid,text,uuid,uuid)','EXECUTE')`), "f")
    assert.equal(sql(`select has_function_privilege('service_role',
      'public.multideck_hmrc_vat_obligation_context(uuid,uuid,text,uuid,uuid)','EXECUTE')`), "t")
    assert.equal(sql(`set role service_role;
      do $permission$ begin
        begin
          insert into public."FIN_HmrcVatOAuthStates" default values;
          raise exception 'direct OAuth state insert was allowed';
        exception when insufficient_privilege then null; end;
        begin
          update public."FIN_HmrcVatConnections" set status='connected';
          raise exception 'direct HMRC token reference update was allowed';
        exception when insufficient_privilege then null; end;
      end $permission$;
      reset role; select 'denied';`), "denied")
    assert.equal(sql(`select count(*) from information_schema.role_table_grants where grantee='service_role' and table_name='FIN_HmrcVatObligationVerifications' and privilege_type='INSERT'`), "0")
    assert.equal(sql(`
      do $test$
      declare e uuid:='00000000-0000-0000-0000-000000000001'; other uuid:='00000000-0000-0000-0000-000000000002';
        actor uuid:='00000000-0000-0000-0000-000000000003'; registration uuid:='00000000-0000-0000-0000-000000000004';
        pack uuid:='00000000-0000-0000-0000-000000000005'; obligation uuid:='00000000-0000-0000-0000-000000000006';
        state_id uuid; connection_id uuid; v_period_id uuid; v_claim jsonb; v_result jsonb; v_lease uuid;
        v_attempt uuid; v_approval uuid; v_review_lock uuid;
        state_hash text:=repeat('a',64); verifier text:=repeat('v',64);
      begin
        insert into "cmp_LegalEntities" values(e,'00000000-0000-0000-0000-000000000020',true,'GB'),
          (other,'00000000-0000-0000-0000-000000000021',true,'GB');
        insert into "cmp_Users" values(actor,'00000000-0000-0000-0000-000000000020','active',actor);
        insert into "FIN_LocalisationPacks" values(pack,'GB','foundation');
        insert into "FIN_ComplianceObligations" values(obligation,pack,'gb-vat-mtd');
        insert into "FIN_LegalEntityComplianceRegistrations" values(registration,e,obligation,'configured','123456789','{"schemeCode":"standard"}','2020-01-01',null);
        insert into "FIN_IndirectTaxPeriods"(legal_entity_id,obligation_id,registration_id,jurisdiction_code,scheme_code,start_date,end_date,status)
          values(e,obligation,registration,'GB','standard','2026-07-01','2026-09-30','review_locked') returning id into v_period_id;
        update "FIN_LegalEntityComplianceRegistrations"
          set "FINComplianceReg_EffectiveTo"=(now() at time zone 'Europe/London')::date
          where "FINComplianceReg_ID"=registration;
        perform set_config('TimeZone',case
          when (now() at time zone 'Pacific/Kiritimati')::date<>
            (now() at time zone 'Europe/London')::date then 'Pacific/Kiritimati'
          else 'Pacific/Honolulu' end,true);
        if current_date=(now() at time zone 'Europe/London')::date then
          raise exception 'HMRC time-zone probe did not cross the UK date boundary'; end if;
        begin
          perform public.multideck_hmrc_vat_begin(actor,actor,e,'tenant-ref','sandbox',
            repeat('c',64),verifier,'https://tenant.example/hmrc/callback');
          raise exception 'hmrc_uk_date_probe_rollback';
        exception when sqlstate 'P0001' then
          if sqlerrm<>'hmrc_uk_date_probe_rollback' then raise; end if;
        end;
        perform set_config('TimeZone','UTC',true);
        update "FIN_LegalEntityComplianceRegistrations"
          set "FINComplianceReg_EffectiveTo"=null where "FINComplianceReg_ID"=registration;
        begin
          perform set_config('role','service_role',true);
          v_result:=public.multideck_hmrc_vat_begin(actor,actor,e,'tenant-ref','sandbox',
            repeat('e',64),verifier,'https://tenant.example/hmrc/callback');
          if v_result->>'stateId' is null then
            raise exception 'service-role HMRC consent function did not write'; end if;
          raise exception 'hmrc_service_writer_probe_rollback';
        exception when sqlstate 'P0001' then
          if sqlerrm<>'hmrc_service_writer_probe_rollback' then raise; end if;
        end;
        begin
          perform public.multideck_hmrc_vat_begin(actor,actor,e,'tenant-ref','production',repeat('b',64),verifier,'https://tenant.example/hmrc/callback');
          raise exception 'production consent bypassed pack approval';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_hmrc_vat_begin(actor,actor,other,'tenant-ref','sandbox',repeat('b',64),verifier,'https://tenant.example/hmrc/callback');
          raise exception 'cross-company HMRC connection was accepted';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_hmrc_vat_begin(actor,'00000000-0000-0000-0000-000000000019',e,'tenant-ref','sandbox',repeat('b',64),verifier,'https://tenant.example/hmrc/callback');
          raise exception 'another tenant Auth identity was accepted as grantor';
        exception when sqlstate '42501' then null; end;
        state_id:=(public.multideck_hmrc_vat_begin(actor,actor,e,'tenant-ref','sandbox',state_hash,verifier,
          'https://tenant.example/hmrc/callback')->>'stateId')::uuid;
        if (select count(*) from vault.secrets)<>1 then raise exception 'PKCE verifier was not secured'; end if;
        begin
          perform public.multideck_hmrc_vat_claim(state_hash,'different-tenant');
          raise exception 'another tenant claimed OAuth state';
        exception when sqlstate '22023' then null; end;
        v_claim:=public.multideck_hmrc_vat_claim(state_hash,'tenant-ref');
        if v_claim->>'codeVerifier'<>verifier or v_claim->>'vrn'<>'123456789' then
          raise exception 'HMRC callback lost its bound verifier or registration'; end if;
        begin
          perform public.multideck_hmrc_vat_claim(state_hash,'tenant-ref');
          raise exception 'OAuth state was claimed twice';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_hmrc_vat_complete(state_id,'tenant-ref',
            '{"access_token":"sample-access-token","refresh_token":"sample-refresh-token","token_type":"bearer"}',14400,'read:vat');
          raise exception 'incomplete VAT scope was accepted';
        exception when sqlstate '22023' then null; end;
        v_result:=public.multideck_hmrc_vat_complete(state_id,'tenant-ref',
          '{"access_token":"sample-access-token","refresh_token":"sample-refresh-token","token_type":"bearer"}',14400,'read:vat write:vat');
        connection_id:=(v_result->>'connectionId')::uuid;
        v_result:=public.multideck_hmrc_vat_obligation_context(actor,e,'tenant-ref',v_period_id,
          connection_id);
        if v_result->>'startDate'<>'2026-07-01' or v_result->>'endDate'<>'2026-09-30'
          or v_result->>'vrn'<>'123456789' or v_result ? 'accessToken' then
          raise exception 'scoped HMRC obligation context exposed wrong dates or authority'; end if;
        begin
          perform public.multideck_hmrc_vat_obligation_context(actor,e,'another-tenant',v_period_id,
            connection_id);
          raise exception 'foreign tenant read HMRC obligation dates';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_hmrc_vat_obligation_context(actor,other,'tenant-ref',v_period_id,
            connection_id);
          raise exception 'foreign company read HMRC obligation dates';
        exception when sqlstate '42501' then null; end;
        v_result:=public.multideck_hmrc_vat_access_for_period(actor,e,'tenant-ref',v_period_id,
          connection_id,'obligations');
        if v_result->>'accessToken'<>'sample-access-token'
          or v_result->>'vrn'<>'123456789'
          or v_result ? 'refreshToken' or v_result ? 'tokenSecretRef'
          or not exists(select 1 from "Audit_Events" where "AuditEvent_Action"='read_hmrc_vat_access_token'
            and "AuditEvent_UserID"=actor and "AuditEvent_RecordID"=connection_id) then
          raise exception 'scoped HMRC access read was missing, unaudited or exposed a refresh token'; end if;
        begin
          perform public.multideck_hmrc_vat_access_for_period(actor,e,'other-tenant',v_period_id,
            connection_id,'obligations');
          raise exception 'foreign tenant read the HMRC access token';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_hmrc_vat_access_for_period(actor,other,'tenant-ref',v_period_id,
            connection_id,'obligations');
          raise exception 'foreign company read the HMRC access token';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_hmrc_vat_access_for_period(actor,e,'tenant-ref',v_period_id,
            connection_id,'submission');
          raise exception 'unreserved submission read the HMRC access token';
        exception when sqlstate '22023' then null; end;
        begin
          v_attempt:=gen_random_uuid(); v_approval:=gen_random_uuid(); v_review_lock:=gen_random_uuid();
          update "FIN_IndirectTaxPeriods" set active_review_lock_id=v_review_lock where id=v_period_id;
          insert into "FIN_IndirectTaxFilingApprovals" values(v_approval,v_review_lock);
          insert into "FIN_HmrcVatSubmissionAttempts" values(v_attempt,v_approval,v_period_id,
            'tenant-ref',registration,'123456789','sandbox','reserved',default,default);
          begin
            perform public.multideck_uk_vat_readback_context(actor,e,'tenant-ref',v_period_id,
              connection_id,v_attempt);
            raise exception 'reserved submission exposed a readback period key';
          exception when sqlstate '22023' then null; end;
          if public.multideck_hmrc_vat_access_for_period(actor,e,'tenant-ref',v_period_id,
            connection_id,'submission',v_attempt)->>'accessToken'<>'sample-access-token' then
            raise exception 'reserved VAT dispatch lacked scoped authority'; end if;
          update "FIN_HmrcVatSubmissionAttempts" set status='dispatching' where id=v_attempt;
          v_result:=public.multideck_uk_vat_readback_context(actor,e,'tenant-ref',v_period_id,
            connection_id,v_attempt);
          if v_result->>'periodKey'<>'#001' or v_result->>'vrn'<>'123456789'
            or v_result ? 'accessToken' or v_result ? 'payloadBody' then
            raise exception 'claimed readback context was missing or exposed a token/body'; end if;
          begin
            perform public.multideck_uk_vat_readback_context(actor,e,'other-tenant',v_period_id,
              connection_id,v_attempt);
            raise exception 'foreign tenant read a VAT period key';
          exception when sqlstate '22023' then null; end;
          begin
            perform public.multideck_uk_vat_readback_context(actor,other,'tenant-ref',v_period_id,
              connection_id,v_attempt);
            raise exception 'foreign company read a VAT period key';
          exception when sqlstate '42501' then null; end;
          if public.multideck_hmrc_vat_access_for_period(actor,e,'tenant-ref',v_period_id,
            connection_id,'readback',v_attempt)->>'accessToken'<>'sample-access-token' then
            raise exception 'claimed VAT readback lacked scoped authority'; end if;
          begin
            perform public.multideck_hmrc_vat_access_for_period(actor,e,'tenant-ref',v_period_id,
              connection_id,'submission',v_attempt);
            raise exception 'claimed submission reused pre-dispatch authority';
          exception when sqlstate '22023' then null; end;
          update "FIN_HmrcVatSubmissionAttempts" set status='accepted' where id=v_attempt;
          begin
            perform public.multideck_uk_vat_readback_context(actor,e,'tenant-ref',v_period_id,
              connection_id,v_attempt);
            raise exception 'accepted submission exposed a readback period key';
          exception when sqlstate '22023' then null; end;
          raise exception 'hmrc_scoped_attempt_probe_rollback';
        exception when sqlstate 'P0001' then
          if sqlerrm<>'hmrc_scoped_attempt_probe_rollback' then raise; end if;
        end;
        v_result:=public.multideck_hmrc_vat_record_obligation(actor,e,'tenant-ref',connection_id,v_period_id,
          '{"start":"2026-07-01","end":"2026-09-30","due":"2026-11-07","status":"O","periodKey":"#001"}',
          'c75f40a6-a3df-4429-a697-471eeec46435');
        if v_result->>'periodKey'<>'#001' or (select count(*) from "FIN_HmrcVatObligationVerifications" where period_id=v_period_id)<>1
          or (select count(*) from "Audit_Events" where "AuditEvent_Action"='verify_hmrc_vat_obligation')<>1 then
          raise exception 'HMRC obligation observation was not recorded and audited'; end if;
        begin
          perform public.multideck_hmrc_vat_record_obligation(actor,e,'another-tenant',connection_id,v_period_id,
            '{"start":"2026-07-01","end":"2026-09-30","due":"2026-11-07","status":"O","periodKey":"#001"}',
            'c75f40a6-a3df-4429-a697-471eeec46436');
          raise exception 'another tenant recorded an obligation';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_hmrc_vat_record_obligation(actor,e,'tenant-ref',connection_id,v_period_id,
            '{"start":"2026-07-01","end":"2026-09-29","due":"2026-11-07","status":"O","periodKey":"#001"}',
            'c75f40a6-a3df-4429-a697-471eeec46436');
          raise exception 'mismatched HMRC period was recorded';
        exception when sqlstate '22023' then null; end;
        begin
          perform public.multideck_hmrc_vat_record_obligation(actor,e,'tenant-ref',connection_id,v_period_id,
            '{"start":"2026-07-01","end":"2026-09-30","due":"2026-11-07","status":"F","periodKey":"#001","received":"2026-11-01"}',
            'c75f40a6-a3df-4429-a697-471eeec46436');
          raise exception 'fulfilled HMRC obligation was recorded as open';
        exception when sqlstate '22023' then null; end;
        begin
          update "FIN_HmrcVatObligationVerifications" set period_key='26B1' where period_id=v_period_id;
          raise exception 'HMRC obligation evidence changed';
        exception when sqlstate '22023' then null; end;
        if (select count(*) from vault.secrets)<>1 or not exists(select 1 from vault.secrets where decrypted_secret like '%sample-refresh-token%') then
          raise exception 'completed authority did not replace PKCE with Vault token'; end if;
        if (public.multideck_hmrc_vat_connection_status(actor,e,'tenant-ref')#>>'{connections,0,connection_id}')::uuid<>connection_id
          or public.multideck_hmrc_vat_connection_status(actor,e,'tenant-ref')::text like '%sample-access-token%' then
          raise exception 'connection status exposed or lost sensitive authority'; end if;
        begin
          perform public.multideck_hmrc_vat_complete(state_id,'tenant-ref',
            '{"access_token":"another-access-token","refresh_token":"another-refresh-token","token_type":"bearer"}',14400,'read:vat write:vat');
          raise exception 'claimed consent completed twice';
        exception when sqlstate '22023' then null; end;
        if (select count(*) from "Audit_Events" where "AuditEvent_Action"='hmrc_vat_connected' and "AuditEvent_RecordID"=connection_id)<>1 then
          raise exception 'HMRC connection was not audited'; end if;
        if public.multideck_hmrc_vat_claim_refresh(actor,e,'tenant-ref',connection_id)->>'status'<>'current' then
          raise exception 'valid access token was refreshed unnecessarily'; end if;
        begin
          perform public.multideck_hmrc_vat_claim_refresh(actor,other,'tenant-ref',connection_id);
          raise exception 'another company refreshed HMRC authority';
        exception when sqlstate '42501' then null; end;
        update "FIN_HmrcVatConnections" set authorised_at=now()-interval '5 hours',
          access_expires_at=now()-interval '1 minute' where id=connection_id;
        v_claim:=public.multideck_hmrc_vat_claim_refresh(actor,e,'tenant-ref',connection_id);
        v_lease:=(v_claim->>'leaseId')::uuid;
        if v_claim->>'status'<>'claimed' or v_claim->>'refreshToken'<>'sample-refresh-token'
          or public.multideck_hmrc_vat_claim_refresh(actor,e,'tenant-ref',connection_id)->>'status'<>'refresh_in_progress' then
          raise exception 'single-use HMRC refresh token was claimed twice'; end if;
        begin
          perform public.multideck_hmrc_vat_access_for_period(actor,e,'tenant-ref',v_period_id,
            connection_id,'obligations');
          raise exception 'token read bypassed a refresh lease';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_hmrc_vat_finish_refresh(actor,e,'tenant-ref',connection_id,gen_random_uuid(),
            '{"access_token":"rotated-access-token","refresh_token":"rotated-refresh-token","token_type":"bearer"}',14400,'read:vat write:vat');
          raise exception 'wrong refresh lease rotated authority';
        exception when sqlstate '22023' then null; end;
        v_result:=public.multideck_hmrc_vat_finish_refresh(actor,e,'tenant-ref',connection_id,v_lease,
          '{"access_token":"rotated-access-token","refresh_token":"rotated-refresh-token","token_type":"bearer"}',14400,'read:vat write:vat');
        if (v_result->>'refreshRevision')::integer<>1
          or (select count(*) from vault.secrets where decrypted_secret like '%rotated-refresh-token%')<>1
          or (select count(*) from vault.secrets where decrypted_secret like '%sample-refresh-token%')<>0
          or public.multideck_hmrc_vat_connection_status(actor,e,'tenant-ref')::text like '%rotated-access-token%' then
          raise exception 'refresh did not rotate and conceal Vault tokens'; end if;
        if public.multideck_hmrc_vat_access_for_period(actor,e,'tenant-ref',v_period_id,
          connection_id,'obligations')->>'accessToken'<>'rotated-access-token' then
          raise exception 'scoped read reused the old access token after rotation'; end if;
        update "FIN_HmrcVatConnections" set access_expires_at=now()-interval '1 minute' where id=connection_id;
        v_claim:=public.multideck_hmrc_vat_claim_refresh(actor,e,'tenant-ref',connection_id);
        v_lease:=(v_claim->>'leaseId')::uuid;
        update "FIN_LegalEntityComplianceRegistrations" set "FINComplianceReg_StatusCode"='inactive'
          where "FINComplianceReg_ID"=registration;
        begin
          perform public.multideck_hmrc_vat_finish_refresh(actor,e,'tenant-ref',connection_id,v_lease,
            '{"access_token":"drifted-access-token","refresh_token":"drifted-refresh-token","token_type":"bearer"}',14400,'read:vat write:vat');
          raise exception 'changed registration accepted a refreshed token';
        exception when sqlstate '42501' then null; end;
        update "FIN_LegalEntityComplianceRegistrations" set "FINComplianceReg_StatusCode"='configured'
          where "FINComplianceReg_ID"=registration;
        if not public.multideck_hmrc_vat_fail_refresh(actor,e,'tenant-ref',connection_id,v_lease,'refresh_outcome_unknown') then
          raise exception 'uncertain refresh could not be closed'; end if;
        if public.multideck_hmrc_vat_claim_refresh(actor,e,'tenant-ref',connection_id)->>'status'<>'reauthorisation_required'
          or (select count(*) from vault.secrets)<>0 then
          raise exception 'uncertain refresh did not require new consent and erase token'; end if;
        if (select count(*) from "Audit_Events" where "AuditEvent_Action"='hmrc_vat_reauthorisation_required' and "AuditEvent_RecordID"=connection_id)<>1 then
          raise exception 'lost HMRC authority was not audited'; end if;
        perform public.multideck_hmrc_vat_begin(actor,actor,e,'tenant-ref','sandbox',repeat('d',64),verifier,'https://tenant.example/hmrc/callback');
        update "FIN_LegalEntityComplianceRegistrations" set "FINComplianceReg_StatusCode"='inactive'
          where "FINComplianceReg_ID"=registration;
        begin
          perform public.multideck_hmrc_vat_claim(repeat('d',64),'tenant-ref');
          raise exception 'changed VAT registration completed HMRC callback';
        exception when sqlstate '22023' then null; end;
        update "FIN_LegalEntityComplianceRegistrations" set "FINComplianceReg_StatusCode"='configured'
          where "FINComplianceReg_ID"=registration;
        perform public.multideck_hmrc_vat_deny(repeat('d',64),'tenant-ref');
        perform public.multideck_hmrc_vat_begin(actor,actor,e,'tenant-ref','sandbox',repeat('c',64),verifier,'https://tenant.example/hmrc/callback');
        update "cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"=actor;
        begin
          perform public.multideck_hmrc_vat_claim(repeat('c',64),'tenant-ref');
          raise exception 'revoked grantor completed HMRC callback';
        exception when sqlstate '42501' then null; end;
        begin
          perform public.multideck_hmrc_vat_connection_status(actor,e,'tenant-ref');
          raise exception 'revoked grantor read HMRC status';
        exception when sqlstate '42501' then null; end;
        if not public.multideck_hmrc_vat_deny(repeat('c',64),'tenant-ref') then
          raise exception 'denied OAuth state was not consumed'; end if;
        if public.multideck_hmrc_vat_deny(repeat('c',64),'tenant-ref') then
          raise exception 'denied OAuth state was consumed twice'; end if;
        if (select count(*) from vault.secrets)<>0 then
          raise exception 'denied OAuth state retained its PKCE verifier'; end if;
        update "cmp_Users" set "User_AccessStatus"='active' where "User_ID"=actor;
        update "FIN_LegalEntityComplianceRegistrations"
          set "FINComplianceReg_SettingsJSON"='{"schemeCode":"annual"}'
          where "FINComplianceReg_ID"=registration;
        v_result:=public.multideck_hmrc_vat_begin(actor,actor,e,'tenant-ref','sandbox',
          repeat('e',64),verifier,'https://tenant.example/hmrc/callback');
        if v_result->>'vrn'<>'123456789' then
          raise exception 'annual scheme VAT authority could not begin'; end if;
        perform public.multideck_hmrc_vat_deny(repeat('e',64),'tenant-ref');
        update "FIN_LegalEntityComplianceRegistrations"
          set "FINComplianceReg_SettingsJSON"='{"schemeCode":"cash"}'
          where "FINComplianceReg_ID"=registration;
        begin
          perform public.multideck_hmrc_vat_begin(actor,actor,e,'tenant-ref','sandbox',
            repeat('f',64),verifier,'https://tenant.example/hmrc/callback');
          raise exception 'unsupported cash scheme began VAT authority';
        exception when sqlstate '22023' then null; end;
      end $test$;
      select 'ok';
    `), "ok")
  } finally {
    if (started) run("pg_ctl", ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"])
    rmSync(directory, { recursive: true, force: true })
  }
})
