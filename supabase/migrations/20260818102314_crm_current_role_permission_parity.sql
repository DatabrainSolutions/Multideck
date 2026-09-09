-- The current product assigns Company Manager and Company User roles. Older CRM
-- migrations seeded equivalent permissions only to legacy Operations manager and
-- Operator role names, leaving real non-admin users unable to open the product.
-- Keep both taxonomies compatible while the role catalogue is consolidated.

begin;

with role_permissions(role_name, permission_value) as (
  values
    ('Company Manager', 'Customers.Read'),
    ('Company Manager', 'Customers.Write'),
    ('Company Manager', 'CRM.Read'),
    ('Company Manager', 'CRM.Write'),
    ('Company Manager', 'CRM.Drive.Read'),
    ('Company Manager', 'CRM.Drive.Write'),
    ('Company User', 'Customers.Read'),
    ('Company User', 'Customers.Write'),
    ('Company User', 'CRM.Read'),
    ('Company User', 'CRM.Write'),
    ('Company User', 'CRM.Drive.Read'),
    ('Company User', 'CRM.Drive.Write')
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
