-- A draft has no public version to preserve. When Studio saves its first
-- provider version, make that saved draft the current approval candidate.
create or replace function document_api.advance_draft_template_to_saved_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new."DOCBTV_StatusCode" = 'draft' then
    update public."DOCB_DocumentTemplates" template
    set "DOCBT_CurrentVersionNo" = new."DOCBTV_VersionNo",
        "DOCBT_UpdatedAt" = now()
    where template."DOCBT_ID" = new."DOCBTV_TemplateID"
      and template."DOCBT_StatusCode" = 'draft'
      and template."DOCBT_CurrentVersionNo" < new."DOCBTV_VersionNo";
  end if;
  return new;
end;
$$;

drop trigger if exists document_builder_advance_draft_template_version on public."DOCB_TemplateVersions";
create trigger document_builder_advance_draft_template_version
after insert on public."DOCB_TemplateVersions"
for each row execute function document_api.advance_draft_template_to_saved_version();

-- The MAWB was saved before this trigger was introduced. Move only this
-- carrier-review template to its newest saved provider-backed draft.
update public."DOCB_DocumentTemplates" template
set "DOCBT_CurrentVersionNo" = (
      select version."DOCBTV_VersionNo"
      from public."DOCB_TemplateVersions" version
      where version."DOCBTV_TemplateID" = template."DOCBT_ID"
        and version."DOCBTV_StatusCode" = 'draft'
        and version."DOCBTV_TemplateSnapshotJSON" #>> '{carbone,versionId}' ~ '^[0-9a-f]{64}$'
        and version."DOCBTV_TemplateSnapshotJSON" #>> '{source,path}' is not null
      order by version."DOCBTV_VersionNo" desc
      limit 1
    ),
    "DOCBT_UpdatedAt" = now()
where template."DOCBT_Code" = 'MAWB'
  and template."DOCBT_StatusCode" = 'draft'
  and exists (
    select 1
    from public."DOCB_TemplateVersions" version
    where version."DOCBTV_TemplateID" = template."DOCBT_ID"
      and version."DOCBTV_StatusCode" = 'draft'
      and version."DOCBTV_TemplateSnapshotJSON" #>> '{carbone,versionId}' ~ '^[0-9a-f]{64}$'
      and version."DOCBTV_TemplateSnapshotJSON" #>> '{source,path}' is not null
  );

revoke all on function document_api.advance_draft_template_to_saved_version() from public, anon, authenticated;
