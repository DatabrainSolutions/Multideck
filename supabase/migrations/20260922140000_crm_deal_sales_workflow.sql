-- Shared deal actions, evidence-backed outcomes and measured sales performance.
begin;
set local lock_timeout='5s';

alter table public."CRM_Opportunities"
  add column if not exists "CRMOppty_NextActionJSON" jsonb,
  add column if not exists "CRMOppty_LossCompetitor" text,
  add column if not exists "CRMOppty_RevisitDate" date;

insert into public."sys_CRMLossReasons"("CRMLossReason_Code","CRMLossReason_Name","CRMLossReason_SortOrder") values
 ('price','Price',10),('timing','Timing',20),('competitor','Chose a competitor',30),
 ('service_fit','Service fit',40),('no_response','No response',50),('cancelled','Requirement cancelled',60),('other','Other',70)
on conflict("CRMLossReason_Code") do nothing;

create table public."CRM_DealActions" (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public."cmp_Company"("Company_ID"),
 deal_id uuid not null references public."CRM_Opportunities"("CRMOppty_ID"),
 title text not null check(length(btrim(title)) between 1 and 240),
 type text not null check(type in ('call','email','meeting','quote','follow_up','other')),
 owner_id uuid not null references public."cmp_Users"("User_ID"),due_at timestamptz not null,
 status text not null default 'open' check(status in ('open','completed','cancelled','superseded')),
 completed_at timestamptz,completion_note text,task_id uuid references public."OPS_UserTasks"("TodoTask_ID"),
 created_at timestamptz not null default now(),created_by uuid not null references public."cmp_Users"("User_ID"),
 updated_at timestamptz not null default now(),updated_by uuid not null references public."cmp_Users"("User_ID")
);
create unique index "CRM_DealActions_one_open" on public."CRM_DealActions"(deal_id) where status='open';
create unique index "CRM_DealActions_task" on public."CRM_DealActions"(task_id) where task_id is not null;
create index "CRM_DealActions_history" on public."CRM_DealActions"(deal_id,created_at desc);

create table public."CRM_DealEvents" (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public."cmp_Company"("Company_ID"),
 deal_id uuid not null references public."CRM_Opportunities"("CRMOppty_ID"),
 kind text not null check(kind in ('observed','created','changed')),occurred_at timestamptz not null default now(),
 actor_id uuid references public."cmp_Users"("User_ID"),before_data jsonb,after_data jsonb not null
);
create index "CRM_DealEvents_deal_time" on public."CRM_DealEvents"(deal_id,occurred_at,id);
alter table public."CRM_DealActions" enable row level security;
alter table public."CRM_DealEvents" enable row level security;
revoke all on public."CRM_DealActions",public."CRM_DealEvents" from public,anon,authenticated;

create or replace function public._multideck_crm_context()
returns table(user_id uuid,company_id uuid) language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
begin
 if auth.uid() is null or (select count(*) from public."cmp_Users" where "Auth_User_ID"=auth.uid())<>1 then raise exception 'Your account is not linked to this workspace. Sign in again.' using errcode='42501';end if;
 return query select u."User_ID",u."Company_ID" from public."cmp_Users" u where u."Auth_User_ID"=auth.uid() and u."User_AccessStatus"='active' and u."Company_ID" is not null;
 if not found then raise exception 'Your account no longer has active access to this workspace.' using errcode='42501';end if;
end $$;

create function public._multideck_crm_sales_context(p_write boolean default false)
returns table(user_id uuid,company_id uuid) language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
declare ctx record;
begin
 select * into ctx from public._multideck_crm_context();
 if not exists(select 1 from public."cmp_Users" where "User_ID"=ctx.user_id and "Company_ID"=ctx.company_id and "Auth_User_ID"=auth.uid() and "User_AccessStatus"='active')
 or public._multideck_crm_has_permission(ctx.user_id,'CRM.Read') is not true
 or (p_write and public._multideck_crm_has_permission(ctx.user_id,'CRM.Write') is not true) then
 raise exception 'You do not have permission to use this sales workflow.' using errcode='42501';end if;
 return query select ctx.user_id::uuid,ctx.company_id::uuid;
end $$;

create function public._multideck_crm_sales_lock(p_deal_id uuid,p_expected_version bigint)
returns public."CRM_Opportunities" language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare ctx record;d public."CRM_Opportunities";
begin
 select * into ctx from public._multideck_crm_sales_context(true);
 if p_expected_version is null or p_expected_version<1 then raise exception 'A valid deal version is required.' using errcode='22023';end if;
 if not public._multideck_crm_deal_is_operator_visible(p_deal_id,ctx.company_id) then raise exception 'Deal not found.' using errcode='P0002';end if;
 select * into d from public."CRM_Opportunities" where "CRMOppty_ID"=p_deal_id for update;
 if d."CRMOppty_EditVersion"<>p_expected_version then raise exception 'CRM_CONFLICT: This deal changed elsewhere. Reload it before saving.' using errcode='P0001';end if;
 return d;
end $$;

create function public._multideck_crm_deal_action_json(a public."CRM_DealActions")
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',a.id,'title',a.title,'type',a.type,'ownerId',a.owner_id,
 'ownerName',coalesce(nullif(btrim(concat_ws(' ',u."User_Firstname",u."User_Lastname")),''),u."User_Email"),
 'dueAt',a.due_at,'taskScheduledDate',(select "TodoTask_ScheduledDate" from public."OPS_UserTasks" where "TodoTask_ID"=a.task_id),'status',a.status,'completedAt',a.completed_at,'completionNote',a.completion_note,'taskId',a.task_id,'createdAt',a.created_at)
 from public."cmp_Users" u where u."User_ID"=a.owner_id;
$$;

-- Legacy imports and old board moves sometimes recorded a closed status or
-- stage without a closed timestamp. Recognise that state without inventing dates.
create function public._multideck_crm_deal_outcome(d public."CRM_Opportunities")
returns text language sql stable security definer set search_path=pg_catalog,public as $$
 select case when d."CRMOppty_WonAt" is not null then 'won' when d."CRMOppty_LostAt" is not null then 'lost'
 when lower(d."CRMOppty_StatusCode") ~ '(^|[_ -])lost$' or exists(select 1 from public."sys_CRMOpportunityStages" where "CRMStage_Code"=d."CRMOppty_StageCode" and "CRMStage_IsLost") or exists(select 1 from public."CRM_PipelineStages" where "CRMPipelineStage_ID"=d."CRMOppty_PipelineStageID" and lower(btrim("CRMPipelineStage_Name")) ~ '^(closed[[:space:]_-]+)?lost$') then 'lost'
 when lower(d."CRMOppty_StatusCode") ~ '(^|[_ -])won$' or exists(select 1 from public."sys_CRMOpportunityStages" where "CRMStage_Code"=d."CRMOppty_StageCode" and "CRMStage_IsWon") or exists(select 1 from public."CRM_PipelineStages" where "CRMPipelineStage_ID"=d."CRMOppty_PipelineStageID" and lower(btrim("CRMPipelineStage_Name")) ~ '^(closed[[:space:]_-]+)?won$') then 'won'
 when exists(select 1 from public."sys_CRMOpportunityStatuses" where "CRMOpptyStatus_Code"=d."CRMOppty_StatusCode" and not "CRMOpptyStatus_IsOpen") then 'closed'
 else 'open' end;
$$;

alter function public._multideck_crm_deal_conversion_state(uuid) rename to _multideck_crm_deal_conversion_before_sales_20260922;
create function public._multideck_crm_deal_conversion_state(p_deal_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select public._multideck_crm_deal_conversion_before_sales_20260922(p_deal_id)||jsonb_build_object('isWon',public._multideck_crm_deal_outcome(d)='won') from public."CRM_Opportunities" d where d."CRMOppty_ID"=p_deal_id;
$$;

alter function public._multideck_crm_deal_json(uuid,uuid) rename to _multideck_crm_deal_json_before_sales_20260922;
create function public._multideck_crm_deal_json(p_deal_id uuid,p_company_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select public._multideck_crm_deal_json_before_sales_20260922(p_deal_id,p_company_id)||jsonb_build_object(
 'editVersion',d."CRMOppty_EditVersion",'isLost',public._multideck_crm_deal_outcome(d)='lost','lostAt',d."CRMOppty_LostAt",
 'nextAction',(select public._multideck_crm_deal_action_json(a) from public."CRM_DealActions" a where a.deal_id=p_deal_id and a.company_id=p_company_id and a.status='open'),
 'actionHistory',coalesce((select jsonb_agg(public._multideck_crm_deal_action_json(a) order by a.created_at desc,a.id) from public."CRM_DealActions" a where a.deal_id=p_deal_id and a.company_id=p_company_id),'[]'::jsonb),
 'outcomeHistory',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'event',case when e.after_data->>'outcome' in ('lost','won') then e.after_data->>'outcome' else 'reopened' end,'occurredAt',e.occurred_at,'actorId',e.actor_id,'reasonCode',coalesce(e.after_data->>'lossReasonCode',e.before_data->>'lossReasonCode'),'details',coalesce(e.after_data->>'lossDetails',e.before_data->>'lossDetails'),'competitor',coalesce(e.after_data->>'lossCompetitor',e.before_data->>'lossCompetitor'),'revisitDate',coalesce(e.after_data->>'revisitDate',e.before_data->>'revisitDate'),'reason',e.after_data->>'reopenedReason') order by e.occurred_at desc,e.id) from public."CRM_DealEvents" e where e.deal_id=p_deal_id and e.company_id=p_company_id and e.kind='changed' and (e.before_data->>'outcome' is distinct from e.after_data->>'outcome')),'[]'::jsonb),
 'loss',case when public._multideck_crm_deal_outcome(d)='lost' then jsonb_build_object('reasonCode',d."CRMOppty_LossReasonCode",'reasonName',r."CRMLossReason_Name",'details',d."CRMOppty_LossDetails",'competitor',d."CRMOppty_LossCompetitor",'revisitDate',d."CRMOppty_RevisitDate",'lostAt',d."CRMOppty_LostAt") end)
 from public."CRM_Opportunities" d left join public."sys_CRMLossReasons" r on r."CRMLossReason_Code"=d."CRMOppty_LossReasonCode"
 where d."CRMOppty_ID"=p_deal_id and public._multideck_crm_deal_is_operator_visible(p_deal_id,p_company_id);
$$;

create function public.multideck_crm_deal_people(p_deal_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
declare ctx record;org uuid;can_edit boolean;
begin
 select * into ctx from public._multideck_crm_sales_context(false);
 if not public._multideck_crm_deal_is_operator_visible(p_deal_id,ctx.company_id) then raise exception 'Deal not found.' using errcode='P0002';end if;
 select "CRMOppty_OrgID" into org from public."CRM_Opportunities" where "CRMOppty_ID"=p_deal_id;
 can_edit:=public._multideck_crm_has_permission(ctx.user_id,'CRM.Write');
 return jsonb_build_object('currentUserId',ctx.user_id,'canEdit',can_edit,'canReassign',can_edit,
 'owners',coalesce((select jsonb_agg(jsonb_build_object('id',u."User_ID",'canOwnAction',public._multideck_crm_has_permission(u."User_ID",'CRM.Write'),'name',coalesce(nullif(btrim(concat_ws(' ',u."User_Firstname",u."User_Lastname")),''),u."User_Email")) order by u."User_Firstname",u."User_Lastname") from public."cmp_Users" u where u."Company_ID"=ctx.company_id and u."User_AccessStatus"='active' and u."Auth_User_ID" is not null and public._multideck_crm_has_permission(u."User_ID",'CRM.Read')),'[]'::jsonb),
 'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c."OrgContact_ID",'name',nullif(btrim(concat_ws(' ',c."OrgContact_FirstName",c."OrgContact_LastName")),''),'email',(select e."OrgContactEmail_Email" from public."OrgContact_Emails" e where e."OrgContact_ID"=c."OrgContact_ID" and e."OrgContactEmail_IsActive" order by e."OrgContactEmail_IsPrimary" desc,e."OrgContactEmail_Type",e."OrgContactEmail_ID" limit 1)) order by c."OrgContact_FirstName",c."OrgContact_LastName") from public."Org_Contacts" c where c."Org_ID"=org),'[]'::jsonb));
end $$;

create function public._multideck_crm_deal_sales_snapshot(d public."CRM_Opportunities")
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('outcome',public._multideck_crm_deal_outcome(d),'pipelineId',d."CRMOppty_PipelineID",'stageId',d."CRMOppty_PipelineStageID",'ownerId',d."CRMOppty_OwnerUserID",'primaryContactId',d."CRMOppty_PrimaryContactID",'expectedCloseDate',d."CRMOppty_ExpectedCloseDate",'status',d."CRMOppty_StatusCode",'wonAt',d."CRMOppty_WonAt",'lostAt',d."CRMOppty_LostAt",'lossReasonCode',d."CRMOppty_LossReasonCode",'lossDetails',d."CRMOppty_LossDetails",'lossCompetitor',d."CRMOppty_LossCompetitor",'revisitDate',d."CRMOppty_RevisitDate",'nextAction',d."CRMOppty_NextActionJSON",'reopenedReason',d."CRMOppty_MetadataJSON"->>'reopenedReason');
$$;
create function public._multideck_crm_deal_sales_event()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare company uuid;old_data jsonb;new_data jsonb;
begin
 select "Company_ID" into company from public."CRM_Pipelines" where "CRMPipeline_ID"=new."CRMOppty_PipelineID";
 if company is null or not public._multideck_crm_deal_is_operator_visible(new."CRMOppty_ID",company) then return new;end if;
 new_data:=public._multideck_crm_deal_sales_snapshot(new);
 if tg_op='UPDATE' then old_data:=public._multideck_crm_deal_sales_snapshot(old);end if;
 if old_data is distinct from new_data then insert into public."CRM_DealEvents"(company_id,deal_id,kind,actor_id,before_data,after_data) values(company,new."CRMOppty_ID",case when tg_op='INSERT' then 'created' else 'changed' end,coalesce(new."CRMOppty_UpdatedBy",new."CRMOppty_CreatedBy"),old_data,new_data);end if;
 return new;
end $$;
create trigger "TR_CRM_Opportunities_sales_event" after insert or update on public."CRM_Opportunities" for each row execute function public._multideck_crm_deal_sales_event();
insert into public."CRM_DealEvents"(company_id,deal_id,kind,after_data)
 select p."Company_ID",d."CRMOppty_ID",'observed',public._multideck_crm_deal_sales_snapshot(d)
 from public."CRM_Opportunities" d join public."CRM_Pipelines" p on p."CRMPipeline_ID"=d."CRMOppty_PipelineID"
 where public._multideck_crm_deal_is_operator_visible(d."CRMOppty_ID",p."Company_ID");

create function public.multideck_crm_set_deal_next_action(p_deal_id uuid,p_expected_version bigint,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare ctx record;d public."CRM_Opportunities";a public."CRM_DealActions";prior public."CRM_DealActions";task uuid;owner uuid;due timestamptz;task_date date;title text;kind text;
begin
 select * into ctx from public._multideck_crm_sales_context(true);
 d:=public._multideck_crm_sales_lock(p_deal_id,p_expected_version);
 if public._multideck_crm_deal_outcome(d)<>'open' then raise exception 'This deal is closed. Plan follow-up from the account instead.' using errcode='22023';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('title','type','ownerId','dueAt','taskDate')) then raise exception 'Choose a supported next action.' using errcode='22023';end if;
 title:=btrim(p_input->>'title');kind:=p_input->>'type';owner:=nullif(p_input->>'ownerId','')::uuid;due:=nullif(p_input->>'dueAt','')::timestamptz;
 task_date:=coalesce(nullif(p_input->>'taskDate','')::date,(due at time zone 'UTC')::date);
 if abs(task_date-(due at time zone 'UTC')::date)>1 then raise exception 'The task date must match the chosen due date.' using errcode='22023';end if;
 if title is null or length(title) not between 1 and 240 or kind is null or kind not in ('call','email','meeting','quote','follow_up','other') or due is null then raise exception 'Add an action, type, owner and due date.' using errcode='22023';end if;
 if not exists(select 1 from public."cmp_Users" u where u."User_ID"=owner and u."Company_ID"=ctx.company_id and u."User_AccessStatus"='active' and u."Auth_User_ID" is not null and public._multideck_crm_has_permission(u."User_ID",'CRM.Read') and public._multideck_crm_has_permission(u."User_ID",'CRM.Write')) then raise exception 'Choose an active sales colleague from this workspace.' using errcode='22023';end if;
 select * into prior from public."CRM_DealActions" where deal_id=p_deal_id and status='open' for update;
 if found then
 update public."CRM_DealActions" set status='superseded',updated_at=now(),updated_by=ctx.user_id where id=prior.id;
 update public."OPS_UserTasks" set "TodoTask_IsDeleted"=true,"TodoTask_EditVersion"="TodoTask_EditVersion"+1,"TodoTask_UpdatedBy"=ctx.user_id,"TodoTask_UpdatedAt"=now() where "TodoTask_ID"=prior.task_id;
 end if;
 insert into public."OPS_UserTasks"("TodoTask_CompanyID","TodoTask_OwnerUserID","TodoTask_Title","TodoTask_ScheduledDate","TodoTask_LinksJSON","TodoTask_TagsJSON","TodoTask_CreatedBy","TodoTask_UpdatedBy")
 values(ctx.company_id,owner,title,task_date,jsonb_build_array(jsonb_build_object('label',d."CRMOppty_Name",'url','/crm/deals/'||p_deal_id)),jsonb_build_array(jsonb_build_object('label','Deal next action','href','/crm/deals/'||p_deal_id)),ctx.user_id,ctx.user_id) returning "TodoTask_ID" into task;
 insert into public."CRM_DealActions"(company_id,deal_id,title,type,owner_id,due_at,task_id,created_by,updated_by) values(ctx.company_id,p_deal_id,title,kind,owner,due,task,ctx.user_id,ctx.user_id) returning * into a;
 update public."CRM_Opportunities" set "CRMOppty_NextActionDueAt"=due,"CRMOppty_NextActionJSON"=public._multideck_crm_deal_action_json(a),"CRMOppty_UpdatedAt"=now(),"CRMOppty_UpdatedBy"=ctx.user_id where "CRMOppty_ID"=p_deal_id;
 return public._multideck_crm_deal_json(p_deal_id,ctx.company_id);
end $$;

create function public.multideck_crm_complete_deal_next_action(p_deal_id uuid,p_expected_version bigint,p_action_id uuid,p_note text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare ctx record;d public."CRM_Opportunities";a public."CRM_DealActions";
begin
 select * into ctx from public._multideck_crm_sales_context(true);d:=public._multideck_crm_sales_lock(p_deal_id,p_expected_version);
 if length(coalesce(p_note,''))>2000 then raise exception 'Keep the completion note under 2,000 characters.' using errcode='22023';end if;
 select * into a from public."CRM_DealActions" where id=p_action_id and deal_id=p_deal_id and company_id=ctx.company_id and status='open' for update;
 if not found then raise exception 'CRM_CONFLICT: This next action has already changed. Reload the deal.' using errcode='P0001';end if;
 update public."CRM_DealActions" set status='completed',completed_at=now(),completion_note=nullif(btrim(p_note),''),updated_at=now(),updated_by=ctx.user_id where id=a.id;
 update public."OPS_UserTasks" set "TodoTask_StatusCode"='completed',"TodoTask_CompletedAt"=now(),"TodoTask_EditVersion"="TodoTask_EditVersion"+1,"TodoTask_UpdatedAt"=now(),"TodoTask_UpdatedBy"=ctx.user_id where "TodoTask_ID"=a.task_id;
 update public."CRM_Opportunities" set "CRMOppty_NextActionDueAt"=null,"CRMOppty_NextActionJSON"=null,"CRMOppty_LastActivityAt"=now(),"CRMOppty_UpdatedAt"=now(),"CRMOppty_UpdatedBy"=ctx.user_id where "CRMOppty_ID"=p_deal_id;
 return public._multideck_crm_deal_json(p_deal_id,ctx.company_id);
end $$;

-- Linked To Do completion is real completion. Only this explicit shared action
-- projection crosses the personal task boundary; other task data stays private.
create function public._multideck_crm_deal_action_task_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public."CRM_DealActions";d public."CRM_Opportunities";
begin
 if (new."TodoTask_StatusCode",new."TodoTask_IsDeleted",new."TodoTask_Title",new."TodoTask_ScheduledDate") is not distinct from (old."TodoTask_StatusCode",old."TodoTask_IsDeleted",old."TodoTask_Title",old."TodoTask_ScheduledDate") then return new;end if;
 select * into a from public."CRM_DealActions" where task_id=new."TodoTask_ID" and status='open' for update;
 if not found then return new;end if;
 if not exists(select 1 from public."cmp_Users" actor where actor."User_ID"=new."TodoTask_UpdatedBy" and actor."Company_ID"=a.company_id and actor."User_AccessStatus"='active' and actor."Auth_User_ID" is not null and public._multideck_crm_has_permission(actor."User_ID",'CRM.Read') and public._multideck_crm_has_permission(actor."User_ID",'CRM.Write')) then raise exception 'You no longer have permission to change this deal action.' using errcode='42501';end if;
 select * into d from public."CRM_Opportunities" where "CRMOppty_ID"=a.deal_id for update;
 update public."CRM_DealActions" set status=case when new."TodoTask_IsDeleted" then 'cancelled' when new."TodoTask_StatusCode"='completed' then 'completed' else 'open' end,
 title=new."TodoTask_Title",due_at=case when new."TodoTask_ScheduledDate"<>old."TodoTask_ScheduledDate" then due_at + make_interval(days=>(new."TodoTask_ScheduledDate"-old."TodoTask_ScheduledDate")) else due_at end,
 completed_at=case when new."TodoTask_StatusCode"='completed' then new."TodoTask_CompletedAt" end,updated_at=now(),updated_by=new."TodoTask_UpdatedBy" where id=a.id returning * into a;
 update public."CRM_Opportunities" set "CRMOppty_NextActionDueAt"=case when a.status='open' then a.due_at end,"CRMOppty_NextActionJSON"=case when a.status='open' then public._multideck_crm_deal_action_json(a) end,"CRMOppty_UpdatedAt"=now(),"CRMOppty_UpdatedBy"=new."TodoTask_UpdatedBy" where "CRMOppty_ID"=a.deal_id;
 return new;
end $$;
create trigger "TR_OPS_UserTasks_deal_action" after update on public."OPS_UserTasks" for each row execute function public._multideck_crm_deal_action_task_change();

create function public.multideck_crm_lose_deal(p_deal_id uuid,p_expected_version bigint,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare ctx record;d public."CRM_Opportunities";reason text;detail text;competitor text;revisit date;stage uuid;lost_stage text;lost_status text;a public."CRM_DealActions";follow_task uuid;follow_owner uuid;
begin
 select * into ctx from public._multideck_crm_sales_context(true);d:=public._multideck_crm_sales_lock(p_deal_id,p_expected_version);
 if public._multideck_crm_deal_outcome(d)<>'open' then raise exception 'This deal is already closed.' using errcode='22023';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('reasonCode','details','competitor','revisitDate','pipelineStageId')) then raise exception 'Choose a supported deal outcome.' using errcode='22023';end if;
 reason:=p_input->>'reasonCode';detail:=nullif(btrim(p_input->>'details'),'');competitor:=nullif(btrim(p_input->>'competitor'),'');revisit:=nullif(p_input->>'revisitDate','')::date;
 if reason is null or reason not in ('price','timing','competitor','service_fit','no_response','cancelled','other') or (reason='other' and detail is null) then raise exception 'Choose why this deal was lost. Add detail for Other.' using errcode='22023';end if;
 if length(coalesce(detail,''))>2000 or length(coalesce(competitor,''))>160 then raise exception 'Keep details under 2,000 characters and competitor under 160.' using errcode='22023';end if;
 if revisit<current_date then raise exception 'Choose today or a future revisit date.' using errcode='22023';end if;
 stage:=nullif(p_input->>'pipelineStageId','')::uuid;
 if stage is not null and not exists(select 1 from public."CRM_PipelineStages" s where s."CRMPipelineStage_ID"=stage and s."CRMPipeline_ID"=d."CRMOppty_PipelineID" and s."Company_ID"=ctx.company_id and not s."Is_Deleted" and not s."CRMPipelineStage_IsConversion" and lower(btrim(s."CRMPipelineStage_Name")) ~ '^(closed[[:space:]_-]+)?lost$') then raise exception 'Choose a Lost stage from this deal pipeline.' using errcode='22023';end if;
 if stage is null then select "CRMPipelineStage_ID" into stage from public."CRM_PipelineStages" where "CRMPipeline_ID"=d."CRMOppty_PipelineID" and "Company_ID"=ctx.company_id and not "Is_Deleted" and not "CRMPipelineStage_IsConversion" and lower(btrim("CRMPipelineStage_Name")) ~ '^(closed[[:space:]_-]+)?lost$' order by "CRMPipelineStage_SortOrder" limit 1;end if;
 select "CRMStage_Code" into lost_stage from public."sys_CRMOpportunityStages" where "CRMStage_IsActive" and "CRMStage_IsLost" order by "CRMStage_SortOrder" limit 1;
 select "CRMOpptyStatus_Code" into lost_status from public."sys_CRMOpportunityStatuses" where "CRMOpptyStatus_IsActive" and not "CRMOpptyStatus_IsOpen" and (lower("CRMOpptyStatus_Code") like '%lost%' or lower("CRMOpptyStatus_Name") like '%lost%') order by "CRMOpptyStatus_SortOrder" limit 1;
 if lost_stage is null or lost_status is null then raise exception 'The lost-deal lookups are not configured for this workspace.' using errcode='55000';end if;
 for a in select * from public."CRM_DealActions" where deal_id=p_deal_id and status='open' for update loop
 update public."CRM_DealActions" set status='cancelled',completion_note='Deal marked lost',updated_at=now(),updated_by=ctx.user_id where id=a.id;
 update public."OPS_UserTasks" set "TodoTask_IsDeleted"=true,"TodoTask_EditVersion"="TodoTask_EditVersion"+1,"TodoTask_UpdatedAt"=now(),"TodoTask_UpdatedBy"=ctx.user_id where "TodoTask_ID"=a.task_id;
 end loop;
 if revisit is not null then
 select "User_ID" into follow_owner from public."cmp_Users" where "User_ID"=d."CRMOppty_OwnerUserID" and "Company_ID"=ctx.company_id and "User_AccessStatus"='active' and "Auth_User_ID" is not null;
 insert into public."OPS_UserTasks"("TodoTask_CompanyID","TodoTask_OwnerUserID","TodoTask_Title","TodoTask_ScheduledDate","TodoTask_LinksJSON","TodoTask_CreatedBy","TodoTask_UpdatedBy") values(ctx.company_id,coalesce(follow_owner,ctx.user_id),left('Revisit: '||d."CRMOppty_Name",240),revisit,jsonb_build_array(jsonb_build_object('label',d."CRMOppty_Name",'url','/crm/deals/'||p_deal_id)),ctx.user_id,ctx.user_id) returning "TodoTask_ID" into follow_task;
 end if;
 update public."CRM_Opportunities" set "CRMOppty_StatusCode"=lost_status,"CRMOppty_StageCode"=lost_stage,"CRMOppty_PipelineStageID"=coalesce(stage,"CRMOppty_PipelineStageID"),"CRMOppty_ProbabilityPct"=0,"CRMOppty_WeightedValueAmount"=0,"CRMOppty_LostAt"=now(),"CRMOppty_LossReasonCode"=reason,"CRMOppty_LossDetails"=detail,"CRMOppty_LossCompetitor"=competitor,"CRMOppty_RevisitDate"=revisit,"CRMOppty_NextActionDueAt"=null,"CRMOppty_NextActionJSON"=null,"CRMOppty_UpdatedAt"=now(),"CRMOppty_UpdatedBy"=ctx.user_id,"CRMOppty_MetadataJSON"="CRMOppty_MetadataJSON"||jsonb_strip_nulls(jsonb_build_object('lossRevisitTaskId',follow_task)) where "CRMOppty_ID"=p_deal_id;
 return public._multideck_crm_deal_json(p_deal_id,ctx.company_id);
end $$;

create function public.multideck_crm_reopen_deal(p_deal_id uuid,p_expected_version bigint,p_pipeline_stage_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare ctx record;d public."CRM_Opportunities";s public."CRM_PipelineStages";open_stage text;open_status text;task uuid;
begin
 select * into ctx from public._multideck_crm_sales_context(true);d:=public._multideck_crm_sales_lock(p_deal_id,p_expected_version);
 if public._multideck_crm_deal_outcome(d)<>'lost' then raise exception 'Only a lost deal can be reopened here.' using errcode='22023';end if;
 if nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'Add a reason for reopening this deal, up to 2,000 characters.' using errcode='22023';end if;
 select * into s from public."CRM_PipelineStages" where "CRMPipelineStage_ID"=p_pipeline_stage_id and "CRMPipeline_ID"=d."CRMOppty_PipelineID" and "Company_ID"=ctx.company_id and not "Is_Deleted" and not "CRMPipelineStage_IsConversion" and lower(btrim("CRMPipelineStage_Name")) !~ '^(closed[[:space:]_-]+)?(lost|won)$';
 if not found then raise exception 'Choose an open stage from this deal pipeline.' using errcode='22023';end if;
 select "CRMStage_Code" into open_stage from public."sys_CRMOpportunityStages" where "CRMStage_IsActive" and "CRMStage_IsOpen" and not "CRMStage_IsWon" and not "CRMStage_IsLost" order by "CRMStage_SortOrder" limit 1;
 select "CRMOpptyStatus_Code" into open_status from public."sys_CRMOpportunityStatuses" where "CRMOpptyStatus_IsActive" and "CRMOpptyStatus_IsOpen" order by "CRMOpptyStatus_SortOrder" limit 1;
 if open_stage is null or open_status is null then raise exception 'Open deal statuses are not configured.' using errcode='55000';end if;
 task:=nullif(d."CRMOppty_MetadataJSON"->>'lossRevisitTaskId','')::uuid;
 update public."OPS_UserTasks" set "TodoTask_IsDeleted"=true,"TodoTask_EditVersion"="TodoTask_EditVersion"+1,"TodoTask_UpdatedAt"=now(),"TodoTask_UpdatedBy"=ctx.user_id where "TodoTask_ID"=task and "TodoTask_StatusCode"='open' and "TodoTask_CompanyID"=ctx.company_id;
 update public."CRM_Opportunities" set "CRMOppty_StatusCode"=open_status,"CRMOppty_StageCode"=open_stage,"CRMOppty_PipelineStageID"=p_pipeline_stage_id,"CRMOppty_ProbabilityPct"=s."CRMPipelineStage_ProbabilityPct","CRMOppty_WeightedValueAmount"=round("CRMOppty_ExpectedValueAmount"*s."CRMPipelineStage_ProbabilityPct"/100,4),"CRMOppty_LostAt"=null,"CRMOppty_LossReasonCode"=null,"CRMOppty_LossDetails"=null,"CRMOppty_LossCompetitor"=null,"CRMOppty_RevisitDate"=null,"CRMOppty_UpdatedAt"=now(),"CRMOppty_UpdatedBy"=ctx.user_id,"CRMOppty_MetadataJSON"=("CRMOppty_MetadataJSON"-'lossRevisitTaskId')||jsonb_build_object('reopenedReason',btrim(p_reason)) where "CRMOppty_ID"=p_deal_id;
 return public._multideck_crm_deal_json(p_deal_id,ctx.company_id);
end $$;

-- Existing editing stays canonical, but owner validation now agrees with the
-- picker and named next actions cannot be desynchronised by the legacy date field.
alter function public.multideck_crm_update_deal(uuid,bigint,jsonb) rename to _multideck_crm_update_deal_before_sales_20260922;
create function public.multideck_crm_update_deal(p_deal_id uuid,p_expected_version bigint,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare ctx record;d public."CRM_Opportunities";
begin
 select * into ctx from public._multideck_crm_sales_context(true);d:=public._multideck_crm_sales_lock(p_deal_id,p_expected_version);
 if p_input ? 'ownerId' and nullif(p_input->>'ownerId','') is not null and not exists(select 1 from public."cmp_Users" u where u."User_ID"=(p_input->>'ownerId')::uuid and u."Company_ID"=ctx.company_id and u."User_AccessStatus"='active' and u."Auth_User_ID" is not null and public._multideck_crm_has_permission(u."User_ID",'CRM.Read')) then raise exception 'Choose an active sales colleague from this workspace.' using errcode='22023';end if;
 if p_input ? 'nextActionDueAt' and exists(select 1 from public."CRM_DealActions" where deal_id=p_deal_id and status='open') then raise exception 'Edit the named next action to change its due date.' using errcode='22023';end if;
 return public._multideck_crm_update_deal_before_sales_20260922(p_deal_id,p_expected_version,p_input);
end $$;

create or replace function public.multideck_crm_move_deal_stage(p_deal_id uuid,p_pipeline_id uuid,p_pipeline_stage_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare ctx record;d public."CRM_Opportunities";s public."CRM_PipelineStages";
begin
 select * into ctx from public._multideck_crm_sales_context(true);
 if not public._multideck_crm_deal_is_operator_visible(p_deal_id,ctx.company_id) then raise exception 'Deal not found.' using errcode='P0002';end if;
 select * into d from public."CRM_Opportunities" where "CRMOppty_ID"=p_deal_id for update;
 if public._multideck_crm_deal_outcome(d)<>'open' then raise exception 'This deal is closed.' using errcode='22023';end if;
 select * into s from public."CRM_PipelineStages" where "CRMPipelineStage_ID"=p_pipeline_stage_id and "CRMPipeline_ID"=p_pipeline_id and "Company_ID"=ctx.company_id and not "Is_Deleted";
 if s."CRMPipelineStage_IsConversion" then raise exception 'Use Mark won to complete the customer handover.' using errcode='22023';end if;
 if lower(btrim(s."CRMPipelineStage_Name")) ~ '^(closed[[:space:]_-]+)?lost$' then raise exception 'Use Mark lost to record the reason.' using errcode='22023';end if;
 return public._multideck_crm_move_deal_stage_unfiltered_20260818(p_deal_id,p_pipeline_id,p_pipeline_stage_id);
end $$;

alter function public.multideck_crm_win_deal(uuid,uuid,text) rename to _multideck_crm_win_deal_before_sales_20260922;
create function public.multideck_crm_win_deal(p_deal_id uuid,p_pipeline_stage_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare ctx record;d public."CRM_Opportunities";a public."CRM_DealActions";result jsonb;
begin
 select * into ctx from public._multideck_crm_sales_context(true);
 if not public._multideck_crm_deal_is_operator_visible(p_deal_id,ctx.company_id) then raise exception 'Deal not found.' using errcode='P0002';end if;
 select * into d from public."CRM_Opportunities" where "CRMOppty_ID"=p_deal_id for update;
 if public._multideck_crm_deal_outcome(d)='lost' then raise exception 'This deal is already lost.' using errcode='22023';end if;
 result:=public._multideck_crm_win_deal_before_sales_20260922(p_deal_id,p_pipeline_stage_id,p_reason);
 for a in select * from public."CRM_DealActions" where deal_id=p_deal_id and status='open' for update loop
 update public."CRM_DealActions" set status='cancelled',completion_note='Deal marked won',updated_at=now(),updated_by=ctx.user_id where id=a.id;
 update public."OPS_UserTasks" set "TodoTask_IsDeleted"=true,"TodoTask_EditVersion"="TodoTask_EditVersion"+1,"TodoTask_UpdatedAt"=now(),"TodoTask_UpdatedBy"=ctx.user_id where "TodoTask_ID"=a.task_id;
 end loop;
 update public."CRM_Opportunities" set "CRMOppty_NextActionDueAt"=null,"CRMOppty_NextActionJSON"=null where "CRMOppty_ID"=p_deal_id and "CRMOppty_NextActionJSON" is not null;
 return result||public._multideck_crm_deal_json(p_deal_id,ctx.company_id);
end $$;

create function public.multideck_crm_get_sales_insights(p_days integer default 90,p_pipeline_id uuid default null,p_owner_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
declare ctx record;days integer:=coalesce(p_days,90);since timestamptz;result jsonb;
begin
 select * into ctx from public._multideck_crm_sales_context(false);
 if days not in (30,60,90,180,365) then raise exception 'Choose a supported sales review period.' using errcode='22023';end if;
 since:=now()-make_interval(days=>days);
 if p_pipeline_id is not null and not exists(select 1 from public."CRM_Pipelines" where "CRMPipeline_ID"=p_pipeline_id and "Company_ID"=ctx.company_id and not "Is_Deleted") then raise exception 'Choose a pipeline from this workspace.' using errcode='22023';end if;
 if p_owner_id is not null and not exists(select 1 from public."cmp_Users" where "User_ID"=p_owner_id and "Company_ID"=ctx.company_id) then raise exception 'Choose an owner from this workspace.' using errcode='22023';end if;
 with visible as materialized (
 select d.*,public._multideck_crm_deal_outcome(d) outcome,p."Company_ID" company_id,p."CRMPipeline_Name" pipeline_name,s."CRMPipelineStage_Name" stage_name,
 coalesce(nullif(o."Org_Name",''),'Account') company_name,coalesce(nullif(btrim(concat_ws(' ',u."User_Firstname",u."User_Lastname")),''),u."User_Email") owner_name
 from public."CRM_Opportunities" d join public."CRM_Pipelines" p on p."CRMPipeline_ID"=d."CRMOppty_PipelineID"
 join public."CRM_PipelineStages" s on s."CRMPipelineStage_ID"=d."CRMOppty_PipelineStageID"
 left join public."Org_Master" o on o."Org_id"=d."CRMOppty_OrgID" left join public."cmp_Users" u on u."User_ID"=d."CRMOppty_OwnerUserID"
 where public._multideck_crm_deal_is_operator_visible(d."CRMOppty_ID",ctx.company_id)
 and (p_pipeline_id is null or d."CRMOppty_PipelineID"=p_pipeline_id) and (p_owner_id is null or d."CRMOppty_OwnerUserID"=p_owner_id)
 ), measured as materialized (
 select d.*,coalesce(d."CRMOppty_WonAt",d."CRMOppty_LostAt") closed_at,
 entry.started_at,case when entry.started_at is not null then greatest(0,extract(epoch from(now()-entry.started_at))/86400) end stage_days,
 shifts.push_count,shifts.days_pushed,shifts.previous_close_date,
 d.outcome='open' is_open,
 d."CRMOppty_ExpectedCloseDate"<current_date is_overdue
 from visible d
 left join lateral (select max(e.occurred_at) started_at from public."CRM_DealEvents" e where e.company_id=ctx.company_id and e.deal_id=d."CRMOppty_ID"
 and (e.before_data is null or e.before_data->>'stageId' is distinct from e.after_data->>'stageId' or (e.before_data->>'outcome' is distinct from 'open' and e.after_data->>'outcome'='open')) and e.after_data->>'stageId'=d."CRMOppty_PipelineStageID"::text) entry on true
 left join lateral (select count(*) push_count,coalesce(sum((e.after_data->>'expectedCloseDate')::date-(e.before_data->>'expectedCloseDate')::date),0) days_pushed,
 (array_agg((e.before_data->>'expectedCloseDate')::date order by e.occurred_at desc,e.id))[1] previous_close_date
 from public."CRM_DealEvents" e where e.company_id=ctx.company_id and e.deal_id=d."CRMOppty_ID" and e.occurred_at>=since
 and (e.after_data->>'expectedCloseDate')::date>(e.before_data->>'expectedCloseDate')::date) shifts on true
 ), evidence as materialized (
 select d.*,jsonb_build_object('id',d."CRMOppty_ID",'name',d."CRMOppty_Name",'companyName',d.company_name,'ownerId',d."CRMOppty_OwnerUserID",'ownerName',d.owner_name,'pipelineId',d."CRMOppty_PipelineID",'pipelineName',d.pipeline_name,'stageId',d."CRMOppty_PipelineStageID",'stageName',d.stage_name,'expectedCloseDate',d."CRMOppty_ExpectedCloseDate",'previousCloseDate',d.previous_close_date,'pushCount',d.push_count,'daysPushed',d.days_pushed,'isOverdue',coalesce(d.is_overdue,false),'daysInStage',round(d.stage_days::numeric,1),'nextActionDueAt',d."CRMOppty_NextActionDueAt",'route','/crm/deals/'||d."CRMOppty_ID") item from measured d
 ), stage_entries as (
 select e.deal_id,(e.after_data->>'stageId')::uuid stage_id,min(e.occurred_at) entered_at
 from public."CRM_DealEvents" e join visible d on d."CRMOppty_ID"=e.deal_id
 where e.company_id=ctx.company_id and e.occurred_at>=since and e.kind<>'observed' and e.after_data->>'outcome'='open'
 and (e.before_data is null or e.before_data->>'stageId' is distinct from e.after_data->>'stageId' or (e.before_data->>'outcome' is distinct from 'open' and e.after_data->>'outcome'='open'))
 group by e.deal_id,e.after_data->>'stageId'
 ), progress as (
 select entries.stage_id,count(*) entered,jsonb_agg(entries.deal_id) progression_ids,
 count(*) filter(where exists(select 1 from public."CRM_DealEvents" later where later.company_id=ctx.company_id and later.deal_id=entries.deal_id and later.occurred_at>=entries.entered_at and later.before_data->>'stageId'=entries.stage_id::text and (later.after_data->>'stageId' is distinct from later.before_data->>'stageId' or (later.before_data->>'outcome'='open' and later.after_data->>'outcome'<>'open')))) moved_on
 from stage_entries entries group by entries.stage_id
 ), stage_summary as (
 select s."CRMPipelineStage_ID" id,s."CRMPipelineStage_Name" name,p."CRMPipeline_ID" pipeline_id,p."CRMPipeline_Name" pipeline_name,p."CRMPipeline_SortOrder" pipeline_order,s."CRMPipelineStage_SortOrder" stage_order,
 count(d."CRMOppty_ID") open_deals,count(d.stage_days) sample_size,round(avg(d.stage_days)::numeric,1) average_days,
 round((percentile_cont(0.5) within group(order by d.stage_days))::numeric,1) median_days,
 coalesce(jsonb_agg(d."CRMOppty_ID") filter(where d."CRMOppty_ID" is not null),'[]'::jsonb) deal_ids,
 coalesce(jsonb_agg(d.item order by d.stage_days desc nulls last) filter(where d."CRMOppty_ID" is not null),'[]'::jsonb) deals,
 coalesce(prog.entered,0) entered,coalesce(prog.moved_on,0) moved_on,coalesce(prog.progression_ids,'[]'::jsonb) progression_ids
 from public."CRM_PipelineStages" s join public."CRM_Pipelines" p on p."CRMPipeline_ID"=s."CRMPipeline_ID"
 left join evidence d on d."CRMOppty_PipelineStageID"=s."CRMPipelineStage_ID" and d.is_open
 left join progress prog on prog.stage_id=s."CRMPipelineStage_ID"
 where p."Company_ID"=ctx.company_id and s."Company_ID"=ctx.company_id and not p."Is_Deleted" and not s."Is_Deleted" and (p_pipeline_id is null or p."CRMPipeline_ID"=p_pipeline_id)
 group by s."CRMPipelineStage_ID",s."CRMPipelineStage_Name",p."CRMPipeline_ID",p."CRMPipeline_Name",p."CRMPipeline_SortOrder",s."CRMPipelineStage_SortOrder",prog.entered,prog.moved_on,prog.progression_ids
 ), losses as (
 select coalesce(d."CRMOppty_LossReasonCode",'unrecorded') code,coalesce(r."CRMLossReason_Name",'Not recorded') name,count(*) loss_count,jsonb_agg(d."CRMOppty_ID") deal_ids
 from evidence d left join public."sys_CRMLossReasons" r on r."CRMLossReason_Code"=d."CRMOppty_LossReasonCode" where d."CRMOppty_LostAt">=since group by d."CRMOppty_LossReasonCode",r."CRMLossReason_Name"
 ), counts as (
 select count(*) filter(where is_open) open_deals,count(*) filter(where "CRMOppty_WonAt">=since) won_deals,count(*) filter(where "CRMOppty_LostAt">=since) lost_deals,
 count(*) filter(where is_open and "CRMOppty_NextActionJSON" is not null and "CRMOppty_NextActionDueAt"<now()) overdue_actions,count(*) filter(where is_open and "CRMOppty_NextActionJSON" is null) missing_actions,
 count(*) filter(where is_open and (is_overdue or push_count>0)) slipping_deals from evidence
 )
 select jsonb_build_object('generatedAt',now(),'period',jsonb_build_object('days',days,'from',since,'to',now()),'detailLimit',500,
 'filters',jsonb_build_object('pipelines',coalesce((select jsonb_agg(jsonb_build_object('id',"CRMPipeline_ID",'name',"CRMPipeline_Name") order by "CRMPipeline_SortOrder") from public."CRM_Pipelines" where "Company_ID"=ctx.company_id and not "Is_Deleted"),'[]'::jsonb),
 'owners',coalesce((select jsonb_agg(jsonb_build_object('id',u."User_ID",'name',coalesce(nullif(btrim(concat_ws(' ',u."User_Firstname",u."User_Lastname")),''),u."User_Email")) order by u."User_Firstname",u."User_Lastname") from public."cmp_Users" u where u."Company_ID"=ctx.company_id and (u."User_AccessStatus"='active' or exists(select 1 from visible where "CRMOppty_OwnerUserID"=u."User_ID"))),'[]'::jsonb)),
 'coverage',jsonb_build_object('historyStartedAt',(select min(occurred_at) from public."CRM_DealEvents" where company_id=ctx.company_id),'measuredStageDeals',(select count(*) from evidence where is_open and started_at is not null),'totalDeals',(select count(*) from evidence),'undatedClosedDeals',(select count(*) from evidence where not is_open and closed_at is null),'note','Stage time and close-date movement are measured from the first recorded observation. Earlier history is unavailable; existing deals start at observation, not their original entry. Closed records without a close date are excluded from period outcomes.'),
 'definitions',jsonb_build_object('winRate','Currently won deals divided by currently won plus lost deals closed in the selected period. Open and reopened deals are excluded; previous outcomes remain in deal history.','stageTime','Average and median time currently open deals have spent in their current stage, measured from exact recorded stage entry or first observation.','stageProgression','Distinct deals moving on divided by distinct deals entering that stage during the selected period. Initial imported observations are excluded; moving to another stage or closing a deal is an exit, and movement does not imply a forward stage order.','slippage','Currently open deals past their expected close date, or whose close date moved later during the selected period. Days pushed adds observed outward changes only.','coverage','Stage history and close-date changes before measurement started are not inferred.'),
 'summary',jsonb_build_object('openDeals',c.open_deals,'wonDeals',c.won_deals,'lostDeals',c.lost_deals,'closedDeals',c.won_deals+c.lost_deals,'winRatePct',round(100.0*c.won_deals/nullif(c.won_deals+c.lost_deals,0),1),'overdueActions',c.overdue_actions,'missingActions',c.missing_actions,'slippingDeals',c.slipping_deals),
 'stages',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'pipelineId',pipeline_id,'pipelineName',pipeline_name,'openDeals',open_deals,'averageDays',average_days,'medianDays',median_days,'sampleSize',sample_size,'dealIds',deal_ids,'deals',(select coalesce(jsonb_agg(value),'[]'::jsonb) from(select value from jsonb_array_elements(deals) limit 100) limited),'progressionDealIds',progression_ids,'enteredDeals',entered,'movedOnDeals',moved_on,'progressionRatePct',round(100.0*moved_on/nullif(entered,0),1)) order by pipeline_order,stage_order) from stage_summary),'[]'::jsonb),
 'lossReasons',coalesce((select jsonb_agg(jsonb_build_object('code',code,'name',name,'count',loss_count,'sharePct',round(100.0*loss_count/nullif(c.lost_deals,0),1),'dealIds',deal_ids) order by loss_count desc,name) from losses),'[]'::jsonb),
 'slippingDeals',coalesce((select jsonb_agg(item) from(select item from evidence where is_open and(is_overdue or push_count>0) order by is_overdue desc,"CRMOppty_ExpectedCloseDate" limit 500) limited),'[]'::jsonb),
 'attentionDeals',coalesce((select jsonb_agg(item) from(select item||jsonb_build_object('reason',case when "CRMOppty_NextActionJSON" is null then 'missing_action' when "CRMOppty_NextActionDueAt"<now() then 'overdue_action' else 'stalled_stage' end) item from evidence where is_open and("CRMOppty_NextActionDueAt"<now() or "CRMOppty_NextActionJSON" is null or stage_days>=14) order by "CRMOppty_NextActionDueAt" nulls last,stage_days desc nulls last limit 500) limited),'[]'::jsonb),
 'outcomes',coalesce((select jsonb_agg(item) from(select jsonb_build_object('id',"CRMOppty_ID",'name',"CRMOppty_Name",'companyName',company_name,'ownerName',owner_name,'outcome',case when "CRMOppty_WonAt" is not null then 'won' else 'lost' end,'closedAt',closed_at,'lossReasonCode',"CRMOppty_LossReasonCode",'route','/crm/deals/'||"CRMOppty_ID") item from evidence where closed_at>=since order by closed_at desc limit 500) limited),'[]'::jsonb),
 'records',coalesce((select jsonb_agg(item) from(select item from evidence order by "CRMOppty_UpdatedAt" desc limit 500) limited),'[]'::jsonb)) into result from counts c;
 return result;
end $$;

-- Dexter uses the same authenticated data boundary and exact evidence IDs.
create function public.multideck_dexter_domain_deal_sales(p_company_id uuid,p_search text,p_take integer)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
declare ctx record;result jsonb;
begin
 select * into ctx from public._multideck_crm_sales_context(false);
 if ctx.company_id is distinct from p_company_id then raise exception 'This sales data is outside your workspace.' using errcode='42501';end if;
 select coalesce(jsonb_agg(item),'[]'::jsonb) into result from (
 select public._multideck_crm_deal_json(d."CRMOppty_ID",ctx.company_id)||jsonb_build_object('recordId',d."CRMOppty_ID",'people',public.multideck_crm_deal_people(d."CRMOppty_ID"),'sourceTable','CRM_Opportunities','sourceUrl','/crm/deals/'||d."CRMOppty_ID",'evidence',jsonb_build_object('dealId',d."CRMOppty_ID",'editVersion',d."CRMOppty_EditVersion")) item
 from public."CRM_Opportunities" d where public._multideck_crm_deal_is_operator_visible(d."CRMOppty_ID",ctx.company_id)
 and (nullif(btrim(p_search),'') is null or d."CRMOppty_ID"::text=lower(btrim(p_search)) or d."CRMOppty_Name" ilike '%'||btrim(p_search)||'%') order by d."CRMOppty_UpdatedAt" desc limit greatest(1,least(coalesce(p_take,10),25))) results;
 return result;
end $$;
create function public.multideck_dexter_domain_sales_insights(p_company_id uuid,p_search text,p_take integer)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
declare ctx record;
begin
 select * into ctx from public._multideck_crm_sales_context(false);
 if ctx.company_id is distinct from p_company_id then raise exception 'This sales data is outside your workspace.' using errcode='42501';end if;
 return jsonb_build_array(public.multideck_crm_get_sales_insights(90,null,null)||jsonb_build_object('recordId',ctx.company_id,'sourceTable','CRM_DealEvents','sourceUrl','/crm/insights'));
end $$;

create function public.multideck_dexter_action_update_deal_sales(p_company_id uuid,p_user_id uuid,p_arguments jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare actor uuid;previous_sub text:=current_setting('request.jwt.claim.sub',true);result jsonb;target uuid;version bigint;operation text;input jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'server_only' using errcode='42501';end if;
 select "Auth_User_ID" into actor from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and "User_AccessStatus"='active';
 if actor is null or public._multideck_crm_has_permission(p_user_id,'CRM.Read') is not true or public._multideck_crm_has_permission(p_user_id,'CRM.Write') is not true then raise exception 'You do not have permission to change this deal.' using errcode='42501';end if;
 if jsonb_typeof(p_arguments) is distinct from 'object' or not(p_arguments ?& array['target_id','expected_version','operation','input','reason']) or exists(select 1 from jsonb_object_keys(p_arguments) k where k not in ('target_id','expected_version','operation','input','reason','_document_evidence')) then raise exception 'Read the deal and prepare one explicit sales change for approval.' using errcode='22023';end if;
 target:=(p_arguments->>'target_id')::uuid;version:=(p_arguments->>'expected_version')::bigint;operation:=p_arguments->>'operation';input:=p_arguments->'input';
 if not public._multideck_crm_deal_is_operator_visible(target,p_company_id) then raise exception 'Deal not found.' using errcode='P0002';end if;
 if nullif(btrim(p_arguments->>'reason'),'') is null or jsonb_typeof(input) is distinct from 'object' then raise exception 'Describe the proposed change for approval.' using errcode='22023';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 begin
 case operation
 when 'set_next_action' then result:=public.multideck_crm_set_deal_next_action(target,version,input);
 when 'complete_next_action' then
   if exists(select 1 from jsonb_object_keys(input) k where k not in ('actionId','note')) then raise exception 'Only an action and completion note may be supplied.' using errcode='22023';end if;
   result:=public.multideck_crm_complete_deal_next_action(target,version,(input->>'actionId')::uuid,input->>'note');
 when 'assign' then
   if not(input ?| array['ownerId','primaryContactId']) or exists(select 1 from jsonb_object_keys(input) k where k not in ('ownerId','primaryContactId')) then raise exception 'Choose only an owner or main contact change.' using errcode='22023';end if;
   result:=public.multideck_crm_update_deal(target,version,input);
 when 'mark_lost' then result:=public.multideck_crm_lose_deal(target,version,input);
 when 'reopen' then
 if exists(select 1 from jsonb_object_keys(input) k where k not in ('pipelineStageId','reason')) then raise exception 'Choose only an open stage and a reopening reason.' using errcode='22023';end if;
 result:=public.multideck_crm_reopen_deal(target,version,(input->>'pipelineStageId')::uuid,input->>'reason');
 else raise exception 'That deal sales action is not supported.' using errcode='22023';
 end case;
 perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
 exception when others then perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);raise;end;
 return jsonb_build_object('recordId',target,'sourceUrl','/crm/deals/'||target,'operation',operation,'result',result);
end $$;

create or replace function public._multideck_dexter_deal_watch_snapshot(d public."CRM_Opportunities")
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('name',d."CRMOppty_Name",'stage',(select "CRMPipelineStage_Name" from public."CRM_PipelineStages" where "CRMPipelineStage_ID"=d."CRMOppty_PipelineStageID"),'stageId',d."CRMOppty_PipelineStageID",'pipelineId',d."CRMOppty_PipelineID",'pipeline',(select "CRMPipeline_Name" from public."CRM_Pipelines" where "CRMPipeline_ID"=d."CRMOppty_PipelineID"),'status',d."CRMOppty_StatusCode",'expectedCloseDate',d."CRMOppty_ExpectedCloseDate",'probabilityPct',d."CRMOppty_ProbabilityPct",'expectedValue',d."CRMOppty_ExpectedValueAmount",'expectedMargin',d."CRMOppty_ExpectedMarginAmount",'nextActionDueAt',d."CRMOppty_NextActionDueAt",'ownerId',d."CRMOppty_OwnerUserID",'primaryContactId',d."CRMOppty_PrimaryContactID",'nextAction',d."CRMOppty_NextActionJSON"->>'title','nextActionId',d."CRMOppty_NextActionJSON"->>'id','nextActionOwnerId',d."CRMOppty_NextActionJSON"->>'ownerId','lossReasonCode',d."CRMOppty_LossReasonCode",'revisitDate',d."CRMOppty_RevisitDate");
$$;

insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_SortOrder","AIDexterDomain_IsActive","AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON","AIDexterDomain_ScopeStrategy") values
 ('deal_sales','Deal actions and outcomes','Shared deal owner and main contact, exact current next action and personal task link, completed action history, structured lost reason and revisit date. Read exact record ID and edit version before proposing a change.','multideck_dexter_domain_deal_sales',34,true,'["CRM.Read"]','["business_record"]','canonical'),
 ('sales_insights','Sales insights','Measured current-stage dwell, stage movement cohorts, close-date slippage, won/closed win rate and loss reasons for the last 90 days. Includes exact source deal IDs, routes, denominators and history coverage. Never invent missing historical measurements.','multideck_dexter_domain_sales_insights',35,true,'["CRM.Read"]','["business_record"]','canonical');
insert into public."sys_AIDexterActions"("AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description","AIDexterAction_Function","AIDexterAction_ParametersJSON","AIDexterAction_SortOrder","AIDexterAction_IsActive","AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily","AIDexterAction_ScopeStrategy","AIDexterAction_AlwaysRequiresApproval") values
 ('update_deal_sales','deals','Update deal sales workflow','Prepare one explicit deal next action, completion, owner/main contact assignment, or structured lost outcome. Read deal_sales first. Approval always required; stale versions fail. Input for set_next_action: title/type/ownerId/dueAt/taskDate (local calendar date); complete_next_action: actionId/note; assign: ownerId/primaryContactId; mark_lost: reasonCode/details/competitor/revisitDate/pipelineStageId; reopen: pipelineStageId/reason (lost deals only, choose an open stage).','multideck_dexter_action_update_deal_sales',
 '{"type":"object","properties":{"target_id":{"type":"string"},"expected_version":{"type":"integer","minimum":1},"operation":{"type":"string","enum":["set_next_action","complete_next_action","assign","mark_lost","reopen"]},"input":{"type":"object","properties":{"title":{"type":"string"},"type":{"type":"string","enum":["call","email","meeting","quote","follow_up","other"]},"ownerId":{"type":["string","null"]},"dueAt":{"type":"string"},"taskDate":{"type":"string"},"reason":{"type":"string"},"actionId":{"type":"string"},"note":{"type":"string"},"primaryContactId":{"type":["string","null"]},"reasonCode":{"type":"string","enum":["price","timing","competitor","service_fit","no_response","cancelled","other"]},"details":{"type":"string"},"competitor":{"type":"string"},"revisitDate":{"type":"string"},"pipelineStageId":{"type":"string"}},"additionalProperties":false},"reason":{"type":"string"}},"required":["target_id","expected_version","operation","input","reason"],"additionalProperties":false}',36,true,'["CRM.Read","CRM.Write"]','update_deal_sales','canonical',true);
update public."sys_AIDexterWatchCapabilities" set "AIDexterWatchCapability_Description"='Deal stage, close date, ownership, named next action, completion and loss reason changes. Exact deal evidence; event-driven and permission scoped.',"AIDexterWatchCapability_FieldsJSON"=(select jsonb_agg(distinct value) from jsonb_array_elements("AIDexterWatchCapability_FieldsJSON"||'["ownerId","primaryContactId","nextAction","nextActionId","nextActionOwnerId","lossReasonCode","revisitDate"]'::jsonb)) where "AIDexterWatchCapability_Code"='deals';

-- Keep the existing paged register and its filters consistent with legacy
-- closed states. Preserve saved dates; only the read projection is normalised.
do $patch$
declare definition text;marker text:='deal."CRMOppty_LostAt" as lost_at';
begin
 definition:=pg_get_functiondef('public.multideck_crm_deal_register_page(text,text,uuid,uuid,uuid,boolean,boolean,text,text,integer,integer)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'Review the deal register projection before applying the sales workflow';end if;
 definition:=replace(definition,marker,marker||', public._multideck_crm_deal_outcome(deal) as outcome');
 definition:=replace(definition,'won_at is null and lost_at is null','outcome = ''open''');
 definition:=replace(definition,'won_at is not null','outcome = ''won''');
 definition:=replace(definition,'lost_at is not null','outcome = ''lost''');
 definition:=replace(definition,'deal."CRMOppty_StatusCode" as status_code','case when public._multideck_crm_deal_outcome(deal) in (''lost'',''won'') then public._multideck_crm_deal_outcome(deal) else deal."CRMOppty_StatusCode" end as status_code');
 definition:=replace(definition,'opportunity_status."CRMOpptyStatus_Name" as status_name','case when public._multideck_crm_deal_outcome(deal) in (''lost'',''won'') then initcap(public._multideck_crm_deal_outcome(deal)) else opportunity_status."CRMOpptyStatus_Name" end as status_name');
 execute definition;
end $patch$;

-- Existing deal watches must stop for unlinked users as well as revoked roles.
do $patch$
declare definition text;marker text:=E'and owner_user."User_AccessStatus" = ''active''';
begin
 definition:=pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
 if position(marker in definition)=0 then raise exception 'Review the deal watch actor guard before applying the sales workflow';end if;
 definition:=replace(definition,marker,marker||E'\n            and owner_user."Auth_User_ID" is not null');
 execute definition;
end $patch$;

-- Every newly added internal helper and old alias stays server-private.
do $$declare fn regprocedure;begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (
 '_multideck_crm_context','_multideck_crm_sales_context','_multideck_crm_sales_lock','_multideck_crm_deal_action_json','_multideck_crm_deal_outcome','_multideck_crm_deal_conversion_before_sales_20260922','_multideck_crm_deal_conversion_state','_multideck_crm_deal_json_before_sales_20260922','_multideck_crm_deal_json','_multideck_crm_deal_sales_snapshot','_multideck_crm_deal_sales_event','_multideck_crm_deal_action_task_change','_multideck_crm_update_deal_before_sales_20260922','_multideck_crm_win_deal_before_sales_20260922','_multideck_dexter_deal_watch_snapshot','multideck_dexter_domain_deal_sales','multideck_dexter_domain_sales_insights','multideck_dexter_action_update_deal_sales') loop execute format('revoke all on function %s from public,anon,authenticated',fn);end loop;
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (
 'multideck_crm_deal_people','multideck_crm_set_deal_next_action','multideck_crm_complete_deal_next_action','multideck_crm_lose_deal','multideck_crm_reopen_deal','multideck_crm_update_deal','multideck_crm_move_deal_stage','multideck_crm_win_deal','multideck_crm_get_sales_insights') loop execute format('revoke all on function %s from public,anon',fn);execute format('grant execute on function %s to authenticated,service_role',fn);end loop;
end $$;
grant execute on function public.multideck_dexter_domain_deal_sales(uuid,text,integer),public.multideck_dexter_domain_sales_insights(uuid,text,integer),public.multideck_dexter_action_update_deal_sales(uuid,uuid,jsonb) to service_role;
commit;
