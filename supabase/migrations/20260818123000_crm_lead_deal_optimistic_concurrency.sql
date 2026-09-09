-- Prevent stale lead/deal detail screens from overwriting a newer operator,
-- Dexter, consent, transfer, conversion or pipeline change.

begin;

alter table public."CRM_Leads"
  add column if not exists "CRMLead_EditVersion" bigint not null default 1;

alter table public."CRM_Opportunities"
  add column if not exists "CRMOppty_EditVersion" bigint not null default 1;

alter table public."CRM_Leads"
  drop constraint if exists "CK_CRM_Leads_edit_version";
alter table public."CRM_Leads"
  add constraint "CK_CRM_Leads_edit_version" check ("CRMLead_EditVersion" > 0);

alter table public."CRM_Opportunities"
  drop constraint if exists "CK_CRM_Opportunities_edit_version";
alter table public."CRM_Opportunities"
  add constraint "CK_CRM_Opportunities_edit_version" check ("CRMOppty_EditVersion" > 0);

-- Organisation-backed leads must use the same explicit company ownership as
-- accounts. Physical project isolation alone is insufficient in shared test or
-- migration projects that contain more than one operator company.
create or replace function public._multideck_crm_lead_is_reachable(
  p_lead_id uuid,
  p_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public."CRM_Leads" lead
    left join public."cmp_Users" owner
      on owner."User_ID" = lead."CRMLead_OwnerUserID"
    left join public."cmp_Users" creator
      on creator."User_ID" = lead."CRMLead_CreatedBy"
    where lead."CRMLead_ID" = p_lead_id
      and not lead."CRMLead_IsDeleted"
      and (
        (
          lead."CRMLead_OrgID" is not null
          and public.multideck_crm_company_can_access_account(p_company_id, lead."CRMLead_OrgID")
        )
        or (
          lead."CRMLead_OrgID" is null
          and lead."CRMLead_OwnerUserID" is not null
          and owner."Company_ID" = p_company_id
          and coalesce(owner."User_AccessStatus", 'active') = 'active'
        )
        or (
          lead."CRMLead_OrgID" is null
          and lead."CRMLead_OwnerUserID" is null
          and creator."Company_ID" = p_company_id
          and coalesce(creator."User_AccessStatus", 'active') = 'active'
        )
      )
  )
$$;

create or replace function public._multideck_crm_increment_lead_edit_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if (to_jsonb(new) - 'CRMLead_EditVersion') is distinct from (to_jsonb(old) - 'CRMLead_EditVersion') then
    new."CRMLead_EditVersion" := old."CRMLead_EditVersion" + 1;
  else
    new."CRMLead_EditVersion" := old."CRMLead_EditVersion";
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_CRM_Leads_edit_version" on public."CRM_Leads";
create trigger "TR_CRM_Leads_edit_version"
before update on public."CRM_Leads"
for each row execute function public._multideck_crm_increment_lead_edit_version();

create or replace function public._multideck_crm_increment_deal_edit_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if (to_jsonb(new) - 'CRMOppty_EditVersion') is distinct from (to_jsonb(old) - 'CRMOppty_EditVersion') then
    new."CRMOppty_EditVersion" := old."CRMOppty_EditVersion" + 1;
  else
    new."CRMOppty_EditVersion" := old."CRMOppty_EditVersion";
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_CRM_Opportunities_edit_version" on public."CRM_Opportunities";
create trigger "TR_CRM_Opportunities_edit_version"
before update on public."CRM_Opportunities"
for each row execute function public._multideck_crm_increment_deal_edit_version();

-- Keep the mature list/detail contracts intact and add versions at their
-- authenticated public boundary. The previous implementations become private
-- so no client can call a versionless write overload.
alter function public.multideck_crm_list_leads_essential(text)
  rename to _multideck_crm_list_leads_essential_unversioned_20260818;
alter function public.multideck_crm_get_lead_essential(uuid)
  rename to _multideck_crm_get_lead_essential_unversioned_20260818;
alter function public.multideck_crm_list_deals_essential()
  rename to _multideck_crm_list_deals_essential_unversioned_20260818;
alter function public.multideck_crm_update_lead(uuid, jsonb)
  rename to _multideck_crm_update_lead_unversioned_20260818;
alter function public.multideck_crm_update_deal(uuid, jsonb)
  rename to _multideck_crm_update_deal_unversioned_20260818;

create function public.multideck_crm_list_leads_essential(p_search text default null)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(jsonb_agg(
    entry.item || jsonb_build_object('editVersion', lead."CRMLead_EditVersion")
    order by entry.ordinal
  ), '[]'::jsonb)
  from jsonb_array_elements(public._multideck_crm_list_leads_essential_unversioned_20260818(p_search))
    with ordinality entry(item, ordinal)
  join public."CRM_Leads" lead
    on lead."CRMLead_ID" = (entry.item ->> 'id')::uuid
$$;

create function public.multideck_crm_get_lead_essential(p_lead_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public._multideck_crm_get_lead_essential_unversioned_20260818(p_lead_id)
    || jsonb_build_object('editVersion', lead."CRMLead_EditVersion")
  from public."CRM_Leads" lead
  where lead."CRMLead_ID" = p_lead_id
$$;

create function public.multideck_crm_list_deals_essential()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(jsonb_agg(
    entry.item || jsonb_build_object('editVersion', deal."CRMOppty_EditVersion")
    order by entry.ordinal
  ), '[]'::jsonb)
  from jsonb_array_elements(public._multideck_crm_list_deals_essential_unversioned_20260818())
    with ordinality entry(item, ordinal)
  join public."CRM_Opportunities" deal
    on deal."CRMOppty_ID" = (entry.item ->> 'id')::uuid
$$;

create function public.multideck_crm_update_lead(
  p_lead_id uuid,
  p_expected_version bigint,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_current_version bigint;
  v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  if not public._multideck_crm_has_permission(v_context.user_id, 'CRM.Write') then
    raise exception 'You do not have permission to change CRM.' using errcode = '42501';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'A valid lead version is required.' using errcode = '22023';
  end if;
  if not public._multideck_crm_lead_is_reachable(p_lead_id, v_context.company_id) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  select lead."CRMLead_EditVersion" into v_current_version
  from public."CRM_Leads" lead
  where lead."CRMLead_ID" = p_lead_id
    and not lead."CRMLead_IsDeleted"
  for update;

  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  if v_current_version <> p_expected_version then
    raise exception 'CRM_CONFLICT: This lead changed elsewhere. Latest values have been reloaded.' using errcode = 'P0001';
  end if;

  v_result := public._multideck_crm_update_lead_unversioned_20260818(p_lead_id, p_input);
  select lead."CRMLead_EditVersion" into v_current_version
  from public."CRM_Leads" lead
  where lead."CRMLead_ID" = p_lead_id;
  return v_result || jsonb_build_object('editVersion', v_current_version);
end;
$$;

create function public.multideck_crm_update_deal(
  p_deal_id uuid,
  p_expected_version bigint,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_current_version bigint;
  v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  if not public._multideck_crm_has_permission(v_context.user_id, 'CRM.Write') then
    raise exception 'You do not have permission to change CRM.' using errcode = '42501';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'A valid deal version is required.' using errcode = '22023';
  end if;

  select deal."CRMOppty_EditVersion" into v_current_version
  from public."CRM_Opportunities" deal
  join public."CRM_Pipelines" pipeline
    on pipeline."CRMPipeline_ID" = deal."CRMOppty_PipelineID"
   and pipeline."Company_ID" = v_context.company_id
   and not pipeline."Is_Deleted"
  where deal."CRMOppty_ID" = p_deal_id
    and not deal."CRMOppty_IsDeleted"
  for update of deal;

  if not found then
    raise exception 'Deal not found.' using errcode = 'P0002';
  end if;
  if v_current_version <> p_expected_version then
    raise exception 'CRM_CONFLICT: This deal changed elsewhere. Latest values have been reloaded.' using errcode = 'P0001';
  end if;

  v_result := public._multideck_crm_update_deal_unversioned_20260818(p_deal_id, p_input);
  select deal."CRMOppty_EditVersion" into v_current_version
  from public."CRM_Opportunities" deal
  where deal."CRMOppty_ID" = p_deal_id;
  return v_result || jsonb_build_object('editVersion', v_current_version);
end;
$$;

revoke all on function public._multideck_crm_increment_lead_edit_version() from public, anon, authenticated;
revoke all on function public._multideck_crm_increment_deal_edit_version() from public, anon, authenticated;
revoke all on function public._multideck_crm_lead_is_reachable(uuid, uuid) from public, anon, authenticated;
revoke all on function public._multideck_crm_list_leads_essential_unversioned_20260818(text) from public, anon, authenticated;
revoke all on function public._multideck_crm_get_lead_essential_unversioned_20260818(uuid) from public, anon, authenticated;
revoke all on function public._multideck_crm_list_deals_essential_unversioned_20260818() from public, anon, authenticated;
revoke all on function public._multideck_crm_update_lead_unversioned_20260818(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._multideck_crm_update_deal_unversioned_20260818(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_crm_list_leads_essential(text) from public, anon;
revoke all on function public.multideck_crm_get_lead_essential(uuid) from public, anon;
revoke all on function public.multideck_crm_list_deals_essential() from public, anon;
revoke all on function public.multideck_crm_update_lead(uuid, bigint, jsonb) from public, anon;
revoke all on function public.multideck_crm_update_deal(uuid, bigint, jsonb) from public, anon;

grant execute on function public.multideck_crm_list_leads_essential(text) to authenticated;
grant execute on function public.multideck_crm_get_lead_essential(uuid) to authenticated;
grant execute on function public.multideck_crm_list_deals_essential() to authenticated;
grant execute on function public.multideck_crm_update_lead(uuid, bigint, jsonb) to authenticated;
grant execute on function public.multideck_crm_update_deal(uuid, bigint, jsonb) to authenticated;

commit;
