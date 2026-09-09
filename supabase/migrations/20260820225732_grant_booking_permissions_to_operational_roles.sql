-- Booking workspace functions require explicit Bookings permissions. The
-- permission catalogue existed, but the operational roles were never linked
-- to it, so every authenticated booking workspace request was denied.

begin;

insert into public."sys_Permissions" (
  "sys_Permission_Value",
  "sys_Permission_Group",
  "sys_Permission_Name",
  "sys_Permission_Description",
  "sys_Permission_IsDangerous"
)
values
  ('Bookings.Read', 'Bookings', 'Read bookings', 'Read freight bookings and routing records.', false),
  ('Bookings.Write', 'Bookings', 'Change bookings', 'Create and update freight bookings through validated product workflows.', true)
on conflict ("sys_Permission_Value") do update
set
  "sys_Permission_Group" = excluded."sys_Permission_Group",
  "sys_Permission_Name" = excluded."sys_Permission_Name",
  "sys_Permission_Description" = excluded."sys_Permission_Description",
  "sys_Permission_IsDangerous" = excluded."sys_Permission_IsDangerous";

with role_permissions(role_name, permission_value) as (
  values
    ('Administrator', 'Bookings.Read'),
    ('Administrator', 'Bookings.Write'),
    ('Operations manager', 'Bookings.Read'),
    ('Operations manager', 'Bookings.Write'),
    ('Operator', 'Bookings.Read'),
    ('Operator', 'Bookings.Write'),
    ('Viewer', 'Bookings.Read')
)
insert into public."sys_UserRole_Permissions" (
  "sys_UserRole_ID",
  "sys_Permission_ID"
)
select role."sys_UserRole_ID", permission."sys_Permission_ID"
from role_permissions mapping
join public."sys_UserRoles" role
  on lower(role."sys_UserRole_Name") = lower(mapping.role_name)
join public."sys_Permissions" permission
  on permission."sys_Permission_Value" = mapping.permission_value
on conflict ("sys_UserRole_ID", "sys_Permission_ID") do nothing;

commit;
