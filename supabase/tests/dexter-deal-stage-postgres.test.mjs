import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const available = spawnSync(join(bin, 'initdb'), ['--version']).status === 0
const read = name => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')
const migration = read('20260909204719_dexter_deal_stage_changes')
const crm = read('202607300002_crm_supabase_rpc')
const start = crm.indexOf('create or replace function public.multideck_crm_move_deal_stage(')
const writer = crm.slice(start, crm.indexOf('\n$$;', start) + 4).replace('public.multideck_crm_move_deal_stage(', 'public._multideck_crm_move_deal_stage_unfiltered_20260818(')

test('pipeline adapter reuses canonical writes, rejects stale/scope/permission changes and emits one deterministic signal', { skip: !available }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'dexter-deal-stage-'))
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
      create role anon; create role authenticated; create role service_role; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
      create table public."cmp_Users" ("User_ID" uuid primary key,"Company_ID" uuid,"Auth_User_ID" uuid,"User_AccessStatus" text);
      create function public._multideck_crm_context() returns table(user_id uuid,company_id uuid) language sql stable as $$ select "User_ID","Company_ID" from public."cmp_Users" where "Auth_User_ID"=auth.uid() $$;
      create function public._multideck_crm_has_permission(uuid,text) returns boolean language sql stable as $$ select current_setting('test.can_write',true)='yes' $$;
      create table public."CRM_Pipelines" ("CRMPipeline_ID" uuid primary key,"Company_ID" uuid,"CRMPipeline_Name" text,"CRMPipeline_SortOrder" integer default 1,"Updated_At" timestamptz default now(),"Is_Deleted" boolean default false);
      create table public."CRM_PipelineStages" ("CRMPipelineStage_ID" uuid primary key,"Company_ID" uuid,"CRMPipeline_ID" uuid,"CRMPipelineStage_Name" text,"CRMPipelineStage_ProbabilityPct" numeric,"CRMPipelineStage_EntryRule" text,"CRMPipelineStage_IsConversion" boolean default false,"CRMPipelineStage_SortOrder" integer default 1,"Updated_At" timestamptz default now(),"Is_Deleted" boolean default false);
      create table public."CRM_Opportunities" ("CRMOppty_ID" uuid primary key,"CRMOppty_Name" text,"CRMOppty_PipelineID" uuid,"CRMOppty_PipelineStageID" uuid,"CRMOppty_StageCode" text default 'open',"CRMOppty_StatusCode" text default 'open',"CRMOppty_EditVersion" bigint default 1,"CRMOppty_IsDeleted" boolean default false,"CRMOppty_ProbabilityPct" numeric,"CRMOppty_ExpectedValueAmount" numeric,"CRMOppty_WeightedValueAmount" numeric,"CRMOppty_ExpectedMarginAmount" numeric,"CRMOppty_ExpectedCloseDate" date,"CRMOppty_NextActionDueAt" timestamptz,"CRMOppty_CurrencyCode" text default 'GBP',"CRMOppty_UpdatedAt" timestamptz,"CRMOppty_UpdatedBy" uuid);
      create function public._multideck_crm_deal_is_operator_visible(id uuid,company uuid) returns boolean language sql stable as $$ select exists(select 1 from public."CRM_Opportunities" d join public."CRM_Pipelines" p on p."CRMPipeline_ID"=d."CRMOppty_PipelineID" where d."CRMOppty_ID"=id and p."Company_ID"=company and not p."Is_Deleted" and not d."CRMOppty_IsDeleted") $$;
      create function public._multideck_crm_deal_json(id uuid,company uuid) returns jsonb language sql stable as $$ select to_jsonb(d) from public."CRM_Opportunities" d where d."CRMOppty_ID"=id $$;
      create table public."CRM_OpportunityStageHistory" ("CRMOpptyStage_ID" uuid,"CRMOpptyStage_OpportunityID" uuid,"CRMOpptyStage_FromStageCode" text,"CRMOpptyStage_ToStageCode" text,"CRMOpptyStage_ProbabilityPct" numeric,"CRMOpptyStage_Reason" text,"CRMOpptyStage_ChangedAt" timestamptz,"CRMOpptyStage_ChangedBy" uuid);
      create function increment_version() returns trigger language plpgsql as $$ begin new."CRMOppty_EditVersion":=old."CRMOppty_EditVersion"+1;return new;end $$;
      create trigger version before update on public."CRM_Opportunities" for each row execute function increment_version();
      create table public."sys_AIDexterDataDomains" ("AIDexterDomain_Code" text primary key,"AIDexterDomain_Name" text,"AIDexterDomain_Description" text,"AIDexterDomain_QueryFunction" text,"AIDexterDomain_SortOrder" integer,"AIDexterDomain_IsActive" boolean,"AIDexterDomain_RequiredPermissionsJSON" jsonb,"AIDexterDomain_DataCategoriesJSON" jsonb,"AIDexterDomain_ScopeStrategy" text);
      create table public."sys_AIDexterActions" ("AIDexterAction_Code" text primary key,"AIDexterAction_DomainCode" text,"AIDexterAction_Name" text,"AIDexterAction_Description" text,"AIDexterAction_Function" text,"AIDexterAction_ParametersJSON" jsonb,"AIDexterAction_SortOrder" integer,"AIDexterAction_IsActive" boolean,"AIDexterAction_RequiredPermissionsJSON" jsonb,"AIDexterAction_IntentFamily" text,"AIDexterAction_ScopeStrategy" text,"AIDexterAction_AlwaysRequiresApproval" boolean);
      create table public."sys_AIDexterWatchCapabilities" ("AIDexterWatchCapability_Code" text,"AIDexterWatchCapability_Description" text,"AIDexterWatchCapability_FieldsJSON" jsonb);
      insert into public."sys_AIDexterWatchCapabilities" values('deals','Deals','["stage"]');
      create table public."AI_DexterWatches" ("AIDexterWatch_CompanyID" uuid,"AIDexterWatch_CapabilityCode" text,"AIDexterWatch_StatusCode" text,"AIDexterWatch_TargetID" uuid);
      create table public."AI_DexterWatchSignals" ("AIDexterWatchSignal_CompanyID" uuid,"AIDexterWatchSignal_CapabilityCode" text,"AIDexterWatchSignal_SourceTable" text,"AIDexterWatchSignal_SourceID" uuid,"AIDexterWatchSignal_OldJSON" jsonb,"AIDexterWatchSignal_NewJSON" jsonb);
      ${writer}
      ${migration}
      create function expect_denied(company uuid,actor uuid,args jsonb,code text) returns void language plpgsql as $$ begin
        begin perform public.multideck_dexter_action_move_deal_stage(company,actor,args);
        exception when others then if sqlstate<>code then raise;end if;return;end;
        raise exception 'Move unexpectedly succeeded' using errcode='XX000';end $$;
      do $$ declare
        company uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();identity uuid:=gen_random_uuid();other_company uuid:=gen_random_uuid();
        p1 uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();s1 uuid:=gen_random_uuid();s2 uuid:=gen_random_uuid();deal uuid:=gen_random_uuid();
        stamp timestamptz:=now();args jsonb;result jsonb;prior_sub text:=gen_random_uuid()::text;
      begin
        insert into public."cmp_Users" values(actor,company,identity,'active');
        insert into public."CRM_Pipelines" ("CRMPipeline_ID","Company_ID","CRMPipeline_Name","Updated_At") values(p1,company,'Freight',stamp),(p2,company,'Renewal',stamp);
        insert into public."CRM_PipelineStages" ("CRMPipelineStage_ID","Company_ID","CRMPipeline_ID","CRMPipelineStage_Name","CRMPipelineStage_ProbabilityPct","Updated_At") values(s1,company,p1,'Review',10,stamp),(s2,company,p2,'Review',60,stamp);
        insert into public."CRM_Opportunities" ("CRMOppty_ID","CRMOppty_Name","CRMOppty_PipelineID","CRMOppty_PipelineStageID","CRMOppty_ProbabilityPct","CRMOppty_ExpectedValueAmount","CRMOppty_WeightedValueAmount") values(deal,'Stage QA',p1,s1,10,100,10);
        insert into public."AI_DexterWatches" values(company,'deals','active',deal);
        perform set_config('request.jwt.claim.role','service_role',true);perform set_config('request.jwt.claim.sub',prior_sub,true);perform set_config('test.can_write','yes',true);
        args:=jsonb_build_object('target_id',deal,'pipeline_id',p2,'stage_id',s2,'expected_version',1,'expected_stage_updated_at',stamp,'expected_pipeline_updated_at',stamp,'reason','QA');
        if jsonb_array_length(public.multideck_dexter_domain_deal_move_state(company,deal::text,1))<>1 or public.multideck_dexter_domain_deal_move_state(other_company,deal::text,1)<>'[]'::jsonb then raise exception 'Deal read scope failed';end if;
        if jsonb_array_length(public.multideck_dexter_domain_deal_stage_options(company,p2::text,25))<>1 or public.multideck_dexter_domain_deal_stage_options(other_company,null,25)<>'[]'::jsonb then raise exception 'Stage read scope failed';end if;
        perform expect_denied(other_company,actor,args,'42501');perform expect_denied(company,gen_random_uuid(),args,'42501');
        perform set_config('test.can_write','no',true);perform expect_denied(company,actor,args,'42501');perform set_config('test.can_write','yes',true);
        perform expect_denied(company,actor,args||'{"expected_version":2}','P0001');
        perform expect_denied(company,actor,args||jsonb_build_object('expected_stage_updated_at',stamp-interval '1 second'),'P0001');
        perform expect_denied(company,actor,args||jsonb_build_object('pipeline_id',p1),'22023');
        update public."CRM_PipelineStages" set "CRMPipelineStage_IsConversion"=true where "CRMPipelineStage_ID"=s2;
        perform expect_denied(company,actor,args,'22023');
        update public."CRM_PipelineStages" set "CRMPipelineStage_IsConversion"=false where "CRMPipelineStage_ID"=s2;
        result:=public.multideck_dexter_action_move_deal_stage(company,actor,args);
        if current_setting('request.jwt.claim.sub',true)<>prior_sub then raise exception 'Actor claim leaked';end if;
        if (select "CRMOppty_WeightedValueAmount"<>60 or "CRMOppty_PipelineStageID"<>s2 or "CRMOppty_EditVersion"<>2 from public."CRM_Opportunities" where "CRMOppty_ID"=deal) then raise exception 'Canonical move failed';end if;
        if (select count(*) from public."CRM_OpportunityStageHistory")<>1 or (select count(*) from public."AI_DexterWatchSignals")<>1 then raise exception 'History/signal count is wrong';end if;
        if (select "AIDexterWatchSignal_OldJSON"->>'stage' <> "AIDexterWatchSignal_NewJSON"->>'stage' or "AIDexterWatchSignal_OldJSON"->>'pipelineId'="AIDexterWatchSignal_NewJSON"->>'pipelineId' from public."AI_DexterWatchSignals") then raise exception 'Same-label pipeline move was not represented';end if;
        perform expect_denied(company,actor,args,'P0001');
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused';
        perform public.multideck_dexter_action_move_deal_stage(company,actor,args||jsonb_build_object('pipeline_id',p1,'stage_id',s1,'expected_version',2));
        if (select count(*) from public."AI_DexterWatchSignals")<>1 then raise exception 'Paused watch emitted';end if;
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active';
        perform public.multideck_dexter_action_move_deal_stage(company,actor,args||'{"expected_version":3}');
        if (select count(*) from public."AI_DexterWatchSignals")<>2 then raise exception 'Resume did not emit once';end if;
        update public."AI_DexterWatches" set "AIDexterWatch_TargetID"=gen_random_uuid();
        perform public.multideck_dexter_action_move_deal_stage(company,actor,args||jsonb_build_object('pipeline_id',p1,'stage_id',s1,'expected_version',4));
        if (select count(*) from public."AI_DexterWatchSignals")<>2 then raise exception 'Non-matching target emitted';end if;
        perform set_config('request.jwt.claim.role','authenticated',true);perform expect_denied(company,actor,args||'{"expected_version":5}','42501');
        if has_function_privilege('authenticated','public.multideck_dexter_action_move_deal_stage(uuid,uuid,jsonb)','execute') or has_function_privilege('anon','public.multideck_dexter_domain_deal_move_state(uuid,text,integer)','execute') then raise exception 'Internal boundary was exposed';end if;
      end $$;
    `)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'])
    rmSync(directory, { recursive: true, force: true })
  }
})
