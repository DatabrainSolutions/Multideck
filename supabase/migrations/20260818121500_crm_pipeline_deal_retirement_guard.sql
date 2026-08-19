-- Keep active deals visible by preventing their pipeline or stage from being
-- retired underneath them. Advisory locks close the race between a settings
-- change and a concurrent deal create/move from another client or Dexter.

begin;

create or replace function public._multideck_crm_lock_pipeline_stage(
  p_pipeline_id uuid,
  p_stage_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_pipeline_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('crm-pipeline:' || p_pipeline_id::text, 0));
  end if;
  if p_stage_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('crm-stage:' || p_stage_id::text, 0));
  end if;
end;
$$;

create or replace function public._multideck_crm_validate_deal_pipeline_stage()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not new."CRMOppty_IsDeleted" then
    perform public._multideck_crm_lock_pipeline_stage(
      new."CRMOppty_PipelineID",
      new."CRMOppty_PipelineStageID"
    );

    if new."CRMOppty_PipelineID" is null or new."CRMOppty_PipelineStageID" is null or not exists (
      select 1
      from public."CRM_Pipelines" pipeline
      join public."CRM_PipelineStages" stage
        on stage."CRMPipeline_ID" = pipeline."CRMPipeline_ID"
       and stage."CRMPipelineStage_ID" = new."CRMOppty_PipelineStageID"
       and not stage."Is_Deleted"
      where pipeline."CRMPipeline_ID" = new."CRMOppty_PipelineID"
        and not pipeline."Is_Deleted"
    ) then
      raise exception 'Choose an active stage in this pipeline before saving the deal.' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists "TR_CRM_Opportunities_validate_pipeline_stage" on public."CRM_Opportunities";
create trigger "TR_CRM_Opportunities_validate_pipeline_stage"
before insert or update of "CRMOppty_PipelineID", "CRMOppty_PipelineStageID", "CRMOppty_IsDeleted"
on public."CRM_Opportunities"
for each row execute function public._multideck_crm_validate_deal_pipeline_stage();

create or replace function public._multideck_crm_guard_stage_retirement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not old."Is_Deleted" and new."Is_Deleted" then
    perform public._multideck_crm_lock_pipeline_stage(null, new."CRMPipelineStage_ID");
    if exists (
      select 1
      from public."CRM_Opportunities" deal
      where deal."CRMOppty_PipelineStageID" = new."CRMPipelineStage_ID"
        and not deal."CRMOppty_IsDeleted"
    ) then
      raise exception 'Deals in this stage must be moved before removal.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_CRM_PipelineStages_guard_retirement" on public."CRM_PipelineStages";
create trigger "TR_CRM_PipelineStages_guard_retirement"
before update of "Is_Deleted" on public."CRM_PipelineStages"
for each row execute function public._multideck_crm_guard_stage_retirement();

create or replace function public._multideck_crm_guard_pipeline_retirement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not old."Is_Deleted" and new."Is_Deleted" then
    perform public._multideck_crm_lock_pipeline_stage(new."CRMPipeline_ID", null);
    if exists (
      select 1
      from public."CRM_Opportunities" deal
      where deal."CRMOppty_PipelineID" = new."CRMPipeline_ID"
        and not deal."CRMOppty_IsDeleted"
    ) then
      raise exception 'Deals in this pipeline must be moved before removal.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_CRM_Pipelines_guard_retirement" on public."CRM_Pipelines";
create trigger "TR_CRM_Pipelines_guard_retirement"
before update of "Is_Deleted" on public."CRM_Pipelines"
for each row execute function public._multideck_crm_guard_pipeline_retirement();

revoke all on function public._multideck_crm_lock_pipeline_stage(uuid, uuid) from public, anon, authenticated;
revoke all on function public._multideck_crm_validate_deal_pipeline_stage() from public, anon, authenticated;
revoke all on function public._multideck_crm_guard_stage_retirement() from public, anon, authenticated;
revoke all on function public._multideck_crm_guard_pipeline_retirement() from public, anon, authenticated;

commit;
