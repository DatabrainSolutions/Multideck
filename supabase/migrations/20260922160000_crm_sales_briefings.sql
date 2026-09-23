-- Saved company sales briefings: database changes queue work; page reads never
-- generate. Quiet debounce, six-hour company ceiling and finite leased retries.
begin;
set local lock_timeout='5s';

create table public."AI_CrmSalesBriefings" (
 company_id uuid primary key references public."cmp_Company"("Company_ID"),
 result jsonb, result_source_ids uuid[] not null default '{}', result_is_empty boolean not null default false, fingerprint text, generated_at timestamptz, checked_at timestamptz,
 status text not null default 'pending' check(status in ('pending','processing','ready','failed')),
 dirty_version bigint not null default 1, processed_version bigint not null default 0,
 pending_since timestamptz default now(),last_changed_at timestamptz not null default now(),due_at timestamptz not null default now()+interval '5 minutes',
 attempts integer not null default 0 check(attempts between 0 and 3),retry_at timestamptz,last_claimed_at timestamptz,
 lease_id uuid,lease_user_id uuid references public."cmp_Users"("User_ID"),lease_version bigint,lease_snapshot_deals bigint,lease_source_ids uuid[] not null default '{}',lease_until timestamptz,
 last_error_code varchar(80),last_dispatched_at timestamptz,updated_at timestamptz not null default now(),
 check(fingerprint is null or fingerprint ~ '^[a-f0-9]{64}$'),
 check(result is null or (jsonb_typeof(result)='object' and octet_length(result::text)<=60000))
);
alter table public."AI_CrmSalesBriefings" enable row level security;
revoke all on public."AI_CrmSalesBriefings" from public,anon,authenticated;

create function public._multideck_crm_briefing_actor(p_company_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public."cmp_Users" u where u."User_ID"=p_user_id and u."Company_ID"=p_company_id
 and u."User_AccessStatus"='active' and u."Auth_User_ID" is not null
 and (select count(*) from public."cmp_Users" linked where linked."Auth_User_ID"=u."Auth_User_ID")=1
 and public._multideck_crm_has_permission(u."User_ID",'CRM.Read'));
$$;

create function public._multideck_crm_queue_sales_briefing(p_company_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if p_company_id is null then return;end if;
 insert into public."AI_CrmSalesBriefings"(company_id) values(p_company_id)
 on conflict(company_id) do update set
 dirty_version="AI_CrmSalesBriefings".dirty_version+1,
 pending_since=coalesce("AI_CrmSalesBriefings".pending_since,now()),last_changed_at=now(),
 due_at=least(now()+interval '5 minutes',coalesce("AI_CrmSalesBriefings".pending_since,now())+interval '30 minutes'),
 status=case when "AI_CrmSalesBriefings".status='processing' then 'processing' else 'pending' end,
 attempts=case when "AI_CrmSalesBriefings".status in ('ready','failed') then 0 else "AI_CrmSalesBriefings".attempts end,
 retry_at=case when "AI_CrmSalesBriefings".status='failed' then null else "AI_CrmSalesBriefings".retry_at end,
 last_error_code=case when "AI_CrmSalesBriefings".status='failed' then null else "AI_CrmSalesBriefings".last_error_code end,
 updated_at=now();
end $$;

create function public._multideck_crm_briefing_deal_event()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.kind in ('created','changed') and new.before_data is distinct from new.after_data then
 perform public._multideck_crm_queue_sales_briefing(new.company_id);end if;
 return new;
end $$;
create trigger "TR_CRM_DealEvents_sales_briefing" after insert on public."CRM_DealEvents"
 for each row execute function public._multideck_crm_briefing_deal_event();

-- Deletion/restoration and names change snapshot membership or source labels,
-- even when the lifecycle evidence trigger has no visible deal row to publish.
create function public._multideck_crm_briefing_deal_membership()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare company uuid;old_company uuid;
begin
 if (old."CRMOppty_IsDeleted",old."CRMOppty_Name",old."CRMOppty_PipelineID",old."CRMOppty_OrgID",old."CRMOppty_MetadataJSON") is not distinct from (new."CRMOppty_IsDeleted",new."CRMOppty_Name",new."CRMOppty_PipelineID",new."CRMOppty_OrgID",new."CRMOppty_MetadataJSON") then return new;end if;
 select "Company_ID" into company from public."CRM_Pipelines" where "CRMPipeline_ID"=new."CRMOppty_PipelineID";
 select "Company_ID" into old_company from public."CRM_Pipelines" where "CRMPipeline_ID"=old."CRMOppty_PipelineID";
 if company is not null then perform public._multideck_crm_queue_sales_briefing(company);end if;
 if old_company is distinct from company then perform public._multideck_crm_queue_sales_briefing(old_company);end if;
 return new;
end $$;
create trigger "TR_CRM_Opportunities_briefing_membership" after update of "CRMOppty_IsDeleted","CRMOppty_Name","CRMOppty_PipelineID","CRMOppty_OrgID","CRMOppty_MetadataJSON" on public."CRM_Opportunities"
 for each row execute function public._multideck_crm_briefing_deal_membership();

-- Related visibility and stage-label changes also invalidate the shared scope.
create function public._multideck_crm_briefing_related_scope()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare company uuid;
begin
 if to_jsonb(old) is not distinct from to_jsonb(new) then return new;end if;
 if tg_table_name in ('CRM_Pipelines','CRM_PipelineStages') then
 perform public._multideck_crm_queue_sales_briefing((to_jsonb(old)->>'Company_ID')::uuid);
 if to_jsonb(new)->>'Company_ID' is distinct from to_jsonb(old)->>'Company_ID' then perform public._multideck_crm_queue_sales_briefing((to_jsonb(new)->>'Company_ID')::uuid);end if;
 else
 for company in select distinct p."Company_ID" from public."CRM_Opportunities" d join public."CRM_Pipelines" p on p."CRMPipeline_ID"=d."CRMOppty_PipelineID" where d."CRMOppty_OrgID" in ((to_jsonb(old)->>'CRMAccount_OrgID')::uuid,(to_jsonb(new)->>'CRMAccount_OrgID')::uuid) loop
 perform public._multideck_crm_queue_sales_briefing(company);end loop;
 end if;return new;
end $$;
create trigger "TR_CRM_Pipelines_briefing_scope" after update of "Company_ID","Is_Deleted","CRMPipeline_Name" on public."CRM_Pipelines" for each row execute function public._multideck_crm_briefing_related_scope();
create trigger "TR_CRM_PipelineStages_briefing_scope" after update of "Company_ID","Is_Deleted","CRMPipeline_ID","CRMPipelineStage_Name" on public."CRM_PipelineStages" for each row execute function public._multideck_crm_briefing_related_scope();
create trigger "TR_CRM_AccountProfiles_briefing_scope" after update of "CRMAccount_IsDeleted","CRMAccount_MetadataJSON","CRMAccount_OrgID" on public."CRM_AccountProfiles" for each row execute function public._multideck_crm_briefing_related_scope();

insert into public."AI_CrmSalesBriefings"(company_id)
 select c."Company_ID" from public."cmp_Company" c
 where exists(select 1 from public."cmp_Users" u where public._multideck_crm_briefing_actor(c."Company_ID",u."User_ID"))
 on conflict(company_id) do nothing;

create function public._multideck_crm_sales_briefing_configured()
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare endpoint text;secret text;scheduled boolean;
begin
 if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null or to_regprocedure('cron.schedule(text,text,text)') is null or to_regclass('cron.job') is null then return false;end if;
 execute 'select exists(select 1 from cron.job j where jobname=$1 and command=$2 and coalesce((to_jsonb(j)->>''active'')::boolean,true))' into scheduled using 'multideck-crm-sales-briefings','select public._multideck_crm_dispatch_sales_briefings()';
 if not scheduled then return false;end if;
 if to_regclass('vault.decrypted_secrets') is null then return false;end if;
 execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into endpoint using 'multideck_crm_sales_worker_endpoint';
 execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into secret using 'multideck_crm_sales_worker_secret';
 return coalesce(endpoint ~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/crm-sales-insights$',false) and length(coalesce(secret,''))>=32;
end $$;

create function public.multideck_crm_get_sales_briefing()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
declare ctx record;r public."AI_CrmSalesBriefings";visible boolean;
begin
 select * into ctx from public._multideck_crm_sales_context(false);
 select * into r from public."AI_CrmSalesBriefings" where company_id=ctx.company_id;
 visible:=not exists(select 1 from unnest(r.result_source_ids) id where not public._multideck_crm_deal_is_operator_visible(id,ctx.company_id));
 return jsonb_build_object('result',case when visible then r.result end,'resultWithheld',not visible,'generatedAt',case when visible then r.generated_at end,'checkedAt',r.checked_at,
 'status',case when r.company_id is null then 'unavailable' when not visible then 'pending' when r.status='failed' then 'failed' when r.result is not null and r.dirty_version>r.processed_version then 'stale' when r.status='processing' then 'generating' else r.status end,
 'refreshStatus',r.status,'lastErrorCode',r.last_error_code,'pendingSince',r.pending_since,'scope',jsonb_build_object('companyId',ctx.company_id,'days',90,'pipelineId',null,'ownerId',null),
 'automationReady',public._multideck_crm_sales_briefing_configured());
end $$;

create function public.multideck_crm_sales_briefing_worker_secret()
returns text language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare secret text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'server_only' using errcode='42501';end if;
 if to_regclass('vault.decrypted_secrets') is null then return null;end if;
 execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into secret using 'multideck_crm_sales_worker_secret';
 return case when length(coalesce(secret,''))>=32 then secret end;
end $$;

create function public.multideck_crm_validate_sales_briefing_job(p_company_id uuid,p_user_id uuid,p_lease_id uuid)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'server_only' using errcode='42501';end if;
 return public._multideck_crm_briefing_actor(p_company_id,p_user_id) and exists(select 1 from public."AI_CrmSalesBriefings" r where r.company_id=p_company_id and r.lease_user_id=p_user_id and r.lease_id=p_lease_id and r.status='processing' and r.lease_until>now() and not exists(select 1 from unnest(r.lease_source_ids) id where not public._multideck_crm_deal_is_operator_visible(id,p_company_id)));
end $$;

create function public.multideck_crm_claim_sales_briefing_jobs(p_limit integer default 2)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare r public."AI_CrmSalesBriefings";actor uuid;actor_auth uuid;lease uuid;snapshot jsonb;result jsonb:='[]';previous_sub text:=current_setting('request.jwt.claim.sub',true);
begin
 if auth.role() is distinct from 'service_role' then raise exception 'server_only' using errcode='42501';end if;
 -- An interrupted worker consumes its bounded attempt; its lease cannot be
 -- reused. Reclaim waits for the same company cooldown as any provider retry.
 update public."AI_CrmSalesBriefings" set status=case when attempts>=3 then 'failed' else 'pending' end,
 retry_at=greatest(now()+make_interval(hours=>greatest(1,attempts)*6),last_claimed_at+interval '6 hours'),
 lease_id=null,lease_user_id=null,lease_version=null,lease_until=null,last_error_code='lease_expired',updated_at=now()
 where status='processing' and lease_until<=now();
 for r in select * from public."AI_CrmSalesBriefings" where status='pending' and dirty_version>processed_version
 and attempts<3 and due_at<=now() and (retry_at is null or retry_at<=now())
 and (last_claimed_at is null or last_claimed_at<=now()-interval '6 hours')
 order by due_at,company_id for update skip locked limit greatest(1,least(coalesce(p_limit,2),5)) loop
 select u."User_ID",u."Auth_User_ID" into actor,actor_auth from public."cmp_Users" u
 where public._multideck_crm_briefing_actor(r.company_id,u."User_ID") order by u."User_ID" limit 1;
 if actor is null then continue;end if;
 lease:=gen_random_uuid();
 update public."AI_CrmSalesBriefings" set status='processing',lease_id=lease,lease_user_id=actor,lease_version=dirty_version,
 lease_until=now()+interval '10 minutes',last_claimed_at=now(),attempts=attempts+1,last_error_code=null,updated_at=now() where company_id=r.company_id;
 perform set_config('request.jwt.claim.sub',actor_auth::text,true);
 begin
 snapshot:=public.multideck_crm_get_sales_insights(90,null,null);
 update public."AI_CrmSalesBriefings" set lease_source_ids=coalesce((select array_agg(d."CRMOppty_ID" order by d."CRMOppty_ID") from public."CRM_Opportunities" d where public._multideck_crm_deal_is_operator_visible(d."CRMOppty_ID",r.company_id)),'{}'::uuid[]),lease_snapshot_deals=(snapshot->'coverage'->>'totalDeals')::bigint where company_id=r.company_id;
 perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
 exception when others then
 perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
 update public."AI_CrmSalesBriefings" set status=case when attempts>=3 then 'failed' else 'pending' end,
 retry_at=now()+interval '6 hours',lease_id=null,lease_user_id=null,lease_version=null,lease_until=null,last_error_code='snapshot_unavailable',updated_at=now() where company_id=r.company_id;
 continue;
 end;
 -- A changed source membership can leave bounded evidence/aggregate values
 -- identical. Never preserve a result that the shared getter must withhold.
 result:=result||jsonb_build_array(jsonb_build_object('companyId',r.company_id,'userId',actor,'leaseId',lease,'snapshot',snapshot,'lastFingerprint',case when not exists(select 1 from unnest(r.result_source_ids) id where not public._multideck_crm_deal_is_operator_visible(id,r.company_id)) then r.fingerprint end));
 end loop;
 return result;
end $$;

create function public.multideck_crm_finish_sales_briefing_job(p_company_id uuid,p_user_id uuid,p_lease_id uuid,p_fingerprint text,p_result jsonb,p_skipped boolean default false)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public."AI_CrmSalesBriefings";
begin
 if not public.multideck_crm_validate_sales_briefing_job(p_company_id,p_user_id,p_lease_id) then return false;end if;
 select * into r from public."AI_CrmSalesBriefings" where company_id=p_company_id and lease_id=p_lease_id and lease_user_id=p_user_id and status='processing' and lease_until>now() for update;
 if not found or not public._multideck_crm_briefing_actor(p_company_id,p_user_id) then return false;end if;
 if p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Invalid briefing fingerprint.' using errcode='22023';end if;
 if p_skipped then
 if r.fingerprint is distinct from p_fingerprint or (r.result is null and not r.result_is_empty)
 or exists(select 1 from unnest(r.result_source_ids) id where not public._multideck_crm_deal_is_operator_visible(id,p_company_id)) then raise exception 'A skipped briefing must match a currently visible saved result.' using errcode='22023';end if;
 elsif (p_result is null and r.lease_snapshot_deals is distinct from 0) or (p_result is not null and (jsonb_typeof(p_result)<>'object' or octet_length(p_result::text)>60000)) then raise exception 'Invalid briefing result.' using errcode='22023';end if;
 update public."AI_CrmSalesBriefings" set result=case when p_skipped then result else p_result end,
 result_source_ids=case when p_skipped then result_source_ids else r.lease_source_ids end,result_is_empty=case when p_skipped then result_is_empty else p_result is null end,fingerprint=p_fingerprint,generated_at=case when p_skipped then generated_at else now() end,checked_at=now(),processed_version=r.lease_version,
 status=case when dirty_version>r.lease_version then 'pending' else 'ready' end,
 pending_since=case when dirty_version>r.lease_version then pending_since else null end,
 attempts=0,retry_at=null,lease_id=null,lease_user_id=null,lease_version=null,lease_until=null,last_error_code=null,updated_at=now()
 where company_id=p_company_id;
 return true;
end $$;

create function public.multideck_crm_fail_sales_briefing_job(p_company_id uuid,p_user_id uuid,p_lease_id uuid,p_error_code text)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare changed integer;
begin
 if not public.multideck_crm_validate_sales_briefing_job(p_company_id,p_user_id,p_lease_id) then return false;end if;
 update public."AI_CrmSalesBriefings" set status=case when attempts>=3 then 'failed' else 'pending' end,
 retry_at=greatest(now()+make_interval(hours=>greatest(1,attempts)*6),last_claimed_at+interval '6 hours'),
 lease_id=null,lease_user_id=null,lease_version=null,lease_until=null,
 last_error_code=case when p_error_code in ('provider_unavailable','provider_error','invalid_response','access_revoked','snapshot_unavailable','generation_unavailable','access_changed','stale_lease','evidence_too_large','not_configured','invalid_evidence','usage_allowance_reached','model_capability_disabled','model_allowance_unavailable') then p_error_code else 'generation_failed' end,updated_at=now()
 where company_id=p_company_id and lease_id=p_lease_id and lease_user_id=p_user_id and status='processing' and lease_until>now();
 get diagnostics changed=row_count;return changed=1;
end $$;

create function public.multideck_dexter_domain_sales_briefing(p_company_id uuid,p_search text,p_take integer)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
declare ctx record;
begin
 select * into ctx from public._multideck_crm_sales_context(false);
 if ctx.company_id is distinct from p_company_id then raise exception 'This briefing is outside your workspace.' using errcode='42501';end if;
 return jsonb_build_array(public.multideck_crm_get_sales_briefing()||jsonb_build_object('recordId',ctx.company_id,'sourceTable','AI_CrmSalesBriefings','sourceUrl','/crm/insights','generatedContent',true));
end $$;
insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_SortOrder","AIDexterDomain_IsActive","AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON","AIDexterDomain_ScopeStrategy") values
 ('sales_briefing','Saved sales briefing','Read the saved company-wide 90-day AI sales briefing and its source evidence, generation date, scope, and refresh status. Reading never calls a model. Distinguish generated interpretation from measured sales data.','multideck_dexter_domain_sales_briefing',36,true,'["CRM.Read"]','["business_record"]','canonical');
insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_RequiredPermissionsJSON") values
 ('sales_briefing','Sales briefing','Notify when changed sales evidence produces a new saved company briefing. Exact workspace target; notifications never generate analysis.','["fingerprint","generatedAt","summary"]','["CRM.Read"]');

alter function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) rename to _multideck_dexter_create_watch_before_sales_briefing;
create function public.multideck_dexter_create_watch(p_capability text,p_title text,p_summary text,p_request text,p_target_id uuid,p_target_label text,p_rule jsonb,p_action jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare ctx record;
begin
 if lower(btrim(p_capability))='sales_briefing' then
 select * into ctx from public._multideck_crm_sales_context(false);
 if p_target_id is distinct from ctx.company_id then raise exception 'Choose this workspace briefing before creating a watch.' using errcode='42501';end if;
 if p_action is not null then raise exception 'Sales briefing watches notify only; they do not generate or change sales data.' using errcode='22023';end if;
 end if;
 return public._multideck_dexter_create_watch_before_sales_briefing(p_capability,p_title,p_summary,p_request,p_target_id,p_target_label,p_rule,p_action);
end $$;

create function public._multideck_crm_saved_briefing_signal()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.fingerprint is not distinct from old.fingerprint or new.result is null then return new;end if;
 if exists(select 1 from public."AI_DexterWatches" w where w."AIDexterWatch_CompanyID"=new.company_id and w."AIDexterWatch_CapabilityCode"='sales_briefing' and w."AIDexterWatch_TargetID"=new.company_id and w."AIDexterWatch_StatusCode"='active') then
 insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
 values(new.company_id,'sales_briefing','AI_CrmSalesBriefings',new.company_id,
 jsonb_build_object('fingerprint',old.fingerprint,'generatedAt',old.generated_at,'summary',left(old.result->>'summary',300)),
 jsonb_build_object('fingerprint',new.fingerprint,'generatedAt',new.generated_at,'summary',left(new.result->>'summary',300)));
 end if;return new;
end $$;
create trigger "TR_AI_CrmSalesBriefings_watch" after update on public."AI_CrmSalesBriefings" for each row execute function public._multideck_crm_saved_briefing_signal();

do $patch$
declare definition text;marker text:=E'and watch_row."AIDexterWatch_StatusCode" = ''active''';repeat_marker text:=E'watch."AIDexterWatch_CapabilityCode" = ''deals''';
begin
 definition:=pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
 if position(marker in definition)=0 or position(repeat_marker in definition)=0 then raise exception 'Review watch evaluator before enabling saved sales briefing events';end if;
 definition:=replace(definition,marker,marker||$guard$
 and (watch_row."AIDexterWatch_CapabilityCode"<>'sales_briefing' or (
 watch_row."AIDexterWatch_TargetID"=watch_row."AIDexterWatch_CompanyID"
 and new."AIDexterWatchSignal_SourceID"=watch_row."AIDexterWatch_CompanyID"
 and public._multideck_crm_briefing_actor(watch_row."AIDexterWatch_CompanyID",watch_row."AIDexterWatch_OwnerUserID")))$guard$);
 definition:=replace(definition,repeat_marker,E'watch."AIDexterWatch_CapabilityCode" in (''deals'',''sales_briefing'')');
 execute definition;
end $patch$;

create function public._multideck_crm_dispatch_sales_briefings()
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare endpoint text;secret text;claimed integer;request_id bigint;
begin
 if not public._multideck_crm_sales_briefing_configured() or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return false;end if;
 -- Dispatch is only a cheap queue signal. SKIP LOCKED claims, actor validation,
 -- leases, cooldown and the worker fingerprint check guard every model call.
 update public."AI_CrmSalesBriefings" b set last_dispatched_at=now()
 where b.company_id in(select q.company_id from public."AI_CrmSalesBriefings" q where
 ((q.status='pending' and q.dirty_version>q.processed_version and q.attempts<3 and q.due_at<=now() and (q.retry_at is null or q.retry_at<=now()) and (q.last_claimed_at is null or q.last_claimed_at<=now()-interval '6 hours'))
 or (q.status='processing' and q.lease_until<=now()))
 and (q.last_dispatched_at is null or q.last_dispatched_at<=now()-interval '1 minute')
 and exists(select 1 from public."cmp_Users" u where public._multideck_crm_briefing_actor(q.company_id,u."User_ID"))
 order by q.due_at limit 5 for update skip locked);
 get diagnostics claimed=row_count;
 if claimed=0 then return false;end if;
 execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into endpoint using 'multideck_crm_sales_worker_endpoint';
 execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into secret using 'multideck_crm_sales_worker_secret';
 execute 'select net.http_post(url:=$1,body:=$2,headers:=$3,timeout_milliseconds:=55000)' into request_id
 using endpoint,jsonb_build_object('source','crm-sales-briefing-worker'),jsonb_build_object('Content-Type','application/json','x-multideck-crm-sales-worker',secret);
 return true;
end $$;

-- Install the queue-aware scheduler on provisioned Supabase projects. A plain
-- local PostgreSQL fixture lacks these extensions and tests the dispatcher
-- against an inert HTTP boundary instead. Missing Vault configuration makes
-- dispatch a visible unavailable automation, never a per-visit generation.
do $schedule$
declare id bigint;
begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then create extension if not exists pg_cron;end if;
 if exists(select 1 from pg_available_extensions where name='pg_net') then create extension if not exists pg_net;end if;
 if to_regprocedure('cron.schedule(text,text,text)') is not null then
 for id in execute 'select jobid from cron.job where jobname=''multideck-crm-sales-briefings''' loop execute 'select cron.unschedule($1)' using id;end loop;
 execute 'select cron.schedule($1,$2,$3)' using 'multideck-crm-sales-briefings','* * * * *','select public._multideck_crm_dispatch_sales_briefings()';
 end if;
end $schedule$;

do $$declare fn regprocedure;begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (
 '_multideck_crm_briefing_actor','_multideck_crm_queue_sales_briefing','_multideck_crm_briefing_deal_event','_multideck_crm_briefing_deal_membership','_multideck_crm_briefing_related_scope','_multideck_crm_sales_briefing_configured','_multideck_dexter_create_watch_before_sales_briefing','_multideck_crm_saved_briefing_signal','_multideck_crm_dispatch_sales_briefings','multideck_crm_sales_briefing_worker_secret','multideck_crm_validate_sales_briefing_job','multideck_crm_claim_sales_briefing_jobs','multideck_crm_finish_sales_briefing_job','multideck_crm_fail_sales_briefing_job','multideck_dexter_domain_sales_briefing') loop execute format('revoke all on function %s from public,anon,authenticated',fn);end loop;
end $$;
revoke all on function public.multideck_crm_get_sales_briefing(),public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.multideck_crm_get_sales_briefing(),public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) to authenticated,service_role;
grant execute on function public.multideck_crm_sales_briefing_worker_secret(),public.multideck_crm_validate_sales_briefing_job(uuid,uuid,uuid),public.multideck_crm_claim_sales_briefing_jobs(integer),public.multideck_crm_finish_sales_briefing_job(uuid,uuid,uuid,text,jsonb,boolean),public.multideck_crm_fail_sales_briefing_job(uuid,uuid,uuid,text),public.multideck_dexter_domain_sales_briefing(uuid,text,integer) to service_role;
commit;
