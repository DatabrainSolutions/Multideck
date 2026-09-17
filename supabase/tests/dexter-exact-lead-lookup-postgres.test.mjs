import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const available = spawnSync(join(bin, 'initdb'), ['--version']).status === 0
const migration = readFileSync(new URL('../migrations/20260909202648_dexter_exact_lead_lookup.sql', import.meta.url), 'utf8')
const searchSource = readFileSync(new URL('../migrations/20260803170000_dexter_guarded_domain_search.sql', import.meta.url), 'utf8')
const search = searchSource.slice(searchSource.indexOf('create or replace function public._multideck_dexter_search_evidence('), searchSource.indexOf('create or replace function public.multideck_dexter_domain_customers('))

test('exact lead lookup preserves owner/company, demo and deleted boundaries and never corrects UUIDs', { skip: !available }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'dexter-lead-lookup-'))
  const data = join(directory, 'data')
  let started = false
  const run = (command, args, input) => {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30_000 })
    assert.equal(result.status, 0, `${command}: ${result.stderr}\n${result.stdout}`)
    return result.stdout
  }
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'])
    run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${directory} -c listen_addresses=''`, '-w', 'start'])
    started = true
    run('psql', ['-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], `
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema extensions;
      create extension pg_trgm with schema extensions;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      create table public."cmp_Users" ("User_ID" uuid primary key, "Company_ID" uuid, "Auth_User_ID" uuid, "User_Firstname" text, "User_Lastname" text);
      create table public."CRM_Leads" (
        "CRMLead_ID" uuid primary key, "CRMLead_OwnerUserID" uuid, "CRMLead_OrgID" uuid,
        "CRMLead_CompanyName" text, "CRMLead_PersonName" text, "CRMLead_Email" text,
        "CRMLead_StatusCode" text, "CRMLead_RatingCode" text, "CRMLead_SourceCode" text,
        "CRMLead_ModeCode" text, "CRMLead_DirectionCode" text, "CRMLead_TradeLane" text,
        "CRMLead_ServiceInterest" text, "CRMLead_EstimatedValueAmount" numeric,
        "CRMLead_EstimatedValueCurrencyCode" text, "CRMLead_UrgencyCode" text, "CRMLead_Score" numeric,
        "CRMLead_AIProbabilityToConvert" numeric, "CRMLead_NextActionDueAt" timestamptz,
        "CRMLead_LastInteractionAt" timestamptz, "CRMLead_CreatedAt" timestamptz default now(),
        "CRMLead_IsDeleted" boolean default false, "CRMLead_MetadataJSON" jsonb default '{}',
        "CRMLead_TownCity" text, "CRMLead_CountyState" text, "CRMLead_PostZipCode" text, "CRMLead_CountryCode" text
      );
      create table public."Org_Addresses" ("Org_ID" uuid, "OrgAdd_ID" uuid, "OrgAdd_TownCity" text, "OrgAdd_CountyState" text, "OrgAdd_PostZipCode" text, "OrgAdd_Country" text);
      create table public."CRM_LeadTransferRequests" ("CRMLeadTransfer_ID" uuid, "CRMLeadTransfer_LeadID" uuid, "CRMLeadTransfer_Status" text, "CRMLeadTransfer_FromUserID" uuid, "CRMLeadTransfer_ToUserID" uuid, "CRMLeadTransfer_RequestedAt" timestamptz);
      create function public._multideck_crm_lead_native_address(uuid) returns jsonb language sql stable as $$ select '{}'::jsonb $$;
      ${search}
      ${migration}
      do $$ declare
        company uuid := gen_random_uuid(); actor uuid := gen_random_uuid(); identity uuid := gen_random_uuid();
        other_actor uuid := gen_random_uuid(); other_identity uuid := gen_random_uuid();
        lead uuid := gen_random_uuid(); other_lead uuid := gen_random_uuid();
        result jsonb;
      begin
        insert into public."cmp_Users" values(actor, company, identity, 'Test', 'Operator'), (other_actor, company, other_identity, 'Other', 'Operator');
        insert into public."CRM_Leads" ("CRMLead_ID", "CRMLead_OwnerUserID", "CRMLead_CompanyName", "CRMLead_NextActionDueAt")
          values (lead, actor, 'Exact lookup verification', '2026-09-10T09:00:00Z'), (other_lead, other_actor, 'Another operator lead', null);
        perform set_config('request.jwt.claim.sub', identity::text, true);
        result := public.multideck_dexter_domain_leads(company, upper(lead::text), 1);
        if jsonb_array_length(result) <> 1 or result->0->>'recordId' <> lead::text
          or result->0->'searchEvidence'->>'quality' <> 'exact_identifier'
          or (result->0->>'nextActionDueAt')::timestamptz <> '2026-09-10T09:00:00Z'::timestamptz
          then raise exception 'Exact lookup did not preserve identity, evidence and deadline'; end if;
        if public.multideck_dexter_domain_leads(company, other_lead::text, 25) <> '[]'::jsonb
          then raise exception 'Another owner was exposed'; end if;
        if public.multideck_dexter_domain_leads(gen_random_uuid(), lead::text, 25) <> '[]'::jsonb
          then raise exception 'Another company was exposed'; end if;
        if public.multideck_dexter_domain_leads(company, left(lead::text,35) || case right(lead::text,1) when '0' then '1' else '0' end,25) <> '[]'::jsonb
          then raise exception 'A wrong UUID was corrected to another record'; end if;
        if jsonb_array_length(public.multideck_dexter_domain_leads(company, 'Exact lookup verification', 25)) <> 1
          then raise exception 'Name lookup regressed'; end if;
        update public."CRM_Leads" set "CRMLead_MetadataJSON"='{"isDemo":true}' where "CRMLead_ID"=lead;
        if public.multideck_dexter_domain_leads(company, lead::text, 25) <> '[]'::jsonb
          then raise exception 'Demo lead was exposed'; end if;
        update public."CRM_Leads" set "CRMLead_MetadataJSON"='{}', "CRMLead_IsDeleted"=true where "CRMLead_ID"=lead;
        if public.multideck_dexter_domain_leads(company, lead::text, 25) <> '[]'::jsonb
          then raise exception 'Deleted lead was exposed'; end if;
        update public."CRM_Leads" set "CRMLead_IsDeleted"=false where "CRMLead_ID"=lead;
        perform set_config('request.jwt.claim.sub', '', true);
        if public.multideck_dexter_domain_leads(company, lead::text, 25) <> '[]'::jsonb
          then raise exception 'Missing identity was allowed'; end if;
        if has_function_privilege('authenticated','public.multideck_dexter_domain_leads(uuid,text,integer)','execute')
          or has_function_privilege('anon','public.multideck_dexter_domain_leads(uuid,text,integer)','execute')
          then raise exception 'Internal domain became directly callable'; end if;
      end $$;
    `)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'])
    rmSync(directory, { recursive: true, force: true })
  }
})
