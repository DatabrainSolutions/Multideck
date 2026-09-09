-- Durable contact-card automation evidence, field-mapped CRM actions, reruns,
-- and Dexter read/watch parity. Runtime evaluation is deterministic in Postgres.

begin;

alter table public."CRM_ContactCardAutomationActions"
  drop constraint if exists "CRM_ContactCardAutomationActions_Action_Kind_check";
alter table public."CRM_ContactCardAutomationActions"
  add constraint "CRM_ContactCardAutomationActions_Action_Kind_check"
  check ("Action_Kind" in ('add-to-crm','assign-owner','pipeline-stage','add-to-list','create-task','notify-user','send-email'));

create table public."CRM_ContactCardAutomationRuns" (
  "AutomationRun_ID" uuid primary key default gen_random_uuid(),
  "ContactCard_ID" uuid not null references public."CRM_ContactCards"("ContactCard_ID") on delete cascade,
  "Exchange_ID" uuid references public."CRM_ContactCardExchanges"("Exchange_ID") on delete set null,
  "CRMLead_ID" uuid references public."CRM_Leads"("CRMLead_ID") on delete set null,
  "AutomationRun_Status" text not null default 'running' check ("AutomationRun_Status" in ('running','succeeded','failed','skipped')),
  "AutomationRun_Trigger" text not null default 'Lead submitted',
  "AutomationRun_Input" jsonb not null default '{}'::jsonb,
  "AutomationRun_ExistingLead" boolean not null default false,
  "AutomationRun_StartedAt" timestamptz not null default clock_timestamp(),
  "AutomationRun_CompletedAt" timestamptz,
  "AutomationRun_DurationMs" integer not null default 0,
  "AutomationRun_RecordsAffected" integer not null default 0,
  "AutomationRun_ErrorSummary" text,
  "AutomationRun_Recovery" text,
  "AutomationRun_RerunOf" uuid references public."CRM_ContactCardAutomationRuns"("AutomationRun_ID") on delete set null,
  "AutomationRun_IsTest" boolean not null default false
);

create table public."CRM_ContactCardAutomationRunSteps" (
  "AutomationRunStep_ID" uuid primary key default gen_random_uuid(),
  "AutomationRun_ID" uuid not null references public."CRM_ContactCardAutomationRuns"("AutomationRun_ID") on delete cascade,
  "Action_ID" uuid references public."CRM_ContactCardAutomationActions"("Action_ID") on delete set null,
  "AutomationRunStep_SortOrder" integer not null default 0,
  "AutomationRunStep_Kind" text not null,
  "AutomationRunStep_Label" text not null,
  "AutomationRunStep_Status" text not null check ("AutomationRunStep_Status" in ('succeeded','failed','skipped')),
  "AutomationRunStep_Detail" text not null default '',
  "AutomationRunStep_StartedAt" timestamptz not null default clock_timestamp(),
  "AutomationRunStep_DurationMs" integer not null default 0
);

create index "IX_CRM_ContactCardAutomationRuns_Card_Started"
  on public."CRM_ContactCardAutomationRuns"("ContactCard_ID", "AutomationRun_StartedAt" desc);
create index "IX_CRM_ContactCardAutomationRunSteps_Run_Order"
  on public."CRM_ContactCardAutomationRunSteps"("AutomationRun_ID", "AutomationRunStep_SortOrder");

alter table public."CRM_ContactCardAutomationRuns" enable row level security;
alter table public."CRM_ContactCardAutomationRunSteps" enable row level security;
revoke all on public."CRM_ContactCardAutomationRuns", public."CRM_ContactCardAutomationRunSteps" from public, anon, authenticated;

create or replace function public.multideck_contact_cards_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record; v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  select jsonb_build_object(
    'cards', coalesce((select jsonb_agg(to_jsonb(c) order by c."ContactCard_UpdatedAt" desc) from public."CRM_ContactCards" c where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null),'[]'::jsonb),
    'automations', coalesce((select jsonb_agg(to_jsonb(a)) from public."CRM_ContactCardAutomations" a join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null),'[]'::jsonb),
    'conditions', coalesce((select jsonb_agg(to_jsonb(x) order by x."Condition_SortOrder") from public."CRM_ContactCardAutomationConditions" x join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null),'[]'::jsonb),
    'actions', coalesce((select jsonb_agg(to_jsonb(x) order by x."Action_SortOrder") from public."CRM_ContactCardAutomationActions" x join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null),'[]'::jsonb),
    'scans', coalesce((select jsonb_agg(to_jsonb(s) order by s."Scan_At") from public."CRM_ContactCardScans" s join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null),'[]'::jsonb),
    'exchanges', coalesce((select jsonb_agg(to_jsonb(e) order by e."Exchange_At") from public."CRM_ContactCardExchanges" e join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null),'[]'::jsonb),
    'runs', coalesce((select jsonb_agg(to_jsonb(r) order by r."AutomationRun_StartedAt" desc) from (select run.* from public."CRM_ContactCardAutomationRuns" run join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null order by run."AutomationRun_StartedAt" desc limit 200) r),'[]'::jsonb),
    'runSteps', coalesce((select jsonb_agg(to_jsonb(step) order by step."AutomationRunStep_SortOrder") from public."CRM_ContactCardAutomationRunSteps" step join public."CRM_ContactCardAutomationRuns" run using ("AutomationRun_ID") join public."CRM_ContactCards" c using ("ContactCard_ID") where c."Company_ID"=v_context.company_id and c."ContactCard_DeletedAt" is null and run."AutomationRun_StartedAt">now()-interval '90 days'),'[]'::jsonb),
    'pipelines', coalesce((select jsonb_agg(jsonb_build_object('id',p."CRMPipeline_ID",'name',p."CRMPipeline_Name",'stages',(select coalesce(jsonb_agg(jsonb_build_object('id',s."CRMPipelineStage_ID",'name',s."CRMPipelineStage_Name",'isDefaultEntry',s."CRMPipelineStage_IsDefaultEntry") order by s."CRMPipelineStage_SortOrder"),'[]'::jsonb) from public."CRM_PipelineStages" s where s."CRMPipeline_ID"=p."CRMPipeline_ID" and not s."Is_Deleted")) order by p."CRMPipeline_SortOrder") from public."CRM_Pipelines" p where p."Company_ID"=v_context.company_id and not p."Is_Deleted"),'[]'::jsonb),
    'owners', coalesce((select jsonb_agg(jsonb_build_object('id',u."User_ID",'name',btrim(concat_ws(' ',u."User_Firstname",u."User_Lastname")),'email',u."User_Email") order by u."User_Firstname",u."User_Lastname") from public."cmp_Users" u where u."Company_ID"=v_context.company_id and u."Auth_User_ID" is not null),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public._multideck_contact_card_execute_automation(
  p_card_id uuid,
  p_exchange_id uuid,
  p_lead_id uuid,
  p_input jsonb,
  p_existing_lead boolean,
  p_is_test boolean default false,
  p_rerun_of uuid default null,
  p_start_order integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_card record; v_automation record; v_run uuid; v_started timestamptz:=clock_timestamp();
  v_condition record; v_action record; v_match boolean; v_domain text; v_detail text;
  v_actions integer:=0; v_step_started timestamptz; v_pipeline uuid; v_stage uuid; v_owner uuid;
  v_record_type text; v_duplicate text; v_deal uuid; v_deal_name text; v_lead record;
  v_type text; v_status text; v_forecast text; v_opportunity_stage text;
begin
  select * into v_card from public."CRM_ContactCards" where "ContactCard_ID"=p_card_id and "ContactCard_DeletedAt" is null;
  if not found then raise exception 'Contact card not found.' using errcode='P0002'; end if;
  select * into v_automation from public."CRM_ContactCardAutomations" where "ContactCard_ID"=p_card_id;

  insert into public."CRM_ContactCardAutomationRuns"("ContactCard_ID","Exchange_ID","CRMLead_ID","AutomationRun_Status","AutomationRun_Input","AutomationRun_ExistingLead","AutomationRun_RerunOf","AutomationRun_IsTest")
  values(p_card_id,p_exchange_id,p_lead_id,'running',p_input,p_existing_lead,p_rerun_of,p_is_test) returning "AutomationRun_ID" into v_run;
  insert into public."CRM_ContactCardAutomationRunSteps"("AutomationRun_ID","AutomationRunStep_SortOrder","AutomationRunStep_Kind","AutomationRunStep_Label","AutomationRunStep_Status","AutomationRunStep_Detail")
  values(v_run,0,'trigger','Lead submitted','succeeded',case when p_is_test then 'Test input accepted. No CRM record was changed.' else 'The contact card received valid details.' end);

  if not p_is_test and p_rerun_of is null and coalesce(v_automation."Automation_State",'off')<>'active' then
    update public."CRM_ContactCardAutomationRuns" set "AutomationRun_Status"='skipped',"AutomationRun_CompletedAt"=clock_timestamp(),"AutomationRun_DurationMs"=greatest(0,(extract(epoch from(clock_timestamp()-v_started))*1000)::integer) where "AutomationRun_ID"=v_run;
    return v_run;
  end if;

  for v_condition in select * from public."CRM_ContactCardAutomationConditions" where "ContactCard_ID"=p_card_id and "Condition_Enabled" order by "Condition_SortOrder" loop
    v_step_started:=clock_timestamp(); v_domain:=lower(split_part(coalesce(p_input->>'email',''),'@',2));
    if p_rerun_of is not null then v_match:=true; v_detail:='Matched in the original run.';
    elsif p_is_test then
      v_match:=v_condition."Condition_Kind"<>'within-dates' or v_condition."Condition_Value" ~ '^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$';
      v_detail:=case when v_match then 'Condition configuration is valid.' else 'Use dates in the format YYYY-MM-DD..YYYY-MM-DD.' end;
    elsif v_condition."Condition_Kind"='free-email' then
      v_match:=v_domain=any(array['gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','icloud.com','yahoo.com','aol.com','proton.me','protonmail.com']); v_detail:='Checked the submitted email provider.';
    elsif v_condition."Condition_Kind"='new-lead' then v_match:=not p_existing_lead; v_detail:=case when v_match then 'This email was not already in the CRM.' else 'This email already exists in the CRM.' end;
    elsif v_condition."Condition_Kind"='email-domain' then v_match:=v_domain=lower(replace(v_condition."Condition_Value",'@','')); v_detail:='Compared the submitted email domain.';
    elsif v_condition."Condition_Kind"='known-company' then
      v_match:=exists(select 1 from public."Org_Master" organisation where lower(btrim(organisation."Org_Name"))=lower(btrim(coalesce(p_input->>'company','')))); v_detail:='Compared the company with existing organisations.';
    elsif v_condition."Condition_Kind"='within-dates' then
      if v_condition."Condition_Value" ~ '^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$' then
        v_match:=current_date between split_part(v_condition."Condition_Value",'..',1)::date and split_part(v_condition."Condition_Value",'..',2)::date;
      else
        v_match:=false;
      end if;
      v_detail:='Checked today against the saved event dates.';
    else v_match:=false; v_detail:='This condition is not supported.'; end if;
    if v_condition."Condition_Negated" then v_match:=not v_match; end if;
    insert into public."CRM_ContactCardAutomationRunSteps"("AutomationRun_ID","AutomationRunStep_SortOrder","AutomationRunStep_Kind","AutomationRunStep_Label","AutomationRunStep_Status","AutomationRunStep_Detail","AutomationRunStep_StartedAt","AutomationRunStep_DurationMs")
    values(v_run,10+v_condition."Condition_SortOrder",'condition',v_condition."Condition_Kind",case when v_match then 'succeeded' else 'skipped' end,v_detail,v_step_started,greatest(0,(extract(epoch from(clock_timestamp()-v_step_started))*1000)::integer));
    if not v_match then
      update public."CRM_ContactCardAutomationRuns" set "AutomationRun_Status"='skipped',"AutomationRun_CompletedAt"=clock_timestamp(),"AutomationRun_DurationMs"=greatest(0,(extract(epoch from(clock_timestamp()-v_started))*1000)::integer) where "AutomationRun_ID"=v_run;
      return v_run;
    end if;
  end loop;

  for v_action in select * from public."CRM_ContactCardAutomationActions" where "ContactCard_ID"=p_card_id and "Action_Enabled" order by "Action_SortOrder" loop
    if v_action."Action_SortOrder"<p_start_order then
      insert into public."CRM_ContactCardAutomationRunSteps"("AutomationRun_ID","Action_ID","AutomationRunStep_SortOrder","AutomationRunStep_Kind","AutomationRunStep_Label","AutomationRunStep_Status","AutomationRunStep_Detail") values(v_run,v_action."Action_ID",100+v_action."Action_SortOrder",v_action."Action_Kind",v_action."Action_Kind",'skipped','Completed in the original run.');
      continue;
    end if;
    v_step_started:=clock_timestamp();
    begin
      v_pipeline:=v_action."Action_PipelineID"; v_stage:=v_action."Action_PipelineStageID"; v_owner:=v_action."Action_OwnerUserID";
      if v_pipeline is not null and not exists(select 1 from public."CRM_Pipelines" p join public."CRM_PipelineStages" s on s."CRMPipeline_ID"=p."CRMPipeline_ID" where p."Company_ID"=v_card."Company_ID" and p."CRMPipeline_ID"=v_pipeline and s."CRMPipelineStage_ID"=v_stage and not p."Is_Deleted" and not s."Is_Deleted") then raise exception 'The saved pipeline or stage is no longer available.'; end if;
      if v_owner is not null and not exists(select 1 from public."cmp_Users" where "User_ID"=v_owner and "Company_ID"=v_card."Company_ID") then raise exception 'The saved owner is no longer available.'; end if;

      if p_is_test then
        if v_action."Action_Kind" not in ('add-to-crm','assign-owner','pipeline-stage') then raise exception 'This action is not connected to a live Multideck operation yet.'; end if;
        if v_action."Action_Kind"='add-to-crm' and coalesce(v_action."Action_Config"->>'recordType','lead')='deal' and (v_pipeline is null or v_stage is null) then raise exception 'Choose a pipeline and deal stage.'; end if;
        v_detail:='Configuration checked. No CRM record was changed.';
      elsif v_action."Action_Kind"='assign-owner' then
        if v_owner is null then raise exception 'Choose an owner.'; end if;
        update public."CRM_Leads" set "CRMLead_OwnerUserID"=v_owner,"CRMLead_UpdatedAt"=now(),"CRMLead_UpdatedBy"=v_card."Owner_User_ID" where "CRMLead_ID"=p_lead_id;
        v_actions:=v_actions+1; v_detail:='Lead owner updated in the CRM.';
      elsif v_action."Action_Kind"='pipeline-stage' then
        if v_pipeline is null or v_stage is null then raise exception 'Choose a pipeline and stage.'; end if;
        insert into public."CRM_LeadPipelinePlacements"("CRMLead_ID","CRMPipeline_ID","CRMPipelineStage_ID","ContactCard_ID") values(p_lead_id,v_pipeline,v_stage,p_card_id)
        on conflict("CRMLead_ID") do update set "CRMPipeline_ID"=excluded."CRMPipeline_ID","CRMPipelineStage_ID"=excluded."CRMPipelineStage_ID","ContactCard_ID"=excluded."ContactCard_ID","Placed_At"=now();
        v_actions:=v_actions+1; v_detail:='Lead placed in the selected pipeline stage.';
      elsif v_action."Action_Kind"='add-to-crm' then
        v_record_type:=coalesce(v_action."Action_Config"->>'recordType','lead'); v_duplicate:=coalesce(v_action."Action_Config"->>'duplicateHandling','update');
        if p_existing_lead and v_duplicate='fail' then raise exception 'This email already exists in the CRM.'; end if;
        if p_existing_lead and v_duplicate='skip' then
          insert into public."CRM_ContactCardAutomationRunSteps"("AutomationRun_ID","Action_ID","AutomationRunStep_SortOrder","AutomationRunStep_Kind","AutomationRunStep_Label","AutomationRunStep_Status","AutomationRunStep_Detail","AutomationRunStep_StartedAt","AutomationRunStep_DurationMs") values(v_run,v_action."Action_ID",100+v_action."Action_SortOrder",v_action."Action_Kind",case when v_record_type='deal' then 'Add deal to CRM' else 'Add lead to CRM' end,'skipped','The email already existed, so the saved duplicate rule skipped this step.',v_step_started,greatest(0,(extract(epoch from(clock_timestamp()-v_step_started))*1000)::integer));
          continue;
        end if;
        if v_owner is not null then update public."CRM_Leads" set "CRMLead_OwnerUserID"=v_owner,"CRMLead_UpdatedAt"=now(),"CRMLead_UpdatedBy"=v_card."Owner_User_ID" where "CRMLead_ID"=p_lead_id; end if;
        if v_record_type='deal' then
          select * into v_lead from public."CRM_Leads" where "CRMLead_ID"=p_lead_id and not "CRMLead_IsDeleted";
          if v_lead."CRMLead_OrgID" is null then raise exception 'Link this lead to an organisation before creating a deal.'; end if;
          if v_pipeline is null or v_stage is null then raise exception 'Choose a pipeline and deal stage.'; end if;
          select "CRMOpptyType_Code" into v_type from public."sys_CRMOpportunityTypes" where "CRMOpptyType_IsActive" order by "CRMOpptyType_SortOrder" limit 1;
          select "CRMOpptyStatus_Code" into v_status from public."sys_CRMOpportunityStatuses" where "CRMOpptyStatus_IsActive" and "CRMOpptyStatus_IsOpen" order by "CRMOpptyStatus_SortOrder" limit 1;
          select "CRMForecast_Code" into v_forecast from public."sys_CRMForecastCategories" where "CRMForecast_IsActive" order by "CRMForecast_SortOrder" limit 1;
          select "CRMStage_Code" into v_opportunity_stage from public."sys_CRMOpportunityStages" where "CRMStage_IsActive" and "CRMStage_IsOpen" order by "CRMStage_SortOrder" limit 1;
          v_deal_name:=replace(coalesce(nullif(v_action."Action_Config"->>'dealName',''),'{company} enquiry'),'{company}',coalesce(p_input->>'company','New'));
          select "CRMOppty_ID" into v_deal from public."CRM_Opportunities" where "CRMOppty_SourceLeadID"=p_lead_id and "CRMOppty_PipelineID"=v_pipeline and not "CRMOppty_IsDeleted" order by "CRMOppty_CreatedAt" desc limit 1;
          if v_deal is null then
            insert into public."CRM_Opportunities"("CRMOppty_OrgID","CRMOppty_SourceLeadID","CRMOppty_OwnerUserID","CRMOppty_PipelineID","CRMOppty_PipelineStageID","CRMOppty_Name","CRMOppty_TypeCode","CRMOppty_StageCode","CRMOppty_StatusCode","CRMOppty_ForecastCategoryCode","CRMOppty_MetadataJSON","CRMOppty_CreatedBy","CRMOppty_UpdatedBy")
            values(v_lead."CRMLead_OrgID",p_lead_id,coalesce(v_owner,v_lead."CRMLead_OwnerUserID",v_card."Owner_User_ID"),v_pipeline,v_stage,left(v_deal_name,240),v_type,v_opportunity_stage,v_status,v_forecast,jsonb_build_object('contactCardId',p_card_id,'automationRunId',v_run),v_card."Owner_User_ID",v_card."Owner_User_ID") returning "CRMOppty_ID" into v_deal;
          else
            update public."CRM_Opportunities" set "CRMOppty_PipelineStageID"=v_stage,"CRMOppty_UpdatedAt"=now(),"CRMOppty_UpdatedBy"=v_card."Owner_User_ID" where "CRMOppty_ID"=v_deal;
          end if;
          v_detail:='Deal saved in the selected CRM pipeline.';
        else
          update public."CRM_Leads" set
            "CRMLead_PersonName"=left(btrim(concat_ws(' ',p_input->>'firstName',p_input->>'lastName')),255),
            "CRMLead_CompanyName"=left(btrim(coalesce(p_input->>'company','')),255),
            "CRMLead_Phone"=left(btrim(coalesce(p_input->>'phone','')),80),
            "CRMLead_UpdatedAt"=now(),"CRMLead_UpdatedBy"=v_card."Owner_User_ID"
          where "CRMLead_ID"=p_lead_id;
          if v_pipeline is not null and v_stage is not null then insert into public."CRM_LeadPipelinePlacements"("CRMLead_ID","CRMPipeline_ID","CRMPipelineStage_ID","ContactCard_ID") values(p_lead_id,v_pipeline,v_stage,p_card_id) on conflict("CRMLead_ID") do update set "CRMPipeline_ID"=excluded."CRMPipeline_ID","CRMPipelineStage_ID"=excluded."CRMPipelineStage_ID","ContactCard_ID"=excluded."ContactCard_ID","Placed_At"=now(); end if;
          v_detail:=case when p_existing_lead then 'Existing CRM lead updated from the submitted fields.' else 'New CRM lead created from the submitted fields.' end;
        end if;
        v_actions:=v_actions+1;
      else raise exception 'This action is saved but its live integration is not connected yet.'; end if;

      insert into public."CRM_ContactCardAutomationRunSteps"("AutomationRun_ID","Action_ID","AutomationRunStep_SortOrder","AutomationRunStep_Kind","AutomationRunStep_Label","AutomationRunStep_Status","AutomationRunStep_Detail","AutomationRunStep_StartedAt","AutomationRunStep_DurationMs") values(v_run,v_action."Action_ID",100+v_action."Action_SortOrder",v_action."Action_Kind",case when v_action."Action_Kind"='add-to-crm' then 'Add to CRM' when v_action."Action_Kind"='assign-owner' then 'Assign owner' when v_action."Action_Kind"='pipeline-stage' then 'Add to pipeline' else v_action."Action_Kind" end,'succeeded',v_detail,v_step_started,greatest(0,(extract(epoch from(clock_timestamp()-v_step_started))*1000)::integer));
    exception when others then
      insert into public."CRM_ContactCardAutomationRunSteps"("AutomationRun_ID","Action_ID","AutomationRunStep_SortOrder","AutomationRunStep_Kind","AutomationRunStep_Label","AutomationRunStep_Status","AutomationRunStep_Detail","AutomationRunStep_StartedAt","AutomationRunStep_DurationMs") values(v_run,v_action."Action_ID",100+v_action."Action_SortOrder",v_action."Action_Kind",case when v_action."Action_Kind"='add-to-crm' then 'Add to CRM' else v_action."Action_Kind" end,'failed',sqlerrm,v_step_started,greatest(0,(extract(epoch from(clock_timestamp()-v_step_started))*1000)::integer));
      update public."CRM_ContactCardAutomationRuns" set "AutomationRun_Status"='failed',"AutomationRun_CompletedAt"=clock_timestamp(),"AutomationRun_DurationMs"=greatest(0,(extract(epoch from(clock_timestamp()-v_started))*1000)::integer),"AutomationRun_RecordsAffected"=v_actions,"AutomationRun_ErrorSummary"=sqlerrm,"AutomationRun_Recovery"=case when v_action."Action_Kind"='add-to-crm' then 'Open Add to CRM, correct the owner, pipeline, duplicate rule or mapping, publish the change, then rerun the failed steps.' else 'Open the failed step, correct its setup, publish the change, then rerun the failed steps.' end where "AutomationRun_ID"=v_run;
      return v_run;
    end;
  end loop;
  update public."CRM_ContactCardAutomationRuns" set "AutomationRun_Status"='succeeded',"AutomationRun_CompletedAt"=clock_timestamp(),"AutomationRun_DurationMs"=greatest(0,(extract(epoch from(clock_timestamp()-v_started))*1000)::integer),"AutomationRun_RecordsAffected"=v_actions where "AutomationRun_ID"=v_run;
  update public."CRM_ContactCardAutomations" set "Automation_LastRunAt"=case when p_is_test then "Automation_LastRunAt" else now() end,"Automation_AutoPausedReason"=null,"Automation_UpdatedAt"=now() where "ContactCard_ID"=p_card_id;
  return v_run;
end;
$$;

create or replace function public.multideck_contact_card_submit_exchange(p_slug text,p_scan_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_card record; v_email text; v_lead uuid; v_existing boolean:=false; v_exchange uuid; v_outcome text; v_run uuid; v_run_status text;
begin
  select * into v_card from public."CRM_ContactCards" where "ContactCard_Slug"=lower(btrim(p_slug)) and "ContactCard_Status"='published' and "ContactCard_DeletedAt" is null limit 1;
  if not found then raise exception 'This contact card is not active.' using errcode='P0002'; end if;
  v_email:=lower(btrim(p_input->>'email'));
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a valid email address.' using errcode='22023'; end if;
  if btrim(coalesce(p_input->>'firstName',''))='' or btrim(coalesce(p_input->>'lastName',''))='' or btrim(coalesce(p_input->>'company',''))='' then raise exception 'Enter a first name, last name and company.' using errcode='22023'; end if;
  select "CRMLead_ID" into v_lead from public."CRM_Leads" where lower("CRMLead_Email")=v_email and not "CRMLead_IsDeleted" order by "CRMLead_CreatedAt" limit 1; v_existing:=v_lead is not null;
  if not v_existing then insert into public."CRM_Leads"("CRMLead_SourceCode","CRMLead_StatusCode","CRMLead_RatingCode","CRMLead_OwnerUserID","CRMLead_CompanyName","CRMLead_PersonName","CRMLead_Email","CRMLead_Phone","CRMLead_MetadataJSON","CRMLead_CreatedBy","CRMLead_UpdatedBy") values('website','new','unrated',v_card."Owner_User_ID",left(btrim(p_input->>'company'),255),left(btrim(concat_ws(' ',p_input->>'firstName',p_input->>'lastName')),255),left(v_email,255),left(coalesce(p_input->>'phone',''),80),jsonb_build_object('contactCardId',v_card."ContactCard_ID",'contactCardSlug',v_card."ContactCard_Slug",'leadSource',v_card."ContactCard_LeadSource",'marketingConsent',coalesce((p_input->>'marketingConsent')::boolean,false)),v_card."Owner_User_ID",v_card."Owner_User_ID") returning "CRMLead_ID" into v_lead; end if;
  if p_scan_id is not null and not exists(select 1 from public."CRM_ContactCardScans" where "Scan_ID"=p_scan_id and "ContactCard_ID"=v_card."ContactCard_ID" and "Scan_At">now()-interval '24 hours') then p_scan_id:=null; end if;
  v_outcome:=case when v_existing then 'matched' else 'created' end;
  insert into public."CRM_ContactCardExchanges"("ContactCard_ID","Scan_ID","CRMLead_ID","Exchange_FirstName","Exchange_LastName","Exchange_Email","Exchange_Company","Exchange_Phone","Exchange_MarketingConsent","Exchange_Outcome","Exchange_AutomationOutcome","Exchange_AutomationDetail") values(v_card."ContactCard_ID",p_scan_id,v_lead,btrim(p_input->>'firstName'),btrim(p_input->>'lastName'),v_email,btrim(p_input->>'company'),btrim(coalesce(p_input->>'phone','')),coalesce((p_input->>'marketingConsent')::boolean,false),v_outcome,'none','Automation pending.') returning "Exchange_ID" into v_exchange;
  v_run:=public._multideck_contact_card_execute_automation(v_card."ContactCard_ID",v_exchange,v_lead,p_input,v_existing,false,null,0);
  select "AutomationRun_Status" into v_run_status from public."CRM_ContactCardAutomationRuns" where "AutomationRun_ID"=v_run;
  update public."CRM_ContactCardExchanges" set "Exchange_AutomationOutcome"=case when v_run_status='succeeded' then 'ran' when v_run_status='failed' then 'failed' when v_run_status='skipped' then 'skipped' else 'none' end,"Exchange_AutomationDetail"=case when v_run_status='succeeded' then 'Connected CRM actions completed.' when v_run_status='failed' then 'An automation step failed. The input was preserved for rerun.' when v_run_status='skipped' then 'The automation was off or a condition did not match.' else 'No automation action ran.' end where "Exchange_ID"=v_exchange;
  update public."CRM_ContactCardScans" set "Scan_StartedAt"=coalesce("Scan_StartedAt",now()),"Scan_ExchangedAt"=now() where "Scan_ID"=p_scan_id and "ContactCard_ID"=v_card."ContactCard_ID";
  return jsonb_build_object('outcome',v_outcome,'exchangeId',v_exchange,'leadId',v_lead,'runId',v_run,'automationOutcome',v_run_status);
end; $$;

create or replace function public.multideck_contact_card_test_automation(p_card_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_context record; v_card record; v_input jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  select * into v_card from public."CRM_ContactCards" where "ContactCard_ID"=p_card_id and "Company_ID"=v_context.company_id and "ContactCard_DeletedAt" is null;
  if not found then raise exception 'Contact card not found.' using errcode='P0002'; end if;
  v_input:=jsonb_build_object('firstName','Test','lastName','Contact','email',coalesce(nullif(v_card."ContactCard_Person"->>'email',''),'test@example.com'),'company',coalesce(nullif(v_card."ContactCard_Person"->>'company',''),'Test company'),'phone',coalesce(v_card."ContactCard_Person"->>'phone',''),'marketingConsent',false);
  return public._multideck_contact_card_execute_automation(p_card_id,null,null,v_input,false,true,null,0);
end; $$;

create or replace function public.multideck_contact_card_rerun(p_run_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_context record; v_run record; v_start integer;
begin
  select * into v_context from public._multideck_crm_context();
  select run.* into v_run from public."CRM_ContactCardAutomationRuns" run join public."CRM_ContactCards" card using("ContactCard_ID") where run."AutomationRun_ID"=p_run_id and card."Company_ID"=v_context.company_id and card."ContactCard_DeletedAt" is null;
  if not found then raise exception 'Automation run not found.' using errcode='P0002'; end if;
  if v_run."AutomationRun_Status"<>'failed' or v_run."AutomationRun_IsTest" then raise exception 'Only a failed live run can be rerun.' using errcode='22023'; end if;
  select greatest(0,"AutomationRunStep_SortOrder"-100) into v_start from public."CRM_ContactCardAutomationRunSteps" where "AutomationRun_ID"=p_run_id and "AutomationRunStep_Status"='failed' order by "AutomationRunStep_SortOrder" limit 1;
  if v_start is null then raise exception 'No failed step remains to rerun.' using errcode='22023'; end if;
  return public._multideck_contact_card_execute_automation(v_run."ContactCard_ID",v_run."Exchange_ID",v_run."CRMLead_ID",v_run."AutomationRun_Input",v_run."AutomationRun_ExistingLead",false,p_run_id,v_start);
end; $$;

-- Dexter can inspect card health and automation evidence without generic SQL.
create or replace function public.multideck_dexter_domain_contact_cards(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg(row_data order by sort_updated desc),'[]'::jsonb) from (
    select jsonb_build_object('recordId',card."ContactCard_ID",'label',card."ContactCard_Label",'person',card."ContactCard_Person"->>'fullName','status',card."ContactCard_Status",'slug',card."ContactCard_Slug",'automationState',automation."Automation_State",'lastRunAt',automation."Automation_LastRunAt",'lastRunStatus',latest."AutomationRun_Status",'failedRuns',(select count(*) from public."CRM_ContactCardAutomationRuns" failed where failed."ContactCard_ID"=card."ContactCard_ID" and failed."AutomationRun_Status"='failed'),'exchanges',(select count(*) from public."CRM_ContactCardExchanges" exchange where exchange."ContactCard_ID"=card."ContactCard_ID")) row_data,card."ContactCard_UpdatedAt" sort_updated
    from public."CRM_ContactCards" card left join public."CRM_ContactCardAutomations" automation using("ContactCard_ID") left join lateral(select run."AutomationRun_Status" from public."CRM_ContactCardAutomationRuns" run where run."ContactCard_ID"=card."ContactCard_ID" order by run."AutomationRun_StartedAt" desc limit 1) latest on true
    where card."Company_ID"=p_company_id and card."ContactCard_DeletedAt" is null and (nullif(btrim(p_search),'') is null or concat_ws(' ',card."ContactCard_Label",card."ContactCard_Slug",card."ContactCard_Person"->>'fullName',card."ContactCard_Person"->>'company') ilike '%'||btrim(p_search)||'%')
    order by card."ContactCard_UpdatedAt" desc limit greatest(1,least(coalesce(p_take,10),25))
  ) rows;
$$;

insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_SortOrder","AIDexterDomain_IsActive","AIDexterDomain_UpdatedAt")
values('contact_cards','Contact cards','QR contact cards, exchanges, automation health and recent run evidence.','multideck_dexter_domain_contact_cards',35,true,now())
on conflict("AIDexterDomain_Code") do update set "AIDexterDomain_Name"=excluded."AIDexterDomain_Name","AIDexterDomain_Description"=excluded."AIDexterDomain_Description","AIDexterDomain_QueryFunction"=excluded."AIDexterDomain_QueryFunction","AIDexterDomain_IsActive"=true,"AIDexterDomain_UpdatedAt"=now();

insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_SortOrder")
values('contact_cards','Contact cards','Published state, exchanges and automation run failures.','["status","exchangeOutcome","automationStatus","errorSummary","recordsAffected"]',35)
on conflict("AIDexterWatchCapability_Code") do update set "AIDexterWatchCapability_Name"=excluded."AIDexterWatchCapability_Name","AIDexterWatchCapability_Description"=excluded."AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON"=excluded."AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_IsActive"=true,"AIDexterWatchCapability_UpdatedAt"=now();

create or replace function public._multideck_contact_card_watch_signal()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_card uuid; v_company uuid; v_old jsonb:='{}'; v_new jsonb:='{}';
begin
  if tg_table_name='CRM_ContactCards' then v_card:=new."ContactCard_ID"; v_company:=new."Company_ID"; v_old:=case when tg_op='INSERT' then '{}' else jsonb_build_object('status',old."ContactCard_Status") end; v_new:=jsonb_build_object('status',new."ContactCard_Status");
  elsif tg_table_name='CRM_ContactCardExchanges' then v_card:=new."ContactCard_ID"; select "Company_ID" into v_company from public."CRM_ContactCards" where "ContactCard_ID"=v_card; v_new:=jsonb_build_object('exchangeOutcome',new."Exchange_Outcome",'automationStatus',new."Exchange_AutomationOutcome");
  else v_card:=new."ContactCard_ID"; select "Company_ID" into v_company from public."CRM_ContactCards" where "ContactCard_ID"=v_card; v_new:=jsonb_build_object('automationStatus',new."AutomationRun_Status",'errorSummary',new."AutomationRun_ErrorSummary",'recordsAffected',new."AutomationRun_RecordsAffected"); end if;
  if v_company is not null and exists(select 1 from public."AI_DexterWatches" watch where watch."AIDexterWatch_CompanyID"=v_company and watch."AIDexterWatch_CapabilityCode"='contact_cards' and watch."AIDexterWatch_StatusCode"='active' and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID"=v_card)) then insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON") values(v_company,'contact_cards',tg_table_name,v_card,v_old,v_new); end if;
  return new;
end; $$;

create trigger "TR_CRM_ContactCards_dexter_watch" after insert or update of "ContactCard_Status" on public."CRM_ContactCards" for each row execute function public._multideck_contact_card_watch_signal();
create trigger "TR_CRM_ContactCardExchanges_dexter_watch" after insert or update of "Exchange_AutomationOutcome" on public."CRM_ContactCardExchanges" for each row execute function public._multideck_contact_card_watch_signal();
create trigger "TR_CRM_ContactCardAutomationRuns_dexter_watch" after insert or update of "AutomationRun_Status" on public."CRM_ContactCardAutomationRuns" for each row execute function public._multideck_contact_card_watch_signal();

revoke all on function public._multideck_contact_card_execute_automation(uuid,uuid,uuid,jsonb,boolean,boolean,uuid,integer) from public,anon,authenticated;
revoke all on function public._multideck_contact_card_watch_signal() from public,anon,authenticated;
revoke all on function public.multideck_dexter_domain_contact_cards(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.multideck_contact_card_test_automation(uuid),public.multideck_contact_card_rerun(uuid) from public,anon;
grant execute on function public.multideck_contact_card_test_automation(uuid),public.multideck_contact_card_rerun(uuid) to authenticated;

commit;
