alter table public."cmp_Users"
  add column if not exists "User_AccessStatus" text not null default 'active',
  add column if not exists "User_FormerCompanyID" uuid references public."cmp_Company"("Company_ID") on delete set null,
  add column if not exists "User_RetainedAuthUserID" uuid,
  add column if not exists "User_DeactivatedAt" timestamptz,
  add column if not exists "User_DeactivatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  add column if not exists "User_DeletedAt" timestamptz,
  add column if not exists "User_DeletedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  add column if not exists "User_DeletionReference" uuid,
  add column if not exists "User_DeletionCleanupPending" jsonb;

alter table public."cmp_Users"
  drop constraint if exists "CK_cmp_Users_AccessStatus";

alter table public."cmp_Users"
  add constraint "CK_cmp_Users_AccessStatus"
  check ("User_AccessStatus" in ('active', 'deactivated', 'deleted')) not valid;

alter table public."cmp_Users" validate constraint "CK_cmp_Users_AccessStatus";

create unique index if not exists "UX_cmp_Users_RetainedAuthUserID"
  on public."cmp_Users" ("User_RetainedAuthUserID")
  where "User_RetainedAuthUserID" is not null;

comment on column public."cmp_Users"."User_AccessStatus" is
  'Operational access lifecycle. Deactivated and deleted rows have Auth_User_ID cleared so existing JWTs cannot cross RLS boundaries.';
comment on column public."cmp_Users"."User_RetainedAuthUserID" is
  'Server-only recovery pointer used to reactivate a deactivated account or finish an idempotent Auth deletion. Never returned to ordinary clients.';
comment on column public."cmp_Users"."User_DeletionReference" is
  'Non-PII tombstone reference retained for immutable business and audit attribution after user deletion.';
comment on column public."cmp_Users"."User_DeletionCleanupPending" is
  'Server-only retry marker for personal Storage objects that must be removed after the database transaction commits.';

create or replace function public."User_DeletionImpact"(
  p_actor_user_id uuid,
  p_target_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_company uuid;
  v_target_company uuid;
  v_target_status text;
  v_relation record;
  v_count bigint;
  v_groups jsonb := '[]'::jsonb;
  v_cleanup jsonb := '[]'::jsonb;
  v_retained jsonb := '[]'::jsonb;
  v_total bigint := 0;
  v_payload jsonb;
begin
  select "Company_ID" into v_actor_company
  from public."cmp_Users"
  where "User_ID" = p_actor_user_id and "User_AccessStatus" = 'active';

  select "Company_ID", "User_AccessStatus"
  into v_target_company, v_target_status
  from public."cmp_Users"
  where "User_ID" = p_target_user_id;

  if v_actor_company is null or v_target_company is distinct from v_actor_company then
    raise exception 'The user is not available in this workspace.' using errcode = '42501';
  end if;
  if v_target_status = 'deleted' then
    return jsonb_build_object('alreadyDeleted', true, 'requiresReassignment', false, 'totalTransferable', 0, 'groups', '[]'::jsonb, 'cleanup', '[]'::jsonb, 'retainedAttribution', '[]'::jsonb, 'impactToken', md5(p_target_user_id::text || ':deleted'));
  end if;

  for v_relation in
    select
      ns.nspname as table_schema,
      cls.relname as table_name,
      att.attname as column_name,
      con.confdeltype,
      case
        when att.attname ~* '(Owner(User)?ID|Assigned(To)?UserID|AssignedUserID|CurrentApproverUserID|DefaultAssignedUserID|ManagerUserID|DelegatedToUserID|RequiredApproverUserID|SuggestedOwnerUserID|TargetUserID)$'
          or (cls.relname ~* '(TaskAssignments|AccountAssignments|LeadAssignments)$' and att.attname ~* 'UserID$')
          then 'transfer'
        when con.confdeltype = 'c' or cls.relname ~* '(Preferences|ReadStates|OAuthStates|Notifications|UserRoles|UserOfficeAccess|MailboxAccess|ConversationParticipants|WorkQueueMembers|TerritoryMembers)$'
          then 'cleanup'
        else 'retain'
      end as disposition
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    join unnest(con.conkey) with ordinality key(attnum, ord) on true
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = key.attnum
    where con.contype = 'f'
      and con.confrelid = 'public."cmp_Users"'::regclass
      and array_length(con.conkey, 1) = 1
      and ns.nspname = 'public'
      and cls.relname not in ('cmp_Users', 'Audit_Events', 'Audit_AccessEvents', 'Audit_ExportEvents', 'Audit_RequestContexts')
    order by cls.relname, att.attname
  loop
    execute format('select count(*) from %I.%I where %I = $1', v_relation.table_schema, v_relation.table_name, v_relation.column_name)
      into v_count using p_target_user_id;
    if v_count = 0 then continue; end if;

    if v_relation.disposition = 'transfer' then
      v_total := v_total + v_count;
      v_groups := v_groups || jsonb_build_array(jsonb_build_object(
        'key', v_relation.table_name || '.' || v_relation.column_name,
        'table', v_relation.table_name,
        'field', v_relation.column_name,
        'count', v_count
      ));
    elsif v_relation.disposition = 'cleanup' then
      v_cleanup := v_cleanup || jsonb_build_array(jsonb_build_object(
        'key', v_relation.table_name || '.' || v_relation.column_name,
        'table', v_relation.table_name,
        'count', v_count
      ));
    else
      v_retained := v_retained || jsonb_build_array(jsonb_build_object(
        'key', v_relation.table_name || '.' || v_relation.column_name,
        'table', v_relation.table_name,
        'count', v_count
      ));
    end if;
  end loop;

  v_payload := jsonb_build_object(
    'alreadyDeleted', false,
    'requiresReassignment', v_total > 0,
    'totalTransferable', v_total,
    'groups', v_groups,
    'cleanup', v_cleanup,
    'retainedAttribution', v_retained
  );
  return v_payload || jsonb_build_object('impactToken', md5(v_payload::text));
end;
$$;

create or replace function public."User_DeleteWithReassignment"(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_replacement_user_id uuid,
  p_expected_impact_token text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_target public."cmp_Users"%rowtype;
  v_actor_company uuid;
  v_replacement_company uuid;
  v_impact jsonb;
  v_relation record;
  v_reference uuid;
begin
  select "Company_ID" into v_actor_company
  from public."cmp_Users"
  where "User_ID" = p_actor_user_id and "User_AccessStatus" = 'active';

  select * into v_target
  from public."cmp_Users"
  where "User_ID" = p_target_user_id
  for update;

  if not found then raise exception 'User not found.'; end if;
  if v_target."User_AccessStatus" = 'deleted' then
    return jsonb_build_object('alreadyDeleted', true, 'authUserId', v_target."User_RetainedAuthUserID", 'deletionReference', v_target."User_DeletionReference", 'cleanupArtifacts', coalesce(v_target."User_DeletionCleanupPending", '[]'::jsonb));
  end if;
  if p_target_user_id = p_actor_user_id then
    raise exception 'You cannot delete your own Multideck access.';
  end if;
  if v_actor_company is null or v_target."Company_ID" is distinct from v_actor_company then
    raise exception 'The user is not available in this workspace.' using errcode = '42501';
  end if;

  v_impact := public."User_DeletionImpact"(p_actor_user_id, p_target_user_id);
  if v_impact->>'impactToken' is distinct from p_expected_impact_token then
    raise exception 'This user''s work changed. Review the updated reassignment summary before deleting them.';
  end if;

  if coalesce((v_impact->>'totalTransferable')::bigint, 0) > 0 then
    if p_replacement_user_id is null then
      raise exception 'Choose who will receive this user''s active work.';
    end if;
    select "Company_ID" into v_replacement_company
    from public."cmp_Users"
    where "User_ID" = p_replacement_user_id and "User_AccessStatus" = 'active' and "Auth_User_ID" is not null;
    if v_replacement_company is distinct from v_actor_company or p_replacement_user_id = p_target_user_id then
      raise exception 'Choose an active user in this workspace for reassignment.';
    end if;
  end if;

  for v_relation in
    select item->>'table' as table_name, item->>'field' as column_name
    from jsonb_array_elements(v_impact->'groups') item
  loop
    execute format('update public.%I set %I = $1 where %I = $2', v_relation.table_name, v_relation.column_name, v_relation.column_name)
      using p_replacement_user_id, p_target_user_id;
  end loop;

  for v_relation in
    select distinct item->>'table' as table_name, split_part(item->>'key', '.', 2) as column_name
    from jsonb_array_elements(v_impact->'cleanup') item
  loop
    execute format('delete from public.%I where %I = $1', v_relation.table_name, v_relation.column_name)
      using p_target_user_id;
  end loop;

  delete from public."cmp_Users_Offices" where "User_ID" = p_target_user_id;
  delete from public."cmp_Users_Roles" where "User_ID" = p_target_user_id;

  -- Department membership is supplied by the Broadcasts/Departments feature.
  -- Keep this deletion migration compatible whether that table lands before or after it.
  if to_regclass('public."cmp_Users_Departments"') is not null then
    execute 'delete from public."cmp_Users_Departments" where "User_ID" = $1' using p_target_user_id;
  end if;

  v_reference := gen_random_uuid();
  update public."cmp_Users"
  set "Company_ID" = null,
      "User_FormerCompanyID" = v_target."Company_ID",
      "Auth_User_ID" = null,
      "User_RetainedAuthUserID" = coalesce("User_RetainedAuthUserID", v_target."Auth_User_ID"),
      "User_AccessStatus" = 'deleted',
      "User_Firstname" = 'Deleted',
      "User_Lastname" = 'user',
      "User_Email" = 'deleted+' || v_reference::text || '@redacted.invalid',
      "User_JobTitle" = null,
      "User_ProfilePhotoBucket" = null,
      "User_ProfilePhotoPath" = null,
      "User_ProfilePhotoMimeType" = null,
      "User_ProfilePhotoSizeBytes" = null,
      "User_ProfilePhotoUpdatedAt" = null,
      "User_CoverPhotoBucket" = null,
      "User_CoverPhotoPath" = null,
      "User_CoverPhotoMimeType" = null,
      "User_CoverPhotoSizeBytes" = null,
      "User_CoverPhotoUpdatedAt" = null,
      "User_SidebarCollapsed" = null,
      "User_SidebarLayout" = null,
      "User_TablePinnedColumns" = null,
      "User_Locale" = null,
      "User_AccentPreset" = null,
      "User_ThemeMode" = null,
      "User_DeletedAt" = now(),
      "User_DeletedBy" = p_actor_user_id,
      "User_DeletionReference" = v_reference,
      "User_DeletionCleanupPending" = jsonb_strip_nulls(jsonb_build_array(
        case when v_target."User_ProfilePhotoBucket" is not null and v_target."User_ProfilePhotoPath" is not null then jsonb_build_object('bucket', v_target."User_ProfilePhotoBucket", 'path', v_target."User_ProfilePhotoPath") end,
        case when v_target."User_CoverPhotoBucket" is not null and v_target."User_CoverPhotoPath" is not null then jsonb_build_object('bucket', v_target."User_CoverPhotoBucket", 'path', v_target."User_CoverPhotoPath") end
      ))
  where "User_ID" = p_target_user_id;

  -- This preference was introduced independently and is not present in every
  -- tenant schema yet. Clear it when available without making the core deletion
  -- lifecycle fail to compile on older tenant projects.
  if exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public."cmp_Users"'::regclass
      and attname = 'User_DefaultInboxProviderCode'
      and not attisdropped
  ) then
    execute format(
      'update public."cmp_Users" set %I = null where "User_ID" = $1',
      (
        select attname
        from pg_catalog.pg_attribute
        where attrelid = 'public."cmp_Users"'::regclass
          and attname = 'User_DefaultInboxProviderCode'
          and not attisdropped
      )
    ) using p_target_user_id;
  end if;

  perform public."Audit_LogBusinessEvent"(
    'user.deleted', 'user', p_target_user_id, 'cmp_Users', 'delete',
    'Workspace user deleted', null,
    jsonb_build_object('deletionReference', v_reference, 'replacementUserId', p_replacement_user_id, 'impact', v_impact)
  );

  return jsonb_build_object(
    'alreadyDeleted', false,
    'authUserId', coalesce(v_target."Auth_User_ID", v_target."User_RetainedAuthUserID"),
    'deletionReference', v_reference,
    'cleanupArtifacts', jsonb_strip_nulls(jsonb_build_array(
      case when v_target."User_ProfilePhotoBucket" is not null and v_target."User_ProfilePhotoPath" is not null then jsonb_build_object('bucket', v_target."User_ProfilePhotoBucket", 'path', v_target."User_ProfilePhotoPath") end,
      case when v_target."User_CoverPhotoBucket" is not null and v_target."User_CoverPhotoPath" is not null then jsonb_build_object('bucket', v_target."User_CoverPhotoBucket", 'path', v_target."User_CoverPhotoPath") end
    )),
    'transferred', v_impact->'groups',
    'cleaned', v_impact->'cleanup',
    'retainedAttribution', v_impact->'retainedAttribution'
  );
end;
$$;

revoke all on function public."User_DeletionImpact"(uuid, uuid) from public, anon, authenticated;
revoke all on function public."User_DeleteWithReassignment"(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public."User_DeletionImpact"(uuid, uuid) to service_role;
grant execute on function public."User_DeleteWithReassignment"(uuid, uuid, uuid, text) to service_role;

select public."Audit_EnableTableAudit"(
  'public', 'cmp_Users', 'user', 'all_changes', 'standard_7y', 'confidential', false,
  array['User_ID'],
  array['Company_ID', 'Auth_User_ID', 'User_AccessStatus', 'User_DeactivatedAt', 'User_DeletedAt', 'User_DeletionReference'],
  array['User_ProfilePhotoUpdatedAt', 'User_CoverPhotoUpdatedAt'],
  array['User_Email', 'User_Firstname', 'User_Lastname', 'User_RetainedAuthUserID', 'User_DeletionCleanupPending']
);
