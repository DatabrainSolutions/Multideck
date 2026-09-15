-- Product exclusivity is additional to (never a substitute for) user roles.
-- Existing phone RPCs, Dexter reads/writes and deterministic watch adapters
-- all use this central permission resolver.
create or replace function public._multideck_crm_has_permission(p_user_id uuid, p_permission text)
returns boolean language sql stable security definer
set search_path = '' as $$
  select (p_permission not like 'CRM.PhoneCalls.%'
    or public.multideck_cloud_product_access('jenkar_phone'))
  and exists (
    select 1 from public."cmp_Users_Roles" user_role
    join public."sys_UserRole_Permissions" role_permission
      on role_permission."sys_UserRole_ID" = user_role."sys_UserRole_ID"
    join public."sys_Permissions" permission
      on permission."sys_Permission_ID" = role_permission."sys_Permission_ID"
    where user_role."User_ID" = p_user_id
      and permission."sys_Permission_Value" = p_permission
  );
$$;
revoke all on function public._multideck_crm_has_permission(uuid,text) from public, anon, authenticated;

-- Revocation pauses existing watches immediately. Re-enablement never silently
-- resumes them; the normal authorised watch lifecycle remains in control.
create function private.cloud_product_pause_phone_watches()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.multideck_cloud_product_access('jenkar_phone') then
    update public."AI_DexterWatches"
    set "AIDexterWatch_StatusCode" = 'paused',
        "AIDexterWatch_IsArmed" = true,
        "AIDexterWatch_UpdatedAt" = now()
    where "AIDexterWatch_CapabilityCode" = 'phone_calls'
      and "AIDexterWatch_StatusCode" = 'active';
  end if;
  return null;
end $$;
revoke all on function private.cloud_product_pause_phone_watches() from public, anon, authenticated, service_role;
create trigger cloud_product_phone_revocation
after insert or update or delete on private.cloud_product_state
for each statement execute function private.cloud_product_pause_phone_watches();

update public."AI_DexterWatches"
set "AIDexterWatch_StatusCode" = 'paused', "AIDexterWatch_IsArmed" = true,
    "AIDexterWatch_UpdatedAt" = now()
where "AIDexterWatch_CapabilityCode" = 'phone_calls'
  and "AIDexterWatch_StatusCode" = 'active'
  and not public.multideck_cloud_product_access('jenkar_phone');
