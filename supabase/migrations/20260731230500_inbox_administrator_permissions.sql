-- The built-in Administrator role is defined by the API as full workspace access.
-- Keep that invariant before the authorization settings screen has had a chance to
-- reconcile newly added permissions for an existing tenant.
insert into public."sys_UserRole_Permissions" (
  "sys_UserRole_ID",
  "sys_Permission_ID"
)
select
  role."sys_UserRole_ID",
  permission."sys_Permission_ID"
from public."sys_UserRoles" as role
cross join public."sys_Permissions" as permission
where lower(role."sys_UserRole_Name") = 'administrator'
  and permission."sys_Permission_Value" in (
    'Email.Connect',
    'Email.Read',
    'Email.Send',
    'Email.ManageShared',
    'Email.AIRead'
  )
on conflict ("sys_UserRole_ID", "sys_Permission_ID") do nothing;
