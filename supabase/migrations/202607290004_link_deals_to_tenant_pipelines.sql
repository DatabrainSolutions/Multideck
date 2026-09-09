-- Link each opportunity to the company pipeline and stage that owns its Kanban position.
-- Legacy stage codes remain for compatibility with the wider CRM schema; these IDs are the
-- durable source of truth for the tenant-configurable Deals board.

begin;

alter table public."CRM_Opportunities"
  add column if not exists "CRMOppty_PipelineID" uuid,
  add column if not exists "CRMOppty_PipelineStageID" uuid;

with deal_destinations as (
  select distinct on (opportunity."CRMOppty_ID")
    opportunity."CRMOppty_ID" as deal_id,
    pipeline."CRMPipeline_ID" as pipeline_id,
    stage."CRMPipelineStage_ID" as stage_id
  from public."CRM_Opportunities" opportunity
  left join public."CRM_Leads" lead
    on lead."CRMLead_ID" = opportunity."CRMOppty_SourceLeadID"
  join public."cmp_Users" owner
    on owner."User_ID" = coalesce(opportunity."CRMOppty_OwnerUserID", lead."CRMLead_OwnerUserID")
  join public."CRM_Pipelines" pipeline
    on pipeline."Company_ID" = owner."Company_ID"
   and pipeline."Is_Deleted" = false
  join public."CRM_PipelineStages" stage
    on stage."CRMPipeline_ID" = pipeline."CRMPipeline_ID"
   and stage."Is_Deleted" = false
  where opportunity."CRMOppty_PipelineID" is null
  order by
    opportunity."CRMOppty_ID",
    pipeline."CRMPipeline_SortOrder",
    stage."CRMPipelineStage_IsDefaultEntry" desc,
    stage."CRMPipelineStage_SortOrder"
)
update public."CRM_Opportunities" opportunity
set
  "CRMOppty_PipelineID" = destination.pipeline_id,
  "CRMOppty_PipelineStageID" = destination.stage_id
from deal_destinations destination
where opportunity."CRMOppty_ID" = destination.deal_id;

create index if not exists "IX_CRM_Opportunities_Pipeline_Stage"
  on public."CRM_Opportunities"("CRMOppty_PipelineID", "CRMOppty_PipelineStageID")
  where "CRMOppty_PipelineID" is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'FK_CRM_Opportunities_Pipeline'
  ) then
    alter table public."CRM_Opportunities"
      add constraint "FK_CRM_Opportunities_Pipeline"
      foreign key ("CRMOppty_PipelineID")
      references public."CRM_Pipelines"("CRMPipeline_ID")
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'FK_CRM_Opportunities_PipelineStage'
  ) then
    alter table public."CRM_Opportunities"
      add constraint "FK_CRM_Opportunities_PipelineStage"
      foreign key ("CRMOppty_PipelineStageID")
      references public."CRM_PipelineStages"("CRMPipelineStage_ID")
      on delete restrict;
  end if;
end $$;

commit;
