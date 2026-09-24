-- Bounded shared sales narrative, with source-level revocation for saved themes.
begin;
set local lock_timeout='5s';

alter table public."AI_CrmSalesBriefings"
 add column lease_narrative_sources jsonb not null default '[]',
 add column result_narrative_sources jsonb not null default '[]';

-- CRM_Notes is RLS-protected and currently has no shared operator read policy.
-- Deliberately do not read it, personal To Do, mail or call records here. Only
-- feedback already exposed on the shared deal detail is eligible.
create function public._multideck_crm_sales_narrative_sources(p_company_id uuid)
returns table(id text,deal_id uuid,kind text,body text,recorded_at timestamptz,signature text)
language sql stable security definer set search_path=pg_catalog,public as $$
 with sources as (
 select 'loss_feedback:'||d."CRMOppty_ID"::text id,d."CRMOppty_ID" deal_id,'loss_feedback'::text kind,
 btrim(d."CRMOppty_LossDetails") body,d."CRMOppty_LostAt" recorded_at
 from public."CRM_Opportunities" d
 where public._multideck_crm_deal_is_operator_visible(d."CRMOppty_ID",p_company_id)
 and public._multideck_crm_deal_outcome(d)='lost' and d."CRMOppty_LostAt" is not null
 and nullif(btrim(d."CRMOppty_LossDetails"),'') is not null
 union all
 select 'action_outcome:'||a.id::text,a.deal_id,'action_outcome',btrim(a.completion_note),a.completed_at
 from public."CRM_DealActions" a
 where a.company_id=p_company_id and a.status='completed' and a.completed_at is not null
 and nullif(btrim(a.completion_note),'') is not null
 and public._multideck_crm_deal_is_operator_visible(a.deal_id,p_company_id)
 )
 select s.*,md5(jsonb_build_array(s.id,s.deal_id,s.kind,s.body,to_char(s.recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text) from sources s
 where exists(select 1 from public."CRM_Opportunities" d join public."CRM_PipelineStages" stage on stage."CRMPipelineStage_ID"=d."CRMOppty_PipelineStageID" where d."CRMOppty_ID"=s.deal_id and stage."Company_ID"=p_company_id);
$$;

create function public._multideck_crm_sales_narrative_deals(p_company_id uuid,p_deal_ids uuid[],p_as_of timestamptz)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',d."CRMOppty_ID",'name',d."CRMOppty_Name",
 'outcome',public._multideck_crm_deal_outcome(d),
 'closedAt',case public._multideck_crm_deal_outcome(d) when 'won' then d."CRMOppty_WonAt" when 'lost' then d."CRMOppty_LostAt" end,
 'ownerId',d."CRMOppty_OwnerUserID",'pipelineId',p."CRMPipeline_ID",'pipelineName',p."CRMPipeline_Name",'stageId',s."CRMPipelineStage_ID",'stageName',s."CRMPipelineStage_Name",
 'daysInStage',case when public._multideck_crm_deal_outcome(d)='open' and entry.started_at is not null then round(greatest(0,extract(epoch from(p_as_of-entry.started_at))/86400)::numeric,1) end
 ) order by d."CRMOppty_ID"),'[]'::jsonb)
 from public."CRM_Opportunities" d
 join public."CRM_Pipelines" p on p."CRMPipeline_ID"=d."CRMOppty_PipelineID" and p."Company_ID"=p_company_id
 join public."CRM_PipelineStages" s on s."CRMPipelineStage_ID"=d."CRMOppty_PipelineStageID" and s."Company_ID"=p_company_id
 left join lateral (
 select max(e.occurred_at) started_at from public."CRM_DealEvents" e
 where e.company_id=p_company_id and e.deal_id=d."CRMOppty_ID" and e.occurred_at<=p_as_of
 and e.after_data->>'stageId'=d."CRMOppty_PipelineStageID"::text
 and (e.before_data is null or e.before_data->>'stageId' is distinct from e.after_data->>'stageId'
 or (e.before_data->>'outcome' is distinct from 'open' and e.after_data->>'outcome'='open'))
 ) entry on true
 where d."CRMOppty_ID"=any(p_deal_ids) and public._multideck_crm_deal_is_operator_visible(d."CRMOppty_ID",p_company_id);
$$;

alter function public.multideck_crm_get_sales_insights(integer,uuid,uuid) rename to _multideck_crm_get_sales_insights_before_narrative_20260922;
create function public.multideck_crm_get_sales_insights(p_days integer default 90,p_pipeline_id uuid default null,p_owner_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
declare ctx record;snapshot jsonb;narrative jsonb;since timestamptz;as_of timestamptz;
begin
 snapshot:=public._multideck_crm_get_sales_insights_before_narrative_20260922(p_days,p_pipeline_id,p_owner_id);
 select * into ctx from public._multideck_crm_sales_context(false);
 since:=(snapshot->'period'->>'from')::timestamptz;as_of:=(snapshot->'period'->>'to')::timestamptz;
 with eligible as materialized (
 select n.* from public._multideck_crm_sales_narrative_sources(ctx.company_id) n
 join public."CRM_Opportunities" d on d."CRMOppty_ID"=n.deal_id
 where n.recorded_at>=since and n.recorded_at<=as_of
 and (p_pipeline_id is null or d."CRMOppty_PipelineID"=p_pipeline_id)
 and (p_owner_id is null or d."CRMOppty_OwnerUserID"=p_owner_id)
 ), selected as materialized(select * from eligible order by recorded_at desc,id limit 40)
 select jsonb_build_object('version',1,'from',snapshot->'period'->'from','to',snapshot->'period'->'to',
 'totalDocuments',(select count(*) from eligible),'includedDocuments',(select count(*) from selected),
 'totalDeals',(select count(distinct deal_id) from eligible),'includedDeals',(select count(distinct deal_id) from selected),
 'truncated',(select count(*)>40 from eligible),
 'documents',coalesce((select jsonb_agg(jsonb_build_object('id',id,'dealId',deal_id,'kind',kind,'text',left(body,600),'recordedAt',recorded_at) order by recorded_at desc,id) from selected),'[]'::jsonb),
 'deals',public._multideck_crm_sales_narrative_deals(ctx.company_id,coalesce((select array_agg(distinct deal_id) from selected),'{}'::uuid[]),as_of)) into narrative;
 return snapshot||jsonb_build_object('narrative',narrative,'definitions',coalesce(snapshot->'definitions','{}'::jsonb)||jsonb_build_object(
 'narrative','Shared current loss feedback and completed deal-action outcomes recorded during the selected period, using current owner/pipeline filters. Up to 40 newest documents, each limited to 600 characters. Counts describe this narrative cohort, not the whole pipeline. Notes without a shared read boundary, personal tasks, mail, calls and restricted/deleted sources are excluded. Theme grouping is generated; outcome and stage metadata are measured.'
 ));
end $$;

create function public._multideck_crm_sales_narrative_manifest(p_company_id uuid,p_documents jsonb)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',d->>'id','dealId',d->>'dealId','kind',d->>'kind',
 'signature',case when n.deal_id::text=d->>'dealId' and n.kind=d->>'kind' and left(n.body,600)=d->>'text'
 and n.recorded_at=(d->>'recordedAt')::timestamptz then n.signature else 'invalid' end) order by d->>'id'),'[]'::jsonb)
 from jsonb_array_elements(coalesce(p_documents,'[]'::jsonb)) d
 left join public._multideck_crm_sales_narrative_sources(p_company_id) n on n.id=d->>'id';
$$;

create function public._multideck_crm_sales_narrative_manifest_visible(p_company_id uuid,p_manifest jsonb)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select not exists(select 1 from jsonb_array_elements(p_manifest) m
 left join public._multideck_crm_sales_narrative_sources(p_company_id) n
 on n.id=m->>'id' and n.deal_id::text=m->>'dealId' and n.kind=m->>'kind' and n.signature=m->>'signature'
 where n.id is null);
$$;

alter function public.multideck_crm_claim_sales_briefing_jobs(integer) rename to _multideck_crm_claim_sales_briefings_before_narrative_20260922;
create function public.multideck_crm_claim_sales_briefing_jobs(p_limit integer default 2)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare jobs jsonb;j jsonb;result jsonb:='[]';company uuid;
begin
 jobs:=public._multideck_crm_claim_sales_briefings_before_narrative_20260922(p_limit);
 for j in select value from jsonb_array_elements(jobs) loop
 company:=(j->>'companyId')::uuid;
 update public."AI_CrmSalesBriefings" set lease_narrative_sources=public._multideck_crm_sales_narrative_manifest(company,j->'snapshot'->'narrative'->'documents')
 where company_id=company and lease_id=(j->>'leaseId')::uuid;
 if not public._multideck_crm_sales_narrative_manifest_visible(company,(select result_narrative_sources from public."AI_CrmSalesBriefings" where company_id=company)) then j:=j||jsonb_build_object('lastFingerprint',null);end if;
 result:=result||jsonb_build_array(j);
 end loop;return result;
end $$;

alter function public.multideck_crm_validate_sales_briefing_job(uuid,uuid,uuid) rename to _multideck_crm_validate_sales_briefing_before_narrative_20260922;
create function public.multideck_crm_validate_sales_briefing_job(p_company_id uuid,p_user_id uuid,p_lease_id uuid)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if not public._multideck_crm_validate_sales_briefing_before_narrative_20260922(p_company_id,p_user_id,p_lease_id) then return false;end if;
 return exists(select 1 from public."AI_CrmSalesBriefings" r where r.company_id=p_company_id and r.lease_id=p_lease_id
 and public._multideck_crm_sales_narrative_manifest_visible(p_company_id,r.lease_narrative_sources));
end $$;

alter function public.multideck_crm_finish_sales_briefing_job(uuid,uuid,uuid,text,jsonb,boolean) rename to _multideck_crm_finish_sales_briefing_before_narrative_20260922;
create function public.multideck_crm_finish_sales_briefing_job(p_company_id uuid,p_user_id uuid,p_lease_id uuid,p_fingerprint text,p_result jsonb,p_skipped boolean default false)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public."AI_CrmSalesBriefings";finished boolean;
begin
 if not public.multideck_crm_validate_sales_briefing_job(p_company_id,p_user_id,p_lease_id) then return false;end if;
 select * into r from public."AI_CrmSalesBriefings" where company_id=p_company_id and lease_id=p_lease_id for update;
 if not found then return false;end if;
 if p_skipped and not public._multideck_crm_sales_narrative_manifest_visible(p_company_id,r.result_narrative_sources) then raise exception 'Saved narrative sources changed; generate from the current snapshot.' using errcode='22023';end if;
 finished:=public._multideck_crm_finish_sales_briefing_before_narrative_20260922(p_company_id,p_user_id,p_lease_id,p_fingerprint,p_result,p_skipped);
 if finished and not p_skipped then update public."AI_CrmSalesBriefings" set result_narrative_sources=r.lease_narrative_sources where company_id=p_company_id;end if;
 return finished;
end $$;

alter function public.multideck_crm_get_sales_briefing() rename to _multideck_crm_get_sales_briefing_before_narrative_20260922;
create function public.multideck_crm_get_sales_briefing()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
declare ctx record;briefing jsonb;manifest jsonb;ids uuid[];
begin
 briefing:=public._multideck_crm_get_sales_briefing_before_narrative_20260922();
 select * into ctx from public._multideck_crm_sales_context(false);
 select result_narrative_sources into manifest from public."AI_CrmSalesBriefings" where company_id=ctx.company_id;
 if not public._multideck_crm_sales_narrative_manifest_visible(ctx.company_id,coalesce(manifest,'[]'::jsonb)) then
 return briefing||jsonb_build_object('result',null,'generatedAt',null,'resultWithheld',true,'status','pending');end if;
 if briefing->'result'->>'schemaVersion'='3' then
 select array_agg(distinct (d->>'id')::uuid) into ids from jsonb_array_elements(coalesce(briefing->'result'->'narrative'->'deals','[]'::jsonb)) d
 where d->>'id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
 briefing:=jsonb_set(briefing,'{result,narrative,deals}',public._multideck_crm_sales_narrative_deals(ctx.company_id,coalesce(ids,'{}'::uuid[]),now()));
 briefing:=jsonb_set(briefing,'{result,metricsAsOf}',to_jsonb(now()));
 end if;return briefing;
end $$;

create function public._multideck_crm_sales_narrative_action_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if tg_op='UPDATE' and (old.deal_id,old.company_id,old.status,old.completed_at,old.completion_note) is not distinct from (new.deal_id,new.company_id,new.status,new.completed_at,new.completion_note) then return new;end if;
 if tg_op<>'INSERT' and old.status='completed' and nullif(btrim(old.completion_note),'') is not null then perform public._multideck_crm_queue_sales_briefing(old.company_id);end if;
 if tg_op<>'DELETE' and new.status='completed' and nullif(btrim(new.completion_note),'') is not null then perform public._multideck_crm_queue_sales_briefing(new.company_id);end if;
 return coalesce(new,old);
end $$;
create trigger "TR_CRM_DealActions_sales_narrative" after insert or update or delete on public."CRM_DealActions"
for each row execute function public._multideck_crm_sales_narrative_action_change();

-- Refresh the new source dependency once, preserving existing debounce, leases,
-- finite retries and the six-hour company claim ceiling.
do $$declare company uuid;begin for company in select company_id from public."AI_CrmSalesBriefings" loop perform public._multideck_crm_queue_sales_briefing(company);end loop;end $$;

update public."sys_AIDexterDataDomains" set "AIDexterDomain_Description"='Measured sales snapshot with bounded shared loss feedback and completed deal-action outcomes. Narrative theme grouping is generated; source excerpts and cohort coverage are explicit. Personal/restricted notes and communications are unsupported.' where "AIDexterDomain_Code"='sales_insights';
update public."sys_AIDexterDataDomains" set "AIDexterDomain_Description"='Read saved generated sales themes and evidence with current measured outcome/stage/owner metadata. Source visibility is rechecked; reads never generate. Distinguish generated classification from measured counts and disclose bounded narrative coverage.' where "AIDexterDomain_Code"='sales_briefing';
update public."sys_AIDexterWatchCapabilities" set "AIDexterWatchCapability_Description"='Notify when changed sales evidence produces a new saved company briefing or generated narrative themes. Exact workspace target; deterministic notifications never generate analysis.' where "AIDexterWatchCapability_Code"='sales_briefing';

do $$declare fn regprocedure;begin
for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (
'_multideck_crm_sales_narrative_sources','_multideck_crm_sales_narrative_deals','_multideck_crm_sales_narrative_manifest','_multideck_crm_sales_narrative_manifest_visible','_multideck_crm_sales_narrative_action_change',
'_multideck_crm_get_sales_insights_before_narrative_20260922','_multideck_crm_claim_sales_briefings_before_narrative_20260922','_multideck_crm_validate_sales_briefing_before_narrative_20260922','_multideck_crm_finish_sales_briefing_before_narrative_20260922','_multideck_crm_get_sales_briefing_before_narrative_20260922') loop execute format('revoke all on function %s from public,anon,authenticated,service_role',fn);end loop;
end $$;
revoke all on function public.multideck_crm_claim_sales_briefing_jobs(integer),public.multideck_crm_validate_sales_briefing_job(uuid,uuid,uuid),public.multideck_crm_finish_sales_briefing_job(uuid,uuid,uuid,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.multideck_crm_claim_sales_briefing_jobs(integer),public.multideck_crm_validate_sales_briefing_job(uuid,uuid,uuid),public.multideck_crm_finish_sales_briefing_job(uuid,uuid,uuid,text,jsonb,boolean) to service_role;
revoke all on function public.multideck_crm_get_sales_insights(integer,uuid,uuid),public.multideck_crm_get_sales_briefing() from public,anon;
grant execute on function public.multideck_crm_get_sales_insights(integer,uuid,uuid),public.multideck_crm_get_sales_briefing() to authenticated,service_role;
commit;
