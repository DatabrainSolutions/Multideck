begin;

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

  -- The profile tombstone remains, so department links must be removed explicitly.
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

  -- This preference is optional across tenant schema vintages. Resolve its
  -- identifier from the catalogue so static validation never binds a missing column.
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

revoke all on function public."User_DeleteWithReassignment"(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public."User_DeleteWithReassignment"(uuid, uuid, uuid, text) to service_role;

commit;
