-- Personal ordering; manager removal is reversible and retains all source,
-- versions and generated files. These RPCs are only called by authenticated
-- Edge Functions with the verified actor, never an actor supplied by a browser.
alter table public."cmp_Users" add column "User_DocumentTemplateOrder" jsonb not null default '[]';
alter table public."DOCB_DocumentTemplates" add column "DOCBT_LibraryRemovedAt" timestamptz;

create table document_api.template_library_changes (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public."DOCB_DocumentTemplates"("DOCBT_ID"),
  actor_user_id uuid not null references public."cmp_Users"("User_ID"),
  action text not null check (action in ('remove','restore')),
  created_at timestamptz not null default now()
);
alter table document_api.template_library_changes enable row level security;
revoke all on document_api.template_library_changes from public, anon, authenticated;

create function document_api.template_library(
  caller_auth_user_id uuid, requested_action text default 'read',
  requested_template_id uuid default null, requested_order jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor record;
  selected public."DOCB_DocumentTemplates"%rowtype;
  overview jsonb;
  removed jsonb := '[]';
begin
  select "User_ID", "Company_ID", "User_DocumentTemplateOrder" into strict actor
  from public."cmp_Users" where "Auth_User_ID" = caller_auth_user_id
    and "User_AccessStatus" = 'active';
  if not document_api.has_permission(caller_auth_user_id, 'Documents.Read') then
    raise exception 'Document access is not authorised.' using errcode = '42501';
  end if;
  if requested_action not in ('read','reorder','remove','restore') or requested_action is null then
    raise exception 'Choose a valid template library action.' using errcode = '22023';
  end if;

  if requested_action = 'reorder' then
    overview := document_api.workspace_overview(caller_auth_user_id);
    if requested_order is null or jsonb_typeof(requested_order) <> 'array' then
      raise exception 'Choose a valid template order.' using errcode = '22023';
    end if;
    if jsonb_array_length(requested_order) > 1000
      or (select count(*) <> count(distinct value) from jsonb_array_elements(requested_order))
      or exists (select 1 from jsonb_array_elements(requested_order) item
        where not exists (select 1 from jsonb_array_elements(overview->'templates') visible
          where to_jsonb(visible->>'id') = item)) then
      raise exception 'The template order contains unavailable or duplicate templates.' using errcode = '22023';
    end if;
    update public."cmp_Users" set "User_DocumentTemplateOrder" = requested_order
      where "User_ID" = actor."User_ID";
    actor."User_DocumentTemplateOrder" := requested_order;
  end if;

  if requested_action in ('remove','restore') then
    if not document_api.has_permission(caller_auth_user_id, 'Documents.Manage') then
      raise exception 'Document template management is not authorised.' using errcode = '42501';
    end if;
    select * into selected from public."DOCB_DocumentTemplates" template
      where template."DOCBT_ID" = requested_template_id
        and template."DOCBT_IsUserEditable" and template."DOCBT_DefaultRenderEngineCode" = 'carbone'
        and template."DOCBT_StatusCode" in ('draft','published')
        and (template."DOCBT_OrgOfficeID" is null or exists (
          select 1 from public."cmp_Users_Offices" membership
          join public."cmp_Offices" office on office."Office_ID" = membership."Office_ID"
          where membership."User_ID" = actor."User_ID" and office."Company_ID" = actor."Company_ID"
            and membership."Office_ID" = template."DOCBT_OrgOfficeID")) for update;
    if not found or (requested_action = 'remove' and not selected."DOCBT_IsActive")
      or (requested_action = 'restore' and (selected."DOCBT_IsActive" or selected."DOCBT_LibraryRemovedAt" is null)) then
      raise exception 'This template is unavailable or has already changed. Refresh the library.' using errcode = '42501';
    end if;
    update public."DOCB_DocumentTemplates"
      set "DOCBT_IsActive" = requested_action = 'restore',
        "DOCBT_LibraryRemovedAt" = case when requested_action = 'remove' then now() else null end,
        "DOCBT_UpdatedAt" = now(), "DOCBT_UpdatedBy" = actor."User_ID"
      where "DOCBT_ID" = selected."DOCBT_ID";
    insert into document_api.template_library_changes(template_id,actor_user_id,action)
      values(selected."DOCBT_ID",actor."User_ID",requested_action);
  end if;

  if document_api.has_permission(caller_auth_user_id, 'Documents.Manage') then
    select coalesce(jsonb_agg(jsonb_build_object('id',template."DOCBT_ID",'name',template."DOCBT_Name",
      'code',template."DOCBT_Code",'removedAt',template."DOCBT_LibraryRemovedAt") order by template."DOCBT_LibraryRemovedAt" desc),'[]')
    into removed from public."DOCB_DocumentTemplates" template
    where not template."DOCBT_IsActive" and template."DOCBT_LibraryRemovedAt" is not null
      and (template."DOCBT_OrgOfficeID" is null or exists (
        select 1 from public."cmp_Users_Offices" membership
        join public."cmp_Offices" office on office."Office_ID" = membership."Office_ID"
        where membership."User_ID" = actor."User_ID" and office."Company_ID" = actor."Company_ID"
          and membership."Office_ID" = template."DOCBT_OrgOfficeID"));
  end if;
  return jsonb_build_object('order',actor."User_DocumentTemplateOrder",'removedTemplates',removed);
exception when no_data_found or too_many_rows then
  raise exception 'Document identity is not authorised.' using errcode = '42501';
end $$;
revoke all on function document_api.template_library(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function document_api.template_library(uuid,text,uuid,jsonb) to service_role;
